<script setup lang="ts">
const { user } = useUserSession()
</script>

<template>
  <div>
    <EncabezadoPagina :titulo="`Hola, ${user?.nombre ?? ''}`" :descripcion="user ? NOMBRE_ROL[user.rol] : ''" />

    <div class="grid gap-4 sm:grid-cols-2 mt-6 max-w-2xl">
      <UCard>
        <h2 class="font-medium">Clientes</h2>
        <p class="text-sm text-muted mb-3">
          {{ user?.rol === 'administrador' ? 'Consulta de clientes.' : 'Alta y consulta de clientes.' }}
        </p>
        <UButton to="/clientes" label="Abrir" variant="outline" />
      </UCard>
      <template v-if="user?.rol !== 'cobrador'">
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
        <UCard v-if="user?.rol === 'administrador'">
          <h2 class="font-medium">Respaldos</h2>
          <p class="text-sm text-muted mb-3">Copias semanales de la base de datos.</p>
          <UButton to="/respaldos" label="Abrir" variant="outline" />
        </UCard>
      </template>
    </div>
  </div>
</template>
