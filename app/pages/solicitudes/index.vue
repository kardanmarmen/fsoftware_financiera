<script setup lang="ts">
// RF46–RF52: solicitudes de crédito. El Gerente aprueba (puede ajustar las condiciones) o rechaza
// con motivo; el Cobrador consulta las suyas y el Administrador todas.
const { user } = useUserSession()
const esGerente = computed(() => user.value?.rol === 'gerente')

const route = useRoute()
const filtro = ref<'pendiente' | 'aprobada' | 'rechazada' | ''>(route.query.estado === 'aprobada' ? 'aprobada' : 'pendiente')
const { data: solicitudes, refresh, error: errorLista } = await useFetch('/api/solicitudes', {
  query: computed(() => ({ estado: filtro.value || undefined })),
  default: () => [],
})
type Solicitud = (typeof solicitudes.value)[number]

const filtros = [
  { label: 'Pendientes', value: 'pendiente' },
  { label: 'Aprobadas', value: 'aprobada' },
  { label: 'Rechazadas', value: 'rechazada' },
  { label: 'Todas', value: '' },
]
const COLOR_SOLICITUD = { pendiente: 'warning', aprobada: 'success', rechazada: 'error', cancelada: 'neutral' } as const

// Aprobación (RF47–RF52)
const aprobando = ref<Solicitud | null>(null)
const aprobacion = ref({ montoAprobado: undefined as number | undefined, tasaInteres: undefined as number | undefined, plazoSemanas: undefined as number | undefined, fechaDesembolso: '' })
const vistaPrevia = computed(() => {
  const a = aprobacion.value
  if (!a.montoAprobado || a.tasaInteres == null || !a.plazoSemanas || !Number.isInteger(a.plazoSemanas) || !a.fechaDesembolso) return null
  return calcularCredito(Math.round(a.montoAprobado * 100), Math.round(a.tasaInteres * 100), a.plazoSemanas, a.fechaDesembolso)
})

function abrirAprobacion(s: Solicitud) {
  error.value = ''
  aprobando.value = s
  aprobacion.value = {
    montoAprobado: s.montoSolicitadoCentavos / 100,
    tasaInteres: s.tasaInteresBp / 100,
    plazoSemanas: s.plazoSemanas,
    fechaDesembolso: hoyEnMexico(),
  }
}

// Rechazo (RF50, RF51)
const rechazando = ref<Solicitud | null>(null)
const rechazo = ref({ motivo: '' })
function abrirRechazo(s: Solicitud) {
  error.value = ''
  rechazando.value = s
  rechazo.value = { motivo: '' }
}

const error = ref('')
const enviando = ref(false)
const aviso = ref<{ texto: string, creditoId?: string } | null>(null)

async function aprobar() {
  error.value = ''
  enviando.value = true
  try {
    const s = aprobando.value!
    const { creditoId } = await $fetch<{ creditoId: string }>(`/api/solicitudes/${s.id}/aprobar`, { method: 'POST', body: aprobacion.value })
    aviso.value = { texto: `Solicitud de ${s.clienteNombre} aprobada. El crédito queda listo para desembolsar.`, creditoId }
    aprobando.value = null
    await refresh()
  } catch (e) {
    error.value = mensajeDeError(e)
  } finally {
    enviando.value = false
  }
}

async function rechazar() {
  error.value = ''
  enviando.value = true
  try {
    const s = rechazando.value!
    await $fetch(`/api/solicitudes/${s.id}/rechazar`, { method: 'POST', body: rechazo.value })
    aviso.value = { texto: `Solicitud de ${s.clienteNombre} rechazada.` }
    rechazando.value = null
    await refresh()
  } catch (e) {
    error.value = mensajeDeError(e)
  } finally {
    enviando.value = false
  }
}
</script>

<template>
  <div class="max-w-3xl">
    <EncabezadoPagina titulo="Solicitudes de crédito" :descripcion="esGerente ? 'Revisa y aprueba las solicitudes de tus Cobradores.' : undefined" />

    <div class="flex flex-wrap gap-1 mb-4">
      <UButton
        v-for="f in filtros"
        :key="f.value"
        :label="f.label"
        :variant="filtro === f.value ? 'solid' : 'outline'"
        color="neutral"
        size="sm"
        @click="filtro = f.value as typeof filtro"
      />
    </div>

    <UAlert v-if="aviso" color="success" variant="subtle" :description="aviso.texto" class="mb-4" :close="true" @update:open="aviso = null">
      <template v-if="aviso.creditoId" #actions>
        <UButton :to="`/creditos/${aviso.creditoId}`" label="Ver crédito" size="sm" variant="outline" />
      </template>
    </UAlert>
    <UAlert v-if="errorLista" color="error" variant="subtle" :description="mensajeDeError(errorLista)" class="mb-4" />

    <p v-if="solicitudes.length === 0" class="text-sm text-muted">No hay solicitudes.</p>
    <div v-else class="space-y-2">
      <div v-for="s in solicitudes" :key="s.id" class="rounded-md border border-default p-3">
        <div class="flex flex-wrap items-center gap-2">
          <NuxtLink :to="`/clientes/${s.clienteId}`" class="font-medium hover:underline">{{ s.clienteNombre }}</NuxtLink>
          <UBadge :label="NOMBRE_ESTADO_SOLICITUD[s.estado]" :color="COLOR_SOLICITUD[s.estado]" variant="subtle" />
          <UBadge v-if="s.tipo === 'renovacion'" label="Renovación" color="info" variant="outline" />
          <span class="ml-auto font-medium">{{ formatearDinero(s.montoAprobadoCentavos ?? s.montoSolicitadoCentavos) }}</span>
        </div>
        <p class="text-sm text-muted mt-1">
          {{ s.modeloNombre }} · {{ formatearPorcentaje(s.tasaInteresBp) }} · {{ s.plazoSemanas }} semanas ·
          Cobrador: {{ s.cobradorNombre }} · {{ formatearFecha(s.creadoEn) }}
        </p>
        <p v-if="s.ocupacion || s.ingresoSemanalCentavos" class="text-sm text-muted">
          <template v-if="s.ocupacion">{{ s.ocupacion }}</template>
          <template v-if="s.ocupacion && s.ingresoSemanalCentavos"> · </template>
          <template v-if="s.ingresoSemanalCentavos">Ingreso semanal {{ formatearDinero(s.ingresoSemanalCentavos) }}</template>
        </p>
        <p v-if="s.creditoAnteriorFolio" class="text-sm text-muted">
          Renueva {{ s.creditoAnteriorFolio }}<template v-if="s.estado === 'pendiente'">, saldo actual {{ formatearDinero(s.creditoAnteriorSaldoCentavos) }}</template>
        </p>
        <p v-if="s.motivo" class="text-sm text-muted">Motivo: {{ s.motivo }}</p>
        <div v-if="s.creditoId" class="flex flex-wrap items-center gap-2 mt-2">
          <UBadge v-if="s.creditoEstado === 'aprobado'" label="Por desembolsar" color="info" variant="subtle" />
          <UButton :to="`/creditos/${s.creditoId}`" label="Ver crédito" size="sm" variant="outline" />
        </div>
        <div v-if="esGerente && s.estado === 'pendiente'" class="flex gap-2 mt-2">
          <UButton label="Aprobar" icon="i-lucide-check" size="sm" @click="abrirAprobacion(s)" />
          <UButton label="Rechazar" icon="i-lucide-x" size="sm" color="error" variant="outline" @click="abrirRechazo(s)" />
        </div>
      </div>
    </div>

    <UModal
      :open="!!aprobando"
      :title="`Aprobar solicitud de ${aprobando?.clienteNombre ?? ''}`"
      description="Puedes ajustar el monto, el interés y el plazo antes de aprobar."
      :dismissible="!enviando"
      @update:open="(v) => { if (!v && !enviando) aprobando = null }"
    >
      <template #body>
        <UForm id="form-aprobar" :schema="esquemaAprobarSolicitud" :state="aprobacion" class="grid gap-4 sm:grid-cols-2" @submit="aprobar">
          <UFormField label="Monto aprobado" name="montoAprobado">
            <CampoNumero v-model="aprobacion.montoAprobado" pesos />
          </UFormField>
          <UFormField label="Interés total (%)" name="tasaInteres">
            <CampoNumero v-model="aprobacion.tasaInteres" />
          </UFormField>
          <UFormField label="Plazo (semanas)" name="plazoSemanas">
            <CampoNumero v-model="aprobacion.plazoSemanas" enteros />
          </UFormField>
          <UFormField label="Fecha de desembolso" name="fechaDesembolso">
            <UInput v-model="aprobacion.fechaDesembolso" type="date" class="w-full" />
          </UFormField>
          <p v-if="vistaPrevia" class="text-sm sm:col-span-2">
            Total a pagar <strong>{{ formatearDinero(vistaPrevia.totalCentavos) }}</strong>
            (interés {{ formatearDinero(vistaPrevia.interesCentavos) }}) en {{ vistaPrevia.calendario.length }} pagos de
            <strong>{{ formatearDinero(vistaPrevia.pagoSemanalCentavos) }}</strong><template
              v-if="vistaPrevia.calendario.at(-1)!.montoCentavos !== vistaPrevia.pagoSemanalCentavos"
            >; el último de {{ formatearDinero(vistaPrevia.calendario.at(-1)!.montoCentavos) }}</template>.
          </p>
          <p v-if="aprobando?.creditoAnteriorFolio && aprobacion.montoAprobado" class="text-sm sm:col-span-2">
            Renovación: al desembolsar se liquida {{ aprobando.creditoAnteriorFolio }}
            (saldo {{ formatearDinero(aprobando.creditoAnteriorSaldoCentavos) }}, más la mora que tenga) y el cliente recibe
            alrededor de <strong>{{ formatearDinero(Math.round(aprobacion.montoAprobado * 100) - (aprobando.creditoAnteriorSaldoCentavos ?? 0)) }}</strong>.
          </p>
          <UAlert v-if="error" color="error" variant="subtle" :description="error" class="sm:col-span-2" />
        </UForm>
      </template>
      <template #footer>
        <div class="flex gap-2 ml-auto">
          <UButton label="Cancelar" variant="outline" color="neutral" :disabled="enviando" @click="aprobando = null" />
          <UButton type="submit" form="form-aprobar" label="Aprobar y generar crédito" :loading="enviando" />
        </div>
      </template>
    </UModal>

    <UModal
      :open="!!rechazando"
      :title="`Rechazar solicitud de ${rechazando?.clienteNombre ?? ''}`"
      :dismissible="!enviando"
      @update:open="(v) => { if (!v && !enviando) rechazando = null }"
    >
      <template #body>
        <UForm id="form-rechazar" :schema="esquemaRechazarSolicitud" :state="rechazo" class="space-y-4" @submit="rechazar">
          <UFormField label="Motivo del rechazo" name="motivo">
            <UTextarea v-model="rechazo.motivo" :rows="3" class="w-full" />
          </UFormField>
          <UAlert v-if="error" color="error" variant="subtle" :description="error" />
        </UForm>
      </template>
      <template #footer>
        <div class="flex gap-2 ml-auto">
          <UButton label="Cancelar" variant="outline" color="neutral" :disabled="enviando" @click="rechazando = null" />
          <UButton type="submit" form="form-rechazar" label="Rechazar" color="error" :loading="enviando" />
        </div>
      </template>
    </UModal>
  </div>
</template>
