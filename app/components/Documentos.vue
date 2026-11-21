<script setup lang="ts">
// RF17–RF23: lista de documentos y subida de uno nuevo (foto del celular o PDF, hasta 10 MB).
// Los archivos se abren a través de la API, que revisa el permiso (el almacenamiento es privado).
interface Documento {
  id: string
  tipo: keyof typeof NOMBRE_TIPO_DOCUMENTO
  nombreArchivo: string
  tamanoBytes: number
  subidoPorNombre: string
  subidoEn: number
}
const props = defineProps<{
  documentos: Documento[]
  clienteId: string
  puedeSubir: boolean
  solicitudId?: string | null
  creditoId?: string | null
  tipoInicial?: keyof typeof NOMBRE_TIPO_DOCUMENTO
}>()
const emit = defineEmits<{ subido: [] }>()

const tipos = Object.entries(NOMBRE_TIPO_DOCUMENTO).map(([value, label]) => ({ value, label }))
const tipo = ref<keyof typeof NOMBRE_TIPO_DOCUMENTO>(props.tipoInicial ?? 'identificacion')
const entrada = ref<HTMLInputElement | null>(null)
const subiendo = ref(false)
const error = ref('')

const tamano = (b: number) => (b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`)

async function subir() {
  const archivo = entrada.value?.files?.[0]
  error.value = ''
  if (!archivo) return
  if (archivo.size > TAMANO_MAXIMO_DOCUMENTO) {
    error.value = 'El archivo pesa más de 10 MB'
    return
  }
  subiendo.value = true
  try {
    await $fetch(`/api/clientes/${props.clienteId}/documentos`, {
      method: 'POST',
      query: { tipo: tipo.value, nombre: archivo.name, solicitudId: props.solicitudId ?? undefined, creditoId: props.creditoId ?? undefined },
      headers: { 'content-type': archivo.type || 'application/octet-stream' },
      body: archivo,
    })
    entrada.value!.value = ''
    emit('subido')
  } catch (e) {
    error.value = mensajeDeError(e)
  } finally {
    subiendo.value = false
  }
}
</script>

<template>
  <div>
    <p v-if="documentos.length === 0" class="text-sm text-muted mb-3">Sin documentos.</p>
    <div v-else class="space-y-1 mb-3">
      <a
        v-for="d in documentos"
        :key="d.id"
        :href="`/api/documentos/${d.id}`"
        target="_blank"
        rel="noopener"
        class="flex flex-wrap items-center gap-x-2 rounded-md border border-default p-2 text-sm hover:bg-elevated"
      >
        <span class="font-medium">{{ NOMBRE_TIPO_DOCUMENTO[d.tipo] }}</span>
        <span class="text-muted break-all">{{ d.nombreArchivo }} · {{ tamano(d.tamanoBytes) }}</span>
        <span class="ml-auto text-muted">{{ d.subidoPorNombre }} · {{ formatearFecha(d.subidoEn) }}</span>
      </a>
    </div>

    <div v-if="puedeSubir" class="flex flex-wrap items-end gap-2">
      <UFormField label="Tipo" class="w-full sm:w-56">
        <USelect v-model="tipo" :items="tipos" class="w-full" />
      </UFormField>
      <input
        ref="entrada"
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,application/pdf"
        class="block w-full sm:w-auto text-sm file:mr-2 file:rounded-md file:border file:border-default file:bg-elevated file:px-3 file:py-1.5"
        aria-label="Archivo"
      >
      <UButton icon="i-lucide-upload" label="Subir" variant="outline" :loading="subiendo" @click="subir" />
      <UAlert v-if="error" color="error" variant="subtle" :description="error" class="w-full" />
    </div>
  </div>
</template>
