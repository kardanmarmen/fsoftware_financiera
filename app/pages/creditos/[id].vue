<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'

// RF61, RF63: consulta del crédito: condiciones, saldo, calendario de pagos y operaciones.
// RF94, RF96: desembolso o cancelación. RF64–RF68: pagos y abonos. RF97–RF99: liquidación.
// Cada operación lleva a su comprobante (RF100, RF114). RF73–RF79: moras y condonación.
// RF82–RF87: renovación (el crédito nuevo liquida a este al desembolsarse).
const route = useRoute()
const { data: credito, error, refresh } = await useFetch(`/api/creditos/${route.params.id}`)

type Semana = NonNullable<typeof credito.value>['calendario'][number]
type Operacion = NonNullable<typeof credito.value>['operaciones'][number]

const hoy = hoyEnMexico()

function estadoSemana(s: Semana) {
  if (s.cubiertoCentavos >= s.montoCentavos) return { label: 'Pagada', color: 'success' as const }
  if (s.fechaVencimiento < hoy) return { label: 'Vencida', color: 'error' as const }
  if (s.cubiertoCentavos > 0) return { label: 'Abono parcial', color: 'warning' as const }
  return { label: 'Pendiente', color: 'neutral' as const }
}

const UBadge = resolveComponent('UBadge')
const ULink = resolveComponent('ULink')

// Ventana abierta: una a la vez. La clave de idempotencia se genera al abrirla: si la conexión
// falla y se vuelve a enviar, el servidor reconoce el reintento y no duplica la operación (RN-24).
type Accion = 'desembolso' | 'cancelar' | 'pago' | 'liquidacion' | 'condonar'
const accion = ref<Accion | null>(null)
const clave = ref('')
const datos = ref({ fecha: hoy, monto: undefined as number | undefined, motivo: '' })
const enviando = ref(false)
const errorAccion = ref('')

// Lo que falta de la semana más antigua sin cubrir: el pago que normalmente se espera
const siguienteSemana = computed(() => credito.value?.calendario.find((s) => s.cubiertoCentavos < s.montoCentavos))

function abrir(a: Accion) {
  accion.value = a
  clave.value = crypto.randomUUID()
  errorAccion.value = ''
  const s = siguienteSemana.value
  // Sugerencia: la mora pendiente más lo que falta de la semana más antigua (el pago cubre primero la mora)
  const mora = credito.value?.moraPendienteCentavos ?? 0
  datos.value = { fecha: hoy, monto: s ? (s.montoCentavos - s.cubiertoCentavos + mora) / 100 : undefined, motivo: '' }
}

function cerrar() {
  if (!enviando.value) accion.value = null
}

const RUTA: Record<Accion, string> = { desembolso: 'desembolso', cancelar: 'cancelar', pago: 'pagos', liquidacion: 'liquidacion', condonar: 'condonar-mora' }

async function enviar() {
  errorAccion.value = ''
  enviando.value = true
  try {
    const a = accion.value!
    const cuerpo = {
      desembolso: { fecha: datos.value.fecha, claveIdempotencia: clave.value },
      cancelar: { motivo: datos.value.motivo },
      condonar: { motivo: datos.value.motivo },
      pago: { monto: datos.value.monto, claveIdempotencia: clave.value },
      liquidacion: { claveIdempotencia: clave.value },
    }[a]
    const respuesta = await $fetch<{ operacionId?: string }>(`/api/creditos/${route.params.id}/${RUTA[a]}`, { method: 'POST', body: cuerpo })
    accion.value = null
    if (respuesta.operacionId) await navigateTo(`/comprobantes/${respuesta.operacionId}`)
    else await refresh()
  } catch (e) {
    errorAccion.value = mensajeDeError(e)
  } finally {
    enviando.value = false
  }
}

const TITULO: Record<Accion, string> = {
  desembolso: 'Registrar desembolso',
  cancelar: 'Cancelar crédito',
  pago: 'Registrar pago',
  liquidacion: 'Liquidar crédito',
  condonar: 'Condonar mora',
}

const adeudo = computed(() => (credito.value ? credito.value.saldoCentavos + credito.value.moraPendienteCentavos : 0))
const moraPagada = computed(() => credito.value?.moras.reduce((t, m) => t + m.pagadoCentavos, 0) ?? 0)
const moraCondonada = computed(() => credito.value?.moras.reduce((t, m) => t + m.condonadoCentavos, 0) ?? 0)

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
      const texto = o.semana ? `${nombre} (semana ${o.semana})` : nombre
      return o.moraCentavos ? `${texto}, mora ${formatearDinero(o.moraCentavos)}` : texto
    },
  },
  { accessorKey: 'montoCentavos', header: 'Monto', cell: ({ row }) => formatearDinero(row.original.montoCentavos) },
  { accessorKey: 'saldoResultanteCentavos', header: 'Saldo', meta: soloPantallaGrande, cell: ({ row }) => formatearDinero(row.original.saldoResultanteCentavos) },
  { accessorKey: 'registradoPorNombre', header: 'Registró', meta: soloPantallaGrande },
  {
    id: 'comprobante',
    header: '',
    cell: ({ row }) => h(ULink, { to: `/comprobantes/${row.original.id}`, class: 'text-primary' }, () => 'Comprobante'),
  },
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

      <div v-if="credito.puedeOperar && (credito.estado === 'aprobado' || credito.estado === 'aceptado')" class="flex flex-wrap gap-2 mb-4">
        <template v-if="credito.estado === 'aprobado'">
          <UButton icon="i-lucide-hand-coins" label="Registrar desembolso" @click="abrir('desembolso')" />
          <UButton icon="i-lucide-ban" label="Cancelar crédito" color="error" variant="outline" @click="abrir('cancelar')" />
        </template>
        <template v-else>
          <UButton icon="i-lucide-banknote" label="Registrar pago" @click="abrir('pago')" />
          <UButton icon="i-lucide-badge-check" label="Liquidar" variant="outline" @click="abrir('liquidacion')" />
          <UButton
            v-if="credito.puedeCondonar && credito.moraPendienteCentavos > 0"
            icon="i-lucide-hand-heart"
            label="Condonar mora"
            variant="outline"
            color="neutral"
            @click="abrir('condonar')"
          />
        </template>
      </div>

      <UAlert
        v-if="credito.estado === 'aprobado'"
        color="info"
        variant="subtle"
        description="Crédito aprobado: falta entregar el dinero al cliente. Los pagos se registran después del desembolso."
        class="mb-4"
      />
      <UAlert
        v-if="credito.estado === 'liquidado'"
        color="neutral"
        variant="subtle"
        :description="`Liquidado el ${formatearFecha(credito.liquidadoEn)}${credito.tipoLiquidacion === 'anticipada' ? ' (liquidación anticipada)' : ''}${credito.renovacion?.creditoNuevoFolio ? `, por la renovación ${credito.renovacion.creditoNuevoFolio}` : ''}.`"
        class="mb-4"
      />
      <UAlert v-if="credito.creditoAnterior" color="info" variant="subtle" class="mb-4">
        <template #description>
          Renovación del crédito
          <NuxtLink :to="`/creditos/${credito.creditoAnterior.id}`" class="underline">{{ credito.creditoAnterior.folio }}</NuxtLink>.
          <template v-if="credito.estado === 'aprobado'">Al desembolsar se liquida su saldo y el cliente recibe la diferencia.</template>
        </template>
      </UAlert>
      <UAlert
        v-if="credito.estado === 'aceptado' && credito.renovacion?.creditoNuevoId"
        color="info"
        variant="subtle"
        class="mb-4"
      >
        <template #description>
          Renovación aprobada:
          <NuxtLink :to="`/creditos/${credito.renovacion.creditoNuevoId}`" class="underline">{{ credito.renovacion.creditoNuevoFolio }}</NuxtLink>.
          Este crédito se liquida al desembolsarla.
        </template>
      </UAlert>
      <UAlert
        v-else-if="credito.estado === 'aceptado' && credito.renovacion?.estado === 'pendiente'"
        color="info"
        variant="subtle"
        description="Hay una solicitud de renovación pendiente de aprobar."
        class="mb-4"
      />
      <UAlert
        v-if="credito.estado === 'aceptado' && credito.diasAtraso > 0"
        color="error"
        variant="subtle"
        :title="`${credito.diasAtraso} días de atraso`"
        :description="`Mora pendiente: ${formatearDinero(credito.moraPendienteCentavos)}. Adeudo total: ${formatearDinero(adeudo)}.`"
        class="mb-4"
      />

      <div class="grid gap-4 sm:grid-cols-2 mb-6">
        <UCard>
          <p class="text-sm text-muted">Saldo pendiente</p>
          <p class="text-2xl font-semibold">{{ formatearDinero(credito.saldoCentavos) }}</p>
          <p class="text-sm text-muted">de {{ formatearDinero(credito.totalCentavos) }}</p>
          <p v-if="credito.moraPendienteCentavos" class="text-sm text-error mt-1">
            + {{ formatearDinero(credito.moraPendienteCentavos) }} de mora
          </p>
          <p v-if="credito.estado === 'aceptado'" class="text-sm text-muted mt-1">
            {{ credito.semanasPagadas }} de {{ credito.plazoSemanas }} semanas pagadas<template
              v-if="credito.semanasParaRenovar && credito.semanasPagadas >= credito.semanasParaRenovar"
            > · puede renovar</template>
          </p>
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

      <template v-if="credito.moras.length">
        <h2 class="font-medium mb-2">Moras</h2>
        <p class="text-sm text-muted mb-2">
          {{ credito.moras.length }} {{ credito.moras.length === 1 ? 'semana vencida' : 'semanas vencidas' }} con
          {{ formatearDinero(credito.moraSemanalCentavos) }} de mora cada una ·
          pagada {{ formatearDinero(moraPagada) }}<template v-if="moraCondonada"> · condonada {{ formatearDinero(moraCondonada) }}</template>
          · pendiente <strong>{{ formatearDinero(credito.moraPendienteCentavos) }}</strong>
        </p>
        <p class="text-sm mb-6">Semanas: {{ credito.moras.map((m) => m.semana).join(', ') }}</p>
      </template>

      <h2 class="font-medium mb-2">Operaciones</h2>
      <UTable :data="credito.operaciones" :columns="columnasOperaciones" empty="Aún no hay operaciones registradas" />

      <UModal :open="!!accion" :title="accion ? TITULO[accion] : ''" :dismissible="!enviando" :close="!enviando" @update:open="(v) => { if (!v) cerrar() }">
        <template #body>
          <UForm id="form-accion" :state="datos" class="space-y-4" @submit="enviar">
            <template v-if="accion === 'desembolso'">
              <p class="text-sm">
                Entrega de <strong>{{ formatearDinero(credito.montoCentavos) }}</strong> a {{ credito.clienteNombre }}.
                El cliente pagará {{ formatearDinero(credito.totalCentavos) }} en {{ credito.plazoSemanas }} semanas.
              </p>
              <p v-if="credito.creditoAnterior" class="text-sm">
                Es una renovación: del monto se descuenta todo lo que se debe del crédito {{ credito.creditoAnterior.folio }}
                (saldo y mora), ese crédito queda liquidado y el cliente recibe la diferencia.
              </p>
              <UFormField label="Fecha de entrega" name="fecha" help="La semana 1 vence 7 días después.">
                <UInput v-model="datos.fecha" type="date" :max="hoy" class="w-full" />
              </UFormField>
            </template>

            <UFormField v-else-if="accion === 'cancelar'" label="Motivo (el cliente no recibió el dinero)" name="motivo">
              <UTextarea v-model="datos.motivo" :rows="3" class="w-full" />
            </UFormField>

            <template v-else-if="accion === 'condonar'">
              <p class="text-sm">Se perdona la mora pendiente de <strong>{{ formatearDinero(credito.moraPendienteCentavos) }}</strong>. El saldo del crédito no cambia.</p>
              <UFormField label="Motivo" name="motivo">
                <UTextarea v-model="datos.motivo" :rows="3" class="w-full" />
              </UFormField>
            </template>

            <template v-else-if="accion === 'pago'">
              <p v-if="credito.moraPendienteCentavos" class="text-sm text-error">
                Mora pendiente: {{ formatearDinero(credito.moraPendienteCentavos) }}. El pago cubre primero la mora.
              </p>
              <p v-if="siguienteSemana" class="text-sm text-muted">
                Semana {{ siguienteSemana.semana }}, vence {{ formatearFechaCorta(siguienteSemana.fechaVencimiento) }}:
                faltan {{ formatearDinero(siguienteSemana.montoCentavos - siguienteSemana.cubiertoCentavos) }}.
                Si el pago es menor queda como abono; si es mayor, cubre las semanas siguientes.
              </p>
              <UFormField label="Monto recibido" name="monto">
                <CampoNumero v-model="datos.monto" pesos />
              </UFormField>
              <p class="text-sm text-muted">Saldo pendiente: {{ formatearDinero(credito.saldoCentavos) }} · adeudo total: {{ formatearDinero(adeudo) }}</p>
            </template>

            <p v-else-if="accion === 'liquidacion'" class="text-sm">
              El cliente paga todo lo que debe: <strong>{{ formatearDinero(adeudo) }}</strong><template v-if="credito.moraPendienteCentavos">
              ({{ formatearDinero(credito.saldoCentavos) }} de saldo y {{ formatearDinero(credito.moraPendienteCentavos) }} de mora)</template>,
              y el crédito queda liquidado. Se genera el comprobante de liquidación.
            </p>

            <UAlert v-if="errorAccion" color="error" variant="subtle" :description="errorAccion" />
          </UForm>
        </template>
        <template #footer>
          <div class="flex gap-2 ml-auto">
            <UButton label="Cerrar" variant="outline" color="neutral" :disabled="enviando" @click="cerrar" />
            <UButton
              type="submit"
              form="form-accion"
              :label="accion === 'cancelar' ? 'Cancelar crédito' : accion === 'condonar' ? 'Condonar mora' : 'Guardar y ver comprobante'"
              :color="accion === 'cancelar' ? 'error' : 'primary'"
              :loading="enviando"
            />
          </div>
        </template>
      </UModal>
    </template>
  </div>
</template>
