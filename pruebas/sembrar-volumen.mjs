// Genera datos de volumen para las pruebas de rendimiento (6.3): 10 Cobradores del Gerente "gerente1",
// 300 clientes cada uno (3,000), un crédito vigente por cliente con su calendario de 16 semanas
// (48,000 semanas), pagos al corriente o atrasados, y moras. Escribe un .sql para wrangler d1 execute.
import { writeFileSync } from 'node:fs'
const [gerenteId, modeloId, salida] = process.argv.slice(2)
const ahora = Date.now()
const DIA = 86400000
const fecha = (ms) => new Date(ms - 6 * 3600000).toISOString().slice(0, 10)
const q = (v) => (v === null ? 'NULL' : typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`)
const lineas = []
const insertar = (tabla, filas) => {
  for (let i = 0; i < filas.length; i += 200) {
    const bloque = filas.slice(i, i + 200)
    lineas.push(`INSERT INTO ${tabla} (${Object.keys(bloque[0]).join(',')}) VALUES\n${bloque.map((f) => `(${Object.values(f).map(q).join(',')})`).join(',\n')};`)
  }
}
const nombres = ['Ana', 'Luis', 'María', 'José', 'Carmen', 'Juan', 'Rosa', 'Pedro', 'Lucía', 'Jorge', 'Elena', 'Raúl']
const apellidos = ['Pérez', 'López', 'García', 'Hernández', 'Martínez', 'Ramírez', 'Cruz', 'Flores', 'Gómez', 'Díaz', 'Reyes', 'Morales', 'Ortiz', 'Castillo']
const sinAcento = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const usuarios = [], clientes = [], palabras = [], solicitudes = [], creditos = [], calendario = [], operaciones = [], moras = []
let folioCr = 1000, folioOp = 100000
for (let k = 0; k < 10; k++) {
  const cobradorId = crypto.randomUUID()
  usuarios.push({ id: cobradorId, usuario: `carga${k}`, nombre: `Cobrador Carga ${k}`, rol: 'cobrador', gerente_id: gerenteId, contrasena_hash: 'x', creado_en: ahora, actualizado_en: ahora })
  for (let i = 0; i < 300; i++) {
    const n = k * 300 + i
    const id = crypto.randomUUID()
    const nombre = nombres[n % nombres.length], ap = apellidos[n % apellidos.length], am = apellidos[(n * 7) % apellidos.length]
    clientes.push({
      id, curp: `CARG${String(n).padStart(6, '0')}HVZXXX0${n % 10}`.slice(0, 18), nombre, apellido_paterno: ap, apellido_materno: am,
      nombre_busqueda: sinAcento(`${ap} ${am} ${nombre}`), fecha_nacimiento: '1990-01-01', telefono: `235${String(n).padStart(7, '0')}`,
      calle: 'Hidalgo', numero_exterior: String(n), colonia: 'Centro', municipio: 'Misantla', estado: 'Veracruz', codigo_postal: '93821',
      cobrador_id: cobradorId, creado_por: cobradorId, creado_en: ahora, actualizado_en: ahora,
    })
    for (const p of new Set(sinAcento(`${ap} ${am} ${nombre}`).split(' '))) palabras.push({ cliente_id: id, palabra: p })
    // Crédito de $5,000 desembolsado hace entre 7 y 105 días; 70 % al corriente, 30 % atrasado
    const sId = crypto.randomUUID(), cId = crypto.randomUUID()
    const dias = 7 + (n * 13) % 98
    const desembolso = fecha(ahora - dias * DIA)
    const vencidas = Math.min(16, Math.floor(dias / 7))
    const pagadas = n % 10 < 7 ? vencidas : Math.max(0, vencidas - 1 - (n % 4))
    const saldo = 600000 - pagadas * 37500
    solicitudes.push({ id: sId, cliente_id: id, cobrador_id: cobradorId, modelo_id: modeloId, tipo: 'nueva', monto_solicitado_centavos: 500000, tasa_interes_bp: 2000, plazo_semanas: 16, mora_semanal_centavos: 5000, estado: 'aprobada', monto_aprobado_centavos: 500000, fecha_desembolso: desembolso, revisada_por: gerenteId, revisada_en: ahora, creado_por: cobradorId, creado_en: ahora - dias * DIA, actualizado_en: ahora })
    creditos.push({ id: cId, folio: `CR-${++folioCr}`, solicitud_id: sId, cliente_id: id, cobrador_id: cobradorId, modelo_id: modeloId, monto_centavos: 500000, tasa_interes_bp: 2000, plazo_semanas: 16, mora_semanal_centavos: 5000, interes_centavos: 100000, total_centavos: 600000, pago_semanal_centavos: 37500, saldo_centavos: saldo, estado: saldo === 0 ? 'liquidado' : 'aceptado', fecha_desembolso: desembolso, aceptado_en: ahora - dias * DIA, liquidado_en: saldo === 0 ? ahora : null, tipo_liquidacion: saldo === 0 ? 'normal' : null, creado_en: ahora - dias * DIA, actualizado_en: ahora })
    for (let s = 1; s <= 16; s++) {
      calendario.push({ id: crypto.randomUUID(), credito_id: cId, semana: s, fecha_vencimiento: fecha(ahora - dias * DIA + 7 * s * DIA), monto_centavos: 37500, cubierto_centavos: s <= pagadas ? 37500 : 0 })
    }
    operaciones.push({ id: crypto.randomUUID(), folio: `OP-${++folioOp}`, credito_id: cId, tipo: 'desembolso', semana: null, monto_centavos: 500000, mora_centavos: 0, saldo_resultante_centavos: 600000, clave_idempotencia: crypto.randomUUID(), registrado_por: cobradorId, registrado_en: ahora - dias * DIA })
    for (let s = 1; s <= pagadas; s++) {
      operaciones.push({ id: crypto.randomUUID(), folio: `OP-${++folioOp}`, credito_id: cId, tipo: s === 16 ? 'liquidacion' : 'pago', semana: s, monto_centavos: 37500, mora_centavos: 0, saldo_resultante_centavos: 600000 - s * 37500, clave_idempotencia: crypto.randomUUID(), registrado_por: cobradorId, registrado_en: ahora - (dias - 7 * s) * DIA })
    }
    // La mitad de las semanas atrasadas ya tiene su mora generada
    for (let s = pagadas + 1; s <= vencidas; s += 2) moras.push({ id: crypto.randomUUID(), credito_id: cId, semana: s, monto_centavos: 5000, pagado_centavos: 0, condonado_centavos: 0, generada_en: ahora })
  }
}
insertar('usuarios', usuarios); insertar('clientes', clientes); insertar('cliente_palabras', palabras)
insertar('solicitudes', solicitudes); insertar('creditos', creditos); insertar('calendario_pagos', calendario)
insertar('operaciones', operaciones); insertar('moras', moras)
writeFileSync(salida, lineas.join('\n'))
console.log({ clientes: clientes.length, creditos: creditos.length, calendario: calendario.length, operaciones: operaciones.length, moras: moras.length })
