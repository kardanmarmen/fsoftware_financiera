<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import type { z } from 'zod'

// RF12, RF13. Edita el Cobrador sus clientes y el Gerente los de sus Cobradores (matriz 4.1).
definePageMeta({ roles: ['gerente', 'cobrador'] })

const route = useRoute()
const id = String(route.params.id)
const { data: cliente, error: errorCarga } = await useFetch(`/api/clientes/${id}`)

type Datos = z.output<typeof esquemaEditarCliente>
// Los campos opcionales vacíos llegan como null; el formulario los necesita como texto
const estado = ref({
  curp: '', nombre: '', apellidoPaterno: '', apellidoMaterno: '',
  telefono: '', telefonoAlterno: '', correo: '',
  calle: '', numeroExterior: '', numeroInterior: '', colonia: '', municipio: '',
  estado: 'Veracruz' as (typeof ESTADOS_MEXICO)[number], codigoPostal: '',
  referenciasDomicilio: '', notas: '', actualizadoEn: 0,
})
watchEffect(() => {
  const c = cliente.value
  if (!c) return
  estado.value = {
    curp: c.curp, nombre: c.nombre, apellidoPaterno: c.apellidoPaterno, apellidoMaterno: c.apellidoMaterno ?? '',
    telefono: c.telefono, telefonoAlterno: c.telefonoAlterno ?? '', correo: c.correo ?? '',
    calle: c.calle, numeroExterior: c.numeroExterior, numeroInterior: c.numeroInterior ?? '',
    colonia: c.colonia, municipio: c.municipio, estado: c.estado as (typeof ESTADOS_MEXICO)[number],
    codigoPostal: c.codigoPostal, referenciasDomicilio: c.referenciasDomicilio ?? '', notas: c.notas ?? '',
    actualizadoEn: c.actualizadoEn,
  }
})

const error = ref('')
const enviando = ref(false)
const guardado = useState<boolean>('cliente-guardado', () => false)

async function guardar(evento: FormSubmitEvent<Datos>) {
  error.value = ''
  enviando.value = true
  try {
    await $fetch(`/api/clientes/${id}`, { method: 'PATCH', body: evento.data })
    guardado.value = true
    await navigateTo(`/clientes/${id}`)
  } catch (e) {
    error.value = mensajeDeError(e)
  } finally {
    enviando.value = false
  }
}
</script>

<template>
  <div class="max-w-2xl">
    <UButton :to="`/clientes/${id}`" icon="i-lucide-arrow-left" label="Volver" variant="link" color="neutral" class="px-0 mb-2" />

    <UAlert v-if="errorCarga" color="error" variant="subtle" :description="mensajeDeError(errorCarga)" />

    <template v-else-if="cliente">
      <EncabezadoPagina titulo="Editar cliente" />

      <UForm :schema="esquemaEditarCliente" :state="estado" class="space-y-6" @submit="guardar">
        <FormularioCliente v-model="estado" :curp-bloqueada="!cliente.puedeCorregirCurp" />

        <UAlert v-if="error" color="error" variant="subtle" :description="error" />

        <div class="flex gap-2">
          <UButton type="submit" label="Guardar cambios" :loading="enviando" />
          <UButton :to="`/clientes/${id}`" label="Cancelar" variant="outline" color="neutral" :disabled="enviando" />
        </div>
      </UForm>
    </template>
  </div>
</template>
