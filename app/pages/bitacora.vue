<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'

definePageMeta({ roles: ['administrador', 'gerente'] })

const { user } = useUserSession()

// Filtros: se aplican en el servidor, así buscan en toda la bitácora y no solo en la página visible.
const filtros = reactive({
  accion: undefined as string | undefined,
  usuarioId: undefined as string | undefined,
  desde: '',
  hasta: '',
})
const pagina = ref(1)
watch(filtros, () => { pagina.value = 1 }) // al cambiar un filtro se regresa a la primera página

const consulta = computed(() => ({
  pagina: pagina.value,
  accion: filtros.accion || undefined,
  usuarioId: filtros.usuarioId || undefined,
  desde: filtros.desde || undefined,
  hasta: filtros.hasta || undefined,
}))
const { data, status, error } = await useFetch('/api/bitacora', { query: consulta })

const opcionesAccion = Object.entries(NOMBRE_ACCION).map(([value, label]) => ({ value, label }))

// Usuarios que se pueden elegir: el Administrador ve a todos; el Gerente, a sí mismo y a sus Cobradores.
const { data: lista } = await useFetch('/api/usuarios')
const opcionesUsuario = computed(() => {
  const opciones = (lista.value ?? []).map((u) => ({ value: u.id, label: u.nombre }))
  if (user.value && !opciones.some((o) => o.value === user.value!.id)) {
    opciones.unshift({ value: user.value.id, label: user.value.nombre })
  }
  return opciones
})

const hayFiltros = computed(() => Boolean(filtros.accion || filtros.usuarioId || filtros.desde || filtros.hasta))
function limpiarFiltros() {
  Object.assign(filtros, { accion: undefined, usuarioId: undefined, desde: '', hasta: '' })
}

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
    <EncabezadoPagina titulo="Bitácora" />

    <div class="grid grid-cols-2 gap-3 lg:grid-cols-4 mb-4">
      <UFormField label="Acción" class="col-span-2 lg:col-span-1">
        <USelectMenu
          v-model="filtros.accion"
          :items="opcionesAccion"
          value-key="value"
          placeholder="Todas"
          clear
          class="w-full"
        />
      </UFormField>
      <UFormField label="Usuario" class="col-span-2 lg:col-span-1">
        <USelectMenu
          v-model="filtros.usuarioId"
          :items="opcionesUsuario"
          value-key="value"
          placeholder="Todos"
          clear
          class="w-full"
        />
      </UFormField>
      <UFormField label="Desde">
        <UInput v-model="filtros.desde" type="date" class="w-full" />
      </UFormField>
      <UFormField label="Hasta">
        <UInput v-model="filtros.hasta" type="date" class="w-full" />
      </UFormField>
    </div>

    <div v-if="hayFiltros" class="flex items-center gap-3 mb-3 text-sm text-muted">
      <span>{{ data?.total ?? 0 }} registros encontrados</span>
      <UButton label="Limpiar filtros" icon="i-lucide-x" variant="link" color="neutral" size="sm" @click="limpiarFiltros" />
    </div>

    <UAlert v-if="error" color="error" variant="subtle" :description="mensajeDeError(error)" class="mb-4" />

    <UTable :data="data?.registros ?? []" :columns="columnas" :loading="status === 'pending'" empty="Sin registros" />

    <div v-if="data && data.total > data.porPagina" class="flex justify-end mt-4">
      <UPagination v-model:page="pagina" :total="data.total" :items-per-page="data.porPagina" />
    </div>
  </div>
</template>
