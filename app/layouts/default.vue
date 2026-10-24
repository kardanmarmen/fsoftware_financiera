<script setup lang="ts">
const { user, fetch: actualizarSesion } = useUserSession()

// RNF16: el menú solo muestra lo que el rol puede usar. "Financiera" (a la izquierda) lleva al inicio.
const enlaces = computed(() => {
  const rol = user.value?.rol
  const clientes = { label: 'Clientes', to: '/clientes', icon: 'i-lucide-contact' }
  if (rol !== 'administrador' && rol !== 'gerente') return [clientes]
  return [
    clientes,
    { label: rol === 'gerente' ? 'Mis Cobradores' : 'Usuarios', to: '/usuarios', icon: 'i-lucide-users' },
    { label: 'Bitácora', to: '/bitacora', icon: 'i-lucide-scroll-text' },
  ]
})

const saliendo = ref(false)

async function cerrarSesion() {
  saliendo.value = true // deshabilita el botón: evita enviar el cierre dos veces
  try {
    await $fetch('/api/auth/cerrar-sesion', { method: 'POST' })
    await actualizarSesion()
    await navigateTo('/iniciar-sesion')
  } finally {
    saliendo.value = false
  }
}
</script>

<template>
  <div class="min-h-dvh">
    <header class="border-b border-default">
      <UContainer class="flex flex-wrap items-center gap-2 py-3">
        <NuxtLink to="/" class="font-semibold mr-4">Financiera</NuxtLink>

        <!-- En el celular el menú baja a su propia fila; en pantallas grandes va junto a "Financiera" -->
        <nav v-if="!user?.contrasenaTemporal" class="order-last w-full flex flex-wrap gap-1 sm:order-none sm:w-auto">
          <UButton
            v-for="enlace in enlaces"
            :key="enlace.to"
            :to="enlace.to"
            :icon="enlace.icon"
            :label="enlace.label"
            variant="ghost"
            color="neutral"
          />
        </nav>

        <div class="ml-auto flex items-center gap-2">
          <span class="text-sm text-muted hidden sm:inline">
            {{ user?.nombre }} · {{ user ? NOMBRE_ROL[user.rol] : '' }}
          </span>
          <UButton
            v-if="!user?.contrasenaTemporal"
            to="/mi-cuenta"
            icon="i-lucide-circle-user"
            variant="ghost"
            color="neutral"
            aria-label="Mi cuenta"
          />
          <UButton icon="i-lucide-log-out" label="Salir" variant="outline" color="neutral" :loading="saliendo" @click="cerrarSesion" />
        </div>
      </UContainer>
    </header>

    <UContainer class="py-6">
      <slot />
    </UContainer>
  </div>
</template>
