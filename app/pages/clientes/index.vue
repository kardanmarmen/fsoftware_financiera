<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'

const { user } = useUserSession()
const puedeRegistrar = computed(() => user.value?.rol !== 'administrador') // RN: el Administrador solo consulta
const { data: lista, status } = await useFetch('/api/clientes')

type Fila = NonNullable<typeof lista.value>[number]

const columnas = computed(() => {
  const cols: TableColumn<Fila>[] = [
    { id: 'nombre', header: 'Nombre', cell: ({ row }) => nombreCompleto(row.original) },
    { accessorKey: 'telefono', header: 'Teléfono' },
    { id: 'domicilio', header: 'Colonia', cell: ({ row }) => `${row.original.colonia}, ${row.original.municipio}` },
  ]
  if (user.value?.rol !== 'cobrador') cols.push({ accessorKey: 'cobradorNombre', header: 'Cobrador' })
  return cols
})
</script>

<template>
  <div>
    <EncabezadoPagina titulo="Clientes">
      <UButton v-if="puedeRegistrar" to="/clientes/nuevo" icon="i-lucide-plus" label="Nuevo" class="ml-auto" />
    </EncabezadoPagina>

    <UTable :data="lista ?? []" :columns="columnas" :loading="status === 'pending'" empty="Aún no hay clientes registrados" />
  </div>
</template>
