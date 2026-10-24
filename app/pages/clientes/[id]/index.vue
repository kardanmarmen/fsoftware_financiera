<script setup lang="ts">
// RF11, RF15: ficha del cliente. El historial de solicitudes y créditos (RF14) se agrega en la tarea 2.5.
const route = useRoute()
const { data: cliente, error } = await useFetch(`/api/clientes/${route.params.id}`)

// Aviso de "cambios guardados" que deja la pantalla de edición al regresar
const guardado = useState<boolean>('cliente-guardado', () => false)
onBeforeUnmount(() => { guardado.value = false })

const domicilio = computed(() => {
  const c = cliente.value
  if (!c) return ''
  const numero = c.numeroInterior ? `${c.numeroExterior} int. ${c.numeroInterior}` : c.numeroExterior
  return `${c.calle} ${numero}, col. ${c.colonia}, C.P. ${c.codigoPostal}, ${c.municipio}, ${c.estado}`
})
</script>

<template>
  <div class="max-w-2xl">
    <UButton to="/clientes" icon="i-lucide-arrow-left" label="Volver" variant="link" color="neutral" class="px-0 mb-2" />

    <UAlert v-if="error" color="error" variant="subtle" :description="mensajeDeError(error)" />

    <template v-else-if="cliente">
      <EncabezadoPagina :titulo="nombreCompleto(cliente)">
        <UButton
          v-if="cliente.puedeEditar"
          :to="`/clientes/${cliente.id}/editar`"
          icon="i-lucide-pencil"
          label="Editar"
          variant="outline"
          color="neutral"
          class="ml-auto"
        />
      </EncabezadoPagina>

      <UAlert v-if="guardado" color="success" variant="subtle" title="Cambios guardados" class="mb-4" />

      <UCard class="mb-4">
        <dl class="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
          <dt class="text-muted">CURP</dt>
          <dd>{{ cliente.curp }}</dd>
          <dt class="text-muted">Nacimiento</dt>
          <dd>{{ formatearFechaCorta(cliente.fechaNacimiento) }}</dd>
          <dt class="text-muted">Teléfono</dt>
          <dd>{{ cliente.telefono }}<template v-if="cliente.telefonoAlterno"> · {{ cliente.telefonoAlterno }}</template></dd>
          <template v-if="cliente.correo">
            <dt class="text-muted">Correo</dt>
            <dd class="break-all">{{ cliente.correo }}</dd>
          </template>
          <dt class="text-muted">Domicilio</dt>
          <dd>{{ domicilio }}</dd>
          <template v-if="cliente.referenciasDomicilio">
            <dt class="text-muted">Referencias</dt>
            <dd class="whitespace-pre-line">{{ cliente.referenciasDomicilio }}</dd>
          </template>
          <dt class="text-muted">Cobrador</dt>
          <dd>{{ cliente.cobradorNombre }}</dd>
          <template v-if="cliente.notas">
            <dt class="text-muted">Notas</dt>
            <dd class="whitespace-pre-line">{{ cliente.notas }}</dd>
          </template>
        </dl>
      </UCard>

      <p class="text-xs text-muted">
        Registrado el {{ formatearFecha(cliente.creadoEn) }} · Última modificación {{ formatearFecha(cliente.actualizadoEn) }}
      </p>
    </template>
  </div>
</template>
