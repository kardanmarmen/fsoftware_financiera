<script setup lang="ts">
// RF100, RF102, RF114, RNF28: comprobante de una operación (desembolso, pago, abono o liquidación).
// Se imprime o se guarda como PDF desde el navegador; al imprimir se oculta el menú de la app.
const route = useRoute()
const { data: c, error } = await useFetch(`/api/operaciones/${route.params.id}`)

const TITULO: Record<string, string> = {
  desembolso: 'Comprobante de desembolso',
  pago: 'Comprobante de pago',
  abono: 'Comprobante de abono',
  liquidacion: 'Comprobante de liquidación',
  correccion: 'Comprobante de corrección',
}

function imprimir() {
  window.print()
}
</script>

<template>
  <div class="max-w-xl">
    <div class="flex flex-wrap gap-2 mb-4 print:hidden">
      <UButton
        :to="c ? `/creditos/${c.credito.id}` : '/clientes'"
        icon="i-lucide-arrow-left"
        label="Volver al crédito"
        variant="link"
        color="neutral"
        class="px-0"
      />
      <UButton v-if="c" icon="i-lucide-printer" label="Imprimir o guardar PDF" class="ml-auto" @click="imprimir" />
    </div>

    <UAlert v-if="error" color="error" variant="subtle" :description="mensajeDeError(error)" />

    <article v-else-if="c" class="rounded-md border border-default p-6 print:border-0 print:p-0">
      <header class="flex flex-wrap items-start justify-between gap-2 border-b border-default pb-4 mb-4">
        <div>
          <p class="text-lg font-semibold">Financiera</p>
          <h1 class="text-xl font-semibold">{{ TITULO[c.tipo] }}</h1>
        </div>
        <div class="text-right">
          <p class="text-sm text-muted">Folio</p>
          <p class="font-mono font-semibold">{{ c.folio }}</p>
        </div>
      </header>

      <dl class="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm mb-6">
        <dt class="text-muted">Fecha</dt>
        <dd>{{ formatearFecha(c.registradoEn) }}</dd>
        <dt class="text-muted">Cliente</dt>
        <dd>{{ c.clienteNombre }}</dd>
        <dt class="text-muted">CURP</dt>
        <dd>{{ c.clienteCurp }}</dd>
        <dt class="text-muted">Crédito</dt>
        <dd>
          {{ c.credito.folio }} · {{ formatearDinero(c.credito.montoCentavos) }} al {{ formatearPorcentaje(c.credito.tasaInteresBp) }},
          {{ c.credito.plazoSemanas }} pagos de {{ formatearDinero(c.credito.pagoSemanalCentavos) }}
        </dd>
        <template v-if="c.semana && c.tipo !== 'liquidacion'">
          <dt class="text-muted">Aplicado desde</dt>
          <dd>Semana {{ c.semana }}</dd>
        </template>
        <dt class="text-muted">Cobrador</dt>
        <dd>{{ c.cobradorNombre }}</dd>
        <dt class="text-muted">Registró</dt>
        <dd>{{ c.registradoPorNombre }}</dd>
      </dl>

      <UAlert
        v-if="c.corregidaPor"
        color="error"
        variant="subtle"
        :description="`Esta operación fue corregida (anulada) con la operación ${c.corregidaPor}.`"
        class="mb-4"
      />
      <div class="rounded-md bg-elevated p-4 mb-6 print:bg-transparent print:border print:border-default">
        <template v-if="c.tipo === 'desembolso'">
          <p class="text-sm text-muted">{{ c.renovacion ? 'Monto del crédito' : 'Monto entregado al cliente' }}</p>
          <p class="text-3xl font-semibold">{{ formatearDinero(c.montoCentavos) }}</p>
          <!-- RF86: en una renovación, parte del monto liquida el crédito anterior -->
          <dl v-if="c.renovacion" class="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm mt-2">
            <dt class="text-muted">Liquidación de {{ c.renovacion.creditoFolio }}</dt>
            <dd>− {{ formatearDinero(c.renovacion.montoCentavos) }} (folio {{ c.renovacion.folio }})</dd>
            <dt class="text-muted">Recibe el cliente</dt>
            <dd class="font-medium">{{ formatearDinero(c.montoCentavos - c.renovacion.montoCentavos) }}</dd>
          </dl>
          <p class="text-sm mt-2">
            Total a pagar: {{ formatearDinero(c.saldoResultanteCentavos) }}. Primer pago el
            {{ formatearFechaCorta(sumarDias(c.credito.fechaDesembolso, 7)) }}.
          </p>
        </template>
        <template v-else-if="c.tipo === 'correccion'">
          <!-- RF72: la corrección revierte una operación anterior -->
          <p class="text-sm text-muted">Monto revertido de {{ c.corrige }}</p>
          <p class="text-3xl font-semibold">{{ formatearDinero(c.montoCentavos) }}</p>
          <dl class="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm mt-2">
            <dt class="text-muted">Motivo</dt>
            <dd>{{ c.motivo }}</dd>
            <dt class="text-muted">Saldo después de corregir</dt>
            <dd class="font-medium">{{ formatearDinero(c.saldoResultanteCentavos) }}</dd>
          </dl>
        </template>
        <template v-else>
          <p class="text-sm text-muted">Monto recibido</p>
          <p class="text-3xl font-semibold">{{ formatearDinero(c.montoCentavos) }}</p>
          <dl class="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm mt-2">
            <template v-if="c.moraCentavos">
              <dt class="text-muted">Aplicado a mora</dt>
              <dd>{{ formatearDinero(c.moraCentavos) }}</dd>
              <dt class="text-muted">Aplicado al crédito</dt>
              <dd>{{ formatearDinero(c.montoCentavos - c.moraCentavos) }}</dd>
            </template>
            <dt class="text-muted">Saldo anterior</dt>
            <dd>{{ formatearDinero(c.saldoAnteriorCentavos) }}</dd>
            <dt class="text-muted">Saldo después del pago</dt>
            <dd class="font-medium">{{ formatearDinero(c.saldoResultanteCentavos) }}</dd>
          </dl>
          <p v-if="c.tipo === 'liquidacion'" class="text-sm font-medium mt-2">
            El crédito {{ c.credito.folio }} queda liquidado<template v-if="c.credito.tipoLiquidacion === 'anticipada'"> (liquidación anticipada)</template>.
            El cliente no tiene adeudo por este crédito.
          </p>
          <p v-if="c.tipo === 'liquidacion' && c.renovacion" class="text-sm mt-1">
            Liquidado con la renovación {{ c.renovacion.creditoFolio }} (desembolso {{ c.renovacion.folio }}).
          </p>
        </template>
      </div>

      <!-- Firmas: el cliente firma de recibido en el desembolso; en los pagos firma quien cobra -->
      <div v-if="c.tipo !== 'correccion'" class="grid grid-cols-2 gap-8 mt-12 text-center text-sm">
        <div>
          <div class="border-t border-default pt-1">{{ c.tipo === 'desembolso' ? 'Recibí: ' : '' }}{{ c.clienteNombre }}</div>
        </div>
        <div>
          <div class="border-t border-default pt-1">{{ c.tipo === 'desembolso' ? 'Entregó: ' : 'Recibió: ' }}{{ c.registradoPorNombre }}</div>
        </div>
      </div>
    </article>
  </div>
</template>
