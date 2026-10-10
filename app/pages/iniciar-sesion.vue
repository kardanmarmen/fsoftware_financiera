<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import type { z } from 'zod'

definePageMeta({ layout: false })

const { fetch: actualizarSesion } = useUserSession()

// Motivo por el que se cerró la sesión anterior (lo deja el plugin sesion-cerrada).
const aviso = useState('aviso-sesion', () => '')
const estado = reactive({ usuario: '', contrasena: '' })
const error = ref('')
const enviando = ref(false)

async function iniciarSesion(evento: FormSubmitEvent<z.output<typeof esquemaIniciarSesion>>) {
  error.value = ''
  aviso.value = ''
  enviando.value = true
  try {
    const { contrasenaTemporal } = await $fetch('/api/auth/iniciar-sesion', {
      method: 'POST',
      body: evento.data,
    })
    await actualizarSesion()
    await navigateTo(contrasenaTemporal ? '/cambiar-contrasena' : '/')
  } catch (e) {
    error.value = mensajeDeError(e)
  } finally {
    enviando.value = false
  }
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center p-4">
    <UCard class="w-full max-w-sm">
      <template #header>
        <h1 class="text-lg font-semibold">Financiera</h1>
        <p class="text-sm text-muted">Inicia sesión para continuar</p>
      </template>

      <UForm :schema="esquemaIniciarSesion" :state="estado" class="space-y-4" @submit="iniciarSesion">
        <UFormField label="Usuario" name="usuario">
          <UInput v-model="estado.usuario" autocomplete="username" autocapitalize="none" class="w-full" />
        </UFormField>

        <UFormField label="Contraseña" name="contrasena">
          <CampoContrasena v-model="estado.contrasena" autocomplete="current-password" class="w-full" />
        </UFormField>

        <UAlert v-if="aviso && !error" color="warning" variant="subtle" :description="aviso" />
        <UAlert v-if="error" color="error" variant="subtle" :description="error" />

        <UButton type="submit" label="Entrar" block :loading="enviando" />
      </UForm>
    </UCard>
  </div>
</template>
