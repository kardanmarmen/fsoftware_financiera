<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'

definePageMeta({ roles: ['administrador', 'gerente'] })

const pagina = ref(1)
const { data, status } = await useFetch('/api/bitacora', { query: { pagina } })

type Registro = NonNullable<typeof data.value>['registros'][number]

// Nombre de la acción y, en los cierres automáticos, el motivo.
function describirAccion(registro: Registro) {
  const nombre = NOMBRE_ACCION[registro.accion] ?? registro.accion
  if (registro.accion !== 'sesion_expirada' || !registro.detalle) return nombre
  const { motivo } = JSON.parse(registro.detalle) as { motivo?: string }
  return motivo ? `${nombre} (${NOMBRE_MOTIVO_CIERRE[motivo] ?? motivo})` : nombre
}

const columnas: TableColumn<Registro>[] = [
  { accessorKey: 'creadoEn', header: 'Fecha', cell: ({ row }) => formatearFecha(row.original.creadoEn) },
  {
    accessorKey: 'usuarioNombre',
    header: 'Usuario',
    cell: ({ row }) => row.original.usuarioNombre ?? `(intento: ${row.original.usuarioIntentado})`,
  },
  { accessorKey: 'accion', header: 'Acción', cell: ({ row }) => describirAccion(row.original) },
  { accessorKey: 'objetivoNombre', header: 'Sobre', cell: ({ row }) => row.original.objetivoNombre ?? '—' },
  { accessorKey: 'ip', header: 'IP', cell: ({ row }) => row.original.ip ?? '—' },
]
</script>

<template>
  <div>
    <h1 class="text-xl font-semibold mb-4">Bitácora</h1>

    <UTable :data="data?.registros ?? []" :columns="columnas" :loading="status === 'pending'" empty="Sin registros" />

    <div v-if="data && data.total > data.porPagina" class="flex justify-end mt-4">
      <UPagination v-model:page="pagina" :total="data.total" :items-per-page="data.porPagina" />
    </div>
  </div>
</template>
