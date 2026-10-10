// Cuando el navegador pide la sesión (/api/_auth/session, al abrir la app), se aplican las
// mismas reglas que en la API: si la sesión se cerró, el navegador queda sin sesión.
export default defineNitroPlugin(() => {
  sessionHooks.hook('fetch', async (_sesion, event) => {
    await validarSesion(event)
  })
})
