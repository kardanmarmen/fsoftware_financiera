# Pruebas automáticas

Scripts que usan la aplicación como lo haría el navegador (peticiones a la API con sesión) y comparan
cada respuesta con lo esperado. Los resultados están en `docs/incremento-3/3.6`, `docs/incremento-4/4.7`,
`docs/incremento-5/5.6` y `docs/incremento-6`.

> Solo contra la base **local**: crean usuarios, clientes y créditos de prueba.

## Pruebas funcionales (147 comprobaciones)

```sh
rm -rf .wrangler                                   # base local desde cero
npm run db:migrar:local
npm run crear-admin -- admin "Administrador General"   # anota la contraseña temporal
npm run dev                                        # en otra terminal

node pruebas/1-solicitudes-desembolso-pagos.mjs <contraseña temporal del admin>   # 58
node pruebas/2-moras-renovaciones-reportes.mjs                                    # 44
node pruebas/3-correcciones-modelos-documentos.mjs                                # 45
```

Deben ejecutarse en ese orden y una sola vez por base (la primera cambia la contraseña del admin a
`Contrasena123`). Cada línea muestra ✅ o ❌ y al final el total.

## Pantallas

Con los datos de la prueba 1, recorre en Chromium (tamaño de celular) solicitud → aprobación →
desembolso → pago → liquidación y guarda capturas en esta carpeta:

```sh
node pruebas/pantallas-flujo-completo.mjs
```

Requiere Playwright (`npm i -D playwright && npx playwright install chromium`).

## Rendimiento (ver docs/incremento-6/6.3)

```sh
# 1. Ids del Gerente "gerente1" y del modelo "Semanal 16" (los crea la prueba 1)
npx wrangler d1 execute financiera --local --command "SELECT (SELECT id FROM usuarios WHERE usuario='gerente1') g, (SELECT id FROM modelos_credito WHERE nombre='Semanal 16') m"
# 2. Genera y carga 3,000 clientes con sus créditos (detén npm run dev mientras se carga)
node pruebas/sembrar-volumen.mjs <id gerente> <id modelo> carga.sql
npx wrangler d1 execute financiera --local --file carga.sql
# 3. Mide (con npm run dev encendido)
node pruebas/rendimiento.mjs
```
