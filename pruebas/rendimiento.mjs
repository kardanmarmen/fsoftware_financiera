// 6.3: tiempos de respuesta de la API con volumen (3,000 créditos vigentes del mismo Gerente).
const BASE = 'http://localhost:3000'
async function entrar(usuario) {
  const r = await fetch(`${BASE}/api/auth/iniciar-sesion`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ usuario, contrasena: 'Contrasena123' }) })
  return r.headers.getSetCookie()[0].split(';')[0]
}
const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' })
const desde = new Date(Date.now() - 120 * 86400000).toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' })
async function medir(cookie, ruta, veces = 15) {
  const tiempos = []
  let tamano = 0
  for (let i = 0; i < veces; i++) {
    const t = performance.now()
    const r = await fetch(BASE + ruta, { headers: { cookie } })
    const texto = await r.text()
    tiempos.push(performance.now() - t)
    tamano = texto.length
    if (!r.ok) throw new Error(`${ruta}: ${r.status} ${texto.slice(0, 200)}`)
  }
  tiempos.sort((a, b) => a - b)
  return { ruta, mediana: Math.round(tiempos[Math.floor(veces / 2)]), p95: Math.round(tiempos[Math.floor(veces * 0.95)]), kb: Math.round(tamano / 1024) }
}
const gerente = await entrar('gerente1')
const admin = await entrar('admin')
const credito = (await (await fetch(`${BASE}/api/cobranza`, { headers: { cookie: gerente } })).json()).find((c) => c.diasAtraso > 20)
const filas = []
for (const [quien, cookie, ruta] of [
  ['Gerente', gerente, '/api/resumen'],
  ['Gerente', gerente, '/api/cobranza'],
  ['Gerente', gerente, `/api/creditos/${credito.id}`],
  ['Gerente', gerente, '/api/clientes?q=perez lo'],
  ['Gerente', gerente, '/api/clientes?q=CARG000123'],
  ['Gerente', gerente, '/api/solicitudes?estado=aprobada'],
  ['Gerente', gerente, `/api/reportes/pagos?desde=${desde}&hasta=${hoy}`],
  ['Gerente', gerente, `/api/reportes/liquidaciones?desde=${desde}&hasta=${hoy}`],
  ['Administrador', admin, '/api/cobranza'],
  ['Administrador', admin, '/api/bitacora'],
]) filas.push({ quien, ...(await medir(cookie, ruta)) })
console.table(filas)
