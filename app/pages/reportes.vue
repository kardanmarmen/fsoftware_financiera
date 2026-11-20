<script setup lang="ts">
// Reportes con descarga en CSV (se abre en Excel):
// - Pagos (RF64–RF72, RF80): pagos, abonos y liquidaciones del periodo, con totales por Cobrador.
// - Morosidad (RF73–RF81): créditos vigentes con atraso, al día de hoy.
// - Liquidaciones (RF97–RF103): historial de créditos liquidados en el periodo.
// - Renovaciones (RF82–RF89, RNF28): renovaciones solicitadas en el periodo.
// Cada rol ve lo de su ámbito: Cobrador, lo suyo; Gerente, lo de sus Cobradores; Administrador, todo.
type Pestana = 'pagos' | 'morosidad' | 'liquidaciones' | 'renovaciones'
const pestana = ref<Pestana>('pagos')
const pestanas = [
  { label: 'Pagos', value: 'pagos' },
  { label: 'Morosidad', value: 'morosidad' },
  { label: 'Liquidaciones', value: 'liquidaciones' },
  { label: 'Renovaciones', value: 'renovaciones' },
] as const

const hoy = hoyEnMexico()
const rango = ref({ desde: `${hoy.slice(0, 8)}01`, hasta: hoy }) // del día 1 del mes a hoy
const consulta = computed(() => ({ ...rango.value }))
const rangoValido = computed(() => !!rango.value.desde && !!rango.value.hasta && rango.value.desde <= rango.value.hasta)

// Cada reporte se pide solo al abrir su pestaña
const pagos = useFetch('/api/reportes/pagos', { query: consulta, immediate: false, watch: false })
const morosidad = useFetch('/api/cobranza', { immediate: false, watch: false, default: () => [] })
const liquidaciones = useFetch('/api/reportes/liquidaciones', { query: consulta, immediate: false, watch: false, default: () => [] })
const renovaciones = useFetch('/api/reportes/renovaciones', { query: consulta, immediate: false, watch: false, default: () => [] })

function cargar() {
  if (!rangoValido.value && pestana.value !== 'morosidad') return
  ;({ pagos, morosidad, liquidaciones, renovaciones })[pestana.value].execute()
}
watch([pestana, rango], cargar, { deep: true, immediate: true })

const atrasados = computed(() => morosidad.data.value.filter((c) => c.diasAtraso > 0))
const porNivel = computed(() => {
  const niveles = ['atraso', 'moroso', 'cartera_vencida'] as const
  return niveles.map((n) => {
    const lista = atrasados.value.filter((c) => c.morosidad === n)
    return { nivel: n, creditos: lista.length, vencidoCentavos: lista.reduce((t, c) => t + c.vencidoCentavos + c.moraPendienteCentavos, 0) }
  })
})

const errorActual = computed(() => ({ pagos, morosidad, liquidaciones, renovaciones })[pestana.value].error.value)
const cargando = computed(() => ({ pagos, morosidad, liquidaciones, renovaciones })[pestana.value].status.value === 'pending')

function descargar() {
  const sufijo = `${rango.value.desde}_a_${rango.value.hasta}`
  if (pestana.value === 'pagos' && pagos.data.value) {
    descargarCsv(`pagos_${sufijo}.csv`, ['Fecha', 'Folio', 'Tipo', 'Semana', 'Crédito', 'Cliente', 'Cobrador', 'Registró', 'Monto', 'Mora', 'Saldo después'],
      pagos.data.value.pagos.map((p) => [formatearFecha(p.registradoEn), p.folio, NOMBRE_TIPO_OPERACION[p.tipo], p.semana, p.creditoFolio, p.clienteNombre,
        p.cobradorNombre, p.registradoPorNombre, pesosCsv(p.montoCentavos), pesosCsv(p.moraCentavos), pesosCsv(p.saldoResultanteCentavos)]))
  } else if (pestana.value === 'morosidad') {
    descargarCsv(`morosidad_${hoy}.csv`, ['Crédito', 'Cliente', 'Teléfono', 'Cobrador', 'Días de atraso', 'Nivel', 'Semanas vencidas', 'Vencido', 'Mora pendiente', 'Saldo'],
      atrasados.value.map((c) => [c.folio, c.clienteNombre, c.telefono, c.cobradorNombre, c.diasAtraso, NIVELES_MOROSIDAD[c.morosidad], c.semanasVencidas,
        pesosCsv(c.vencidoCentavos), pesosCsv(c.moraPendienteCentavos), pesosCsv(c.saldoCentavos)]))
  } else if (pestana.value === 'liquidaciones') {
    descargarCsv(`liquidaciones_${sufijo}.csv`, ['Fecha', 'Crédito', 'Cliente', 'Cobrador', 'Tipo', 'Monto del crédito', 'Pagado al liquidar', 'Comprobante'],
      liquidaciones.data.value.map((l) => [formatearFecha(l.liquidadoEn), l.folio, l.clienteNombre, l.cobradorNombre, tipoLiquidacion(l),
        pesosCsv(l.montoCentavos), pesosCsv(l.pagadoCentavos), l.operacionFolio]))
  } else if (pestana.value === 'renovaciones') {
    descargarCsv(`renovaciones_${sufijo}.csv`, ['Fecha', 'Cliente', 'Cobrador', 'Crédito anterior', 'Crédito nuevo', 'Estado', 'Monto nuevo', 'Descontado', 'Entregado'],
      renovaciones.data.value.map((r) => [formatearFecha(r.creadoEn), r.clienteNombre, r.cobradorNombre, r.anteriorFolio, r.nuevoFolio, estadoRenovacion(r),
        pesosCsv(r.nuevoMontoCentavos ?? r.montoSolicitadoCentavos), pesosCsv(r.descontadoCentavos), pesosCsv(r.entregadoCentavos)]))
  }
}

type Liquidacion = (typeof liquidaciones.data.value)[number]
type Renovacion = (typeof renovaciones.data.value)[number]
const tipoLiquidacion = (l: Liquidacion) => (l.porRenovacion ? 'Por renovación' : l.tipoLiquidacion === 'anticipada' ? 'Anticipada' : 'Normal')
function estadoRenovacion(r: Renovacion) {
  if (r.estadoSolicitud !== 'aprobada') return NOMBRE_ESTADO_SOLICITUD[r.estadoSolicitud]
  return r.nuevoEstado === 'aprobado' ? 'Por desembolsar' : r.nuevoEstado ? NOMBRE_ESTADO_CREDITO[r.nuevoEstado] : 'Aprobada'
}
</script>

<template>
  <div class="max-w-4xl">
    <EncabezadoPagina titulo="Reportes">
      <UButton icon="i-lucide-download" label="Descargar CSV" variant="outline" class="ml-auto" :disabled="cargando || !!errorActual" @click="descargar" />
    </EncabezadoPagina>

    <div class="flex flex-wrap gap-1 mb-4">
      <UButton
        v-for="p in pestanas"
        :key="p.value"
        :label="p.label"
        :variant="pestana === p.value ? 'solid' : 'outline'"
        color="neutral"
        size="sm"
        @click="pestana = p.value"
      />
    </div>

    <div v-if="pestana !== 'morosidad'" class="grid grid-cols-2 gap-3 mb-4 max-w-md">
      <UFormField label="Desde">
        <UInput v-model="rango.desde" type="date" :max="hoy" class="w-full" />
      </UFormField>
      <UFormField label="Hasta">
        <UInput v-model="rango.hasta" type="date" class="w-full" />
      </UFormField>
    </div>
    <p v-else class="text-sm text-muted mb-4">Créditos vigentes con atraso al día de hoy ({{ formatearFechaCorta(hoy) }}).</p>

    <UAlert v-if="!rangoValido && pestana !== 'morosidad'" color="warning" variant="subtle" description='La fecha "desde" debe ser anterior o igual a "hasta".' class="mb-4" />
    <UAlert v-else-if="errorActual" color="error" variant="subtle" :description="mensajeDeError(errorActual)" class="mb-4" />
    <p v-else-if="cargando" class="text-sm text-muted">Cargando…</p>

    <!-- Pagos -->
    <template v-else-if="pestana === 'pagos' && pagos.data.value">
      <div class="grid gap-3 sm:grid-cols-3 mb-4">
        <UCard>
          <p class="text-sm text-muted">Total cobrado</p>
          <p class="text-xl font-semibold">{{ formatearDinero(pagos.data.value.totalCentavos) }}</p>
        </UCard>
        <UCard>
          <p class="text-sm text-muted">De eso, mora</p>
          <p class="text-xl font-semibold">{{ formatearDinero(pagos.data.value.moraCentavos) }}</p>
        </UCard>
        <UCard>
          <p class="text-sm text-muted">Operaciones</p>
          <p class="text-xl font-semibold">{{ pagos.data.value.pagos.length }}</p>
        </UCard>
      </div>
      <template v-if="pagos.data.value.porCobrador.length > 1">
        <h2 class="font-medium mb-2">Por Cobrador</h2>
        <div class="space-y-1 mb-4 text-sm">
          <div v-for="c in pagos.data.value.porCobrador" :key="c.cobradorNombre" class="flex gap-2">
            <span>{{ c.cobradorNombre }}</span>
            <span class="text-muted">{{ c.operaciones }} operaciones</span>
            <span class="ml-auto font-medium">{{ formatearDinero(c.montoCentavos) }}</span>
          </div>
        </div>
      </template>
      <p v-if="pagos.data.value.pagos.length === 0" class="text-sm text-muted">No hay pagos en este periodo.</p>
      <div v-else class="space-y-1">
        <NuxtLink
          v-for="p in pagos.data.value.pagos"
          :key="p.operacionId"
          :to="`/comprobantes/${p.operacionId}`"
          class="flex flex-wrap items-center gap-x-2 rounded-md border border-default p-2 text-sm hover:bg-elevated"
        >
          <span class="text-muted">{{ formatearFecha(p.registradoEn) }}</span>
          <span>{{ p.clienteNombre }}</span>
          <span class="text-muted">{{ NOMBRE_TIPO_OPERACION[p.tipo] }} · {{ p.creditoFolio }}</span>
          <span class="ml-auto font-medium">{{ formatearDinero(p.montoCentavos) }}</span>
        </NuxtLink>
      </div>
    </template>

    <!-- Morosidad -->
    <template v-else-if="pestana === 'morosidad'">
      <div class="grid gap-3 sm:grid-cols-3 mb-4">
        <UCard v-for="n in porNivel" :key="n.nivel">
          <p class="text-sm text-muted">{{ NIVELES_MOROSIDAD[n.nivel] }}</p>
          <p class="text-xl font-semibold">{{ n.creditos }}</p>
          <p class="text-sm text-muted">{{ formatearDinero(n.vencidoCentavos) }} vencido con mora</p>
        </UCard>
      </div>
      <p v-if="atrasados.length === 0" class="text-sm text-muted">No hay créditos con atraso.</p>
      <div v-else class="space-y-1">
        <NuxtLink
          v-for="c in atrasados"
          :key="c.id"
          :to="`/creditos/${c.id}`"
          class="flex flex-wrap items-center gap-x-2 rounded-md border border-default p-2 text-sm hover:bg-elevated"
        >
          <span>{{ c.clienteNombre }}</span>
          <span class="text-muted">{{ c.folio }} · {{ c.diasAtraso }} días · {{ c.cobradorNombre }}</span>
          <span class="ml-auto font-medium">{{ formatearDinero(c.vencidoCentavos + c.moraPendienteCentavos) }}</span>
        </NuxtLink>
      </div>
    </template>

    <!-- Liquidaciones -->
    <template v-else-if="pestana === 'liquidaciones'">
      <p v-if="liquidaciones.data.value.length === 0" class="text-sm text-muted">No hay liquidaciones en este periodo.</p>
      <div v-else class="space-y-1">
        <NuxtLink
          v-for="l in liquidaciones.data.value"
          :key="l.creditoId"
          :to="l.operacionId ? `/comprobantes/${l.operacionId}` : `/creditos/${l.creditoId}`"
          class="flex flex-wrap items-center gap-x-2 rounded-md border border-default p-2 text-sm hover:bg-elevated"
        >
          <span class="text-muted">{{ formatearFecha(l.liquidadoEn) }}</span>
          <span>{{ l.clienteNombre }}</span>
          <span class="text-muted">{{ l.folio }} · {{ tipoLiquidacion(l) }}</span>
          <span class="ml-auto font-medium">{{ formatearDinero(l.montoCentavos) }}</span>
        </NuxtLink>
      </div>
    </template>

    <!-- Renovaciones -->
    <template v-else-if="pestana === 'renovaciones'">
      <p v-if="renovaciones.data.value.length === 0" class="text-sm text-muted">No hay renovaciones en este periodo.</p>
      <div v-else class="space-y-1">
        <NuxtLink
          v-for="r in renovaciones.data.value"
          :key="r.solicitudId"
          :to="r.nuevoId ? `/creditos/${r.nuevoId}` : `/clientes/${r.clienteId}`"
          class="block rounded-md border border-default p-2 text-sm hover:bg-elevated"
        >
          <div class="flex flex-wrap items-center gap-x-2">
            <span class="text-muted">{{ formatearFecha(r.creadoEn) }}</span>
            <span>{{ r.clienteNombre }}</span>
            <span class="text-muted">{{ r.anteriorFolio }} → {{ r.nuevoFolio ?? 'sin crédito' }} · {{ estadoRenovacion(r) }}</span>
            <span class="ml-auto font-medium">{{ formatearDinero(r.nuevoMontoCentavos ?? r.montoSolicitadoCentavos) }}</span>
          </div>
          <p v-if="r.entregadoCentavos != null" class="text-muted">
            Descontado {{ formatearDinero(r.descontadoCentavos) }} · entregado {{ formatearDinero(r.entregadoCentavos) }}
          </p>
        </NuxtLink>
      </div>
    </template>
  </div>
</template>
