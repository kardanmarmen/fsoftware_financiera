<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import type { z } from 'zod'

// RF10, RF13, RF15. El Administrador solo consulta clientes (diseño 2.1, matriz 4.1).
definePageMeta({ roles: ['gerente', 'cobrador'] })

const { user } = useUserSession()
const esGerente = computed(() => user.value?.rol === 'gerente')

type Datos = z.output<typeof esquemaNuevoCliente>
const vacio = () => ({
  curp: '', nombre: '', apellidoPaterno: '', apellidoMaterno: '',
  telefono: '', telefonoAlterno: '', correo: '',
  calle: '', numeroExterior: '', numeroInterior: '', colonia: '', municipio: '',
  estado: 'Veracruz' as const, codigoPostal: '',
  referenciasDomicilio: '', notas: '', cobradorId: undefined as string | undefined,
})
const estado = ref(vacio())

// El Gerente elige a cuál de sus Cobradores activos se asigna el cliente.
const { data: lista } = await useFetch('/api/usuarios', { immediate: esGerente.value })
const cobradores = computed(() =>
  (lista.value ?? []).filter((u) => u.rol === 'cobrador' && u.activo).map((u) => ({ label: u.nombre, value: u.id })),
)

const error = ref('')
const clienteExistente = ref<string | null>(null)
const enviando = ref(false)
const creado = ref<{ id: string, nombre: string } | null>(null)

async function registrar(evento: FormSubmitEvent<Datos>) {
  error.value = ''
  clienteExistente.value = null
  enviando.value = true
  try {
    const { id } = await $fetch<{ id: string }>('/api/clientes', {
      method: 'POST',
      body: { ...evento.data, cobradorId: esGerente.value ? evento.data.cobradorId : undefined },
    })
    creado.value = { id, nombre: nombreCompleto(evento.data) }
  } catch (e) {
    error.value = mensajeDeError(e)
    clienteExistente.value = (e as { data?: { data?: { clienteId?: string } } }).data?.data?.clienteId ?? null
  } finally {
    enviando.value = false
  }
}

function registrarOtro() {
  estado.value = vacio()
  creado.value = null
}
</script>

<template>
  <div class="max-w-2xl">
    <UButton to="/clientes" icon="i-lucide-arrow-left" label="Volver" variant="link" color="neutral" class="px-0 mb-2" />
    <EncabezadoPagina titulo="Nuevo cliente" />

    <div v-if="creado" class="space-y-4">
      <UAlert color="success" variant="subtle" :title="`${creado.nombre} quedó registrado`" />
      <div class="flex flex-wrap gap-2">
        <UButton :to="`/clientes/${creado.id}`" label="Ver cliente" />
        <UButton label="Registrar otro" variant="outline" color="neutral" @click="registrarOtro" />
      </div>
    </div>

    <UForm v-else :schema="esquemaNuevoCliente" :state="estado" class="space-y-6" @submit="registrar">
      <FormularioCliente v-model="estado">
        <UFormField v-if="esGerente" label="Cobrador responsable" name="cobradorId">
          <USelect v-model="estado.cobradorId" :items="cobradores" placeholder="Elige el Cobrador" class="w-full" />
          <template v-if="cobradores.length === 0" #help>
            Primero registra un Cobrador activo.
          </template>
        </UFormField>
      </FormularioCliente>

      <UAlert v-if="error" color="error" variant="subtle" :description="error">
        <template v-if="clienteExistente" #actions>
          <UButton :to="`/clientes/${clienteExistente}`" label="Ver cliente" size="sm" variant="outline" />
        </template>
      </UAlert>

      <UButton type="submit" label="Registrar cliente" :loading="enviando" />
    </UForm>
  </div>
</template>
