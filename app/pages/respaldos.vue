<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'

// RF117–RF121: estado de los respaldos semanales. Cómo restaurar: docs/incremento-2/2.7-respaldo-de-datos.md
definePageMeta({ roles: ['administrador'] })

const { data: lista, status } = await useFetch('/api/respaldos')
type Fila = NonNullable<typeof lista.value>[number]

const UBadge = resolveComponent('UBadge')
const ESTADO = {
  en_proceso: { label: 'En proceso', color: 'info' },
  correcto: { label: 'Correcto', color: 'success' },
  fallido: { label: 'Fallido', color: 'error' },
} as const

const formatearTamano = (bytes: number | null) =>
  bytes == null ? '—' : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`

const columnas: TableColumn<Fila>[] = [
  { accessorKey: 'iniciadoEn', header: 'Fecha', cell: ({ row }) => formatearFecha(row.original.iniciadoEn) },
  { accessorKey: 'estado', header: 'Estado', cell: ({ row }) => h(UBadge, { ...ESTADO[row.original.estado], variant: 'subtle' }) },
  { accessorKey: 'tamanoBytes', header: 'Tamaño', cell: ({ row }) => formatearTamano(row.original.tamanoBytes) },
  { id: 'detalle', header: 'Detalle', cell: ({ row }) => row.original.error ?? row.original.archivo ?? '—' },
]
</script>

<template>
  <div>
    <EncabezadoPagina
      titulo="Respaldos"
      descripcion="Cada domingo se guarda una copia completa de la base de datos. Se conservan 12 semanas."
    />
    <UTable :data="lista ?? []" :columns="columnas" :loading="status === 'pending'" empty="Aún no se ha hecho ningún respaldo" />
  </div>
</template>
