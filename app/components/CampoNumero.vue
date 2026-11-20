<script setup lang="ts">
// Campo numérico. Vacío vale `undefined` (no ''), para que la validación pida el dato.
// Con `pesos`, admite centavos y muestra el signo de pesos; la API convierte a centavos
// (shared/utils/creditos.ts).
const props = defineProps<{ pesos?: boolean, enteros?: boolean }>()
const valor = defineModel<number | null | undefined>()
const texto = computed({
  get: () => (valor.value == null ? '' : String(valor.value)),
  set: (v: string) => { valor.value = v === '' ? undefined : Number(v) },
})
</script>

<template>
  <UInput
    v-model="texto"
    type="number"
    :inputmode="props.enteros ? 'numeric' : 'decimal'"
    :step="props.enteros ? 1 : 0.01"
    min="0"
    :icon="props.pesos ? 'i-lucide-dollar-sign' : undefined"
    class="w-full"
  />
</template>
