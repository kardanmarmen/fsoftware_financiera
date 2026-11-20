<script setup lang="ts">
// RF41, RF42: el Cobrador (o su Gerente) captura una solicitud de crédito para el cliente.
definePageMeta({ roles: ['gerente', 'cobrador'] })

const route = useRoute()
const clienteId = route.params.id as string
const [{ data: cliente, error: errorCliente }, { data: modelos }] = await Promise.all([
  useFetch(`/api/clientes/${clienteId}`),
  useFetch('/api/modelos', { default: () => [] }),
])

const opciones = computed(() => modelos.value.filter((m) => m.activo).map((m) => ({ label: m.nombre, value: m.id })))
const estado = ref({
  clienteId,
  modeloId: undefined as string | undefined,
  montoSolicitado: undefined as number | undefined,
  ocupacion: '',
  ingresoSemanal: undefined as number | undefined,
})
const modelo = computed(() => modelos.value.find((m) => m.id === estado.value.modeloId))

// Vista previa con las condiciones del modelo (el Gerente las puede ajustar al aprobar)
const vistaPrevia = computed(() => {
  const m = modelo.value
  const monto = estado.value.montoSolicitado
  if (!m || !monto || monto <= 0) return null
  return calcularCredito(Math.round(monto * 100), m.tasaInteresBp, m.plazoSemanas, hoyEnMexico())
})

const error = ref('')
const enviando = ref(false)

async function enviar() {
  error.value = ''
  enviando.value = true
  try {
    await $fetch('/api/solicitudes', { method: 'POST', body: estado.value })
    await navigateTo(`/clientes/${clienteId}`)
  } catch (e) {
    error.value = mensajeDeError(e)
  } finally {
    enviando.value = false
  }
}
</script>

<template>
  <div class="max-w-xl">
    <UButton :to="`/clientes/${clienteId}`" icon="i-lucide-arrow-left" label="Volver" variant="link" color="neutral" class="px-0 mb-2" />

    <UAlert v-if="errorCliente" color="error" variant="subtle" :description="mensajeDeError(errorCliente)" />

    <template v-else-if="cliente">
      <EncabezadoPagina titulo="Nueva solicitud de crédito" :descripcion="nombreCompleto(cliente)" />

      <UAlert
        v-if="!cliente.puedeSolicitar"
        color="warning"
        variant="subtle"
        description="El cliente ya tiene una solicitud pendiente o un crédito vigente."
      />
      <UAlert
        v-else-if="opciones.length === 0"
        color="warning"
        variant="subtle"
        description="No hay modelos de crédito activos. El Administrador debe crear uno en Modelos."
      />

      <UForm v-else :schema="esquemaSolicitud" :state="estado" class="space-y-4" @submit="enviar">
        <UFormField label="Modelo de crédito" name="modeloId">
          <USelect v-model="estado.modeloId" :items="opciones" placeholder="Elige el modelo" class="w-full" />
          <template v-if="modelo" #help>
            {{ formatearPorcentaje(modelo.tasaInteresBp) }} de interés · {{ modelo.plazoSemanas }} semanas ·
            mora {{ formatearDinero(modelo.moraSemanalCentavos) }} por semana
          </template>
        </UFormField>
        <UFormField label="Monto solicitado" name="montoSolicitado">
          <CampoNumero v-model="estado.montoSolicitado" pesos />
          <template v-if="vistaPrevia" #help>
            Total a pagar {{ formatearDinero(vistaPrevia.totalCentavos) }} en pagos de
            {{ formatearDinero(vistaPrevia.pagoSemanalCentavos) }}
          </template>
        </UFormField>
        <UFormField label="Ocupación" name="ocupacion" hint="Opcional">
          <UInput v-model="estado.ocupacion" class="w-full" />
        </UFormField>
        <UFormField label="Ingreso semanal" name="ingresoSemanal" hint="Opcional">
          <CampoNumero v-model="estado.ingresoSemanal" pesos />
        </UFormField>

        <UAlert v-if="error" color="error" variant="subtle" :description="error" />
        <UButton type="submit" label="Enviar solicitud" :loading="enviando" />
      </UForm>
    </template>
  </div>
</template>
