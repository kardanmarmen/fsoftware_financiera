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

  // Costo de scrypt (RNF23). 1024 verifica una contraseña en ~3 ms, dentro del límite de 10 ms de
  // CPU del plan gratuito de Cloudflare (con el valor por defecto, 16384, tardaba ~50 ms).
  // Lo compensa el límite de intentos de inicio de sesión (wrangler.jsonc > ratelimits).
  // Debe coincidir con scripts/comun.mjs.
  auth: {
    hash: { scrypt: { cost: 1024 } },
  },

  runtimeConfig: {
    session: {
      name: 'sesion',
      // La cookie vence en 7 días como máximo; la validez real la decide la tabla `sesiones`.
      maxAge: 60 * 60 * 24 * 7,
    },
  },

  app: {
    head: {
      htmlAttrs: { lang: 'es-MX' },
      title: 'Financiera',
    },
  },
})
