<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import type { z } from 'zod'

definePageMeta({ roles: ['administrador', 'gerente'] })

const route = useRoute()
const toast = useToast()
const id = route.params.id as string

const { data: usuario, refresh, error: errorCarga } = await useFetch(`/api/usuarios/${id}`)

// --- RF27: modelos de crédito que puede usar el Cobrador ---
const { data: modelos } = await useFetch('/api/modelos', { default: () => [], immediate: usuario.value?.puedeAsignarModelos ?? false })
const modelosElegidos = ref<string[]>([])
watchEffect(() => { modelosElegidos.value = [...(usuario.value?.modelosAsignados ?? [])] })
const guardandoModelos = ref(false)
async function guardarModelos() {
  guardandoModelos.value = true
  try {
    await $fetch(`/api/usuarios/${id}/modelos`, { method: 'PUT', body: { modeloIds: modelosElegidos.value } })
    toast.add({ title: 'Modelos guardados', color: 'success' })
    await refresh()
  } catch (e) {
    toast.add({ title: mensajeDeError(e), color: 'error' })
  } finally {
    guardandoModelos.value = false
  }
}
function alternarModelo(modeloId: string, marcado: boolean | 'indeterminate') {
  modelosElegidos.value = marcado === true
    ? [...modelosElegidos.value, modeloId]
    : modelosElegidos.value.filter((m) => m !== modeloId)
}

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

// --- Eliminar (solo Administrador, RN-08) ---
const confirmarEliminar = ref(false)
const eliminando = ref(false)

async function eliminar() {
  eliminando.value = true
  try {
    await $fetch(`/api/usuarios/${id}`, { method: 'DELETE' })
    toast.add({ title: 'Usuario eliminado', color: 'success' })
    confirmarEliminar.value = false
    await navigateTo('/usuarios')
  } catch (e) {
    toast.add({ title: 'No se pudo eliminar', description: mensajeDeError(e), color: 'error' })
    confirmarEliminar.value = false
  } finally {
    eliminando.value = false
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

// --- Restablecer contraseña (solo Administrador, RF08) ---
const confirmarRestablecer = ref(false)
const restableciendo = ref(false)
const temporal = ref<{ usuario: string, contrasenaTemporal: string } | null>(null)

async function restablecer() {
  restableciendo.value = true
  try {
    temporal.value = await $fetch<{ usuario: string, contrasenaTemporal: string }>(
      `/api/usuarios/${id}/restablecer-contrasena`,
      { method: 'POST' },
    )
    await refresh()
  } catch (e) {
    toast.add({ title: 'No se pudo restablecer', description: mensajeDeError(e), color: 'error' })
  } finally {
    restableciendo.value = false
    confirmarRestablecer.value = false
  }
}
</script>

<template>
  <div class="max-w-2xl">
    <UButton to="/usuarios" icon="i-lucide-arrow-left" label="Volver" variant="link" color="neutral" class="px-0 mb-2" />

    <UAlert v-if="errorCarga" color="error" variant="subtle" :description="mensajeDeError(errorCarga)" />

    <template v-else-if="usuario">
      <EncabezadoPagina :titulo="usuario.nombre">
        <UBadge
          :label="usuario.activo ? 'Activo' : 'Desactivado'"
          :color="usuario.activo ? 'success' : 'neutral'"
          variant="subtle"
        />
      </EncabezadoPagina>

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

        <template v-if="usuario.puedeAsignarModelos">
          <h2 class="font-medium mb-1">Modelos de crédito</h2>
          <p class="text-sm text-muted mb-2">
            Los que puede ofrecer este Cobrador. Si no marcas ninguno, puede usar todos los modelos activos.
          </p>
          <div class="space-y-2 mb-3">
            <UCheckbox
              v-for="m in modelos"
              :key="m.id"
              :model-value="modelosElegidos.includes(m.id)"
              :label="`${m.nombre} · ${formatearPorcentaje(m.tasaInteresBp)}, ${m.plazoSemanas} semanas${m.activo ? '' : ' (inactivo)'}`"
              @update:model-value="(v) => alternarModelo(m.id, v)"
            />
            <p v-if="modelos.length === 0" class="text-sm text-muted">Aún no hay modelos de crédito.</p>
          </div>
          <UButton label="Guardar modelos" variant="outline" :loading="guardandoModelos" class="mb-8" @click="guardarModelos" />
        </template>

        <template v-if="usuario.puedeReasignar">
          <h2 class="font-medium mb-1">Reasignar a otro Gerente</h2>
          <p class="text-sm text-muted mb-2">El Cobrador conserva a sus clientes.</p>
          <div class="flex flex-wrap gap-2 mb-8">
            <USelect v-model="nuevoGerenteId" :items="gerentes" placeholder="Elige el nuevo Gerente" class="w-64" />
            <UButton label="Reasignar" variant="outline" :disabled="!nuevoGerenteId" @click="confirmarReasignacion = true" />
          </div>
        </template>

        <template v-if="usuario.puedeRestablecer">
          <h2 class="font-medium mb-1">Contraseña</h2>
          <p class="text-sm text-muted mb-2">
            Si el usuario olvidó su contraseña, genera una temporal y entrégasela en persona.
          </p>
          <ContrasenaTemporal
            v-if="temporal"
            class="mb-8"
            :usuario="temporal.usuario"
            :contrasena="temporal.contrasenaTemporal"
          />
          <UButton
            v-else
            label="Restablecer contraseña"
            icon="i-lucide-key-round"
            variant="outline"
            class="mb-8"
            @click="confirmarRestablecer = true"
          />
        </template>

        <h2 class="font-medium mb-2">Estado de la cuenta</h2>
        <UButton
          v-if="usuario.activo"
          label="Desactivar usuario"
          color="error"
          variant="outline"
          class="mb-8"
          @click="confirmarEstado = true"
        />
        <UButton v-else label="Activar usuario" variant="outline" class="mb-8" @click="confirmarEstado = true" />
      </template>

      <template v-if="usuario.puedeEliminar">
        <h2 class="font-medium mb-1">Eliminar usuario</h2>
        <p class="text-sm text-muted mb-2">
          Para cuentas registradas por error o que ya no se usarán. Deja de aparecer en las listas y su
          nombre de usuario queda libre, pero la bitácora conserva todo lo que hizo.
        </p>
        <UButton
          label="Eliminar usuario"
          icon="i-lucide-trash-2"
          color="error"
          @click="confirmarEliminar = true"
        />
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
        v-model:open="confirmarEliminar"
        titulo="¿Eliminar usuario?"
        :descripcion="`${usuario.nombre} (${usuario.usuario}) ya no podrá entrar y dejará de aparecer en las listas. Esta acción no se puede deshacer desde el sistema. Su historial en la bitácora se conserva.`"
        etiqueta="Eliminar"
        color="error"
        :cargando="eliminando"
        @confirmar="eliminar"
      />

      <Confirmacion
        v-model:open="confirmarRestablecer"
        titulo="¿Restablecer contraseña?"
        :descripcion="`Se generará una contraseña temporal de 24 horas para ${usuario.nombre} y se cerrará su sesión. Su contraseña actual dejará de funcionar.`"
        etiqueta="Restablecer"
        color="warning"
        :cargando="restableciendo"
        @confirmar="restablecer"
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
