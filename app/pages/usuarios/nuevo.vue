<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import type { z } from 'zod'

definePageMeta({ roles: ['administrador', 'gerente'] })

const { user } = useUserSession()
const esAdmin = computed(() => user.value?.rol === 'administrador')

type Datos = z.output<typeof esquemaNuevoUsuario>
const estado = reactive<Partial<Datos>>({ usuario: '', nombre: '', rol: 'cobrador', gerenteId: undefined })

// El Administrador elige el Gerente de un Cobrador; el Gerente no ve esta lista.
const { data: lista } = await useFetch('/api/usuarios', { immediate: esAdmin.value })
const gerentes = computed(() =>
  (lista.value ?? [])
    .filter((u) => u.rol === 'gerente' && u.activo)
    .map((u) => ({ label: u.nombre, value: u.id })),
)
const opcionesRol = [
  { label: 'Cobrador', value: 'cobrador' },
  { label: 'Gerente', value: 'gerente' },
]

const error = ref('')
const enviando = ref(false)
interface Creado { id: string, usuario: string, contrasenaTemporal: string }
const creado = ref<Creado | null>(null)

async function crear(evento: FormSubmitEvent<Datos>) {
  error.value = ''
  enviando.value = true
  try {
    const datos = { ...evento.data, gerenteId: evento.data.rol === 'cobrador' ? evento.data.gerenteId : undefined }
    creado.value = await $fetch<Creado>('/api/usuarios', { method: 'POST', body: datos })
  } catch (e) {
    error.value = mensajeDeError(e)
  } finally {
    enviando.value = false
  }
}
</script>

<template>
  <div class="max-w-md">
    <UButton to="/usuarios" icon="i-lucide-arrow-left" label="Volver" variant="link" color="neutral" class="px-0 mb-2" />
    <EncabezadoPagina :titulo="esAdmin ? 'Nuevo usuario' : 'Nuevo Cobrador'" />

    <div v-if="creado" class="space-y-4">
      <ContrasenaTemporal :usuario="creado.usuario" :contrasena="creado.contrasenaTemporal" />
      <div class="flex gap-2">
        <UButton :to="`/usuarios/${creado.id}`" label="Ver usuario" />
        <UButton to="/usuarios" label="Ir a la lista" variant="outline" color="neutral" />
      </div>
    </div>

    <UForm v-else :schema="esquemaNuevoUsuario" :state="estado" class="space-y-4" @submit="crear">
      <UFormField label="Nombre completo" name="nombre">
        <UInput v-model="estado.nombre" class="w-full" />
      </UFormField>

      <UFormField label="Nombre de usuario" name="usuario" help="Con este nombre inicia sesión. Ejemplo: jperez">
        <UInput v-model="estado.usuario" autocapitalize="none" class="w-full" />
      </UFormField>

      <template v-if="esAdmin">
        <UFormField label="Rol" name="rol">
          <USelect v-model="estado.rol" :items="opcionesRol" class="w-full" />
        </UFormField>

        <UFormField v-if="estado.rol === 'cobrador'" label="Gerente" name="gerenteId">
          <USelect
            v-model="estado.gerenteId"
            :items="gerentes"
            placeholder="Elige el Gerente"
            class="w-full"
          />
          <template v-if="gerentes.length === 0" #help>
            Primero registra un Gerente.
          </template>
        </UFormField>
      </template>

      <UAlert v-if="error" color="error" variant="subtle" :description="error" />

      <UButton type="submit" label="Registrar" :loading="enviando" />
    </UForm>
  </div>
</template>
