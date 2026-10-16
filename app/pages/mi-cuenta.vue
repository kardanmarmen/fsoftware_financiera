<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import type { z } from 'zod'

const toast = useToast()
const { fetch: actualizarSesion } = useUserSession()
const { data: cuenta, refresh } = await useFetch('/api/mi-cuenta')

const estado = reactive({ nombre: '' })
watchEffect(() => {
  if (cuenta.value) estado.nombre = cuenta.value.nombre
})
const guardando = ref(false)

async function guardar(evento: FormSubmitEvent<z.output<typeof esquemaMiCuenta>>) {
  guardando.value = true
  try {
    await $fetch('/api/mi-cuenta', { method: 'PATCH', body: evento.data })
    await Promise.all([refresh(), actualizarSesion()])
    toast.add({ title: 'Nombre actualizado', color: 'success' })
  } catch (e) {
    toast.add({ title: 'No se guardó el cambio', description: mensajeDeError(e), color: 'error' })
  } finally {
    guardando.value = false
  }
}
</script>

<template>
  <div class="max-w-md">
    <EncabezadoPagina titulo="Mi cuenta" />

    <UCard v-if="cuenta" class="mb-6">
      <dl class="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
        <dt class="text-muted">Nombre</dt>
        <dd>{{ cuenta.nombre }}</dd>
        <dt class="text-muted">Usuario</dt>
        <dd>{{ cuenta.usuario }}</dd>
        <dt class="text-muted">Rol</dt>
        <dd>{{ NOMBRE_ROL[cuenta.rol] }}</dd>
        <template v-if="cuenta.rol === 'cobrador'">
          <dt class="text-muted">Gerente</dt>
          <dd>{{ cuenta.gerenteNombre }}</dd>
        </template>
      </dl>
      <p v-if="!cuenta.puedeEditarNombre" class="text-sm text-muted mt-4">
        Si algún dato es incorrecto, pide a {{ cuenta.rol === 'cobrador' ? 'tu Gerente' : 'el Administrador' }} que lo corrija.
      </p>
    </UCard>

    <template v-if="cuenta?.puedeEditarNombre">
      <h2 class="font-medium mb-2">Corregir mi nombre</h2>
      <UForm :schema="esquemaMiCuenta" :state="estado" class="space-y-4 mb-8" @submit="guardar">
        <UFormField label="Nombre completo" name="nombre">
          <UInput v-model="estado.nombre" class="w-full" />
        </UFormField>
        <UButton type="submit" label="Guardar" :loading="guardando" />
      </UForm>
    </template>

    <h2 class="font-medium mb-2">Contraseña</h2>
    <UButton to="/cambiar-contrasena" icon="i-lucide-key-round" label="Cambiar mi contraseña" variant="outline" />
  </div>
</template>
