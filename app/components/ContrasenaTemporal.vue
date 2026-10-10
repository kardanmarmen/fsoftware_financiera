<script setup lang="ts">
// Muestra una contraseña temporal recién generada. Solo se ve esta vez (RN-11).
defineProps<{ usuario: string, contrasena: string }>()
const copiada = ref(false)

async function copiar(texto: string) {
  await navigator.clipboard.writeText(texto)
  copiada.value = true
}
</script>

<template>
  <UAlert color="warning" variant="subtle" title="Contraseña temporal">
    <template #description>
      <p class="mb-2">
        Entrégala a <strong>{{ usuario }}</strong>. Solo se muestra esta vez y vence en 24 horas.
        Al entrar, el sistema le pedirá elegir una contraseña nueva.
      </p>
      <div class="flex items-center gap-2">
        <code class="text-lg font-mono px-2 py-1 rounded bg-default">{{ contrasena }}</code>
        <UButton
          :icon="copiada ? 'i-lucide-check' : 'i-lucide-copy'"
          :label="copiada ? 'Copiada' : 'Copiar'"
          size="sm"
          variant="outline"
          color="neutral"
          @click="copiar(contrasena)"
        />
      </div>
    </template>
  </UAlert>
</template>
