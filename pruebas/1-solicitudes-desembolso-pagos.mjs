// Pruebas de la API: modelos, solicitudes, desembolso, pagos, liquidación y comprobantes.
const BASE = 'http://localhost:3000'
const [adminTemp] = process.argv.slice(2)
let ok = 0, fallas = 0
function revisar(nombre, cond, extra = '') {
  if (cond) { ok++; console.log('  ✅', nombre) } else { fallas++; console.log('  ❌', nombre, extra) }
}

function sesion() {
  let cookie = ''
  return async (metodo, ruta, cuerpo) => {
    const r = await fetch(BASE + ruta, {
      method: metodo,
      headers: { 'content-type': 'application/json', cookie },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    })
    const sc = r.headers.getSetCookie?.() ?? []
    for (const c of sc) cookie = c.split(';')[0]
    let datos = null
    try { datos = await r.json() } catch {}
    return { status: r.status, datos }
  }
}

async function entrar(usuario, temporal) {
  const s = sesion()
  let r = await s('POST', '/api/auth/iniciar-sesion', { usuario, contrasena: temporal })
  if (r.status !== 200) throw new Error(`login ${usuario}: ${r.status} ${JSON.stringify(r.datos)}`)
  r = await s('POST', '/api/auth/cambiar-contrasena', { actual: temporal, nueva: 'Contrasena123', confirmacion: 'Contrasena123' })
  if (r.status !== 200) throw new Error(`cambio ${usuario}: ${r.status} ${JSON.stringify(r.datos)}`)
  return s
}

// CURP válida con dígito verificador
function curp(base17) {
  const D = '0123456789ABCDEFGHIJKLMNÑOPQRSTUVWXYZ'
  let suma = 0
  for (let i = 0; i < 17; i++) suma += D.indexOf(base17[i]) * (18 - i)
  return base17 + ((10 - (suma % 10)) % 10)
}
const cliente = (c, nombre) => ({
  curp: c, nombre, apellidoPaterno: 'Perez', apellidoMaterno: 'Lopez', telefono: '2351234567',
  calle: 'Hidalgo', numeroExterior: '10', colonia: 'Centro', municipio: 'Misantla', estado: 'Veracruz', codigoPostal: '93821',
})
const uuid = () => crypto.randomUUID()

const admin = await entrar('admin', adminTemp)
const nuevo = async (datos) => (await admin('POST', '/api/usuarios', datos)).datos
const g = await nuevo({ usuario: 'gerente1', nombre: 'Gerente Uno', rol: 'gerente' })
const g2 = await nuevo({ usuario: 'gerente2', nombre: 'Gerente Dos', rol: 'gerente' })
const c = await nuevo({ usuario: 'cobrador1', nombre: 'Cobrador Uno', rol: 'cobrador', gerenteId: g.id })
const gerente = await entrar('gerente1', g.contrasenaTemporal)
const gerente2 = await entrar('gerente2', g2.contrasenaTemporal)
const cobrador = await entrar('cobrador1', c.contrasenaTemporal)

console.log('Modelos de crédito')
let r = await cobrador('POST', '/api/modelos', { nombre: 'X', tasaInteres: 20, plazoSemanas: 16, moraSemanal: 50, semanasParaRenovar: 4 })
revisar('Cobrador no crea modelos (403)', r.status === 403)
r = await admin('POST', '/api/modelos', { nombre: 'Semanal 16', tasaInteres: 20, plazoSemanas: 16, moraSemanal: 50, semanasParaRenovar: 4 })
revisar('Administrador crea modelo (201)', r.status === 201, JSON.stringify(r.datos))
const modeloId = r.datos.id
r = await admin('POST', '/api/modelos', { nombre: 'Semanal 16', tasaInteres: 20, plazoSemanas: 16, moraSemanal: 50, semanasParaRenovar: 4 })
revisar('Nombre repetido (409)', r.status === 409)
r = await admin('POST', '/api/modelos', { nombre: 'Malo', tasaInteres: 20.123, plazoSemanas: 16, moraSemanal: 50, semanasParaRenovar: 4 })
revisar('Tasa con 3 decimales (400)', r.status === 400)
r = await cobrador('GET', '/api/modelos')
revisar('Cobrador consulta modelos', r.status === 200 && r.datos[0].tasaInteresBp === 2000 && r.datos[0].moraSemanalCentavos === 5000)

console.log('Solicitudes')
r = await cobrador('POST', '/api/clientes', cliente(curp('PELA900101HVZRPN0'), 'Ana'))
revisar('Alta de cliente', r.status === 201, JSON.stringify(r.datos))
const clienteId = r.datos.id
r = await cobrador('POST', '/api/solicitudes', { clienteId, modeloId, montoSolicitado: 0 })
revisar('Monto cero (400)', r.status === 400)
r = await cobrador('POST', '/api/solicitudes', { clienteId, modeloId, montoSolicitado: 5000, ocupacion: 'Comerciante', ingresoSemanal: 2500 })
revisar('Cobrador crea solicitud (201)', r.status === 201, JSON.stringify(r.datos))
const solicitudId = r.datos.id
r = await cobrador('POST', '/api/solicitudes', { clienteId, modeloId, montoSolicitado: 3000 })
revisar('Segunda solicitud pendiente (409)', r.status === 409)
r = await gerente2('POST', '/api/solicitudes', { clienteId, modeloId, montoSolicitado: 3000 })
revisar('Gerente ajeno no ve al cliente (404)', r.status === 404)
r = await gerente('GET', '/api/solicitudes?estado=pendiente')
revisar('Gerente ve la solicitud pendiente', r.datos.length === 1 && r.datos[0].ingresoSemanalCentavos === 250000)
r = await gerente2('GET', '/api/solicitudes')
revisar('Gerente ajeno no ve solicitudes', r.datos.length === 0)
r = await cobrador('GET', `/api/clientes/${clienteId}`)
revisar('Ficha: ya no puede solicitar', r.datos.puedeSolicitar === false)

const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' })
const aprobacion = { montoAprobado: 5000, tasaInteres: 20, plazoSemanas: 16, fechaDesembolso: hoy }
r = await cobrador('POST', `/api/solicitudes/${solicitudId}/aprobar`, aprobacion)
revisar('Cobrador no aprueba (403)', r.status === 403)
r = await gerente2('POST', `/api/solicitudes/${solicitudId}/aprobar`, aprobacion)
revisar('Gerente ajeno no aprueba (404)', r.status === 404)
const [a1, a2] = await Promise.all([
  gerente('POST', `/api/solicitudes/${solicitudId}/aprobar`, aprobacion),
  gerente('POST', `/api/solicitudes/${solicitudId}/aprobar`, aprobacion),
])
revisar('Dos aprobaciones simultáneas: una pasa y otra 409', [a1.status, a2.status].sort().join() === '201,409', `${a1.status} ${a2.status}`)
const creditoId = (a1.status === 201 ? a1 : a2).datos.creditoId

r = await cobrador('GET', `/api/creditos/${creditoId}`)
let cr = r.datos
revisar('Crédito aprobado, folio CR-000001', cr.estado === 'aprobado' && cr.folio === 'CR-000001', cr.folio)
revisar('Total $6,000, 16 pagos de $375', cr.totalCentavos === 600000 && cr.pagoSemanalCentavos === 37500 && cr.calendario.length === 16)
revisar('Saldo = total', cr.saldoCentavos === 600000)
r = await gerente('POST', `/api/solicitudes/${solicitudId}/rechazar`, { motivo: 'x' })
revisar('Rechazar una ya aprobada (409)', r.status === 409)

console.log('Desembolso')
r = await cobrador('POST', `/api/creditos/${creditoId}/pagos`, { monto: 375, claveIdempotencia: uuid() })
revisar('No se paga antes del desembolso (409)', r.status === 409)
r = await cobrador('POST', `/api/creditos/${creditoId}/desembolso`, { fecha: '2099-01-01', claveIdempotencia: uuid() })
revisar('Fecha futura (400)', r.status === 400)
r = await admin('POST', `/api/creditos/${creditoId}/desembolso`, { fecha: hoy, claveIdempotencia: uuid() })
revisar('Administrador no desembolsa (403)', r.status === 403)
const ayer = new Date(Date.now() - 86400000).toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' })
const claveDes = uuid()
r = await cobrador('POST', `/api/creditos/${creditoId}/desembolso`, { fecha: ayer, claveIdempotencia: claveDes })
revisar('Desembolso (201)', r.status === 201, JSON.stringify(r.datos))
const opDes = r.datos.operacionId
r = await cobrador('POST', `/api/creditos/${creditoId}/desembolso`, { fecha: ayer, claveIdempotencia: claveDes })
revisar('Reintento con la misma clave: misma operación', r.status === 200 && r.datos.operacionId === opDes)
r = await cobrador('POST', `/api/creditos/${creditoId}/desembolso`, { fecha: ayer, claveIdempotencia: uuid() })
revisar('Segundo desembolso (409)', r.status === 409)
cr = (await cobrador('GET', `/api/creditos/${creditoId}`)).datos
const sumar = (f, d) => { const x = new Date(f + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + d); return x.toISOString().slice(0, 10) }
revisar('Vigente con fecha real y calendario recorrido', cr.estado === 'aceptado' && cr.fechaDesembolso === ayer && cr.calendario[0].fechaVencimiento === sumar(ayer, 7) && cr.calendario[15].fechaVencimiento === sumar(ayer, 112))
r = await cobrador('GET', `/api/operaciones/${opDes}`)
revisar('Comprobante de desembolso', r.status === 200 && r.datos.tipo === 'desembolso' && r.datos.folio === 'OP-000001' && r.datos.montoCentavos === 500000 && r.datos.clienteNombre === 'Ana Perez Lopez')

console.log('Pagos y abonos')
r = await cobrador('POST', `/api/creditos/${creditoId}/pagos`, { monto: 375, claveIdempotencia: uuid() })
const op1 = (await cobrador('GET', `/api/operaciones/${r.datos.operacionId}`)).datos
revisar('Pago de $375 cubre la semana 1', r.status === 201 && op1.tipo === 'pago' && op1.semana === 1 && op1.saldoResultanteCentavos === 562500 && op1.saldoAnteriorCentavos === 600000)
r = await gerente('POST', `/api/creditos/${creditoId}/pagos`, { monto: 200, claveIdempotencia: uuid() })
const op2 = (await gerente('GET', `/api/operaciones/${r.datos.operacionId}`)).datos
revisar('Gerente registra abono de $200 a la semana 2', op2.tipo === 'abono' && op2.semana === 2)
r = await cobrador('POST', `/api/creditos/${creditoId}/pagos`, { monto: 600, claveIdempotencia: uuid() })
cr = (await cobrador('GET', `/api/creditos/${creditoId}`)).datos
const cub = cr.calendario.slice(0, 5).map((s) => s.cubiertoCentavos).join()
revisar('$600 completa semana 2 y 3 y abona $50 a la 4', cub === '37500,37500,37500,5000,0', cub)
revisar('Saldo $4,825', cr.saldoCentavos === 482500, cr.saldoCentavos)
r = await cobrador('POST', `/api/creditos/${creditoId}/pagos`, { monto: 4825.01, claveIdempotencia: uuid() })
revisar('Pago mayor que el saldo (400)', r.status === 400, r.datos?.message)
r = await cobrador('POST', `/api/creditos/${creditoId}/pagos`, { monto: 10.005, claveIdempotencia: uuid() })
revisar('Monto con 3 decimales (400)', r.status === 400)
r = await gerente2('POST', `/api/creditos/${creditoId}/pagos`, { monto: 10, claveIdempotencia: uuid() })
revisar('Gerente ajeno no registra pagos (404)', r.status === 404)
const [p1, p2] = await Promise.all([
  cobrador('POST', `/api/creditos/${creditoId}/pagos`, { monto: 100, claveIdempotencia: uuid() }),
  gerente('POST', `/api/creditos/${creditoId}/pagos`, { monto: 100, claveIdempotencia: uuid() }),
])
revisar('Dos pagos simultáneos: uno pasa y el otro 409', [p1.status, p2.status].sort().join() === '201,409', `${p1.status} ${p2.status}`)
cr = (await cobrador('GET', `/api/creditos/${creditoId}`)).datos
revisar('Saldo $4,725 y suma del calendario cuadra', cr.saldoCentavos === 472500 && cr.calendario.reduce((t, s) => t + s.montoCentavos - s.cubiertoCentavos, 0) === 472500)

console.log('Liquidación')
const claveLiq = uuid()
r = await cobrador('POST', `/api/creditos/${creditoId}/liquidacion`, { claveIdempotencia: claveLiq })
revisar('Liquidación (201)', r.status === 201, JSON.stringify(r.datos))
const opLiq = r.datos.operacionId
r = await cobrador('POST', `/api/creditos/${creditoId}/liquidacion`, { claveIdempotencia: claveLiq })
revisar('Reintento de liquidación: misma operación', r.datos.operacionId === opLiq)
cr = (await cobrador('GET', `/api/creditos/${creditoId}`)).datos
revisar('Liquidado anticipado, saldo 0, todas las semanas cubiertas', cr.estado === 'liquidado' && cr.saldoCentavos === 0 && cr.tipoLiquidacion === 'anticipada' && cr.calendario.every((s) => s.cubiertoCentavos === s.montoCentavos))
r = await cobrador('GET', `/api/operaciones/${opLiq}`)
revisar('Comprobante de liquidación', r.datos.tipo === 'liquidacion' && r.datos.montoCentavos === 472500 && r.datos.saldoResultanteCentavos === 0 && r.datos.credito.tipoLiquidacion === 'anticipada')
revisar('Operaciones: 6, folios OP sin huecos', cr.operaciones.length === 6 && cr.operaciones.map((o) => o.folio).sort().join() === 'OP-000001,OP-000002,OP-000003,OP-000004,OP-000005,OP-000006', cr.operaciones.map((o) => o.folio).join())
r = await cobrador('POST', `/api/creditos/${creditoId}/pagos`, { monto: 1, claveIdempotencia: uuid() })
revisar('Pago a crédito liquidado (409)', r.status === 409)
r = await gerente2('GET', `/api/operaciones/${opLiq}`)
revisar('Gerente ajeno no ve el comprobante (404)', r.status === 404)
r = await admin('GET', `/api/operaciones/${opLiq}`)
revisar('Administrador consulta el comprobante', r.status === 200)

console.log('Rechazo y cancelación')
r = await cobrador('GET', `/api/clientes/${clienteId}`)
revisar('Con el crédito liquidado puede volver a solicitar', r.datos.puedeSolicitar === true)
const s2 = (await cobrador('POST', '/api/solicitudes', { clienteId, modeloId, montoSolicitado: 2000 })).datos.id
r = await gerente('POST', `/api/solicitudes/${s2}/rechazar`, { motivo: '' })
revisar('Rechazo sin motivo (400)', r.status === 400)
r = await gerente('POST', `/api/solicitudes/${s2}/rechazar`, { motivo: 'Ingresos insuficientes' })
revisar('Rechazo con motivo', r.status === 200)
const s3 = (await cobrador('POST', '/api/solicitudes', { clienteId, modeloId, montoSolicitado: 1000 })).datos.id
const c3 = (await gerente('POST', `/api/solicitudes/${s3}/aprobar`, { montoAprobado: 1000, tasaInteres: 12.5, plazoSemanas: 3, fechaDesembolso: hoy })).datos.creditoId
cr = (await cobrador('GET', `/api/creditos/${c3}`)).datos
revisar('Folio CR-000002; $1,125 en 3 pagos: 375, 375, 375', cr.folio === 'CR-000002' && cr.calendario.map((s) => s.montoCentavos).join() === '37500,37500,37500')
const s4c = await (async () => {
  r = await cobrador('POST', `/api/creditos/${c3}/cancelar`, { motivo: 'El cliente ya no lo quiso' })
  return r
})()
revisar('Cancelación de crédito aprobado', s4c.status === 200 && (await cobrador('GET', `/api/creditos/${c3}`)).datos.estado === 'cancelado')

const bit = (await admin('GET', '/api/bitacora')).datos
const acciones = new Set(bit.registros.map((e) => e.accion))
for (const a of ['modelo_creado', 'solicitud_creada', 'solicitud_aprobada', 'solicitud_rechazada', 'credito_desembolsado', 'pago_registrado', 'credito_liquidado', 'credito_cancelado']) {
  revisar(`Bitácora: ${a}`, acciones.has(a))
}

console.log(`\n${ok} pasaron, ${fallas} fallaron`)
process.exit(fallas ? 1 : 0)
