<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import type { z } from 'zod'

definePageMeta({ roles: ['administrador', 'gerente'] })

const route = useRoute()
const toast = useToast()
const id = route.params.id as string

const { data: usuario, refresh, error: errorCarga } = await useFetch(`/api/usuarios/${id}`)

// --- Editar nombre y usuario ---
const estado = reactive({ nombre: '', usuario: '' })
watchEffect(() => {
  if (usuario.value) {
    estado.nombre = usuario.value.nombre
    estado.usuario = usuario.value.usuario
  }
})
const guardando = ref(false)

async function guardar(evento: FormSubmitEvent<z.output<typeof esquemaEditarUsuario>>) {
  guardando.value = true
  try {
    await $fetch(`/api/usuarios/${id}`, { method: 'PATCH', body: evento.data })
    toast.add({ title: 'Cambios guardados', color: 'success' })
    await refresh()
  } catch (e) {
    toast.add({ title: 'No se guardaron los cambios', description: mensajeDeError(e), color: 'error' })
  } finally {
    guardando.value = false
  }
}

// --- Activar / desactivar ---
const confirmarEstado = ref(false)
const cambiandoEstado = ref(false)

async function cambiarEstado() {
  cambiandoEstado.value = true
  const accion = usuario.value?.activo ? 'desactivar' : 'activar'
  try {
    await $fetch(`/api/usuarios/${id}/${accion}`, { method: 'POST' })
    toast.add({ title: accion === 'activar' ? 'Usuario activado' : 'Usuario desactivado', color: 'success' })
    await refresh()
  } catch (e) {
    toast.add({ title: `No se pudo ${accion}`, description: mensajeDeError(e), color: 'error' })
  } finally {
    cambiandoEstado.value = false
    confirmarEstado.value = false
  }
}

// --- Reasignar Cobrador (solo Administrador) ---
const { data: lista } = await useFetch('/api/usuarios', { immediate: usuario.value?.puedeReasignar ?? false })
const gerentes = computed(() =>
  (lista.value ?? [])
    .filter((u) => u.rol === 'gerente' && u.activo && u.id !== usuario.value?.gerenteId)
    .map((u) => ({ label: u.nombre, value: u.id })),
)
const nuevoGerenteId = ref<string>()
const confirmarReasignacion = ref(false)
const reasignando = ref(false)

async function reasignar() {
  reasignando.value = true
  try {
    await $fetch(`/api/usuarios/${id}/reasignar`, { method: 'POST', body: { gerenteId: nuevoGerenteId.value } })
    toast.add({ title: 'Cobrador reasignado', color: 'success' })
    nuevoGerenteId.value = undefined
    await refresh()
  } catch (e) {
    toast.add({ title: 'No se pudo reasignar', description: mensajeDeError(e), color: 'error' })
  } finally {
    reasignando.value = false
    confirmarReasignacion.value = false
  }
}
</script>

<template>
  <div class="max-w-2xl">
    <UButton to="/usuarios" icon="i-lucide-arrow-left" label="Volver" variant="link" color="neutral" class="px-0 mb-2" />

    <UAlert v-if="errorCarga" color="error" variant="subtle" :description="mensajeDeError(errorCarga)" />

    <template v-else-if="usuario">
      <div class="flex flex-wrap items-center gap-2 mb-4">
        <h1 class="text-xl font-semibold">{{ usuario.nombre }}</h1>
        <UBadge
          :label="usuario.activo ? 'Activo' : 'Desactivado'"
          :color="usuario.activo ? 'success' : 'neutral'"
          variant="subtle"
        />
      </div>

      <UCard class="mb-6">
        <dl class="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
          <dt class="text-muted">Usuario</dt>
          <dd>{{ usuario.usuario }}</dd>
          <dt class="text-muted">Rol</dt>
          <dd>{{ NOMBRE_ROL[usuario.rol] }}</dd>
          <template v-if="usuario.rol === 'cobrador'">
            <dt class="text-muted">Gerente</dt>
            <dd>{{ usuario.gerenteNombre }}</dd>
          </template>
          <dt class="text-muted">Contraseña</dt>
          <dd>{{ usuario.contrasenaTemporal ? 'Temporal (pendiente de cambiar)' : 'Definida por el usuario' }}</dd>
          <dt class="text-muted">Alta</dt>
          <dd>{{ formatearFecha(usuario.creadoEn) }}</dd>
        </dl>
      </UCard>

      <template v-if="usuario.puedeAdministrar">
        <h2 class="font-medium mb-2">Editar datos</h2>
        <UForm :schema="esquemaEditarUsuario" :state="estado" class="space-y-4 mb-8" @submit="guardar">
          <UFormField label="Nombre completo" name="nombre">
            <UInput v-model="estado.nombre" class="w-full" />
          </UFormField>
          <UFormField label="Nombre de usuario" name="usuario">
            <UInput v-model="estado.usuario" autocapitalize="none" class="w-full" />
          </UFormField>
          <UButton type="submit" label="Guardar cambios" :loading="guardando" />
        </UForm>

        <template v-if="usuario.puedeReasignar">
          <h2 class="font-medium mb-1">Reasignar a otro Gerente</h2>
          <p class="text-sm text-muted mb-2">El Cobrador conserva a sus clientes.</p>
          <div class="flex flex-wrap gap-2 mb-8">
            <USelect v-model="nuevoGerenteId" :items="gerentes" placeholder="Elige el nuevo Gerente" class="w-64" />
            <UButton label="Reasignar" variant="outline" :disabled="!nuevoGerenteId" @click="confirmarReasignacion = true" />
          </div>
        </template>

        <h2 class="font-medium mb-2">Estado de la cuenta</h2>
        <UButton
          v-if="usuario.activo"
          label="Desactivar usuario"
          color="error"
          variant="outline"
          @click="confirmarEstado = true"
        />
        <UButton v-else label="Activar usuario" variant="outline" @click="confirmarEstado = true" />
      </template>

      <Confirmacion
        v-model:open="confirmarEstado"
        :titulo="usuario.activo ? '¿Desactivar usuario?' : '¿Activar usuario?'"
        :descripcion="usuario.activo
          ? `${usuario.nombre} ya no podrá entrar al sistema. Su historial se conserva.`
          : `${usuario.nombre} podrá volver a entrar al sistema.`"
        :etiqueta="usuario.activo ? 'Desactivar' : 'Activar'"
        :color="usuario.activo ? 'error' : 'primary'"
        :cargando="cambiandoEstado"
        @confirmar="cambiarEstado"
      />

      <Confirmacion
        v-model:open="confirmarReasignacion"
        titulo="¿Reasignar Cobrador?"
        :descripcion="`${usuario.nombre} pasará a estar a cargo de ${gerentes.find((g) => g.value === nuevoGerenteId)?.label}.`"
        etiqueta="Reasignar"
        :cargando="reasignando"
        @confirmar="reasignar"
      />
    </template>
  </div>
</template>
