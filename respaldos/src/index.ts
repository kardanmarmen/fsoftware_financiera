// Respaldo semanal de la base de datos (RF117–RF121). Ver docs/incremento-2/2.7-respaldo-de-datos.md
//
// Cada domingo la tarea programada del Worker (ver "triggers" en wrangler.jsonc) inicia este Workflow:
//   1. Registra el respaldo en la tabla `respaldos` como "en_proceso".
//   2. Pide a la API de D1 que exporte la base de datos completa (archivo .sql).
//   3. Espera a que la exportación esté lista y la guarda en R2, separada de la base (RF121).
//   4. Copia los documentos de los clientes subidos desde el último respaldo correcto (RF118).
//   5. Marca el respaldo como "correcto" o, si algo falló, como "fallido" con el error.
//
// La exportación la hace Cloudflare: este Worker casi solo espera, así que no gasta CPU.
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

      // RF118: los documentos nunca se reemplazan ni se borran (RF19), así que basta copiar los nuevos.
      // Se toman los subidos desde que empezó el último respaldo correcto (con un día de margen) y se
      // guardan en documentos/<misma clave>, fuera de la regla de conservación de 84 días (prefijo d1/).
      const copiados = await paso.do(
        'copiar documentos',
        { retries: { limit: 3, delay: '30 seconds', backoff: 'exponential' }, timeout: '10 minutes' },
        async () => {
          const ultimo = await this.env.DB.prepare(
            "SELECT MAX(iniciado_en) AS desde FROM respaldos WHERE estado = 'correcto'",
          ).first<{ desde: number | null }>()
          const desde = (ultimo?.desde ?? 0) - 24 * 60 * 60 * 1000
          const { results } = await this.env.DB.prepare(
            'SELECT clave_archivo FROM documentos WHERE subido_en >= ? ORDER BY subido_en',
          ).bind(desde).all<{ clave_archivo: string }>()
          let total = 0
          for (const { clave_archivo: clave } of results) {
            if (await this.env.RESPALDOS.head(`documentos/${clave}`)) continue // ya copiado (reintento)
            const objeto = await this.env.DOCUMENTOS.get(clave)
            if (!objeto) continue
            // Hasta 10 MB por documento: se copia completo en memoria
            await this.env.RESPALDOS.put(`documentos/${clave}`, await objeto.arrayBuffer(), { httpMetadata: objeto.httpMetadata })
            total++
          }
          return total
        },
      )
      console.log(`Documentos copiados: ${copiados}`)

      await paso.do('registrar resultado', async () => {
        await this.env.DB.prepare(
          "UPDATE respaldos SET estado = 'correcto', terminado_en = ?, archivo = ?, tamano_bytes = ? WHERE id = ?",
        ).bind(Date.now(), archivo.clave, archivo.tamano, id).run()
      })
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
