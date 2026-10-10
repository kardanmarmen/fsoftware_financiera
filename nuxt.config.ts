export default defineNuxtConfig({
  compatibilityDate: '2026-10-01',
  modules: ['@nuxt/ui', 'nuxt-auth-utils'],
  css: ['~/assets/css/main.css'],
  devtools: { enabled: true },

  // Sin SSR: las páginas se sirven como archivos estáticos y el Worker solo atiende /api.
  // En Cloudflare gratuito ahorra CPU (armar el HTML en el servidor costaba 60–130 ms por página).
  ssr: false,

  nitro: {
    preset: 'cloudflare_module',
    // Genera index.html al compilar; Cloudflare lo entrega sin ejecutar el Worker.
    prerender: { routes: ['/'] },
  },

  app: {
    head: {
      htmlAttrs: { lang: 'es-MX' },
      title: 'Financiera',
    },
  },
})
