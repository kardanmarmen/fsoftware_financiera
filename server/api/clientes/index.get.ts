import { and, asc, eq, gte, inArray, lt, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/sqlite-core'
import { clientePalabras, clientes, creditos, usuarios } from '../../db/esquema'

const cobrador = alias(usuarios, 'cobrador')
const POR_PAGINA = 50

/**
 * Condición "empieza con" que usa el índice de la columna: `col >= 'abc' AND col < 'abd'`.
 * Funciona igual en SQLite y PostgreSQL; `LIKE '%abc%'` obligaría a leer toda la tabla (RNF06).
 */
function empiezaCon(columna: typeof clientePalabras.palabra | typeof clientes.telefono, texto: string) {
  const siguiente = texto.slice(0, -1) + String.fromCharCode(texto.charCodeAt(texto.length - 1) + 1)
  return and(gte(columna, texto), lt(columna, siguiente))
}

// RF11, RF15, RNF06 (diseño 2.1, sección 4.2)
// - Cobrador: todos sus clientes; busca en el navegador, así funciona aunque se pierda la señal.
// - Gerente (los de sus Cobradores) y Administrador (todos): búsqueda en el servidor, por páginas.
//   El texto se interpreta como CURP (18 caracteres), teléfono (solo números) o nombre: cada palabra
//   escrita debe ser el inicio de alguna palabra del nombre, en cualquier orden ("ana", "perez lo").
export default defineEventHandler(async (event) => {
  const actor = await requerirUsuario(event)
  const { q, cobradorId, pagina } = leerConsulta(event, esquemaBuscarClientes)
  const esCobrador = actor.rol === 'cobrador'
  const db = usarBd(event)

  let busqueda
  if (!esCobrador && q) {
    const curp = q.toUpperCase()
    if (/^[A-Z0-9]{18}$/.test(curp)) busqueda = eq(clientes.curp, curp)
    else if (/^\d+$/.test(q)) busqueda = empiezaCon(clientes.telefono, q)
    else {
      // Índice de palabras (tabla cliente_palabras): cada palabra se busca con su índice
      const palabras = normalizarTexto(q).split(' ').filter(Boolean).slice(0, 5)
      busqueda = and(...palabras.map((p) => inArray(
        clientes.id,
        db.select({ id: clientePalabras.clienteId }).from(clientePalabras).where(empiezaCon(clientePalabras.palabra, p)),
      )))
    }
  }

  const filtro = and(
    esCobrador ? eq(clientes.cobradorId, actor.id)
      : actor.rol === 'gerente' ? eq(cobrador.gerenteId, actor.id)
        : undefined,
    !esCobrador && cobradorId ? eq(clientes.cobradorId, cobradorId) : undefined,
    busqueda,
  )

  const consulta = db
    .select({
      id: clientes.id,
      curp: clientes.curp,
      nombre: clientes.nombre,
      apellidoPaterno: clientes.apellidoPaterno,
      apellidoMaterno: clientes.apellidoMaterno,
      telefono: clientes.telefono,
      colonia: clientes.colonia,
      municipio: clientes.municipio,
      cobradorId: clientes.cobradorId,
      cobradorNombre: cobrador.nombre,
      // RF15: créditos activos del cliente (usa idx_creditos_cliente)
      creditosActivos: sql<number>`(SELECT COUNT(*) FROM ${creditos} WHERE ${creditos.clienteId} = ${clientes.id} AND ${creditos.estado} = 'aceptado')`,
    })
    .from(clientes)
    .innerJoin(cobrador, eq(clientes.cobradorId, cobrador.id))
    .where(filtro)
    .orderBy(asc(clientes.nombreBusqueda))

  if (esCobrador) {
    const lista = await consulta
    return { clientes: lista, total: lista.length, porPagina: lista.length }
  }

  const [lista, [conteo]] = await Promise.all([
    consulta.limit(POR_PAGINA).offset((pagina - 1) * POR_PAGINA),
    db
      .select({ total: sql<number>`count(*)` })
      .from(clientes)
      .innerJoin(cobrador, eq(clientes.cobradorId, cobrador.id))
      .where(filtro),
  ])
  return { clientes: lista, total: conteo?.total ?? 0, porPagina: POR_PAGINA }
})
