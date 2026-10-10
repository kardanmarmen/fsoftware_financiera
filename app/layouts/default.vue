<script setup lang="ts">
const { user, fetch: actualizarSesion } = useUserSession()

// RNF16: el menú solo muestra lo que el rol puede usar.
const enlaces = computed(() => {
  const rol = user.value?.rol
  const lista = [{ label: 'Inicio', to: '/', icon: 'i-lucide-house' }]
  if (rol === 'administrador' || rol === 'gerente') {
    lista.push(
      { label: rol === 'gerente' ? 'Mis Cobradores' : 'Usuarios', to: '/usuarios', icon: 'i-lucide-users' },
      { label: 'Bitácora', to: '/bitacora', icon: 'i-lucide-scroll-text' },
    )
  }
  return lista
})

async function cerrarSesion() {
  await $fetch('/api/auth/cerrar-sesion', { method: 'POST' })
  await actualizarSesion()
  await navigateTo('/iniciar-sesion')
}
</script>

<template>
  <div class="min-h-screen">
    <header class="border-b border-default">
      <UContainer class="flex flex-wrap items-center gap-2 py-3">
        <NuxtLink to="/" class="font-semibold mr-4">Financiera</NuxtLink>

        <nav v-if="!user?.contrasenaTemporal" class="flex flex-wrap gap-1">
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
          <UButton to="/cambiar-contrasena" icon="i-lucide-key-round" variant="ghost" color="neutral" aria-label="Cambiar contraseña" />
          <UButton icon="i-lucide-log-out" label="Salir" variant="outline" color="neutral" @click="cerrarSesion" />
        </div>
      </UContainer>
    </header>

    <UContainer class="py-6">
      <slot />
    </UContainer>
  </div>
</template>
