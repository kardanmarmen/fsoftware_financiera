// Respaldo semanal de la base de datos (RF117–RF121). Ver docs/incremento-2/2.7-respaldo-de-datos.md
//
// Cada domingo la tarea programada del Worker (ver "triggers" en wrangler.jsonc) inicia este Workflow:
//   1. Registra el respaldo en la tabla `respaldos` como "en_proceso".
//   2. Pide a la API de D1 que exporte la base de datos completa (archivo .sql).
//   3. Espera a que la exportación esté lista y la guarda en R2, separada de la base (RF121).
//   4. Copia íntegra de los documentos de los clientes (bucket DOCUMENTOS) a documentos/<fecha>/ (RF118).
//   5. Marca el respaldo como "correcto" y deja en la bitácora cuántos documentos y bytes se copiaron;
//      si algo falló (también la copia de documentos), lo marca como "fallido" con el error.
//
// La exportación la hace Cloudflare: este Worker casi solo espera, así que no gasta CPU.
// Se publica solo con cada push a main (Workers Builds, carpeta raíz /respaldos).
// Basado en el ejemplo oficial: https://developers.cloudflare.com/workflows/examples/backup-d1/
import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from 'cloudflare:workers'

interface Env {
  DB: D1Database
  RESPALDOS: R2Bucket
  DOCUMENTOS: R2Bucket
  FLUJO_RESPALDO: Workflow
  CUENTA_ID: string
  BASE_DATOS_ID: string
  TOKEN_EXPORTAR_D1: string // secreto: npx wrangler secret put TOKEN_EXPORTAR_D1
}

// Respuesta de la API de exportación. La dirección de descarga viene en result.result cuando
// status es "complete" (igual que la lee `wrangler d1 export`).
interface RespuestaExportacion {
  success: boolean
  errors?: { message: string }[]
  result?: {
    at_bookmark?: string
    status?: 'active' | 'complete' | 'error'
    error?: string
    result?: { signed_url?: string, filename?: string }
  }
}

// Documentos que copia cada paso (ver "copiar documentos")
const LOTE_DOCUMENTOS = 20

const espera = (ms: number) => new Promise((resolver) => setTimeout(resolver, ms))

export class FlujoRespaldo extends WorkflowEntrypoint<Env> {
  async run(_evento: WorkflowEvent<unknown>, paso: WorkflowStep) {
    const id = await paso.do('registrar inicio', async () => {
      const id = crypto.randomUUID()
      await this.env.DB.prepare("INSERT INTO respaldos (id, iniciado_en, estado) VALUES (?, ?, 'en_proceso')")
        .bind(id, Date.now())
        .run()
      return id
    })

    try {
      const marcador = await paso.do('iniciar exportación', async () => {
        const r = await this.exportar({ output_format: 'polling' })
        if (!r.result?.at_bookmark) throw new Error(`La API no regresó el marcador: ${mensaje(r)}`)
        return r.result.at_bookmark
      })

      // Se consulta el avance cada 3 segundos, enviando siempre el marcador más reciente (así lo
      // hace `wrangler d1 export`). Si en 2 minutos no termina, el paso falla y Workflows lo reintenta.
      const direccion = await paso.do(
        'esperar exportación',
        { retries: { limit: 5, delay: '30 seconds', backoff: 'exponential' }, timeout: '5 minutes' },
        async () => {
          let actual = marcador
          for (let intento = 0; intento < 40; intento++) {
            const r = await this.exportar({ output_format: 'polling', current_bookmark: actual })
            if (!r.success) throw new Error(`La API rechazó la consulta: ${mensaje(r)}`)
            if (r.result?.status === 'error') throw new Error(`La exportación falló: ${r.result.error ?? mensaje(r)}`)
            if (r.result?.status === 'complete' && r.result.result?.signed_url) return r.result.result.signed_url
            actual = r.result?.at_bookmark ?? actual
            await espera(3000)
          }
          throw new Error('La exportación todavía no está lista')
        },
      )

      // La dirección de descarga vale una hora; se descarga y se guarda en R2 en un paso aparte
      const archivo = await paso.do(
        'guardar en R2',
        { retries: { limit: 3, delay: '30 seconds', backoff: 'exponential' } },
        async () => {
          const descarga = await fetch(direccion)
          if (!descarga.ok || !descarga.body) throw new Error(`No se pudo descargar la exportación (${descarga.status})`)

          // d1/2026-10-25-0930.sql: el nombre lleva la fecha (UTC), así se ordenan solos
          const clave = `d1/${new Date().toISOString().slice(0, 16).replace('T', '-').replace(':', '')}.sql`
          const objeto = await this.env.RESPALDOS.put(clave, descarga.body, {
            httpMetadata: { contentType: 'application/sql' },
          })
          return { clave, tamano: objeto.size }
        },
      )

      // RF118: copia íntegra de los documentos, en una carpeta con la misma fecha que el .sql de este
      // respaldo: d1/2026-10-25-0930.sql ↔ documentos/2026-10-25-0930/clientes/<cliente>/<documento>.
      // Se copia por lotes de LOTE_DOCUMENTOS objetos, un paso por lote: cada paso hace 1 lista + 2 llamadas
      // por objeto, dentro del límite de 50 subpeticiones del plan gratuito, y si un lote falla solo se
      // reintenta ese lote. Los nombres de los pasos son fijos (lote 1, 2, …), como pide Workflows.
      const prefijo = `documentos/${archivo.clave.slice('d1/'.length, -'.sql'.length)}/`
      const documentos = { objetos: 0, bytes: 0 }
      let cursor: string | undefined
      for (let lote = 1; ; lote++) {
        const copiado = await paso.do(
          `copiar documentos (lote ${lote})`,
          { retries: { limit: 3, delay: '30 seconds', backoff: 'exponential' }, timeout: '10 minutes' },
          async () => {
            const lista = await this.env.DOCUMENTOS.list({ limit: LOTE_DOCUMENTOS, cursor })
            let objetos = 0
            let bytes = 0
            for (const { key } of lista.objects) {
              const original = await this.env.DOCUMENTOS.get(key)
              if (!original) continue // los documentos no se borran (RF19); por si acaso
              // Con el MD5 del original, R2 rechaza la copia si el contenido no coincide (copia íntegra).
              // Se conservan el tipo de archivo y los metadatos.
              const copia = await this.env.RESPALDOS.put(`${prefijo}${key}`, original.body, {
                httpMetadata: original.httpMetadata,
                customMetadata: original.customMetadata,
                ...(original.checksums.md5 ? { md5: original.checksums.md5 } : {}),
              })
              if (copia.size !== original.size) {
                throw new Error(`La copia de ${key} mide ${copia.size} bytes y el original ${original.size}`)
              }
              objetos++
              bytes += original.size
            }
            return { objetos, bytes, cursor: lista.truncated ? lista.cursor : null }
          },
        )
        documentos.objetos += copiado.objetos
        documentos.bytes += copiado.bytes
        if (!copiado.cursor) break
        cursor = copiado.cursor
      }

      // El resultado y su registro en la bitácora (RNF25, RNF29) se guardan juntos
      await paso.do('registrar resultado', async () => {
        const ahora = Date.now()
        await this.env.DB.batch([
          this.env.DB.prepare(
            "UPDATE respaldos SET estado = 'correcto', terminado_en = ?, archivo = ?, tamano_bytes = ? WHERE id = ?",
          ).bind(ahora, archivo.clave, archivo.tamano, id),
          this.env.DB.prepare(
            "INSERT INTO bitacora (id, accion, entidad, entidad_id, detalle, creado_en) VALUES (?, 'respaldo_completado', 'respaldo', ?, ?, ?)",
          ).bind(
            crypto.randomUUID(),
            id,
            JSON.stringify({
              baseDeDatos: { archivo: archivo.clave, bytes: archivo.tamano },
              documentos: { carpeta: prefijo, ...documentos },
            }),
            ahora,
          ),
        ])
      })
      console.log(`Respaldo correcto: ${archivo.clave}; ${documentos.objetos} documentos (${documentos.bytes} bytes) en ${prefijo}`)
    } catch (error) {
      await paso.do('registrar fallo', async () => {
        await this.env.DB.prepare("UPDATE respaldos SET estado = 'fallido', terminado_en = ?, error = ? WHERE id = ?")
          .bind(Date.now(), String(error instanceof Error ? error.message : error).slice(0, 1000), id)
          .run()
      })
      throw error // el Workflow queda como fallido en el panel de Cloudflare
    }
  }

  private async exportar(cuerpo: Record<string, string>): Promise<RespuestaExportacion> {
    const r = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${this.env.CUENTA_ID}/d1/database/${this.env.BASE_DATOS_ID}/export`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.env.TOKEN_EXPORTAR_D1}` },
        body: JSON.stringify(cuerpo),
      },
    )
    return await r.json<RespuestaExportacion>()
  }
}

function mensaje(r: RespuestaExportacion) {
  return r.errors?.map((e) => e.message).join('; ') || 'sin detalle'
}

export default {
  // La tarea programada de cada domingo (triggers.crons en wrangler.jsonc) inicia el Workflow
  async scheduled(_controlador: ScheduledController, env: Env) {
    await env.FLUJO_RESPALDO.create()
  },
  // Este Worker no atiende páginas
  async fetch() {
    return new Response('No encontrado', { status: 404 })
  },
}
