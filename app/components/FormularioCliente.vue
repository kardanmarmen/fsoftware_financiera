<script setup lang="ts">
// Campos del cliente (RF13). Lo usan el alta y la edición; va dentro de un UForm con esquemaCliente.
// El slot se muestra en "Otros datos" (por ejemplo, para elegir el Cobrador al registrar).
// Mientras se llena, todos los campos son texto; Zod los limpia y convierte al enviar.
type Campos = Record<CampoCliente, string>

defineProps<{
  /** Al editar, el Cobrador no puede cambiar la CURP (solo el Gerente, matriz 4.1). */
  curpBloqueada?: boolean
}>()
const datos = defineModel<Campos>({ required: true })

const opcionesEstado: string[] = [...ESTADOS_MEXICO]

// RN-21: la fecha de nacimiento sale de la CURP; se muestra para que el usuario la confirme.
const fechaNacimiento = computed(() => {
  const curp = datos.value.curp.trim().toUpperCase()
  const fecha = curp.length === 18 ? fechaDeCurp(curp) : null
  return fecha ? `Fecha de nacimiento: ${formatearFechaCorta(fecha)}` : undefined
})

// Aviso (no bloquea) si la CURP no parece de la persona capturada; solo cuando ya hay datos que comparar
const avisos = computed(() => {
  const curp = datos.value.curp.trim().toUpperCase()
  if (curp.length !== 18 || !datos.value.apellidoPaterno.trim() || !datos.value.nombre.trim()) return []
  return avisosCurp(curp, datos.value)
})
</script>

<template>
  <section class="space-y-4">
    <h2 class="font-medium">Datos personales</h2>

    <UFormField
      label="CURP"
      name="curp"
      :help="curpBloqueada ? 'Solo el Gerente puede corregir la CURP' : fechaNacimiento"
    >
      <UInput
        :model-value="datos.curp"
        :disabled="curpBloqueada"
        autocapitalize="characters"
        maxlength="18"
        class="w-full"
        @update:model-value="datos.curp = String($event).toUpperCase()"
      />
    </UFormField>

    <div class="grid gap-4 sm:grid-cols-3">
      <UFormField label="Nombre(s)" name="nombre">
        <UInput v-model="datos.nombre" class="w-full" />
      </UFormField>
      <UFormField label="Apellido paterno" name="apellidoPaterno">
        <UInput v-model="datos.apellidoPaterno" class="w-full" />
      </UFormField>
      <UFormField label="Apellido materno" name="apellidoMaterno" hint="Opcional">
        <UInput v-model="datos.apellidoMaterno" class="w-full" />
      </UFormField>
    </div>

    <UAlert
      v-if="avisos.length"
      color="warning"
      variant="subtle"
      title="Revisa que la CURP sea de esta persona"
      :description="avisos.join('. ') + '.'"
    />
  </section>

  <section class="space-y-4">
    <h2 class="font-medium">Contacto</h2>
    <div class="grid gap-4 sm:grid-cols-2">
      <UFormField label="Teléfono" name="telefono">
        <UInput v-model="datos.telefono" type="tel" inputmode="numeric" maxlength="10" class="w-full" />
      </UFormField>
      <UFormField label="Otro teléfono" name="telefonoAlterno" hint="Opcional">
        <UInput v-model="datos.telefonoAlterno" type="tel" inputmode="numeric" maxlength="10" class="w-full" />
      </UFormField>
    </div>
    <UFormField label="Correo electrónico" name="correo" hint="Opcional">
      <UInput v-model="datos.correo" type="email" autocapitalize="none" class="w-full" />
    </UFormField>
  </section>

  <section class="space-y-4">
    <h2 class="font-medium">Domicilio</h2>
    <UFormField label="Calle" name="calle">
      <UInput v-model="datos.calle" class="w-full" />
    </UFormField>
    <div class="grid grid-cols-2 gap-4">
      <UFormField label="Número exterior" name="numeroExterior">
        <UInput v-model="datos.numeroExterior" class="w-full" />
      </UFormField>
      <UFormField label="Número interior" name="numeroInterior" hint="Opcional">
        <UInput v-model="datos.numeroInterior" class="w-full" />
      </UFormField>
    </div>
    <div class="grid gap-4 sm:grid-cols-2">
      <UFormField label="Colonia" name="colonia">
        <UInput v-model="datos.colonia" class="w-full" />
      </UFormField>
      <UFormField label="Código postal" name="codigoPostal">
        <UInput v-model="datos.codigoPostal" inputmode="numeric" maxlength="5" class="w-full" />
      </UFormField>
      <UFormField label="Municipio" name="municipio">
        <UInput v-model="datos.municipio" class="w-full" />
      </UFormField>
      <UFormField label="Estado" name="estado">
        <USelectMenu v-model="datos.estado" :items="opcionesEstado" class="w-full" />
      </UFormField>
    </div>
    <UFormField
      label="Referencias del domicilio"
      name="referenciasDomicilio"
      hint="Opcional"
      help="Entre qué calles, color de la casa, algún negocio cercano…"
    >
      <UTextarea v-model="datos.referenciasDomicilio" :rows="2" class="w-full" />
    </UFormField>
  </section>

  <section class="space-y-4">
    <h2 class="font-medium">Otros datos</h2>
    <slot />
    <UFormField label="Notas" name="notas" hint="Opcional">
      <UTextarea v-model="datos.notas" :rows="2" class="w-full" />
    </UFormField>
  </section>
</template>
