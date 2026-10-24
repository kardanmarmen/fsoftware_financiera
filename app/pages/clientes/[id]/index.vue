<script setup lang="ts">
// RF11, RF15: ficha del cliente. RF14: historial de créditos y solicitudes.
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

const COLOR_CREDITO = { aprobado: 'info', aceptado: 'success', liquidado: 'neutral', cancelado: 'neutral' } as const
const COLOR_SOLICITUD = { pendiente: 'warning', aprobada: 'success', rechazada: 'error', cancelada: 'neutral' } as const
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

      <p class="text-xs text-muted mb-6">
        Registrado el {{ formatearFecha(cliente.creadoEn) }} · Última modificación {{ formatearFecha(cliente.actualizadoEn) }}
      </p>

      <h2 class="font-medium mb-2">Créditos</h2>
      <p v-if="cliente.creditos.length === 0" class="text-sm text-muted mb-6">Este cliente aún no tiene créditos.</p>
      <div v-else class="space-y-2 mb-6">
        <NuxtLink
          v-for="c in cliente.creditos"
          :key="c.id"
          :to="`/creditos/${c.id}`"
          class="block rounded-md border border-default p-3 hover:bg-elevated"
        >
          <div class="flex flex-wrap items-center gap-2">
            <span class="font-medium">{{ c.folio }}</span>
            <UBadge :label="NOMBRE_ESTADO_CREDITO[c.estado]" :color="COLOR_CREDITO[c.estado]" variant="subtle" />
            <span class="ml-auto text-sm">{{ formatearDinero(c.montoCentavos) }}</span>
          </div>
          <p class="text-sm text-muted mt-1">
            <template v-if="c.estado === 'aceptado'">Saldo {{ formatearDinero(c.saldoCentavos) }} de {{ formatearDinero(c.totalCentavos) }} · </template>
            {{ c.plazoSemanas }} semanas · Desembolso {{ formatearFechaCorta(c.fechaDesembolso) }}
          </p>
        </NuxtLink>
      </div>

      <h2 class="font-medium mb-2">Solicitudes</h2>
      <p v-if="cliente.solicitudes.length === 0" class="text-sm text-muted">Este cliente aún no tiene solicitudes.</p>
      <div v-else class="space-y-2">
        <div v-for="s in cliente.solicitudes" :key="s.id" class="rounded-md border border-default p-3">
          <div class="flex flex-wrap items-center gap-2">
            <span class="text-sm">{{ formatearFecha(s.creadoEn) }}</span>
            <span class="text-sm text-muted">{{ s.tipo === 'renovacion' ? 'Renovación' : 'Nueva' }}</span>
            <UBadge :label="NOMBRE_ESTADO_SOLICITUD[s.estado]" :color="COLOR_SOLICITUD[s.estado]" variant="subtle" />
            <span class="ml-auto text-sm">{{ formatearDinero(s.montoAprobadoCentavos ?? s.montoSolicitadoCentavos) }}</span>
          </div>
          <p v-if="s.motivo" class="text-sm text-muted mt-1">Motivo: {{ s.motivo }}</p>
        </div>
      </div>
    </template>
  </div>
</template>
