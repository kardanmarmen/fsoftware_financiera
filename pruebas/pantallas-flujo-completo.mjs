// Flujo en pantalla: solicitud → aprobación → desembolso → pago → liquidación, con capturas.
import { createRequire } from 'node:module'
const { chromium } = createRequire(import.meta.url)('playwright')
const DIR = new URL('.', import.meta.url).pathname
const BASE = 'http://localhost:3000'
const navegador = await chromium.launch()
const errores = []

async function entrar(usuario) {
  const ctx = await navegador.newContext({ viewport: { width: 390, height: 844 } })
  const p = await ctx.newPage()
  p.on('pageerror', (e) => errores.push(`${usuario}: ${e.message}`))
  await p.goto(`${BASE}/iniciar-sesion`)
  await p.getByLabel('Usuario').fill(usuario)
  await p.getByLabel('Contraseña', { exact: true }).fill('Contrasena123')
  await p.getByRole('button', { name: /Entrar|Iniciar/ }).click()
  await p.waitForURL(`${BASE}/`)
  return p
}
const foto = (p, nombre) => p.screenshot({ path: `${DIR}${nombre}.png`, fullPage: true })

// Cobrador: el cliente de las pruebas de la API ya puede solicitar de nuevo
const cob = await entrar('cobrador1')
await cob.goto(`${BASE}/clientes`)
await cob.getByText('Ana Perez Lopez').first().click()
await cob.getByRole('link', { name: 'Nueva solicitud' }).click()
await cob.getByRole('combobox').click()
await cob.getByRole('option', { name: 'Semanal 16' }).click()
await cob.getByLabel('Monto solicitado').fill('3000')
await cob.getByLabel('Ocupación').fill('Tienda de abarrotes')
await cob.waitForTimeout(300)
await foto(cob, '1-solicitud')
await cob.getByRole('button', { name: 'Enviar solicitud' }).click()
await cob.waitForURL(/\/clientes\/[^/]+$/)

// Gerente: aprueba
const ger = await entrar('gerente1')
await ger.goto(`${BASE}/solicitudes`)
await ger.getByRole('button', { name: 'Aprobar' }).first().click()
await ger.waitForTimeout(400)
await foto(ger, '2-aprobar')
await ger.getByRole('button', { name: 'Aprobar y generar crédito' }).click()
await ger.getByRole('link', { name: 'Ver crédito' }).waitFor()
const urlCredito = await ger.getByRole('link', { name: 'Ver crédito' }).getAttribute('href')

// Cobrador: desembolsa, cobra y liquida
await cob.goto(BASE + urlCredito)
await cob.getByRole('button', { name: 'Registrar desembolso' }).waitFor()
await foto(cob, '3-credito-aprobado')
await cob.getByRole('button', { name: 'Registrar desembolso' }).click()
await cob.getByRole('button', { name: 'Guardar y ver comprobante' }).click()
await cob.waitForURL(/\/comprobantes\//)
await cob.getByText('Comprobante de desembolso').waitFor()
await foto(cob, '4-comprobante-desembolso')

await cob.goto(BASE + urlCredito)
await cob.getByRole('button', { name: 'Registrar pago' }).click()
await cob.waitForTimeout(400)
await foto(cob, '5-registrar-pago')
await cob.getByRole('button', { name: 'Guardar y ver comprobante' }).click()
await cob.waitForURL(/\/comprobantes\//)
await cob.getByText('Comprobante de pago').waitFor()
await foto(cob, '6-comprobante-pago')

await cob.goto(BASE + urlCredito)
await cob.getByRole('button', { name: 'Liquidar' }).click()
await cob.getByRole('button', { name: 'Guardar y ver comprobante' }).click()
await cob.waitForURL(/\/comprobantes\//)
await cob.getByText('Comprobante de liquidación').waitFor()
await foto(cob, '7-comprobante-liquidacion')
// Vista de impresión: sin menú ni botones
await cob.emulateMedia({ media: 'print' })
await foto(cob, '8-impresion')
await cob.emulateMedia({ media: 'screen' })

await cob.goto(BASE + urlCredito)
await cob.getByText('Liquidado el').waitFor()
await foto(cob, '9-credito-liquidado')

const adm = await entrar('admin')
await adm.goto(`${BASE}/modelos`)
await adm.getByText('Semanal 16').waitFor()
await foto(adm, '10-modelos')

console.log(errores.length ? `Errores en la página:\n${errores.join('\n')}` : 'Sin errores de JavaScript en las páginas')
await navegador.close()
