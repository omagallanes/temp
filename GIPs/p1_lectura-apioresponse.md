## **GIP-AC: Paso `lectura-apioresponse` en `wf-procesar-factura`**

### Contexto general

Existe un Workflow de Cloudflare llamado **`wf-procesar-factura`** que ya:

* recibe un identificador interno de factura (`invoiceId`),
* almacena un PDF en R2,
* ejecuta una llamada a la API de OpenAI,
* guarda en R2 un JSON de resultado que contiene `apioResponse.output`.

Se debe añadir un **nuevo paso inicial de los nuevos bloques funcionales**, llamado **`lectura-apioresponse`**, que será el **único responsable** de:

* leer el resultado de OpenAI desde R2,
* validar estrictamente su estructura,
* y decidir si el Workflow continúa o se detiene.

Este paso es **bloqueante**:
**si falla, el Workflow no continúa** con ningún paso posterior.

---

### Reglas obligatorias (no negociables)

1. **Regla de funciones de negocio en Workflows**
   Todas las funciones de negocio (lectura, validación, normalización, preparación de datos, etcétera) deben:

   * residir en módulos TypeScript del mismo proyecto de Workers donde se define el Workflow,
   * ser importadas en el fichero del Workflow,
   * y ser llamadas desde los pasos del Workflow mediante `step.do` como funciones normales de TypeScript.

2. **Regla de parada por error**
   Si el paso `lectura-apioresponse` detecta cualquier error:

   * se debe generar el archivo `error_validacion_factura.json` en R2 junto al archivo original,
   * el Workflow debe finalizar en error controlado,
   * no debe ejecutarse ningún paso posterior (ni persistencia, ni verificación, ni exportación).

3. **Regla de no despliegue**
   El agente **NO debe desplegar** los cambios a Cloudflare.
   El trabajo se limita al código del repositorio y a los artefactos informativos solicitados.

---

### Objetivo funcional del paso `lectura-apioresponse`

1. Leer desde R2 el fichero JSON de resultado de la extracción, usando la **ubicación real ya existente** en el flujo actual.
2. Extraer **exclusivamente** `apioResponse.output`, en adelante **RO**.
3. Validar que RO contiene **únicamente**:

   * `datos_generales`
   * `lineas`
4. Validar que **todos los campos obligatorios** están presentes.

#### Campos obligatorios

**`datos_generales`**

* `nombre_proveedor`
* `nif_proveedor`
* `fecha_emision`
* `moneda`
* `importe_base_total`
* `importe_impuestos_total`
* `importe_retencion_total`
* `importe_total`
* `observaciones`

**`lineas[]`**

* `descripcion`
* `codigo_producto`
* `cantidad`
* `precio_unitario`
* `porcentaje_iva`
* `importe_base`
* `importe_impuesto`
* `importe_total_linea`

Si falta **cualquiera**, el paso debe fallar.

---

### Información que debe manejar este paso (y solo esta)

El paso `lectura-apioresponse` debe trabajar y devolver, en caso de éxito, un objeto serializable que incluya:

* `invoiceId`
* clave completa del PDF original en R2
* dirección URL del PDF
* nombre original del archivo PDF
* tipo de contenido del archivo
* `ro` (con `datos_generales` y `lineas`)

No debe propagar ni almacenar:

* el JSON completo de `apioResponse`,
* marcas temporales del Workflow,
* identificadores internos del motor del Workflow,
* claves de error ni estados intermedios.

---

### Comportamiento en caso de error

Si ocurre cualquiera de los siguientes casos:

* no se puede leer el JSON desde R2,
* no existe `apioResponse.output`,
* la estructura de RO es incorrecta,
* falta algún campo obligatorio,

entonces:

1. Se debe generar `error_validacion_factura.json` en R2, junto al PDF original.
2. El Workflow debe finalizar sin ejecutar pasos posteriores.
3. El error debe ser **explicativo**, indicando qué falta o qué es inválido.

---

### Archivo obligatorio de validación (checklist)

Además del código, el agente debe generar un **archivo informativo**, sin código ejecutable, con estas características:

* Nombre:
  `paso-lectura-apioresponse-YYYYMMDD_HHMM.md`
* Ubicación: dentro del repositorio del proyecto (ruta a criterio del agente, pero coherente con documentación técnica).
* Contenido: checklist claro que permita verificar que el paso cumple lo acordado.

#### Contenido mínimo del checklist

El archivo debe incluir, al menos, comprobaciones del tipo:

* El paso se llama exactamente `lectura-apioresponse`.
* El código del paso reside en el archivo `lectura-apioresponse`.
* Las funciones de negocio están en módulos TypeScript separados.
* El Workflow importa esas funciones y las ejecuta mediante `step.do`.
* El paso lee el JSON desde R2 usando la ubicación real del flujo actual.
* Solo se usa `apioResponse.output`.
* Se validan todos los campos obligatorios.
* En caso de error:

  * se genera `error_validacion_factura.json`,
  * el Workflow no continúa.
* No se ha realizado despliegue a Cloudflare.

El objetivo del archivo es **auditoría y revisión**, no ejecución.

---

### Alcance explícito

Incluido:

* Paso `lectura-apioresponse`.
* Validación estricta de RO.
* Generación de error en R2.
* Preparación del contexto para pasos posteriores.

Excluido:

* Persistencia en base de datos.
* Inserciones en `fat_facturas` o `fat_facturas_archivos`.
* Verificación de importes.
* Exportación a Excel.
* Cambios de frontend.
* Despliegue a Cloudflare.

---

### Criterios de aceptación

1. Con un JSON válido:

   * el paso devuelve `ro` y el contexto mínimo acordado,
   * el Workflow puede continuar.

2. Con un JSON inválido:

   * se genera `error_validacion_factura.json`,
   * el Workflow se detiene.

3. Existe el archivo
   `paso-lectura-apioresponse-YYYYMMDD_HHMM.md`
   y permite verificar punto por punto lo acordado.

---

Further Considerations
1 Confirmar ruta exacta en R2 del JSON de extracción (actual: facturas/${invoiceId}/apioresponse.json) y del PDF para ubicar error_validacion_factura.json.
2 Acordar formato del mensaje de error explicativo (campo/s faltante o inválido) a almacenar en error_validacion_factura.json.
3 Decidir si normalizar tipos numéricos/strings o solo validar presencia/estructura en esta fase.

1 Si
2 [De acuerdo. Respondo **como agente orquestador**, acordando **el formato** (contrato) del mensaje de error, **sin código** y **sin implementación**, para que AGTD lo use tal cual en el GIP y en el desarrollo.

---

## Formato acordado de `error_validacion_factura.json`

### Principios que rigen el formato

1. **Explicativo y auditable**
   Debe permitir entender **qué ha fallado y por qué**, sin necesidad de leer logs ni código.

2. **Determinista y estable**
   El formato no debe depender del tipo de error concreto. Cambia el contenido, no la estructura.

3. **Sin duplicar datos de negocio completos**
   No se debe volcar el RO completo; solo referencias y fragmentos mínimos necesarios.

4. **Preparado para uso futuro**
   El mismo fichero servirá más adelante para:

   * envío de correo electrónico,
   * visualización en frontal,
   * reintentos o análisis manual.

---

## Estructura base del JSON de error

```json
{
  "tipo_error": "",
  "descripcion": "",
  "origen": "lectura-apioresponse",
  "invoiceId": "",
  "archivo": {
    "nombre_original": "",
    "r2_pdf_key": "",
    "file_url": ""
  },
  "detalle_validacion": {
    "campos_faltantes": [],
    "campos_invalidos": []
  },
  "fecha_error": ""
}
```

---

## Descripción de cada campo (contrato)

### Nivel raíz

1. **`tipo_error`**
   Texto corto y normalizado. Valores permitidos (iniciales):

   * `estructura_ro_invalida`
   * `campo_obligatorio_faltante`
   * `campo_obligatorio_invalido`
   * `error_lectura_r2`
   * `apioresponse_inexistente`

2. **`descripcion`**
   Texto humano, claro y directo, explicando el motivo principal del fallo.
   Ejemplo:

   > “Faltan campos obligatorios en datos_generales”

3. **`origen`**
   Nombre exacto del paso del Workflow que genera el error.
   Valor fijo aquí:

   * `lectura-apioresponse`

4. **`invoiceId`**
   Identificador interno de la factura procesada.

---

### Bloque `archivo`

5. **`archivo.nombre_original`**
   Nombre original del PDF subido.

6. **`archivo.r2_pdf_key`**
   Clave completa del PDF en R2.

7. **`archivo.file_url`**
   Dirección URL utilizada para acceder al PDF.

---

### Bloque `detalle_validacion`

8. **`detalle_validacion.campos_faltantes`**
   Lista de rutas de campos que no existen pero son obligatorios.
   Ejemplos:

   * `datos_generales.nif_proveedor`
   * `datos_generales.fecha_emision`
   * `lineas[0].importe_total_linea`

9. **`detalle_validacion.campos_invalidos`**
   Lista de objetos con campos presentes pero inválidos.

   Cada elemento debe incluir:

   * `campo`: ruta del campo
   * `valor`: valor recibido (si es seguro incluirlo)
   * `motivo`: explicación corta

   Ejemplo conceptual:

   ```json
   {
     "campo": "datos_generales.importe_total",
     "valor": -10,
     "motivo": "El importe total no puede ser negativo"
   }
   ```

---

### Metadatos

10. **`fecha_error`**
    Fecha y hora del error en formato ISO 8601 (texto).

---

## Qué **no** debe incluir el fichero de error

Para dejarlo explícito y evitar desviaciones:

* No incluir el `apioResponse` completo.
* No incluir el RO completo.
* No incluir trazas internas del Workflow.
* No incluir información de pasos posteriores (porque no se ejecutan).
* No incluir datos personales adicionales no presentes ya en la factura.

---

## Ejemplo conceptual (no normativo)

Solo para que AGTD entienda el espíritu, no como plantilla rígida:

```json
{
  "tipo_error": "campo_obligatorio_faltante",
  "descripcion": "Faltan campos obligatorios en datos_generales",
  "origen": "lectura-apioresponse",
  "invoiceId": "INV-2026-00034",
  "archivo": {
    "nombre_original": "Factura_Proveedor_X.pdf",
    "r2_pdf_key": "facturas/INV-2026-00034/factura.pdf",
    "file_url": "https://…"
  },
  "detalle_validacion": {
    "campos_faltantes": [
      "datos_generales.nif_proveedor",
      "datos_generales.fecha_emision"
    ],
    "campos_invalidos": []
  },
  "fecha_error": "2026-01-14T16:42:00Z"
}
```

---

## Decisión clara para AGTD

Puedes transmitirle esto como **decisión cerrada**:

* El formato de `error_validacion_factura.json` queda **fijado** con esta estructura.
* Todos los errores del paso `lectura-apioresponse` deben ajustarse a este contrato.
* Cualquier cambio futuro deberá versionarse explícitamente (por ejemplo, `version_error: 1` si más adelante lo pedís).

Si quieres, en el siguiente mensaje puedo:

* integrar este formato directamente dentro del GIP ya aprobado,
* o preparar un **GIP independiente** solo para “Gestión de errores y generación de `error_validacion_factura.json`” para que quede como referencia estable del proyecto.]
3 [Decisión propuesta (para cerrar y que AGTD implemente sin dudas):

## En `lectura-apioresponse` se hace **validación estricta de presencia y estructura** y **normalización mínima de tipos**, pero **no** normalización de contenido

### Qué **sí** se hace en esta fase

1. **Validar presencia** de todos los campos obligatorios (`datos_generales` y `lineas[]` completos).
2. **Validar tipo utilizable**:

   * Campos de texto: deben ser texto o, si vienen como otro tipo, deben poder convertirse de forma segura a texto sin perder significado.
   * Campos numéricos: deben ser número o texto numérico convertible de forma segura.
3. **Normalización mínima de tipos** para los pasos siguientes:

   * Convertir a texto: `nombre_proveedor`, `nif_proveedor`, `fecha_emision`, `moneda`, `observaciones`, `descripcion`, `codigo_producto`.
   * Convertir a número: `importe_base_total`, `importe_impuestos_total`, `importe_retencion_total`, `importe_total`, `cantidad`, `precio_unitario`, `porcentaje_iva`, `importe_base`, `importe_impuesto`, `importe_total_linea`.

Esto significa que el paso devuelve un `ro` con tipos coherentes (textos como texto, números como número), y con eso los siguientes pasos no tienen que repetir conversiones.

### Qué **no** se hace en esta fase

1. **No** se normaliza el contenido (por ejemplo, no se “normaliza” el nombre del proveedor, ni el identificador fiscal, ni formatos de fecha, ni moneda).
2. **No** se aplican reglas de negocio de coherencia aritmética (eso se reserva para validación y verificación posteriores).
3. **No** se corrigen valores “raros” (por ejemplo, si un número es negativo o si una fecha tiene un formato inesperado): aquí se marca como inválido si no es utilizable.

## Regla de fallo asociada

Si un campo numérico **no** es convertible de forma segura a número (por ejemplo, `"12,34"` si no se soporta, `"abc"`, `null`), se considera **campo inválido** y:

* se genera `error_validacion_factura.json` con:

  * `campos_invalidos` incluyendo ruta, valor recibido y motivo,
* y el Workflow se detiene (no continúa).

## Por qué esta decisión encaja con lo acordado

* Mantiene la veracidad: no “arregla” contenido, solo asegura tipos operables.
* Reduce complejidad en pasos posteriores: ya reciben tipos consistentes.
* Evita inventar reglas de normalización semántica en una fase cuyo objetivo es lectura y estructura.

Si confirmas esta decisión, la incorporo tal cual al GIP del paso `lectura-apioresponse` como norma cerrada para AGTD.]