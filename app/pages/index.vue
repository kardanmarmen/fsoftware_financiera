<script setup lang="ts">
const { user } = useUserSession()
</script>

<template>
  <div>
    <EncabezadoPagina :titulo="`Hola, ${user?.nombre ?? ''}`" :descripcion="user ? NOMBRE_ROL[user.rol] : ''" />

    <div v-if="user?.rol !== 'cobrador'" class="grid gap-4 sm:grid-cols-2 mt-6 max-w-2xl">
      <UCard>
        <h2 class="font-medium">{{ user?.rol === 'gerente' ? 'Mis Cobradores' : 'Usuarios' }}</h2>
        <p class="text-sm text-muted mb-3">Alta, edición y activación de cuentas.</p>
        <UButton to="/usuarios" label="Abrir" variant="outline" />
      </UCard>
      <UCard>
        <h2 class="font-medium">Bitácora</h2>
        <p class="text-sm text-muted mb-3">Registro de accesos y cambios.</p>
        <UButton to="/bitacora" label="Abrir" variant="outline" />
      </UCard>
    </div>

    <p v-else class="mt-6 text-sm text-muted">
      Las funciones de cobranza se agregan en los siguientes incrementos.
    </p>
  </div>
</template>
