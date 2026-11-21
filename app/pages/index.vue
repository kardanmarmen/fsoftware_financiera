<script setup lang="ts">
const { user } = useUserSession()

// Tarjetas del mismo alto en cada fila, con el botón "Abrir" siempre abajo
const TARJETA = { root: 'flex flex-col', body: 'flex flex-col flex-1' }
// En computadora las alertas se reparten todo el ancho, sean 1, 2, 3 o 4
const COLUMNAS_ALERTAS: Record<number, string> = { 1: 'sm:grid-cols-1', 2: 'xl:grid-cols-2', 3: 'xl:grid-cols-3', 4: 'xl:grid-cols-4' }

// RNF26, RNF27: alertas del día según el rol (cobros, atrasos, solicitudes y desembolsos pendientes)
const { data: resumen } = await useFetch('/api/resumen')
const alertas = computed(() => {
  const r = resumen.value
  if (!r) return []
  const lista: { titulo: string, descripcion: string, color: 'error' | 'warning' | 'info', to: string }[] = []
  if (r.atrasados) {
    lista.push({
      titulo: `${r.atrasados} ${r.atrasados === 1 ? 'crédito atrasado' : 'créditos atrasados'}`,
      descripcion: r.morosos ? `${r.morosos} con 8 días o más de atraso.` : 'Con semanas vencidas sin pagar.',
      color: 'error',
      to: '/cobranza',
    })
  }
  if (r.cobrarHoy) {
    lista.push({
      titulo: `Cobrar hoy: ${formatearDinero(r.porCobrarHoyCentavos)}`,
      descripcion: `${r.cobrarHoy} ${r.cobrarHoy === 1 ? 'cliente' : 'clientes'} con pago que vence hoy o atrasado.`,
      color: 'warning',
      to: '/cobranza',
    })
  }
  if (r.solicitudesPendientes && user.value?.rol !== 'administrador') {
    lista.push({
      titulo: `${r.solicitudesPendientes} ${r.solicitudesPendientes === 1 ? 'solicitud pendiente' : 'solicitudes pendientes'}`,
      descripcion: user.value?.rol === 'gerente' ? 'Esperan tu aprobación.' : 'Esperan la aprobación del Gerente.',
      color: 'info',
      to: '/solicitudes',
    })
  }
  if (r.porDesembolsar && user.value?.rol !== 'administrador') {
    lista.push({
      titulo: `${r.porDesembolsar} ${r.porDesembolsar === 1 ? 'crédito por desembolsar' : 'créditos por desembolsar'}`,
      descripcion: 'Aprobados; falta entregar el dinero al cliente.',
      color: 'info',
      to: '/solicitudes?estado=aprobada',
    })
  }
  return lista
})
</script>

<template>
  <div>
    <EncabezadoPagina :titulo="`Hola, ${user?.nombre ?? ''}`" :descripcion="user ? NOMBRE_ROL[user.rol] : ''" />

    <!-- En tableta y computadora las alertas y las tarjetas ocupan todo el ancho: 2, 3 o 4 por fila -->
    <div v-if="alertas.length" class="grid gap-2 mt-4 sm:grid-cols-2" :class="COLUMNAS_ALERTAS[alertas.length]">
      <NuxtLink v-for="a in alertas" :key="a.titulo" :to="a.to">
        <UAlert :title="a.titulo" :description="a.descripcion" :color="a.color" variant="subtle" class="h-full" />
      </NuxtLink>
    </div>
    <p v-else-if="resumen" class="text-sm text-muted mt-4">Sin pendientes por hoy.</p>

    <div class="grid gap-4 mt-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      <UCard :ui="TARJETA">
        <h2 class="font-medium">Cobranza</h2>
        <p class="text-sm text-muted mb-3">Vencimientos, atrasos y morosidad de los créditos vigentes.</p>
        <UButton to="/cobranza" label="Abrir" variant="outline" class="mt-auto self-start" />
      </UCard>
      <UCard :ui="TARJETA">
        <h2 class="font-medium">Reportes</h2>
        <p class="text-sm text-muted mb-3">Pagos, morosidad, liquidaciones y renovaciones, en CSV.</p>
        <UButton to="/reportes" label="Abrir" variant="outline" class="mt-auto self-start" />
      </UCard>
      <UCard :ui="TARJETA">
        <h2 class="font-medium">Clientes</h2>
        <p class="text-sm text-muted mb-3">
          {{ user?.rol === 'administrador' ? 'Consulta de clientes.' : 'Alta y consulta de clientes.' }}
        </p>
        <UButton to="/clientes" label="Abrir" variant="outline" class="mt-auto self-start" />
      </UCard>
      <UCard :ui="TARJETA">
        <h2 class="font-medium">Solicitudes</h2>
        <p class="text-sm text-muted mb-3">
          {{ user?.rol === 'gerente' ? 'Aprobación de solicitudes de crédito.' : 'Solicitudes de crédito y su estado.' }}
        </p>
        <UButton to="/solicitudes" label="Abrir" variant="outline" class="mt-auto self-start" />
      </UCard>
      <template v-if="user?.rol !== 'cobrador'">
        <UCard :ui="TARJETA">
          <h2 class="font-medium">Modelos de crédito</h2>
          <p class="text-sm text-muted mb-3">Interés, plazo y mora de cada tipo de crédito.</p>
          <UButton to="/modelos" label="Abrir" variant="outline" class="mt-auto self-start" />
        </UCard>
        <UCard :ui="TARJETA">
          <h2 class="font-medium">{{ user?.rol === 'gerente' ? 'Mis Cobradores' : 'Usuarios' }}</h2>
          <p class="text-sm text-muted mb-3">Alta, edición y activación de cuentas.</p>
          <UButton to="/usuarios" label="Abrir" variant="outline" class="mt-auto self-start" />
        </UCard>
        <UCard :ui="TARJETA">
          <h2 class="font-medium">Bitácora</h2>
          <p class="text-sm text-muted mb-3">Registro de accesos y cambios.</p>
          <UButton to="/bitacora" label="Abrir" variant="outline" class="mt-auto self-start" />
        </UCard>
        <UCard v-if="user?.rol === 'administrador'" :ui="TARJETA">
          <h2 class="font-medium">Respaldos</h2>
          <p class="text-sm text-muted mb-3">Copias semanales de la base de datos.</p>
          <UButton to="/respaldos" label="Abrir" variant="outline" class="mt-auto self-start" />
        </UCard>
      </template>
    </div>
  </div>
</template>
