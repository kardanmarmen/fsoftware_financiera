// Si la API responde 401 (sesión cerrada en otro dispositivo, cierre dominical, inactividad...),
// se borra la sesión del navegador y se lleva al usuario al login con el motivo.
export default defineNuxtPlugin((nuxtApp) => {
  const aviso = useState('aviso-sesion', () => '')

  globalThis.$fetch = $fetch.create({
    async onResponseError({ request, response }) {
      const esLogin = String(request).includes('/api/auth/iniciar-sesion')
      if (response.status !== 401 || esLogin) return

      aviso.value = response._data?.message ?? 'Tu sesión terminó. Inicia sesión de nuevo'
      await nuxtApp.runWithContext(async () => {
        await useUserSession().fetch() // el servidor ya borró la cookie: queda sin sesión
        await navigateTo('/iniciar-sesion')
      })
    },
  }) as typeof globalThis.$fetch
})
