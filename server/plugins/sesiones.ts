// Cuando el navegador pide la sesión (/api/_auth/session: al abrir la app y en cada cambio de
// pantalla), se aplican las mismas reglas que en la API: si se cerró, el navegador queda sin sesión.
export default defineNitroPlugin(() => {
  sessionHooks.hook('fetch', async (sesion, event) => {
    if (sesion.user) await validarSesion(event) // sin usuario: nada que validar
  })
})
