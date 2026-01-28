# Integración conceptual: estados, log y registros técnicos (E6)

Fecha: 2026-01-28 11:49
Ámbito: solo documentación. Sin cambios de código ni de contratos. Compatibilidad obligatoria con el Worker Fetch/HTTP en producción y el frontal en Pages.

## 1. Roles claramente separados
- Estados funcionales (persistidos en `fat_facturas_archivos`): indican la situación actual y canónica del proceso de un archivo (`pendiente`, `validada`). No registran historia, solo el estado presente.
- Campo `log` (diseño E5): historial estructurado de eventos significativos del flujo para un `invoiceId` / `factura_id`. Complementa, no sustituye, a los estados.
- Registros técnicos fijos (“Facturas Fallidas”, “Sin Proveedor Identificado”): valores controlados en D1 (y referenciables vía KV) para absorber casos de fallo o ausencia de proveedor. No son estados ni eventos; son identificadores de recursos técnicos.

## 2. Qué va en cada mecanismo
- Estados: transición mínima y canónica del archivo (p.ej., creado/pendiente tras registrar el PDF; validada tras generar Excel). No detallar causas ni hitos.
- Log: eventos funcionales en orden temporal (inicio, extracción IA ok/error, validación RO ok/error, proveedor ok/error, cabecera ok/error, archivo pendiente ok/error, líneas ok/error, Excel ok/error). Incluye timestamp y referencias a claves R2 cuando aplique.
- Registros técnicos fijos: se usan cuando el proceso debe asociar la factura a un identificador técnico (p.ej., si no hay proveedor o factura fallida). El uso del ID técnico puede registrarse en el `log` como evento, pero el ID vive en D1/KV y el estado permanece en estados canónicos.

## 3. Relación conceptual entre cambios de estado, log y registros técnicos
- Cambio de estado: refleja hitos de consolidación (ej.: pasar a `pendiente` tras primer upsert; pasar a `validada` tras Excel). El `log` registra el evento que provoca el cambio (p.ej., `archivo_pendiente_ok`, `excel_ok`).
- Eventos de log sin cambio de estado: validación fallida de RO, error en IA, error en líneas. El estado puede quedar sin avanzar; el `log` cuenta qué ocurrió.
- Registros técnicos fijos: si el flujo deriva a usar un ID técnico (ej.: “Facturas Fallidas”), el evento de log debe indicar esa asociación. El estado funcional puede seguir siendo el mismo (p.ej., `pendiente`) hasta que se decida otra cosa; el ID técnico no redefine estados.

## 4. Reglas para evitar duplicidades
- No poner en el `log` lo que ya expresa el estado (“validada”, “pendiente”) salvo para marcar el instante en que se alcanzó.
- No usar estados para describir causas o pasos (eso va en el `log`).
- No replicar IDs técnicos en el `log` salvo referencia puntual al hecho de uso (el ID real permanece en D1/KV). Evitar copiar valores sensibles o internos.
- No crear estados nuevos ni reinterpretar los existentes.

## 5. Interpretación conjunta
- Proceso exitoso: estado `validada` + eventos de log que muestren cadena completa (inicio → IA ok → RO ok → proveedor ok → cabecera ok → archivo_pendiente_ok → líneas ok → excel_ok). Registros técnicos fijos no intervienen.
- Fallo temprano (antes de D1): estado no avanza (sigue en `pendiente` inicial o sin actualizar); log muestra error en IA o validación RO; sin uso de IDs técnicos.
- Fallo intermedio (en D1 o posteriores): estado puede quedar en `pendiente`; log muestra el evento de error (proveedor_error, cabecera_error, lineas_error, excel_error); si se decide asociar a “Facturas Fallidas”, se registra en log la asociación al ID técnico.
- Reproceso: nuevo set de eventos de log para el mismo `invoiceId`/`factura_id`; el estado final refleja el último resultado (`validada` si culmina). El log conserva la historia de intentos; los registros técnicos fijos solo se mencionan si se usan.

## 6. Dependencias y advertencias
- No se cambian contratos HTTP ni la secuencia del flujo existente.
- Los valores de `R2_FACTURAS_PREFIX`, IDs técnicos y prefijos históricos deben confirmarse externamente; no se asumen. El log puede referenciar su uso cuando exista confirmación.
- Cualquier implementación futura debe mantener la compatibilidad con el sistema en producción y con el frontal en Pages.

## 7. Próximos pasos (conceptuales)
- E7 podrá diseñar notificaciones basadas en estado + eventos de log, sin alterar contratos ni estados. Cualquier mapeo a registros técnicos deberá apoyarse en IDs confirmados en D1/KV.
