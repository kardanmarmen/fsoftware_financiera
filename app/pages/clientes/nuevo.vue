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
const estado = reactive(vacio())

// El Gerente elige a cuál de sus Cobradores activos se asigna el cliente.
const { data: lista } = await useFetch('/api/usuarios', { immediate: esGerente.value })
const cobradores = computed(() =>
  (lista.value ?? []).filter((u) => u.rol === 'cobrador' && u.activo).map((u) => ({ label: u.nombre, value: u.id })),
)
const opcionesEstado = [...ESTADOS_MEXICO]

// RN-21: la fecha de nacimiento sale de la CURP; se muestra para que el usuario la confirme.
const fechaNacimiento = computed(() => {
  const curp = estado.curp.trim().toUpperCase()
  const fecha = curp.length === 18 ? fechaDeCurp(curp) : null
  return fecha ? formatearFechaCorta(fecha) : null
})

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
  Object.assign(estado, vacio())
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
        <UButton label="Registrar otro" @click="registrarOtro" />
        <UButton to="/clientes" label="Ir a la lista" variant="outline" color="neutral" />
      </div>
    </div>

    <UForm v-else :schema="esquemaNuevoCliente" :state="estado" class="space-y-6" @submit="registrar">
      <section class="space-y-4">
        <h2 class="font-medium">Datos personales</h2>

        <UFormField label="CURP" name="curp" :help="fechaNacimiento ? `Fecha de nacimiento: ${fechaNacimiento}` : undefined">
          <UInput
            :model-value="estado.curp"
            autocapitalize="characters"
            maxlength="18"
            class="w-full"
            @update:model-value="estado.curp = String($event).toUpperCase()"
          />
        </UFormField>

        <div class="grid gap-4 sm:grid-cols-3">
          <UFormField label="Nombre(s)" name="nombre">
            <UInput v-model="estado.nombre" class="w-full" />
          </UFormField>
          <UFormField label="Apellido paterno" name="apellidoPaterno">
            <UInput v-model="estado.apellidoPaterno" class="w-full" />
          </UFormField>
          <UFormField label="Apellido materno" name="apellidoMaterno" hint="Opcional">
            <UInput v-model="estado.apellidoMaterno" class="w-full" />
          </UFormField>
        </div>
      </section>

      <section class="space-y-4">
        <h2 class="font-medium">Contacto</h2>
        <div class="grid gap-4 sm:grid-cols-2">
          <UFormField label="Teléfono" name="telefono">
            <UInput v-model="estado.telefono" type="tel" inputmode="numeric" maxlength="10" class="w-full" />
          </UFormField>
          <UFormField label="Otro teléfono" name="telefonoAlterno" hint="Opcional">
            <UInput v-model="estado.telefonoAlterno" type="tel" inputmode="numeric" maxlength="10" class="w-full" />
          </UFormField>
        </div>
        <UFormField label="Correo electrónico" name="correo" hint="Opcional">
          <UInput v-model="estado.correo" type="email" autocapitalize="none" class="w-full" />
        </UFormField>
      </section>

      <section class="space-y-4">
        <h2 class="font-medium">Domicilio</h2>
        <UFormField label="Calle" name="calle">
          <UInput v-model="estado.calle" class="w-full" />
        </UFormField>
        <div class="grid grid-cols-2 gap-4">
          <UFormField label="Número exterior" name="numeroExterior">
            <UInput v-model="estado.numeroExterior" class="w-full" />
          </UFormField>
          <UFormField label="Número interior" name="numeroInterior" hint="Opcional">
            <UInput v-model="estado.numeroInterior" class="w-full" />
          </UFormField>
        </div>
        <div class="grid gap-4 sm:grid-cols-2">
          <UFormField label="Colonia" name="colonia">
            <UInput v-model="estado.colonia" class="w-full" />
          </UFormField>
          <UFormField label="Código postal" name="codigoPostal">
            <UInput v-model="estado.codigoPostal" inputmode="numeric" maxlength="5" class="w-full" />
          </UFormField>
          <UFormField label="Municipio" name="municipio">
            <UInput v-model="estado.municipio" class="w-full" />
          </UFormField>
          <UFormField label="Estado" name="estado">
            <USelectMenu v-model="estado.estado" :items="opcionesEstado" class="w-full" />
          </UFormField>
        </div>
        <UFormField label="Referencias del domicilio" name="referenciasDomicilio" hint="Opcional" help="Entre qué calles, color de la casa, algún negocio cercano…">
          <UTextarea v-model="estado.referenciasDomicilio" :rows="2" class="w-full" />
        </UFormField>
      </section>

      <section class="space-y-4">
        <h2 class="font-medium">Otros datos</h2>
        <UFormField v-if="esGerente" label="Cobrador responsable" name="cobradorId">
          <USelect v-model="estado.cobradorId" :items="cobradores" placeholder="Elige el Cobrador" class="w-full" />
          <template v-if="cobradores.length === 0" #help>
            Primero registra un Cobrador activo.
          </template>
        </UFormField>
        <UFormField label="Notas" name="notas" hint="Opcional">
          <UTextarea v-model="estado.notas" :rows="2" class="w-full" />
        </UFormField>
      </section>

      <UAlert v-if="error" color="error" variant="subtle" :description="error">
        <template v-if="clienteExistente" #actions>
          <UButton to="/clientes" label="Ver clientes" size="sm" variant="outline" />
        </template>
      </UAlert>

      <UButton type="submit" label="Registrar cliente" :loading="enviando" />
    </UForm>
  </div>
</template>
