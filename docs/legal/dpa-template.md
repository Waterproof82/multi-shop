# Acuerdo de Tratamiento de Datos (DPA) — Modelo Art. 28 RGPD

> **Versión**: 1.0
> **Referencia normativa**: RGPD Art. 28 / LOPDGDD Disposición adicional primera
> **Uso**: Completar y firmar antes de activar cualquier funcionalidad que procese datos personales de clientes del restaurante (sistema de reservas, fidelización, datos de contacto).

---

## PARTES

**RESPONSABLE DEL TRATAMIENTO** ("el Restaurante")

- Denominación: ___________________________
- NIF/CIF: ___________________________
- Domicilio social: ___________________________
- Representante legal: ___________________________
- Contacto DPD (si aplica): ___________________________

**ENCARGADO DEL TRATAMIENTO** ("el Proveedor")

- Denominación: Multisistema SL (o razón social aplicable)
- NIF/CIF: ___________________________
- Domicilio social: ___________________________
- Representante legal: ___________________________
- Email de contacto RGPD: dpo@multisistema.es

---

## 1. OBJETO Y ALCANCE

El Encargado tratará los siguientes datos personales en nombre del Responsable, en el contexto del uso del software TPV multi-shop:

| Categoría de dato | Finalidad | Base legal |
|-------------------|-----------|-----------|
| Nombre y apellidos del cliente | Reservas, fidelización, emisión de facturas | Ejecución de contrato (Art. 6.1.b) |
| Teléfono / email | Confirmaciones, comunicaciones operativas | Ejecución de contrato (Art. 6.1.b) |
| Historial de pedidos anonimizado | Estadísticas internas del restaurante | Interés legítimo (Art. 6.1.f) |
| Datos de empleados (fichajes, PIN hash) | Control horario RD-Ley 8/2019 | Obligación legal (Art. 6.1.c) |

**Quedan excluidos** del presente acuerdo los datos de tarjeta de crédito, que son procesados directamente por el TPV bancario del Restaurante (procesador externo PCI-DSS).

---

## 2. INSTRUCCIONES DE TRATAMIENTO

El Encargado únicamente tratará los datos personales siguiendo las instrucciones documentadas del Responsable. Las instrucciones vigentes son:

1. Almacenar datos en servidores ubicados en la UE (Supabase — región eu-west-1).
2. No ceder datos a terceros salvo obligación legal o instrucción expresa del Responsable.
3. Aplicar anonimización irreversible de clientes tras **5 años** de inactividad (CRON mensual automatizado).
4. No utilizar los datos para fines propios del Encargado (perfilado, publicidad, etc.).

---

## 3. MEDIDAS DE SEGURIDAD (Art. 32 RGPD)

El Encargado implementa y mantiene las siguientes medidas técnicas y organizativas:

### 3.1 Técnicas
- Cifrado en tránsito: TLS 1.2+ en todas las comunicaciones.
- Cifrado en reposo: habilitado en la capa de base de datos (Supabase).
- Control de acceso: RBAC por rol (admin / cajero / encargado / camarero). Autenticación por PIN con hash bcrypt.
- Aislamiento de tenant: Row Level Security (RLS) en PostgreSQL — cada restaurante solo accede a sus propios datos.
- Logs de auditoría inmutables: tabla `audit_log` con trigger AFTER INSERT; imposible borrar o modificar entradas.
- Copias de seguridad: automáticas diarias (retención 30 días) gestionadas por Supabase.

### 3.2 Organizativas
- Acceso a producción restringido a personal técnico autorizado con autenticación MFA.
- Política de desarrollo seguro: revisiones de código, análisis SAST, auditoría de cumplimiento semestral.
- Plan de respuesta a incidentes con notificación al Responsable en < 72 h (Art. 33 RGPD).

---

## 4. SUBENCARGADOS

El Encargado utiliza los siguientes subencargados para el tratamiento de datos:

| Subencargado | País | Rol | Garantías |
|---|---|---|---|
| Supabase Inc. | UE (eu-west-1) | Infraestructura de base de datos | DPA disponible en supabase.com/privacy |
| Vercel Inc. | UE (Frankfurt) | Hosting de la aplicación web | DPA disponible en vercel.com/legal/dpa |
| Sentry Inc. | UE | Monitoreo de errores (sin PII en payloads) | DPA disponible en sentry.io/legal/dpa |

El Encargado notificará al Responsable cualquier cambio en los subencargados con **30 días de antelación**, dando al Responsable la posibilidad de oponerse.

---

## 5. DERECHOS DE LOS INTERESADOS

Cuando el Responsable reciba solicitudes de ejercicio de derechos (acceso, rectificación, supresión, portabilidad, limitación u oposición), el Encargado:

1. Proporcionará al Responsable las herramientas técnicas para atender la solicitud (endpoint de anonimización: `POST /api/admin/rgpd/anonimizar-cliente`).
2. Responderá a requerimientos de asistencia técnica en un plazo máximo de **5 días hábiles**.
3. No atenderá directamente solicitudes de interesados sin instrucción previa del Responsable.

---

## 6. VIOLACIONES DE SEGURIDAD (Art. 33–34 RGPD)

En caso de brecha de seguridad que afecte a datos personales, el Encargado:

1. Notificará al Responsable **sin dilación indebida** y, en todo caso, en un plazo máximo de **72 horas** desde que tenga conocimiento de la violación.
2. La notificación incluirá: naturaleza de la violación, categorías y número aproximado de interesados afectados, medidas adoptadas o propuestas.
3. El Responsable es el obligado a notificar a la AEPD si la violación supone un riesgo para los derechos de los interesados.

---

## 7. DURACIÓN Y SUPRESIÓN

El presente acuerdo estará vigente mientras dure la relación contractual entre las partes.

A la finalización:
- El Encargado suprimirá o devolverá todos los datos personales al Responsable en un plazo máximo de **30 días**.
- A solicitud del Responsable, se podrá emitir certificado de supresión.
- Se conservarán los datos mínimos imprescindibles para el cumplimiento de obligaciones legales (registros fiscales bajo Art. 66 LGT — 5 años), en soporte aislado sin acceso operativo.

---

## 8. AUDITORÍAS Y CUMPLIMIENTO

El Responsable tiene derecho a realizar o encargar auditorías de cumplimiento del presente DPA. El Encargado:
- Facilitará toda la información necesaria para demostrar el cumplimiento.
- Permitirá y contribuirá a auditorías, incluidas inspecciones, realizadas por el Responsable o su auditor designado.
- Comunicará al Responsable cualquier instrucción que, en su opinión, infrinja el RGPD u otras normas de protección de datos.

---

## 9. TRANSFERENCIAS INTERNACIONALES

Todos los datos se procesan dentro de la UE/EEE. En caso de que algún subencargado requiera una transferencia fuera del EEE, el Encargado se asegurará de que existan garantías adecuadas (Cláusulas Contractuales Tipo de la Comisión Europea o decisión de adecuación).

---

## 10. FIRMA

Lugar y fecha: _________________________, a _____ de _____________ de 20___

**Por el Responsable del Tratamiento:**

Nombre y apellidos: _______________________
Cargo: _______________________
Firma: _______________________

**Por el Encargado del Tratamiento:**

Nombre y apellidos: _______________________
Cargo: _______________________
Firma: _______________________

---

*Este documento debe custodiarse junto con el Registro de Actividades de Tratamiento (RAT) del Responsable, de conformidad con el Art. 30 RGPD.*
