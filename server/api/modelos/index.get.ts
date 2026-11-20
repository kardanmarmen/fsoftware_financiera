import { asc } from 'drizzle-orm'
import { modelosCredito } from '../../db/esquema'

// RF35–RF40: modelos de crédito. Todos los consultan (el Cobrador los elige al capturar una solicitud).
export default defineEventHandler(async (event) => {
  await requerirUsuario(event)
  return await usarBd(event)
    .select({
      id: modelosCredito.id,
      nombre: modelosCredito.nombre,
      tasaInteresBp: modelosCredito.tasaInteresBp,
      plazoSemanas: modelosCredito.plazoSemanas,
      moraSemanalCentavos: modelosCredito.moraSemanalCentavos,
      semanasParaRenovar: modelosCredito.semanasParaRenovar,
      activo: modelosCredito.activo,
    })
    .from(modelosCredito)
    .orderBy(asc(modelosCredito.nombre))
})
