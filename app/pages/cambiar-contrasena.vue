<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import type { z } from 'zod'

const { user, fetch: actualizarSesion } = useUserSession()
const toast = useToast()
const estado = reactive({ actual: '', nueva: '', confirmacion: '' })
const error = ref('')
const enviando = ref(false)

async function cambiar(evento: FormSubmitEvent<z.output<typeof esquemaCambiarContrasena>>) {
  error.value = ''
  enviando.value = true
  // Con contraseña temporal se viene del login: al terminar va al inicio; si no, vuelve a "Mi cuenta".
  const eraTemporal = user.value?.contrasenaTemporal
  try {
    await $fetch('/api/auth/cambiar-contrasena', { method: 'POST', body: evento.data })
    await actualizarSesion()
    toast.add({ title: 'Contraseña actualizada', color: 'success' })
    await navigateTo(eraTemporal ? '/' : '/mi-cuenta')
  } catch (e) {
    error.value = mensajeDeError(e)
  } finally {
    enviando.value = false
  }
}
</script>

<template>
  <div class="max-w-md">
    <h1 class="text-xl font-semibold mb-1">Cambiar contraseña</h1>

    <UAlert
      v-if="user?.contrasenaTemporal"
      class="my-4"
      color="warning"
      variant="subtle"
      title="Tienes una contraseña temporal"
      description="Elige una contraseña nueva para poder usar el sistema."
    />

    <UForm :schema="esquemaCambiarContrasena" :state="estado" class="space-y-4 mt-4" @submit="cambiar">
      <UFormField :label="user?.contrasenaTemporal ? 'Contraseña temporal' : 'Contraseña actual'" name="actual">
        <UInput v-model="estado.actual" type="password" autocomplete="current-password" class="w-full" />
      </UFormField>

      <UFormField label="Nueva contraseña" name="nueva" help="Mínimo 8 caracteres">
        <UInput v-model="estado.nueva" type="password" autocomplete="new-password" class="w-full" />
      </UFormField>

      <UFormField label="Confirma la nueva contraseña" name="confirmacion">
        <UInput v-model="estado.confirmacion" type="password" autocomplete="new-password" class="w-full" />
      </UFormField>

      <UAlert v-if="error" color="error" variant="subtle" :description="error" />

      <UButton type="submit" label="Guardar contraseña" :loading="enviando" />
    </UForm>
  </div>
</template>
