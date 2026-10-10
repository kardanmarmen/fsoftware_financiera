<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'

definePageMeta({ roles: ['administrador', 'gerente'] })

const { user } = useUserSession()
const esAdmin = computed(() => user.value?.rol === 'administrador')
const { data: lista, status } = await useFetch('/api/usuarios')
const busqueda = ref('')

type Fila = NonNullable<typeof lista.value>[number]

const NuxtLink = resolveComponent('NuxtLink')
const UBadge = resolveComponent('UBadge')

const columnas = computed(() => {
  const cols: TableColumn<Fila>[] = [
    {
      accessorKey: 'nombre',
      header: 'Nombre',
      cell: ({ row }) =>
        h(NuxtLink, { to: `/usuarios/${row.original.id}`, class: 'text-primary font-medium' }, () => row.original.nombre),
    },
    { accessorKey: 'usuario', header: 'Usuario' },
  ]
  if (esAdmin.value) {
    cols.push(
      { accessorKey: 'rol', header: 'Rol', cell: ({ row }) => NOMBRE_ROL[row.original.rol] },
      { accessorKey: 'gerenteNombre', header: 'Gerente', cell: ({ row }) => row.original.gerenteNombre ?? '—' },
    )
  }
  cols.push({
    accessorKey: 'activo',
    header: 'Estado',
    cell: ({ row }) =>
      row.original.activo
        ? h(UBadge, { label: 'Activo', color: 'success', variant: 'subtle' })
        : h(UBadge, { label: 'Desactivado', color: 'neutral', variant: 'subtle' }),
  })
  return cols
})
</script>

<template>
  <div>
    <div class="flex flex-wrap items-center gap-3 mb-4">
      <h1 class="text-xl font-semibold">{{ esAdmin ? 'Usuarios' : 'Mis Cobradores' }}</h1>
      <UButton to="/usuarios/nuevo" icon="i-lucide-plus" label="Nuevo" class="ml-auto" />
    </div>

    <UInput v-model="busqueda" icon="i-lucide-search" placeholder="Buscar por nombre o usuario" class="w-full max-w-sm mb-3" />

    <UTable
      v-model:global-filter="busqueda"
      :data="lista ?? []"
      :columns="columnas"
      :loading="status === 'pending'"
      empty="No hay usuarios registrados"
    />
  </div>
</template>
