# Flujo de créditos: solicitud, desembolso, pagos, liquidación y comprobantes

**Incrementos:** 3 (solicitudes y aprobación), 4 (pagos y abonos) y 5 (liquidaciones y comprobantes)
**Basado en:** [2.1 Diseño de la base de datos](../incremento-2/2.1-diseno-base-de-datos.md) (tablas, estados y cálculo)
**Requisitos:** RF35–RF52, RF56–RF68, RF94, RF96–RF100, RF102, RF113–RF116, RNF28

## 1. Alcance

Se construyó el recorrido completo de un crédito, para poder **desembolsar, registrar pagos, liquidar
y generar comprobantes**. No se necesitaron tablas nuevas: todo usa las tablas del diseño 2.1.

| Parte | Qué hace | Quién |
| --- | --- | --- |
| Modelos de crédito (`/modelos`) | Alta de modelos (interés, plazo, mora, semanas para renovar); activar o desactivar | Administrador (el Gerente consulta) |
| Solicitud (ficha del cliente → **Nueva solicitud**) | Captura del monto, modelo, ocupación e ingreso; las condiciones se copian del modelo | Cobrador y Gerente |
| Aprobación o rechazo (`/solicitudes`) | El Gerente puede ajustar monto, interés, plazo y fecha de desembolso; al aprobar se genera el crédito con su calendario. El rechazo pide motivo | Gerente (solo de sus Cobradores) |
| Desembolso | El crédito pasa de **Aprobado** a **Vigente**; si se entrega en otra fecha, el calendario se recorre | Cobrador y Gerente |
| Cancelación | Crédito aprobado que el cliente no recibió, con motivo | Cobrador y Gerente |
| Pago o abono | Se reparte de la semana más antigua sin cubrir en adelante | Cobrador y Gerente |
| Liquidación | Paga el saldo completo; **anticipada** si es antes del último vencimiento | Cobrador y Gerente |
| Comprobante (`/comprobantes/:id`) | Uno por operación, con folio; se imprime o se guarda como PDF desde el navegador | Todos (según su ámbito) |

El Administrador consulta todo, pero no registra operaciones.

## 2. Reglas

| ID | Regla |
| --- | --- |
| RN-30 | Un cliente no puede tener otra solicitud mientras tenga una pendiente o un crédito aprobado o vigente. Las renovaciones quedan pendientes (Incremento 5). |
| RN-31 | Cálculo de interés fijo (diseño 2.1, sección 3.5): pago semanal redondeado hacia abajo al peso; la diferencia va en la última semana. |
| RN-32 | La fecha de desembolso no puede ser futura. La semana 1 vence 7 días después de la fecha real de entrega. |
| RN-33 | Un pago no puede ser mayor que el saldo. Si cubre por completo la última semana que toca es **pago**; si deja una semana a medias es **abono**. Si deja el saldo en cero es **liquidación** y el crédito queda liquidado. |
| RN-34 | Cada operación recibe un folio `OP-000001` en la misma transacción en que se guarda: los folios no se repiten ni se saltan. Los créditos usan `CR-000001`. |
| RN-24 | Cada envío lleva una clave de idempotencia generada al abrir la ventana. Si la conexión falla y se reenvía, se muestra el comprobante de la operación ya guardada en lugar de registrarla dos veces. |
| RNF05 | Si dos personas registran un movimiento del mismo crédito al mismo tiempo, el segundo recibe un aviso para recargar; no se aplica sobre un saldo viejo. |

### Cómo se garantiza que nada quede a medias

Cada acción es un solo `db.batch()` (una transacción en D1). La primera consulta toma el folio y la
operación se inserta con `INSERT … SELECT … WHERE` solo si el crédito sigue como se leyó (mismo
estado y mismo saldo). Las demás consultas (saldo, semanas cubiertas, bitácora) solo se aplican si
esa operación existe. Si otra persona se adelantó, ninguna consulta cambia nada y la API responde 409.

**Acciones nuevas en la bitácora:** `modelo_creado`, `modelo_modificado`, `solicitud_creada`,
`solicitud_aprobada`, `solicitud_rechazada`, `credito_desembolsado`, `credito_cancelado`,
`pago_registrado`, `credito_liquidado`.

## 3. API

| Método | Ruta | Quién | Descripción |
| --- | --- | --- | --- |
| GET | `/api/modelos` | Todos | Lista de modelos |
| POST | `/api/modelos` | Administrador | Alta de modelo |
| POST | `/api/modelos/:id/activo` | Administrador | Activa o desactiva |
| GET | `/api/solicitudes?estado=` | Todos (según su ámbito) | Solicitudes |
| POST | `/api/solicitudes` | Gerente, Cobrador | Nueva solicitud |
| POST | `/api/solicitudes/:id/aprobar` | Gerente | Aprueba y genera el crédito |
| POST | `/api/solicitudes/:id/rechazar` | Gerente | Rechaza con motivo |
| POST | `/api/creditos/:id/desembolso` | Gerente, Cobrador | Desembolso (regresa la operación) |
| POST | `/api/creditos/:id/cancelar` | Gerente, Cobrador | Cancela un crédito aprobado |
| POST | `/api/creditos/:id/pagos` | Gerente, Cobrador | Pago o abono (regresa la operación) |
| POST | `/api/creditos/:id/liquidacion` | Gerente, Cobrador | Liquida el saldo (regresa la operación) |
| GET | `/api/operaciones/:id` | Todos (según su ámbito) | Datos del comprobante |

## 4. Pruebas

Base local con dos Gerentes y un Cobrador. **58 comprobaciones de la API** y el flujo completo en
pantalla (navegador en tamaño de celular, 390 px), sin errores de JavaScript. Tipos de TypeScript sin errores.

| Área | Casos principales | Estado |
| --- | --- | --- |
| Modelos | El Cobrador no puede crear (403); nombre repetido (409); tasa con 3 decimales (400) | ✅ |
| Solicitudes | Segunda solicitud pendiente (409); un Gerente ajeno no ve al cliente ni la solicitud (404); el Cobrador no aprueba (403) | ✅ |
| Aprobación | Dos aprobaciones simultáneas: una pasa y la otra recibe 409; $5,000 al 20 % → 16 pagos de $375; rechazar una ya aprobada (409) | ✅ |
| Desembolso | No se paga antes del desembolso; fecha futura (400); reintento con la misma clave regresa la misma operación; segundo desembolso (409); calendario recorrido a la fecha real | ✅ |
| Pagos | $375 → pago de la semana 1; $200 → abono a la semana 2; $600 completa la 2 y la 3 y abona $50 a la 4; pago mayor que el saldo (400); dos pagos simultáneos: uno pasa y el otro 409; la suma del calendario cuadra con el saldo | ✅ |
| Liquidación | Saldo en cero, todas las semanas cubiertas, tipo anticipada; reintento sin duplicar; pago a crédito liquidado (409); folios OP-000001 a OP-000006 sin huecos | ✅ |
| Comprobantes | Desembolso, pago y liquidación con sus montos y saldos; un Gerente ajeno no lo ve (404); el Administrador sí | ✅ |
| Bitácora | Se registran las 8 acciones nuevas | ✅ |

## 5. Pendiente

- Moras y morosidad (RF73–RF81), alertas y reportes de pagos (Incremento 4).
- Renovaciones (RF82–RF89) y reportes de renovaciones (Incremento 5).
- Correcciones de operaciones (RF72), asignación de modelos por Cobrador (RF27), documentos y
  evidencia del desembolso (RF17–RF23).
