import { z } from 'zod'
import { NOMBRE_ACCION } from './formato'

const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida').optional()

// Filtros de la bitácora (en la URL de GET /api/bitacora). Todos son opcionales.
export const esquemaFiltrosBitacora = z
  .object({
    pagina: z.coerce.number().int().min(1).catch(1),
    accion: z.string().refine((a) => a in NOMBRE_ACCION, 'Acción inválida').optional(),
    usuarioId: z.string().max(50).optional(),
    desde: fecha,
    hasta: fecha,
  })
  // Las fechas tienen formato AAAA-MM-DD, así que se pueden comparar como texto.
  .refine((f) => !f.desde || !f.hasta || f.desde <= f.hasta, {
    message: 'La fecha "desde" debe ser anterior o igual a "hasta"',
  })
