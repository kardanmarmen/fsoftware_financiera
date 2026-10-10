<script setup lang="ts">
// Campo de contraseña con botón para mostrarla u ocultarla (usabilidad, RNF15).
// Solo cambia cómo se ve en la pantalla del usuario: lo que se envía al servidor es lo mismo.
// Los atributos extra (autocomplete, etc.) pasan directo al input.
defineOptions({ inheritAttrs: false })

const valor = defineModel<string>({ default: '' })
const visible = ref(false)
</script>

<template>
  <UInput v-model="valor" v-bind="$attrs" :type="visible ? 'text' : 'password'" :ui="{ trailing: 'pe-1' }">
    <template #trailing>
      <UButton
        :icon="visible ? 'i-lucide-eye-off' : 'i-lucide-eye'"
        :aria-label="visible ? 'Ocultar contraseña' : 'Mostrar contraseña'"
        :aria-pressed="visible"
        color="neutral"
        variant="link"
        size="sm"
        @click="visible = !visible"
      />
    </template>
  </UInput>
</template>
