export default defineNuxtConfig({
  compatibilityDate: '2026-10-01',
  modules: ['@nuxt/ui', 'nuxt-auth-utils'],
  css: ['~/assets/css/main.css'],
  devtools: { enabled: true },

  nitro: {
    preset: 'cloudflare_module',
  },

  app: {
    head: {
      htmlAttrs: { lang: 'es-MX' },
      title: 'Financiera',
    },
  },
})
