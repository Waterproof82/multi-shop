# Conservación de datos — cuenta atrás y descarga por ejercicio

> Qué se enseña y dónde: superadmin (`/superadmin`, sección "Conservación de datos", una empresa por desplegable, sin descargas) y panel del cliente (`/admin/conservacion`, con descargas).

## Plazos

| Apartado | Plazo | Base | Fecha usada |
|---|---|---|---|
| Pedidos | 6 años | Art. 30 Código de Comercio | `pedidos.created_at` (sin `es_prueba`) |
| Cobros del TPV | 5 años | Art. 66 LGT | `tpv_cobros.cobrado_at` |
| Turnos y cierres Z | 5 años | Ley 11/2021 | `tpv_turnos.apertura_at` |
| Fichajes | 4 años | Art. 34.9 ET | `lc_fichajes.timestamp_evento` |

Los clientes no están: sus datos personales se anonimizan solos (cron mensual, `retencionClientesAnios`).

La única fuente de los plazos es `APARTADOS_RETENCION` en `src/lib/empresa/retencion.ts`.

## Decisiones

- **El plazo cuenta por EJERCICIO, no por registro.** Todo 2026 se conserva hasta el 31/12/2026 + N años. Es como se inspecciona, y un borrado futuro sería de años completos: borrar medio ejercicio deja su contabilidad incompleta.
- **Que un ejercicio cumpla su plazo NO lo borra.** Somos encargados del tratamiento (art. 28 RGPD): borra la empresa, cuando quiera y si no hay una inspección o reclamación abierta sobre ese ejercicio (que interrumpe la prescripción). Los triggers siguen bloqueando el DELETE.
- **El superadmin no descarga datos de tenants.** Si hace falta, entra con "Editar" y descarga desde el panel del cliente; las URLs llevan `&empresaId=`.

## Piezas

- `retencion_resumen(p_empresa_id uuid DEFAULT NULL)` — conteos por empresa, apartado y ejercicio. Solo `service_role`: con `NULL` devuelve TODAS las empresas. Migración `20261001000003`.
- `src/lib/empresa/retencion.ts` — plazos, `conservarHasta`, `tiempoRestante`, `resumenRetencion`, `textoRestante`, `urlDescarga`. Tests: `tests/compliance/retencion-plazos.test.ts`.
- `src/lib/empresa/historial-csv.ts` — CSV de pedidos. Tests: `tests/compliance/historial-pedidos-csv.test.ts`.
- `HistorialUseCase` + `SupabaseHistorialRepository`; `GET /api/admin/historial/pedidos?ejercicio=YYYY`.
- `ConservacionEmpresa` (vista, recibe `lang`) y `ConservacionTraducida` (envoltorio cliente que lee el idioma y calcula con la fecha del navegador). Tests: `tests/ui/conservacion-empresa.test.tsx`.

## Descargas

| Apartado | Exportador | Formato |
|---|---|---|
| Pedidos | `/api/admin/historial/pedidos?ejercicio=` (nuevo) | CSV `;` con BOM |
| Cobros | `/api/tpv/audit/export?desde=&hasta=` (el del inspector) | JSON |
| Fichajes | `/api/laborcontrol/export?tipo=excel&from=&to=` | Excel |
| Turnos | — (sin exportador todavía) | — |

Cobros y fichajes viven bajo `/api/tpv` y `/api/laborcontrol`: con el TPV apagado el proxy los bloquea (403). Si una empresa apaga el TPV y quiere descargar su histórico, hoy no puede desde aquí.

## Trampas

- **Hora de Madrid en los dos extremos.** El ejercicio se saca con `AT TIME ZONE 'Europe/Madrid'` (un pedido del 1/1 a las 00:30 es aún 31/12 en UTC), y `conservarHasta` es 31/12 23:59:59.999 de Madrid = **22:59:59.999 UTC**. Con 23:59 UTC la pantalla mostraba "01/01/2033" en vez de "31/12/2032" (lo pilló el test de UI).
- **PostgREST corta en 1000 filas.** El CSV de pedidos pagina con `.range()`; sin eso, un año de un restaurante salía truncado sin aviso.
- **Inyección CSV.** Un texto que empieza por `= + - @` se prefija con `'`: los nombres de producto los escribe el tenant y Excel los ejecutaría como fórmula.
- **El CSV de pedidos no lleva datos personales** (dirección, coordenadas): es registro mercantil. Los datos del cliente tienen su vía (`/api/admin/rgpd/exportar-cliente`).

## PENDIENTE — Eliminar ejercicios con el plazo cumplido (decidido el 2026-10-01, sin fecha)

Hoy un ejercicio con el plazo cumplido solo muestra "Plazo cumplido" y la descarga: el cliente NO puede eliminar nada. Diseño acordado para cuando se construya (no corre prisa, porque los primeros pedidos vencen el 31/12/2032):

1. Botón "Eliminar ejercicio N" en `/admin/conservacion`, que se activa solo si:
   - el plazo de ese apartado ya se cumplió,
   - el ejercicio se descargó antes (queda registrado),
   - y el cliente confirma que no hay inspección, recurso ni reclamación abierta sobre ese año (interrumpen la prescripción).
2. Confirmación escribiendo el año, igual que el reset de pruebas.
3. Se borra el ejercicio COMPLETO, nunca registros sueltos. Antes se guarda un **sello de cierre** de la cadena de cobros (último hash y totales del año) para que la verificación de los años siguientes siga funcionando.
4. Un log de solo inserción con quién, qué ejercicio, cuándo y cuántos registros.
5. En BD, excepción estrecha en los triggers de bloqueo, que dejan pasar solo filas de ejercicios ya cumplidos de esa empresa (mismo patrón que `empresas.es_prueba`).
6. Fichajes: antes, comprobar si la cadena de `lc_fichajes` es por empresa o global (ver `superadmin.md`, sección del reset).

Se puede probar antes de 2033 con datos con fecha atrasada en la empresa de pruebas.
