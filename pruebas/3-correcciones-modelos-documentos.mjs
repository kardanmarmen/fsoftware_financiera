// Pruebas: corrección de operaciones (RF72), modelos por Cobrador (RF27) y documentos (RF17–RF23).
// Se ejecuta después de las pruebas 1 y 2.
const BASE = 'http://localhost:3000'
let ok = 0, fallas = 0
function revisar(nombre, cond, extra = '') {
  if (cond) { ok++; console.log('  ✅', nombre) } else { fallas++; console.log('  ❌', nombre, extra) }
}
function sesion() {
  let cookie = ''
  return async (metodo, ruta, cuerpo, opciones = {}) => {
    const crudo = opciones.crudo
    const r = await fetch(BASE + ruta, {
      method: metodo,
      headers: { 'content-type': opciones.tipo ?? 'application/json', cookie, ...(opciones.headers ?? {}) },
      body: crudo ?? (cuerpo ? JSON.stringify(cuerpo) : undefined),
    })
    for (const c of r.headers.getSetCookie?.() ?? []) cookie = c.split(';')[0]
    if (opciones.binario) return { status: r.status, tipo: r.headers.get('content-type'), bytes: new Uint8Array(await r.arrayBuffer()) }
    let datos = null
    try { datos = await r.json() } catch {}
    return { status: r.status, datos }
  }
}
async function entrar(usuario, contrasena, cambiar = true) {
  const s = sesion()
  let r = await s('POST', '/api/auth/iniciar-sesion', { usuario, contrasena })
  if (r.status !== 200) throw new Error(`login ${usuario}: ${r.status}`)
  if (cambiar) await s('POST', '/api/auth/cambiar-contrasena', { actual: contrasena, nueva: 'Contrasena123', confirmacion: 'Contrasena123' })
  return s
}
function curp(base17) {
  const D = '0123456789ABCDEFGHIJKLMNÑOPQRSTUVWXYZ'
  let suma = 0
  for (let i = 0; i < 17; i++) suma += D.indexOf(base17[i]) * (18 - i)
  return base17 + ((10 - (suma % 10)) % 10)
}
const cliente = (c, nombre) => ({
  curp: c, nombre, apellidoPaterno: 'Luna', apellidoMaterno: 'Mar', telefono: '2351112233',
  calle: 'Morelos', numeroExterior: '8', colonia: 'Centro', municipio: 'Misantla', estado: 'Veracruz', codigoPostal: '93821',
})
const uuid = () => crypto.randomUUID()
const fechaMx = (dias) => new Date(Date.now() + dias * 86400000).toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' })
const hoy = fechaMx(0)

const admin = await entrar('admin', 'Contrasena123', false)
const nuevo = async (datos) => (await admin('POST', '/api/usuarios', datos)).datos
const g = await nuevo({ usuario: 'gerente7', nombre: 'Gerente Cinco', rol: 'gerente' })
const g2 = await nuevo({ usuario: 'gerente8', nombre: 'Gerente Seis', rol: 'gerente' })
const c = await nuevo({ usuario: 'cobrador7', nombre: 'Cobrador Cinco', rol: 'cobrador', gerenteId: g.id })
const gerente = await entrar('gerente7', g.contrasenaTemporal)
const gerente2 = await entrar('gerente8', g2.contrasenaTemporal)
const cobrador = await entrar('cobrador7', c.contrasenaTemporal)
const m1 = (await admin('POST', '/api/modelos', { nombre: 'M1b', tasaInteres: 20, plazoSemanas: 16, moraSemanal: 50, semanasParaRenovar: 4 })).datos.id
const m2 = (await admin('POST', '/api/modelos', { nombre: 'M2b', tasaInteres: 10, plazoSemanas: 8, moraSemanal: 30, semanasParaRenovar: 2 })).datos.id

async function creditoDesembolsado(base17, nombre, dias, modeloId = m1) {
  const clienteId = (await cobrador('POST', '/api/clientes', cliente(curp(base17), nombre))).datos.id
  const sId = (await cobrador('POST', '/api/solicitudes', { clienteId, modeloId, montoSolicitado: 5000 })).datos.id
  const creditoId = (await gerente('POST', `/api/solicitudes/${sId}/aprobar`, { montoAprobado: 5000, tasaInteres: 20, plazoSemanas: 16, fechaDesembolso: hoy })).datos.creditoId
  await cobrador('POST', `/api/creditos/${creditoId}/desembolso`, { fecha: fechaMx(-dias), claveIdempotencia: uuid() })
  return { clienteId, creditoId }
}
const credito = async (s, id) => (await s('GET', `/api/creditos/${id}`)).datos
const pagar = async (id, monto) => (await cobrador('POST', `/api/creditos/${id}/pagos`, { monto, claveIdempotencia: uuid() })).datos.operacionId

console.log('Corrección de operaciones (RF72)')
const A = await creditoDesembolsado('LUNA900101HVZNRN0', 'Ana', 16) // 2 semanas vencidas: mora $100
revisar('Solo desembolso: nada que corregir', (await credito(gerente, A.creditoId)).operacionCorregibleId === null)
const op1 = await pagar(A.creditoId, 475) // $100 mora + $375 semana 1
const op2 = await pagar(A.creditoId, 200) // abono semana 2
const antes = await credito(gerente, A.creditoId)
revisar('Corregible: el último pago', antes.operacionCorregibleId === op2)
revisar('El Cobrador no ve qué se puede corregir', (await credito(cobrador, A.creditoId)).operacionCorregibleId === null)
let r = await cobrador('POST', `/api/creditos/${A.creditoId}/correcciones`, { operacionId: op2, motivo: 'x', claveIdempotencia: uuid() })
revisar('El Cobrador no corrige (403)', r.status === 403)
r = await gerente2('POST', `/api/creditos/${A.creditoId}/correcciones`, { operacionId: op2, motivo: 'x', claveIdempotencia: uuid() })
revisar('Gerente ajeno (404)', r.status === 404)
r = await gerente('POST', `/api/creditos/${A.creditoId}/correcciones`, { operacionId: op1, motivo: 'x', claveIdempotencia: uuid() })
revisar('Corregir uno que no es el último (409)', r.status === 409)
r = await gerente('POST', `/api/creditos/${A.creditoId}/correcciones`, { operacionId: op2, motivo: '', claveIdempotencia: uuid() })
revisar('Sin motivo (400)', r.status === 400)
const claveC = uuid()
r = await gerente('POST', `/api/creditos/${A.creditoId}/correcciones`, { operacionId: op2, motivo: 'Se capturó dos veces', claveIdempotencia: claveC })
revisar('Corrección del abono (201)', r.status === 201, JSON.stringify(r.datos))
const corr1 = r.datos.operacionId
r = await gerente('POST', `/api/creditos/${A.creditoId}/correcciones`, { operacionId: op2, motivo: 'Se capturó dos veces', claveIdempotencia: claveC })
revisar('Reintento: misma corrección', r.datos.operacionId === corr1)
let cr = await credito(gerente, A.creditoId)
revisar('Saldo y semana 2 vuelven a como estaban', cr.saldoCentavos === 562500 && cr.calendario[1].cubiertoCentavos === 0)
revisar('El abono queda marcado como corregido', cr.operaciones.find((o) => o.id === op2).corregida === true)
let comp = (await gerente('GET', `/api/operaciones/${corr1}`)).datos
revisar('Comprobante de la corrección', comp.tipo === 'correccion' && comp.corrige && comp.motivo === 'Se capturó dos veces' && comp.saldoResultanteCentavos === 562500)
revisar('El comprobante original dice que fue corregido', (await gerente('GET', `/api/operaciones/${op2}`)).datos.corregidaPor === comp.folio)
revisar('Ahora se puede corregir el pago anterior', cr.operacionCorregibleId === op1)
r = await gerente('POST', `/api/creditos/${A.creditoId}/correcciones`, { operacionId: op1, motivo: 'Monto equivocado', claveIdempotencia: uuid() })
cr = await credito(gerente, A.creditoId)
revisar('Al corregir el pago con mora: saldo total y mora pendiente otra vez', r.status === 201 && cr.saldoCentavos === 600000 && cr.moraPendienteCentavos === 10000 && cr.calendario[0].cubiertoCentavos === 0)
revisar('Nada más que corregir', cr.operacionCorregibleId === null)

const B = await creditoDesembolsado('LUNB900101HVZNRN0', 'Beto', 0)
const opLiq = (await cobrador('POST', `/api/creditos/${B.creditoId}/liquidacion`, { claveIdempotencia: uuid() })).datos.operacionId
r = await gerente('POST', `/api/creditos/${B.creditoId}/correcciones`, { operacionId: opLiq, motivo: 'No pagó, era otro cliente', claveIdempotencia: uuid() })
cr = await credito(gerente, B.creditoId)
revisar('Corregir la liquidación: el crédito vuelve a Vigente', r.status === 201 && cr.estado === 'aceptado' && cr.saldoCentavos === 600000 && cr.liquidadoEn === null && cr.tipoLiquidacion === null)

const Cc = await creditoDesembolsado('LUNC900101HVZNRN0', 'Ciro', 0)
const opLiqC = (await cobrador('POST', `/api/creditos/${Cc.creditoId}/liquidacion`, { claveIdempotencia: uuid() })).datos.operacionId
await cobrador('POST', '/api/solicitudes', { clienteId: Cc.clienteId, modeloId: m1, montoSolicitado: 3000 })
r = await gerente('POST', `/api/creditos/${Cc.creditoId}/correcciones`, { operacionId: opLiqC, motivo: 'x', claveIdempotencia: uuid() })
revisar('No se reabre si el cliente ya tiene otra solicitud (409)', r.status === 409, r.datos?.message)

const D = await creditoDesembolsado('LUND900101HVZNRN0', 'Dora', 0)
const opD = await pagar(D.creditoId, 375)
const [x1, x2] = await Promise.all([
  gerente('POST', `/api/creditos/${D.creditoId}/correcciones`, { operacionId: opD, motivo: 'x', claveIdempotencia: uuid() }),
  cobrador('POST', `/api/creditos/${D.creditoId}/pagos`, { monto: 100, claveIdempotencia: uuid() }),
])
revisar('Corrección y pago al mismo tiempo: uno pasa y el otro 409', [x1.status, x2.status].sort().join() === '201,409', `${x1.status} ${x2.status}`)
cr = await credito(gerente, D.creditoId)
revisar('El calendario cuadra con el saldo', cr.calendario.reduce((t, s) => t + s.montoCentavos - s.cubiertoCentavos, 0) === cr.saldoCentavos)

const rep = (await gerente('GET', `/api/reportes/pagos?desde=${hoy}&hasta=${hoy}`)).datos
revisar('Reporte de pagos: las correcciones restan', rep.pagos.some((p) => p.tipo === 'correccion' && p.montoCentavos < 0) && rep.totalCentavos === rep.pagos.reduce((t, p) => t + p.montoCentavos, 0))

console.log('Modelos por Cobrador (RF27)')
r = await cobrador('PUT', `/api/usuarios/${c.id}/modelos`, { modeloIds: [m2] })
revisar('El Cobrador no se asigna modelos (403)', r.status === 403)
r = await gerente2('PUT', `/api/usuarios/${c.id}/modelos`, { modeloIds: [m2] })
revisar('Gerente ajeno (403 o 404)', r.status === 403 || r.status === 404, r.status)
r = await gerente('PUT', `/api/usuarios/${c.id}/modelos`, { modeloIds: [m2] })
revisar('El Gerente asigna M2', r.status === 200)
revisar('La ficha del Cobrador muestra M2', (await gerente('GET', `/api/usuarios/${c.id}`)).datos.modelosAsignados?.join() === m2)
const E = (await cobrador('POST', '/api/clientes', cliente(curp('LUNE900101HVZNRN0'), 'Eva'))).datos.id
revisar('La ficha del cliente limita los modelos', (await cobrador('GET', `/api/clientes/${E}`)).datos.modelosPermitidos?.join() === m2)
r = await cobrador('POST', '/api/solicitudes', { clienteId: E, modeloId: m1, montoSolicitado: 2000 })
revisar('Solicitud con un modelo no asignado (400)', r.status === 400)
r = await cobrador('POST', '/api/solicitudes', { clienteId: E, modeloId: m2, montoSolicitado: 2000 })
revisar('Solicitud con el modelo asignado (201)', r.status === 201)
const solE = r.datos.id
await gerente('PUT', `/api/usuarios/${c.id}/modelos`, { modeloIds: [] })
revisar('Sin asignaciones: todos los modelos', (await cobrador('GET', `/api/clientes/${E}`)).datos.modelosPermitidos === null)

console.log('Documentos (RF17–RF23)')
const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3, 4, 5, 6, 7, 8])
r = await cobrador('POST', `/api/clientes/${E}/documentos?tipo=identificacion&nombre=${encodeURIComponent('INE frente.png')}&solicitudId=${solE}`, null, { crudo: png, tipo: 'image/png' })
revisar('El Cobrador sube la identificación (201)', r.status === 201, JSON.stringify(r.datos))
const docId = r.datos.id
r = await cobrador('POST', `/api/clientes/${E}/documentos?tipo=otro&nombre=nota.txt`, null, { crudo: new Uint8Array([65]), tipo: 'text/plain' })
revisar('Tipo de archivo no permitido (415)', r.status === 415)
r = await cobrador('POST', `/api/clientes/${E}/documentos?tipo=otro&nombre=vacio.pdf`, null, { crudo: new Uint8Array([]), tipo: 'application/pdf' })
revisar('Archivo vacío (400)', r.status === 400)
r = await cobrador('POST', `/api/clientes/${E}/documentos?tipo=otro&nombre=grande.pdf`, null, { crudo: new Uint8Array(10 * 1024 * 1024 + 1), tipo: 'application/pdf' })
revisar('Archivo de más de 10 MB (413)', r.status === 413)
r = await cobrador('POST', `/api/clientes/${E}/documentos?tipo=otro&nombre=x.pdf&solicitudId=${uuid()}`, null, { crudo: png, tipo: 'application/pdf' })
revisar('Solicitud de otro cliente (400)', r.status === 400)
r = await admin('POST', `/api/clientes/${E}/documentos?tipo=otro&nombre=x.png`, null, { crudo: png, tipo: 'image/png' })
revisar('El Administrador no sube documentos (403)', r.status === 403)
r = await gerente2('POST', `/api/clientes/${E}/documentos?tipo=otro&nombre=x.png`, null, { crudo: png, tipo: 'image/png' })
revisar('Gerente ajeno no sube (404)', r.status === 404)
r = await cobrador('POST', `/api/clientes/${E}/documentos?tipo=desconocido&nombre=x.png`, null, { crudo: png, tipo: 'image/png' })
revisar('Tipo de documento inválido (400)', r.status === 400)
const fichaE = (await cobrador('GET', `/api/clientes/${E}`)).datos
revisar('La ficha lista el documento', fichaE.documentos.length === 1 && fichaE.documentos[0].nombreArchivo === 'INE frente.png' && fichaE.documentos[0].solicitudId === solE)
r = await cobrador('GET', `/api/documentos/${docId}`, null, { binario: true })
revisar('Descarga: mismo contenido y tipo', r.status === 200 && r.tipo === 'image/png' && r.bytes.length === png.length && r.bytes.every((b, i) => b === png[i]))
revisar('Gerente ajeno no descarga (404)', (await gerente2('GET', `/api/documentos/${docId}`, null, { binario: true })).status === 404)
revisar('El Administrador descarga', (await admin('GET', `/api/documentos/${docId}`, null, { binario: true })).status === 200)
const credE = (await gerente('POST', `/api/solicitudes/${solE}/aprobar`, { montoAprobado: 2000, tasaInteres: 10, plazoSemanas: 8, fechaDesembolso: hoy })).datos.creditoId
cr = await credito(cobrador, credE)
revisar('Al aprobar, el documento pasa al crédito (RF20)', cr.documentos.length === 1 && cr.documentos[0].creditoId === credE)
r = await cobrador('POST', `/api/clientes/${E}/documentos?tipo=evidencia_desembolso&nombre=entrega.jpg&creditoId=${credE}`, null, { crudo: png, tipo: 'image/jpeg' })
revisar('Evidencia del desembolso en el crédito', r.status === 201 && (await credito(cobrador, credE)).documentos.length === 2)
r = await cobrador('POST', `/api/clientes/${E}/documentos?tipo=identificacion&nombre=${encodeURIComponent('INE frente.png')}`, null, { crudo: png, tipo: 'image/png' })
revisar('Otra versión no reemplaza la anterior (RF19)', r.status === 201 && (await cobrador('GET', `/api/clientes/${E}`)).datos.documentos.length === 3)

const bit = async (accion) => (await admin('GET', `/api/bitacora?accion=${accion}`)).datos.registros.length
revisar('Bitácora: operacion_corregida, modelos_asignados, documento_subido', (await bit('operacion_corregida')) >= 3 && (await bit('modelos_asignados')) >= 2 && (await bit('documento_subido')) >= 3)

console.log(`\n${ok} pasaron, ${fallas} fallaron`)
process.exit(fallas ? 1 : 0)
