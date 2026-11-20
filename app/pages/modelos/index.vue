<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'

// RF35–RF40: modelos de crédito. El Administrador los crea y activa o desactiva; el Gerente los consulta.
definePageMeta({ roles: ['administrador', 'gerente'] })

const { user } = useUserSession()
const esAdministrador = computed(() => user.value?.rol === 'administrador')
const { data: modelos, refresh } = await useFetch('/api/modelos', { default: () => [] })
type Modelo = (typeof modelos.value)[number]

const vacio = () => ({ nombre: '', tasaInteres: 20 as number | undefined, plazoSemanas: 16 as number | undefined, moraSemanal: 0 as number | undefined, semanasParaRenovar: 4 as number | undefined })
const estado = ref(vacio())
const error = ref('')
const enviando = ref(false)
const abierto = ref(false)

async function crear() {
  error.value = ''
  enviando.value = true
  try {
    await $fetch('/api/modelos', { method: 'POST', body: estado.value })
    estado.value = vacio()
    abierto.value = false
    await refresh()
  } catch (e) {
    error.value = mensajeDeError(e)
  } finally {
    enviando.value = false
  }
}

async function cambiarActivo(m: Modelo) {
  try {
    await $fetch(`/api/modelos/${m.id}/activo`, { method: 'POST', body: { activo: !m.activo } })
    await refresh()
  } catch (e) {
    error.value = mensajeDeError(e)
  }
}

const UBadge = resolveComponent('UBadge')
const UButton = resolveComponent('UButton')
const soloPantallaGrande = { class: { th: 'hidden sm:table-cell', td: 'hidden sm:table-cell' } }

const columnas = computed<TableColumn<Modelo>[]>(() => [
  { accessorKey: 'nombre', header: 'Nombre' },
  { accessorKey: 'tasaInteresBp', header: 'Interés', cell: ({ row }) => formatearPorcentaje(row.original.tasaInteresBp) },
  { accessorKey: 'plazoSemanas', header: 'Plazo', cell: ({ row }) => `${row.original.plazoSemanas} sem.` },
  { accessorKey: 'moraSemanalCentavos', header: 'Mora semanal', meta: soloPantallaGrande, cell: ({ row }) => formatearDinero(row.original.moraSemanalCentavos) },
  {
    id: 'activo',
    header: 'Estado',
    cell: ({ row }) => esAdministrador.value
      ? h(UButton, {
          label: row.original.activo ? 'Activo' : 'Inactivo',
          color: row.original.activo ? 'success' : 'neutral',
          variant: 'subtle',
          size: 'xs',
          title: row.original.activo ? 'Desactivar' : 'Activar',
          onClick: () => cambiarActivo(row.original),
        })
      : h(UBadge, { label: row.original.activo ? 'Activo' : 'Inactivo', color: row.original.activo ? 'success' : 'neutral', variant: 'subtle' }),
  },
])
</script>

<template>
  <div class="max-w-3xl">
    <EncabezadoPagina titulo="Modelos de crédito" descripcion="Condiciones que se copian a cada solicitud nueva.">
      <UButton v-if="esAdministrador && !abierto" icon="i-lucide-plus" label="Nuevo modelo" class="ml-auto" @click="abierto = true" />
    </EncabezadoPagina>

    <UCard v-if="abierto" class="mb-6">
      <UForm :schema="esquemaModelo" :state="estado" class="grid gap-4 sm:grid-cols-2" @submit="crear">
        <UFormField label="Nombre" name="nombre" class="sm:col-span-2">
          <UInput v-model="estado.nombre" placeholder="Semanal 16" class="w-full" />
        </UFormField>
        <UFormField label="Interés total (%)" name="tasaInteres">
          <CampoNumero v-model="estado.tasaInteres" />
        </UFormField>
        <UFormField label="Plazo (semanas)" name="plazoSemanas">
          <CampoNumero v-model="estado.plazoSemanas" enteros />
        </UFormField>
        <UFormField label="Mora por semana vencida" name="moraSemanal">
          <CampoNumero v-model="estado.moraSemanal" pesos />
        </UFormField>
        <UFormField label="Semanas pagadas para renovar" name="semanasParaRenovar">
          <CampoNumero v-model="estado.semanasParaRenovar" enteros />
        </UFormField>
        <UAlert v-if="error" color="error" variant="subtle" :description="error" class="sm:col-span-2" />
        <div class="flex gap-2 sm:col-span-2">
          <UButton type="submit" label="Guardar modelo" :loading="enviando" />
          <UButton label="Cancelar" variant="outline" color="neutral" @click="abierto = false" />
        </div>
      </UForm>
    </UCard>

    <UAlert v-else-if="error" color="error" variant="subtle" :description="error" class="mb-4" />

    <UTable :data="modelos" :columns="columnas" empty="Aún no hay modelos de crédito" />
  </div>
</template>
