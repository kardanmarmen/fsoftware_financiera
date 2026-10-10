// Se ejecuta antes de cada página: pide sesión, obliga a cambiar la contraseña temporal
// y revisa el rol que pide la página (definePageMeta({ roles: [...] })).
export default defineNuxtRouteMiddleware(async (to, from) => {
  const { loggedIn, user, fetch: actualizarSesion } = useUserSession()
  const esPublica = to.path === '/iniciar-sesion'

  // Al cambiar de pantalla se vuelve a preguntar al servidor por la sesión: si se cerró
  // (otro dispositivo, cierre dominical, inactividad...), aquí se detecta y se va al login.
  // No hace falta al abrir o recargar la app (nuxt-auth-utils ya la acaba de pedir)
  // ni al venir del login (la página de login la acaba de pedir).
  if (loggedIn.value && to.fullPath !== from.fullPath && from.path !== '/iniciar-sesion') {
    await actualizarSesion()
  }

  if (!loggedIn.value) {
    return esPublica ? undefined : navigateTo('/iniciar-sesion')
  }
  if (esPublica) return navigateTo('/')

  if (user.value?.contrasenaTemporal && to.path !== '/cambiar-contrasena') {
    return navigateTo('/cambiar-contrasena')
  }

  const roles = to.meta.roles
  if (roles && !roles.includes(user.value!.rol)) {
    return navigateTo('/')
  }
})
