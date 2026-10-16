<script setup lang="ts">
// Título de cada pantalla, con botones o etiquetas opcionales a un lado (slot).
// La fila mide siempre lo mismo que un botón (min-h-8): así el título queda a la misma altura
// en todas las pantallas, tengan botones o no.
defineProps<{ titulo: string, descripcion?: string }>()
</script>

<template>
  <div class="mb-4">
    <div class="flex flex-wrap items-center gap-2 min-h-8">
      <h1 class="text-xl font-semibold">{{ titulo }}</h1>
      <slot />
    </div>
    <p v-if="descripcion" class="text-muted">{{ descripcion }}</p>
  </div>
</template>
