// Pruebas de los Incrementos 4 y 5: moras, condonación, cobranza, alertas, renovaciones y reportes.
// Se ejecuta después de 1-solicitudes-desembolso-pagos.mjs (usa el admin con la contraseña ya cambiada).
const BASE = 'http://localhost:3000'
let ok = 0, fallas = 0
function revisar(nombre, cond, extra = '') {
  if (cond) { ok++; console.log('  ✅', nombre) } else { fallas++; console.log('  ❌', nombre, extra) }
}
function sesion() {
  let cookie = ''
  return async (metodo, ruta, cuerpo) => {
    const r = await fetch(BASE + ruta, { method: metodo, headers: { 'content-type': 'application/json', cookie }, body: cuerpo ? JSON.stringify(cuerpo) : undefined })
    for (const c of r.headers.getSetCookie?.() ?? []) cookie = c.split(';')[0]
    let datos = null
    try { datos = await r.json() } catch {}
    return { status: r.status, datos }
  }
}
async function entrar(usuario, contrasena, cambiar = true) {
  const s = sesion()
  let r = await s('POST', '/api/auth/iniciar-sesion', { usuario, contrasena })
  if (r.status !== 200) throw new Error(`login ${usuario}: ${r.status}`)
  if (cambiar) {
    r = await s('POST', '/api/auth/cambiar-contrasena', { actual: contrasena, nueva: 'Contrasena123', confirmacion: 'Contrasena123' })
    if (r.status !== 200) throw new Error(`cambio ${usuario}: ${r.status}`)
  }
  return s
}
function curp(base17) {
  const D = '0123456789ABCDEFGHIJKLMNÑOPQRSTUVWXYZ'
  let suma = 0
  for (let i = 0; i < 17; i++) suma += D.indexOf(base17[i]) * (18 - i)
  return base17 + ((10 - (suma % 10)) % 10)
}
const cliente = (c, nombre) => ({
  curp: c, nombre, apellidoPaterno: 'Gomez', apellidoMaterno: 'Ruiz', telefono: '2359876543',
  calle: 'Juárez', numeroExterior: '5', colonia: 'Centro', municipio: 'Misantla', estado: 'Veracruz', codigoPostal: '93821',
})
const uuid = () => crypto.randomUUID()
const fechaMx = (dias) => new Date(Date.now() + dias * 86400000).toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' })
const hoy = fechaMx(0)

const admin = await entrar('admin', 'Contrasena123', false)
const nuevo = async (datos) => (await admin('POST', '/api/usuarios', datos)).datos
const g = await nuevo({ usuario: 'gerente3', nombre: 'Gerente Tres', rol: 'gerente' })
const g2 = await nuevo({ usuario: 'gerente4', nombre: 'Gerente Cuatro', rol: 'gerente' })
const c = await nuevo({ usuario: 'cobrador3', nombre: 'Cobrador Tres', rol: 'cobrador', gerenteId: g.id })
const gerente = await entrar('gerente3', g.contrasenaTemporal)
const gerente2 = await entrar('gerente4', g2.contrasenaTemporal)
const cobrador = await entrar('cobrador3', c.contrasenaTemporal)
const modeloId = (await admin('POST', '/api/modelos', { nombre: 'Semanal mora 50', tasaInteres: 20, plazoSemanas: 16, moraSemanal: 50, semanasParaRenovar: 4 })).datos.id

/** Cliente con un crédito de $5,000 desembolsado hace `dias` días. */
async function creditoDesembolsado(base17, nombre, dias, monto = 5000) {
  const clienteId = (await cobrador('POST', '/api/clientes', cliente(curp(base17), nombre))).datos.id
  const sId = (await cobrador('POST', '/api/solicitudes', { clienteId, modeloId, montoSolicitado: monto })).datos.id
  const creditoId = (await gerente('POST', `/api/solicitudes/${sId}/aprobar`, { montoAprobado: monto, tasaInteres: 20, plazoSemanas: 16, fechaDesembolso: hoy })).datos.creditoId
  const r = await cobrador('POST', `/api/creditos/${creditoId}/desembolso`, { fecha: fechaMx(-dias), claveIdempotencia: uuid() })
  if (r.status !== 201) throw new Error(`desembolso ${nombre}: ${JSON.stringify(r.datos)}`)
  return { clienteId, creditoId }
}
const credito = async (s, id) => (await s('GET', `/api/creditos/${id}`)).datos

console.log('Moras (4.3, 4.4)')
const A = await creditoDesembolsado('GORA900101HVZMZN0', 'Alma', 30)
let cr = await credito(cobrador, A.creditoId)
revisar('4 semanas vencidas generan 4 moras de $50', cr.moras.length === 4 && cr.moraPendienteCentavos === 20000, JSON.stringify(cr.moras))
revisar('23 días de atraso', cr.diasAtraso === 23, cr.diasAtraso)
cr = await credito(cobrador, A.creditoId)
revisar('Consultar de nuevo no duplica moras', cr.moras.length === 4)
let cob = (await cobrador('GET', '/api/cobranza')).datos.find((x) => x.id === A.creditoId)
revisar('Cobranza: atrasado, nivel moroso', cob.estado === 'atrasado' && cob.morosidad === 'moroso' && cob.diasAtraso === 23)
revisar('Por cobrar hoy = 4 semanas + mora ($1,700)', cob.porCobrarHoyCentavos === 4 * 37500 + 20000, cob.porCobrarHoyCentavos)

let r = await cobrador('POST', `/api/creditos/${A.creditoId}/pagos`, { monto: 100, claveIdempotencia: uuid() })
let op = (await cobrador('GET', `/api/operaciones/${r.datos.operacionId}`)).datos
revisar('$100 se aplican primero a la mora; el saldo no cambia', op.moraCentavos === 10000 && op.saldoResultanteCentavos === 600000 && op.saldoAnteriorCentavos === 600000)
const [m1, m2] = await Promise.all([
  cobrador('POST', `/api/creditos/${A.creditoId}/pagos`, { monto: 50, claveIdempotencia: uuid() }),
  gerente('POST', `/api/creditos/${A.creditoId}/pagos`, { monto: 50, claveIdempotencia: uuid() }),
])
revisar('Dos pagos solo de mora al mismo tiempo: uno pasa y el otro 409', [m1.status, m2.status].sort().join() === '201,409', `${m1.status} ${m2.status}`)
r = await cobrador('POST', `/api/creditos/${A.creditoId}/pagos`, { monto: 1550, claveIdempotencia: uuid() })
op = (await cobrador('GET', `/api/operaciones/${r.datos.operacionId}`)).datos
revisar('$1,550: $50 de mora y $1,500 cubren las semanas 1 a 4 (pago)', op.moraCentavos === 5000 && op.tipo === 'pago' && op.saldoResultanteCentavos === 450000, JSON.stringify(op))
cr = await credito(cobrador, A.creditoId)
revisar('Al corriente: sin atraso y sin mora pendiente', cr.diasAtraso === 0 && cr.moraPendienteCentavos === 0 && cr.semanasPagadas === 4)
cob = (await cobrador('GET', '/api/cobranza')).datos.find((x) => x.id === A.creditoId)
revisar('Cobranza: vence esta semana', cob.estado === 'esta_semana' && cob.morosidad === 'al_corriente', cob.estado)
r = await cobrador('POST', `/api/creditos/${A.creditoId}/pagos`, { monto: 4500.01, claveIdempotencia: uuid() })
revisar('Pago mayor que el adeudo (400)', r.status === 400)

console.log('Condonación (RF79)')
const B = await creditoDesembolsado('GORB900101HVZMZN0', 'Beto', 15)
cr = await credito(cobrador, B.creditoId)
revisar('2 semanas vencidas, mora $100', cr.moras.length === 2 && cr.moraPendienteCentavos === 10000)
r = await cobrador('POST', `/api/creditos/${B.creditoId}/condonar-mora`, { motivo: 'x' })
revisar('El Cobrador no condona (403)', r.status === 403)
r = await gerente2('POST', `/api/creditos/${B.creditoId}/condonar-mora`, { motivo: 'x' })
revisar('Gerente ajeno (404)', r.status === 404)
r = await gerente('POST', `/api/creditos/${B.creditoId}/condonar-mora`, { motivo: '' })
revisar('Sin motivo (400)', r.status === 400)
r = await gerente('POST', `/api/creditos/${B.creditoId}/condonar-mora`, { motivo: 'Cliente enfermo' })
cr = await credito(cobrador, B.creditoId)
revisar('Condonada: mora pendiente 0, saldo igual', r.status === 200 && cr.moraPendienteCentavos === 0 && cr.saldoCentavos === 600000 && cr.moras.every((m) => m.condonadoCentavos === 5000))
r = await gerente('POST', `/api/creditos/${B.creditoId}/condonar-mora`, { motivo: 'otra vez' })
revisar('Condonar sin mora pendiente (409)', r.status === 409)
r = await cobrador('POST', `/api/creditos/${B.creditoId}/liquidacion`, { claveIdempotencia: uuid() })
op = (await cobrador('GET', `/api/operaciones/${r.datos.operacionId}`)).datos
revisar('Liquidación solo del saldo (la mora se condonó)', op.montoCentavos === 600000 && op.moraCentavos === 0)

console.log('Liquidación con mora')
const E = await creditoDesembolsado('GORE900101HVZMZN0', 'Eva', 10)
r = await cobrador('POST', `/api/creditos/${E.creditoId}/liquidacion`, { claveIdempotencia: uuid() })
op = (await cobrador('GET', `/api/operaciones/${r.datos.operacionId}`)).datos
cr = await credito(cobrador, E.creditoId)
revisar('Liquidar cobra saldo + mora ($6,050)', op.montoCentavos === 605000 && op.moraCentavos === 5000 && cr.estado === 'liquidado' && cr.moras[0].pagadoCentavos === 5000)

console.log('Alertas (4.5)')
const resumenCob = (await cobrador('GET', '/api/resumen')).datos
revisar('Resumen del Cobrador', resumenCob.vigentes === 1 && resumenCob.atrasados === 0 && resumenCob.porDesembolsar === 0, JSON.stringify(resumenCob))
const C = await creditoDesembolsado('GORC900101HVZMZN0', 'Ciro', 40)
const resumenGer = (await gerente('GET', '/api/resumen')).datos
revisar('Resumen del Gerente: 1 atrasado moroso, cobrar hoy', resumenGer.atrasados === 1 && resumenGer.morosos === 1 && resumenGer.cobrarHoy === 1, JSON.stringify(resumenGer))
revisar('Gerente ajeno sin alertas', (await gerente2('GET', '/api/resumen')).datos.vigentes === 0)

console.log('Renovaciones (5.1)')
r = await cobrador('GET', `/api/clientes/${C.clienteId}`)
revisar('Sin semanas pagadas no puede renovar', r.datos.puedeSolicitar === false && /4 semanas pagadas \(lleva 0\)/.test(r.datos.motivoNoSolicitar), r.datos.motivoNoSolicitar)
r = await cobrador('POST', '/api/solicitudes', { clienteId: C.clienteId, modeloId, montoSolicitado: 6000 })
revisar('Solicitud de renovación sin semanas suficientes (409)', r.status === 409)
r = await cobrador('GET', `/api/clientes/${A.clienteId}`)
revisar('Con 4 semanas pagadas puede renovar', r.datos.puedeSolicitar && r.datos.esRenovacion)
const sRen = (await cobrador('POST', '/api/solicitudes', { clienteId: A.clienteId, modeloId, montoSolicitado: 8000 })).datos.id
const lista = (await gerente('GET', '/api/solicitudes?estado=pendiente')).datos
const sol = lista.find((s) => s.id === sRen)
revisar('La solicitud es renovación del crédito vigente', sol.tipo === 'renovacion' && sol.creditoAnteriorSaldoCentavos === 450000)
r = await gerente('POST', `/api/solicitudes/${sRen}/aprobar`, { montoAprobado: 4000, tasaInteres: 20, plazoSemanas: 16, fechaDesembolso: hoy })
revisar('Monto menor que el saldo anterior (400)', r.status === 400)
const nuevoId = (await gerente('POST', `/api/solicitudes/${sRen}/aprobar`, { montoAprobado: 8000, tasaInteres: 20, plazoSemanas: 16, fechaDesembolso: hoy })).datos.creditoId
cr = await credito(cobrador, A.creditoId)
revisar('El crédito anterior muestra la renovación aprobada', cr.renovacion?.creditoNuevoId === nuevoId)
await cobrador('POST', `/api/creditos/${A.creditoId}/pagos`, { monto: 375, claveIdempotencia: uuid() }) // sigue cobrando mientras
const claveRen = uuid()
r = await cobrador('POST', `/api/creditos/${nuevoId}/desembolso`, { fecha: hoy, claveIdempotencia: claveRen })
revisar('Desembolso de la renovación (201)', r.status === 201, JSON.stringify(r.datos))
const opRen = r.datos.operacionId
const anteriorFinal = await credito(cobrador, A.creditoId)
const nuevoFinal = await credito(cobrador, nuevoId)
revisar('El anterior queda liquidado (anticipada) con saldo 0', anteriorFinal.estado === 'liquidado' && anteriorFinal.tipoLiquidacion === 'anticipada' && anteriorFinal.saldoCentavos === 0)
revisar('El nuevo queda vigente y muestra el crédito anterior', nuevoFinal.estado === 'aceptado' && nuevoFinal.creditoAnterior?.id === A.creditoId)
op = (await cobrador('GET', `/api/operaciones/${opRen}`)).datos
revisar('Comprobante: descuenta $4,125 y entrega $3,875', op.renovacion?.montoCentavos === 412500 && op.montoCentavos - op.renovacion.montoCentavos === 387500, JSON.stringify(op.renovacion))
const opLiqAnt = anteriorFinal.operaciones.find((o) => o.tipo === 'liquidacion')
op = (await cobrador('GET', `/api/operaciones/${opLiqAnt.id}`)).datos
revisar('Comprobante de la liquidación apunta al desembolso nuevo', op.renovacion?.operacionId === opRen)
r = await cobrador('POST', `/api/creditos/${nuevoId}/desembolso`, { fecha: hoy, claveIdempotencia: claveRen })
revisar('Reintento: misma operación, sin duplicar', r.datos.operacionId === opRen && (await credito(cobrador, A.creditoId)).operaciones.filter((o) => o.tipo === 'liquidacion').length === 1)

// Renovación cuyo crédito anterior se liquida antes del desembolso
const D = await creditoDesembolsado('GORD900101HVZMZN0', 'Dora', 0)
await cobrador('POST', `/api/creditos/${D.creditoId}/pagos`, { monto: 1500, claveIdempotencia: uuid() })
const sD = (await cobrador('POST', '/api/solicitudes', { clienteId: D.clienteId, modeloId, montoSolicitado: 7000 })).datos.id
const nD = (await gerente('POST', `/api/solicitudes/${sD}/aprobar`, { montoAprobado: 7000, tasaInteres: 20, plazoSemanas: 16, fechaDesembolso: hoy })).datos.creditoId
await cobrador('POST', `/api/creditos/${D.creditoId}/liquidacion`, { claveIdempotencia: uuid() })
r = await cobrador('POST', `/api/creditos/${nD}/desembolso`, { fecha: hoy, claveIdempotencia: uuid() })
revisar('Desembolso si el anterior ya se liquidó aparte (409) y el nuevo sigue aprobado', r.status === 409 && (await credito(cobrador, nD)).estado === 'aprobado', r.datos?.message)
await cobrador('POST', `/api/creditos/${nD}/cancelar`, { motivo: 'Se liquidó antes' })

console.log('Reportes (4.6, 5.4, 5.5)')
let rep = (await gerente('GET', `/api/reportes/pagos?desde=${hoy}&hasta=${hoy}`)).datos
const esperado = 10000 + 5000 + 155000 + 600000 + 605000 + 37500 + 412500 + 150000 + 0
const deCreditos = rep.pagos.filter((p) => [A.creditoId, B.creditoId, E.creditoId, D.creditoId].includes(p.creditoId))
revisar('Reporte de pagos con mora', deCreditos.length >= 8 && rep.moraCentavos >= 20000, `${deCreditos.length} ${rep.moraCentavos}`)
revisar('Total del reporte = suma de las operaciones', rep.totalCentavos === rep.pagos.reduce((t, p) => t + p.montoCentavos, 0))
revisar('Gerente ajeno: reporte vacío', (await gerente2('GET', `/api/reportes/pagos?desde=${hoy}&hasta=${hoy}`)).datos.pagos.length === 0)
r = await gerente('GET', `/api/reportes/pagos?desde=${hoy}&hasta=${fechaMx(-1)}`)
revisar('Rango invertido (400)', r.status === 400)
rep = (await gerente('GET', `/api/reportes/liquidaciones?desde=${hoy}&hasta=${hoy}`)).datos
const liqA = rep.find((l) => l.creditoId === A.creditoId)
const liqB = rep.find((l) => l.creditoId === B.creditoId)
revisar('Liquidaciones: A por renovación, B anticipada, con comprobante', liqA?.porRenovacion === true && liqB?.porRenovacion === false && liqB?.tipoLiquidacion === 'anticipada' && !!liqB.operacionId)
rep = (await gerente('GET', `/api/reportes/renovaciones?desde=${hoy}&hasta=${hoy}`)).datos
const renA = rep.find((x) => x.solicitudId === sRen)
revisar('Renovaciones: descontado $4,125, entregado $3,875', renA?.descontadoCentavos === 412500 && renA?.entregadoCentavos === 387500, JSON.stringify(renA))
revisar('Renovación cancelada sin entregado', rep.find((x) => x.solicitudId === sD)?.entregadoCentavos === null)
revisar('Administrador ve los reportes', (await admin('GET', `/api/reportes/renovaciones?desde=${hoy}&hasta=${hoy}`)).datos.length >= 2)

const bit = (await admin('GET', '/api/bitacora?accion=mora_condonada')).datos
revisar('Bitácora: mora_condonada', bit.registros.length === 1)

console.log(`\n${ok} pasaron, ${fallas} fallaron`)
process.exit(fallas ? 1 : 0)
