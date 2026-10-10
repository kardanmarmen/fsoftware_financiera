<script setup lang="ts">
// Ventana para confirmar acciones importantes antes de ejecutarlas (RNF17).
// Mientras la acción se procesa (`cargando`) no se puede cancelar ni cerrar la ventana,
// para que nadie crea que la canceló cuando en realidad ya se está ejecutando.
defineProps<{
  titulo: string
  descripcion: string
  etiqueta: string
  color?: 'primary' | 'error' | 'warning'
  cargando?: boolean
}>()
const abierta = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ confirmar: [] }>()
</script>

<template>
  <UModal
    v-model:open="abierta"
    :title="titulo"
    :description="descripcion"
    :dismissible="!cargando"
    :close="!cargando"
  >
    <template #footer>
      <div class="flex gap-2 ml-auto">
        <UButton label="Cancelar" variant="outline" color="neutral" :disabled="cargando" @click="abierta = false" />
        <UButton :label="etiqueta" :color="color ?? 'primary'" :loading="cargando" @click="emit('confirmar')" />
      </div>
    </template>
  </UModal>
</template>
