<script setup lang="ts">
// RF73–RF78, RNF26: cobranza. Qué vence hoy, qué está atrasado y quién es moroso, con lo que hay que
// cobrar para que cada cliente quede al corriente. El Cobrador ve sus créditos; el Gerente, los de sus
// Cobradores; el Administrador, todos.
const { user } = useUserSession()
const { data: creditos, error } = await useFetch('/api/cobranza', { default: () => [] })
type Credito = (typeof creditos.value)[number]

const filtro = ref<'cobrar' | 'atrasado' | 'esta_semana' | 'todos'>('cobrar')
const busqueda = ref('')
const filtros = computed(() => [
  { label: 'Cobrar hoy', value: 'cobrar', total: creditos.value.filter((c) => c.estado === 'atrasado' || c.estado === 'vence_hoy').length },
  { label: 'Atrasados', value: 'atrasado', total: creditos.value.filter((c) => c.estado === 'atrasado').length },
  { label: 'Esta semana', value: 'esta_semana', total: creditos.value.filter((c) => c.estado === 'esta_semana').length },
  { label: 'Todos', value: 'todos', total: creditos.value.length },
])

const visibles = computed(() => {
  const q = normalizarTexto(busqueda.value)
  return creditos.value.filter((c) => {
    const pasa = filtro.value === 'todos'
      || (filtro.value === 'cobrar' && (c.estado === 'atrasado' || c.estado === 'vence_hoy'))
      || c.estado === filtro.value
    return pasa && (!q || normalizarTexto(`${c.clienteNombre} ${c.folio}`).includes(q))
  })
})
const totalPorCobrar = computed(() => visibles.value.reduce((t, c) => t + c.porCobrarHoyCentavos, 0))

const COLOR_MOROSIDAD = { al_corriente: 'success', atraso: 'warning', moroso: 'error', cartera_vencida: 'error' } as const
function etiqueta(c: Credito) {
  if (c.estado === 'atrasado') return `${c.diasAtraso} días de atraso`
  if (c.estado === 'vence_hoy') return 'Vence hoy'
  return c.proximoVencimiento ? `Vence ${formatearFechaCorta(c.proximoVencimiento)}` : 'Sin pagos pendientes'
}
</script>

<template>
  <div class="max-w-3xl">
    <EncabezadoPagina titulo="Cobranza" :descripcion="user?.rol === 'cobrador' ? 'Tus créditos vigentes y lo que toca cobrar.' : 'Créditos vigentes, vencimientos y morosidad.'" />

    <UAlert v-if="error" color="error" variant="subtle" :description="mensajeDeError(error)" class="mb-4" />

    <div class="flex flex-wrap gap-1 mb-3">
      <UButton
        v-for="f in filtros"
        :key="f.value"
        :label="`${f.label} (${f.total})`"
        :variant="filtro === f.value ? 'solid' : 'outline'"
        color="neutral"
        size="sm"
        @click="filtro = f.value as typeof filtro"
      />
    </div>
    <UInput v-model="busqueda" icon="i-lucide-search" placeholder="Buscar por cliente o folio" class="w-full mb-3" />

    <p class="text-sm text-muted mb-3">
      {{ visibles.length }} {{ visibles.length === 1 ? 'crédito' : 'créditos' }} ·
      por cobrar hoy para quedar al corriente: <strong>{{ formatearDinero(totalPorCobrar) }}</strong>
    </p>

    <p v-if="visibles.length === 0" class="text-sm text-muted">No hay créditos en esta lista.</p>
    <div v-else class="space-y-2">
      <NuxtLink
        v-for="c in visibles"
        :key="c.id"
        :to="`/creditos/${c.id}`"
        class="block rounded-md border border-default p-3 hover:bg-elevated"
      >
        <div class="flex flex-wrap items-center gap-2">
          <span class="font-medium">{{ c.clienteNombre }}</span>
          <UBadge :label="etiqueta(c)" :color="c.estado === 'atrasado' ? COLOR_MOROSIDAD[c.morosidad] : c.estado === 'vence_hoy' ? 'warning' : 'neutral'" variant="subtle" />
          <span v-if="c.porCobrarHoyCentavos" class="ml-auto font-medium">{{ formatearDinero(c.porCobrarHoyCentavos) }}</span>
        </div>
        <p class="text-sm text-muted mt-1">
          {{ c.folio }} · saldo {{ formatearDinero(c.saldoCentavos) }} · pago semanal {{ formatearDinero(c.pagoSemanalCentavos) }}
          <template v-if="c.semanasVencidas"> · {{ c.semanasVencidas }} {{ c.semanasVencidas === 1 ? 'semana vencida' : 'semanas vencidas' }}</template>
          <template v-if="c.moraPendienteCentavos"> · mora {{ formatearDinero(c.moraPendienteCentavos) }}</template>
          <template v-if="user?.rol !== 'cobrador'"> · {{ c.cobradorNombre }}</template>
          · tel. {{ c.telefono }}
        </p>
      </NuxtLink>
    </div>
  </div>
</template>
