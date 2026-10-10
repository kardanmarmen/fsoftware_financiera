// Si la API responde 401 (sesión cerrada en otro dispositivo, cierre dominical, inactividad...),
// se guarda el motivo para mostrarlo en el login y se lleva al usuario ahí.
//
// `enforce: 'pre'` hace que este plugin se instale antes que el de nuxt-auth-utils, que al abrir
// o recargar la app pide la sesión (/api/_auth/session). Sin esto, ese primer 401 no se
// interceptaba y el motivo se perdía.
export default defineNuxtPlugin({
  name: 'sesion-cerrada',
  enforce: 'pre',
  setup(nuxtApp) {
    const aviso = useState('aviso-sesion', () => '')

    globalThis.$fetch = $fetch.create({
      async onResponseError({ request, response }) {
        const url = String(request)
        if (response.status !== 401 || url.includes('/api/auth/iniciar-sesion')) return

        aviso.value = response._data?.message ?? 'Tu sesión terminó. Inicia sesión de nuevo'

        // Al abrir o recargar la app: la sesión queda vacía y el middleware lleva al login.
        if (url.includes('/api/_auth/session')) return

        // Durante el uso: se borra la sesión del navegador y se va al login.
        await nuxtApp.runWithContext(async () => {
          await useUserSession().fetch()
          await navigateTo('/iniciar-sesion')
        })
      },
    }) as typeof globalThis.$fetch
  },
})
