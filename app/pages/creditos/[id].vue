<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'

// RF61, RF63: consulta del crédito: condiciones, saldo, calendario de pagos y operaciones.
const route = useRoute()
const { data: credito, error } = await useFetch(`/api/creditos/${route.params.id}`)

type Semana = NonNullable<typeof credito.value>['calendario'][number]
type Operacion = NonNullable<typeof credito.value>['operaciones'][number]

const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' }) // AAAA-MM-DD

function estadoSemana(s: Semana) {
  if (s.cubiertoCentavos >= s.montoCentavos) return { label: 'Pagada', color: 'success' as const }
  if (s.fechaVencimiento < hoy) return { label: 'Vencida', color: 'error' as const }
  if (s.cubiertoCentavos > 0) return { label: 'Abono parcial', color: 'warning' as const }
  return { label: 'Pendiente', color: 'neutral' as const }
}

const UBadge = resolveComponent('UBadge')

// Columnas que se ocultan en el celular para que quepan las importantes
const soloPantallaGrande = { class: { th: 'hidden sm:table-cell', td: 'hidden sm:table-cell' } }

const columnasCalendario: TableColumn<Semana>[] = [
  { accessorKey: 'semana', header: 'Semana' },
  { accessorKey: 'fechaVencimiento', header: 'Vence', cell: ({ row }) => formatearFechaCorta(row.original.fechaVencimiento) },
  { accessorKey: 'montoCentavos', header: 'Pago', meta: soloPantallaGrande, cell: ({ row }) => formatearDinero(row.original.montoCentavos) },
  { accessorKey: 'cubiertoCentavos', header: 'Cubierto', cell: ({ row }) => formatearDinero(row.original.cubiertoCentavos) },
  {
    id: 'estado',
    header: 'Estado',
    cell: ({ row }) => h(UBadge, { ...estadoSemana(row.original), variant: 'subtle' }),
  },
]

const columnasOperaciones: TableColumn<Operacion>[] = [
  { accessorKey: 'registradoEn', header: 'Fecha', cell: ({ row }) => formatearFecha(row.original.registradoEn) },
  { accessorKey: 'folio', header: 'Folio', meta: soloPantallaGrande },
  {
    accessorKey: 'tipo',
    header: 'Operación',
    cell: ({ row }) => {
      const o = row.original
      const nombre = NOMBRE_TIPO_OPERACION[o.tipo] ?? o.tipo
      return o.semana ? `${nombre} (semana ${o.semana})` : nombre
    },
  },
  { accessorKey: 'montoCentavos', header: 'Monto', cell: ({ row }) => formatearDinero(row.original.montoCentavos) },
  { accessorKey: 'saldoResultanteCentavos', header: 'Saldo', meta: soloPantallaGrande, cell: ({ row }) => formatearDinero(row.original.saldoResultanteCentavos) },
  { accessorKey: 'registradoPorNombre', header: 'Registró', meta: soloPantallaGrande },
]

const COLOR_CREDITO = { aprobado: 'info', aceptado: 'success', liquidado: 'neutral', cancelado: 'neutral' } as const
</script>

<template>
  <div class="max-w-3xl">
    <UButton
      :to="credito ? `/clientes/${credito.clienteId}` : '/clientes'"
      icon="i-lucide-arrow-left"
      label="Volver"
      variant="link"
      color="neutral"
      class="px-0 mb-2"
    />

    <UAlert v-if="error" color="error" variant="subtle" :description="mensajeDeError(error)" />

    <template v-else-if="credito">
      <EncabezadoPagina :titulo="`Crédito ${credito.folio}`" :descripcion="credito.clienteNombre">
        <UBadge :label="NOMBRE_ESTADO_CREDITO[credito.estado]" :color="COLOR_CREDITO[credito.estado]" variant="subtle" />
      </EncabezadoPagina>

      <div class="grid gap-4 sm:grid-cols-2 mb-6">
        <UCard>
          <p class="text-sm text-muted">Saldo pendiente</p>
          <p class="text-2xl font-semibold">{{ formatearDinero(credito.saldoCentavos) }}</p>
          <p class="text-sm text-muted">de {{ formatearDinero(credito.totalCentavos) }}</p>
        </UCard>
        <UCard>
          <!-- RF58: condiciones con las que se aceptó el crédito -->
          <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt class="text-muted">Monto entregado</dt>
            <dd>{{ formatearDinero(credito.montoCentavos) }}</dd>
            <dt class="text-muted">Interés</dt>
            <dd>{{ formatearPorcentaje(credito.tasaInteresBp) }} ({{ formatearDinero(credito.interesCentavos) }})</dd>
            <dt class="text-muted">Plazo</dt>
            <dd>{{ credito.plazoSemanas }} semanas de {{ formatearDinero(credito.pagoSemanalCentavos) }}</dd>
            <dt class="text-muted">Mora semanal</dt>
            <dd>{{ formatearDinero(credito.moraSemanalCentavos) }}</dd>
            <dt class="text-muted">Desembolso</dt>
            <dd>{{ formatearFechaCorta(credito.fechaDesembolso) }}</dd>
            <dt class="text-muted">Cobrador</dt>
            <dd>{{ credito.cobradorNombre }}</dd>
          </dl>
        </UCard>
      </div>

      <h2 class="font-medium mb-2">Calendario de pagos</h2>
      <UTable :data="credito.calendario" :columns="columnasCalendario" empty="Sin calendario" class="mb-6" />

      <h2 class="font-medium mb-2">Operaciones</h2>
      <UTable :data="credito.operaciones" :columns="columnasOperaciones" empty="Aún no hay operaciones registradas" />
    </template>
  </div>
</template>
