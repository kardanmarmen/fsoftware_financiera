<script setup lang="ts">
// Ventana para confirmar acciones importantes antes de ejecutarlas (RNF17).
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
  <UModal v-model:open="abierta" :title="titulo" :description="descripcion">
    <template #footer>
      <div class="flex gap-2 ml-auto">
        <UButton label="Cancelar" variant="outline" color="neutral" @click="abierta = false" />
        <UButton :label="etiqueta" :color="color ?? 'primary'" :loading="cargando" @click="emit('confirmar')" />
      </div>
    </template>
  </UModal>
</template>
