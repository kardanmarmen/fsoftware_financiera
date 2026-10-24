<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'

// RF11, RF15, RNF06 (diseño 2.1, sección 4.2)
const { user } = useUserSession()
const esCobrador = computed(() => user.value?.rol === 'cobrador')
const puedeRegistrar = computed(() => user.value?.rol !== 'administrador') // el Administrador solo consulta

// Búsqueda. El Cobrador filtra en el navegador; Gerente y Administrador la envían al servidor.
const texto = ref('')
const textoEnviado = ref('') // se envía medio segundo después de dejar de escribir
let espera: ReturnType<typeof setTimeout> | undefined
watch(texto, (t) => {
  if (esCobrador.value) return
  clearTimeout(espera)
  espera = setTimeout(() => { textoEnviado.value = t.trim() }, 500)
})
const cobradorId = ref<string | undefined>()
const pagina = ref(1)
watch([textoEnviado, cobradorId], () => { pagina.value = 1 })

const consulta = computed(() => esCobrador.value
  ? {}
  : { q: textoEnviado.value || undefined, cobradorId: cobradorId.value || undefined, pagina: pagina.value })
const { data, status, error } = await useFetch('/api/clientes', { query: consulta })

// Cobrador: busca en cualquier parte del nombre, la CURP, el teléfono o la colonia, sin acentos
const filas = computed(() => {
  const lista = data.value?.clientes ?? []
  const buscado = normalizarTexto(texto.value)
  if (!esCobrador.value || !buscado) return lista
  return lista.filter((c) =>
    normalizarTexto(`${nombreCompleto(c)} ${c.curp} ${c.telefono} ${c.colonia}`).includes(buscado))
})

// Filtro por Cobrador: el Gerente ve los suyos; el Administrador, todos
const { data: usuarios } = await useFetch('/api/usuarios', { immediate: !esCobrador.value })
const opcionesCobrador = computed(() =>
  (usuarios.value ?? []).filter((u) => u.rol === 'cobrador').map((u) => ({ label: u.nombre, value: u.id })))

const hayBusqueda = computed(() => Boolean(texto.value.trim() || cobradorId.value))
const totalEncontrados = computed(() => (esCobrador.value ? filas.value.length : data.value?.total ?? 0))

type Fila = NonNullable<typeof data.value>['clientes'][number]
const NuxtLink = resolveComponent('NuxtLink')
const soloPantallaGrande = { class: { th: 'hidden sm:table-cell', td: 'hidden sm:table-cell' } }

const columnas = computed(() => {
  const cols: TableColumn<Fila>[] = [
    {
      id: 'nombre',
      header: 'Nombre',
      cell: ({ row }) =>
        h(NuxtLink, { to: `/clientes/${row.original.id}`, class: 'text-primary font-medium' }, () => nombreCompleto(row.original)),
    },
    { accessorKey: 'telefono', header: 'Teléfono' },
    { id: 'domicilio', header: 'Colonia', meta: soloPantallaGrande, cell: ({ row }) => `${row.original.colonia}, ${row.original.municipio}` },
    { accessorKey: 'creditosActivos', header: 'Créditos activos', meta: soloPantallaGrande }, // RF15
  ]
  if (!esCobrador.value) cols.push({ accessorKey: 'cobradorNombre', header: 'Cobrador', meta: soloPantallaGrande })
  return cols
})

function limpiar() {
  texto.value = ''
  textoEnviado.value = ''
  cobradorId.value = undefined
}
</script>

<template>
  <div>
    <EncabezadoPagina titulo="Clientes">
      <UButton v-if="puedeRegistrar" to="/clientes/nuevo" icon="i-lucide-plus" label="Nuevo" class="ml-auto" />
    </EncabezadoPagina>

    <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 mb-3">
      <UInput
        v-model="texto"
        icon="i-lucide-search"
        :placeholder="esCobrador ? 'Buscar por nombre, CURP, teléfono o colonia' : 'Nombre, apellidos, CURP o teléfono'"
        class="w-full"
      />
      <USelectMenu
        v-if="!esCobrador"
        v-model="cobradorId"
        :items="opcionesCobrador"
        value-key="value"
        placeholder="Todos los Cobradores"
        clear
        class="w-full"
      />
    </div>

    <div v-if="hayBusqueda" class="flex items-center gap-3 mb-3 text-sm text-muted">
      <span>{{ totalEncontrados }} {{ totalEncontrados === 1 ? 'cliente encontrado' : 'clientes encontrados' }}</span>
      <UButton label="Limpiar" icon="i-lucide-x" variant="link" color="neutral" size="sm" @click="limpiar" />
    </div>

    <UAlert v-if="error" color="error" variant="subtle" :description="mensajeDeError(error)" class="mb-3" />

    <UTable
      :data="filas"
      :columns="columnas"
      :loading="status === 'pending'"
      :empty="hayBusqueda ? 'Ningún cliente coincide con la búsqueda' : 'Aún no hay clientes registrados'"
    />

    <div v-if="data && data.total > data.porPagina" class="flex justify-end mt-4">
      <UPagination v-model:page="pagina" :total="data.total" :items-per-page="data.porPagina" />
    </div>
  </div>
</template>
