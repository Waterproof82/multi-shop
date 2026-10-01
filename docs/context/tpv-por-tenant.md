# TPV por tenant (`empresas.tpv_habilitado`)

> Implementado el 2026-10-01. Migración `20261001000001_empresas_tpv_habilitado.sql` (aplicada).

## Qué es y por qué existe

Un único interruptor, **solo del superadmin**, que dice si un tenant tiene contratado el TPV. Es la pieza que decide qué obligaciones legales cubre este sistema para ese tenant, porque **el TPV es lo ÚNICO que emite facturas/tickets**: la web solo envía una confirmación de pedido ("hemos recibido tu pedido", sin numeración fiscal — `confirmacion-pedido-email.builder.ts`).

| | Con TPV | Sin TPV |
|---|---|---|
| Quién factura | Este sistema (TPV) | Un programa externo del cliente |
| VeriFactu (RD 1007/2023) | Aplica a este sistema | **No aplica a este sistema** (lo cumple su programa) |
| Registro de jornada (fichajes) | Activo, dentro del TPV | **No disponible** — si tiene empleados, los registra con otra herramienta |
| Datos personales de clientes | Anonimizados a los **5 años** sin actividad | Anonimizados a los **3 años** (garantía legal) |
| Finalidad que justifica guardar el pedido (`/privacidad`) | Obligación fiscal (art. 66 LGT) | Atención de garantías y reclamaciones |
| `/tpv`, `/api/tpv`, `/api/laborcontrol` | Abiertos | Cerrados (redirect / 403) |
| Admin: "Ir al TPV", Empleados TPV, Registro de auditoría | Visibles | Ocultos |
| Copias de seguridad | Toda la BD | **Igual: toda la BD** (no dependen del TPV) |
| Pedidos | Se conservan siempre | **Se conservan siempre** (DELETE bloqueado para todos) |

Decisiones del usuario (2026-10-01):
- **Un solo interruptor**: fichajes van con el TPV. No crear flags separados para jornada o facturación: todo se DERIVA de `tpv_habilitado`, así nunca puede quedar "fichajes sin TPV".
- **3 años** sin TPV (coincide con la garantía legal de bienes, art. 120 TRLGDCU).
- Las empresas existentes quedaron activadas; las nuevas nacen **desactivadas** (`DEFAULT false`).

## Dónde vive cada cosa

| Pieza | Fichero | Qué hace |
|---|---|---|
| Reglas puras | `src/lib/empresa/tpv-legal.ts` | `retencionClientesAnios()` y `resumenLegalEmpresa()` — ÚNICA fuente de verdad de las consecuencias |
| Lectura del flag con caché | `src/lib/tpv/tpv-habilitado.ts` | `tpvHabilitadoParaEmpresa(empresaId)` — 60 s por empresa |
| Bloqueo de APIs | `src/proxy.ts` → `exigirTpvHabilitado()` | Tras autenticar en `/api/tpv` y `/api/laborcontrol`: 403 si el tenant no tiene TPV |
| Bloqueo de páginas | `src/app/tpv/layout.tsx` | `redirect('/admin')` antes de las consultas pesadas |
| Admin | `admin-sidebar.tsx` (`requiresTpv`), `admin/(protected)/layout.tsx`, `lib/admin-context.tsx` | Oculta los accesos al TPV |
| Purga RGPD | `src/lib/rgpd/plan-purga.ts` + `supabase-cliente.repository.ts` | Plazo por tenant; ver `rgpd-clientes.md` |
| Política de privacidad | `components/legal/privacidad-contenido.tsx` | Plazo y finalidades según `flags.tpvHabilitado` |
| Panel superadmin | `src/app/superadmin/seccion-legal.tsx` | Sección "Cumplimiento legal": interruptor + resumen por empresa |
| Validación | `core/application/dtos/empresa.dto.ts` | `superadminUpdateEmpresaSchema` |

## Seguridad: interruptores solo del superadmin

`updateEmpresaSchema` lo usa también `/api/admin/empresa` (el admin de CADA tenant). Todo lo que añadas ahí lo puede cambiar cualquier tenant con una petición hecha a mano, aunque su panel no muestre el botón.

Por eso `superadminUpdateEmpresaSchema` (solo `/api/superadmin/empresas/[id]`) contiene: `tpv_habilitado`, `tipo`, `delivery_habilitado`, `mesas_habilitadas`, `pagos_mesa_habilitados`, `pagos_pickup_habilitados`, `validacion_pedidos_habilitada`. Hasta el 2026-10-01 los seis últimos estaban en el esquema compartido: un tenant podía convertirse en restaurante o activarse Glovo, mesas o cobros en mesa (problema de "funciones sin pagar", no de fuga de datos entre tenants).

**Regla:** un interruptor de producto nuevo va SIEMPRE en el esquema del superadmin. Lo vigila `tests/compliance/tpv-habilitado-solo-superadmin.test.ts`, que también comprueba que lo que el panel del tenant SÍ envía (`envio_domicilio_habilitado`, `mostrar_promociones`, `mostrar_tgtg`, descuento de bienvenida) se sigue aceptando.

## Comportamiento del bloqueo

- **Caché de 60 s**: apagar el TPV desde el superadmin tarda como mucho un minuto en surtir efecto (proxy, layout del TPV y menú del admin usan la misma función).
- **Ante error de BD se deja pasar** y no se cachea: es un interruptor de producto, no la barrera de seguridad (la autenticación ya pasó). Cortar el cobro de un restaurante en pleno servicio por un fallo transitorio de PostgREST sería peor.
- **Sin `x-empresa-id`** (superadmin sin empresa seleccionada) no hay tenant que comprobar: pasa.
- **Siempre abiertos**, tenga o no TPV: `/tpv/legal` (inspección de Hacienda, art. 12 RD 1007/2023), `/api/tpv/audit/export` con token de inspector, login/logout/activate de empleados (no consultan el flag; un token emitido no sirve de nada porque todas las APIs lo bloquean) y los cron de laborcontrol.

## Apagar el TPV a un tenant (procedimiento)

1. `/superadmin` → **Cumplimiento legal** → interruptor de la empresa.
2. Se pide confirmación. El aviso explica que:
   - los empleados no podrán fichar ni cobrar;
   - la facturación pasa a su programa externo;
   - **es irreversible para los clientes**: en la próxima purga mensual (día 1) se anonimizan los que lleven más de 3 años sin actividad. Volver a activar el TPV no los recupera.
3. **Nunca se borra**: cobros (retención fiscal), fichajes (4 años, art. 34.9 ET), pedidos ni turnos.
4. Antes de apagarlo a un tenant con histórico real, hablarlo con él: si tiene empleados, necesita otra herramienta de registro de jornada desde ese día.

Encenderlo no pide confirmación (no tiene consecuencias destructivas).

## Preguntas frecuentes

**¿Sin TPV se ahorran recursos?**
Casi nada en servidores o espacio: el TPV solo consume al abrirse y un cliente ocupa unos bytes. Lo que se gana es cumplimiento (no guardar datos personales más de lo justificable, art. 5.1.e RGPD), menos daño ante una brecha, menos superficie de ataque y que nadie use funciones no contratadas.

**Sin TPV, ¿se dejan de hacer copias o se borran pedidos?**
No. Las copias son de toda la BD para todos los tenants, y los pedidos no se borran nunca (trigger `pedidos_no_delete`). Solo cambia cuándo se anonimizan los datos personales. Los pedidos siguen siendo documentación mercantil del tenant (6 años), justificante ante Hacienda y prueba ante reclamaciones; además somos encargados del tratamiento y no decidimos borrar registros del tenant (art. 28 RGPD). Ver `rgpd-clientes.md`.

**Si un tenant sin TPV empieza a facturar desde la web en el futuro**, el sistema pasaría a ser sistema de facturación para él: VeriFactu le aplicaría a ESTE sistema y habría que replantear este documento (y no emitir dos facturas por la misma venta, una aquí y otra en su programa).

## Tests

| Test | Qué fija |
|---|---|
| `tests/compliance/empresa-tpv-legal.test.ts` | Plazos 5/3 y el resumen legal |
| `tests/compliance/tpv-habilitado-solo-superadmin.test.ts` | Qué campos solo cambia el superadmin |
| `tests/compliance/proxy-autorizacion.test.ts` (bloque "tenant SIN TPV") | 403 en /api/tpv y /api/laborcontrol; rutas públicas y cron no consultan el flag |
| `tests/compliance/rgpd-plan-purga.test.ts` | Agrupación por plazo y campos anonimizados (incluida la copia en pedidos) |
| `tests/ui/admin-sidebar-tpv.test.tsx` | Items del TPV en el menú |
| `tests/ui/legal-privacidad.test.tsx` | 5 vs 3 años y finalidad fiscal vs garantías |
| `tests/ui/superadmin-seccion-legal.test.tsx` | Resumen, confirmación al apagar (con el aviso irreversible), guardado y reversión si falla |
