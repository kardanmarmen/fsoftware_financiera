// Se ejecuta antes de cada página: pide sesión, obliga a cambiar la contraseña temporal
// y revisa el rol que pide la página (definePageMeta({ roles: [...] })).
export default defineNuxtRouteMiddleware((to) => {
  const { loggedIn, user } = useUserSession()
  const esPublica = to.path === '/iniciar-sesion'

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
