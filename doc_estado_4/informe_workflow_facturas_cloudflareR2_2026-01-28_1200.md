# Informe técnico: Comportamiento actual del Workflow de procesamiento de facturas tras la subida a Cloudflare R2

**Fecha de elaboración:** 2026-01-28

---

## 1. Punto de entrada y disparador del Workflow

El inicio del Workflow de procesamiento de facturas se produce tras la subida exitosa de un archivo de factura al almacenamiento Cloudflare R2. El evento que dispara el inicio del Workflow es una llamada HTTP realizada por el sistema que gestiona la subida de archivos (habitualmente un worker o servicio backend), una vez confirmada la persistencia del archivo en R2. Esta llamada se realiza al endpoint expuesto por el Workflow, transmitiendo la información mínima necesaria para identificar el archivo y sus metadatos asociados. El mecanismo de correlación se basa en el identificador único del archivo en R2, garantizando que el Workflow iniciado corresponde exactamente al archivo almacenado.

## 2. Datos requeridos del archivo almacenado en Cloudflare R2

El Workflow requiere recibir los siguientes datos relativos al archivo de factura:

- Identificador único del archivo o clave de almacenamiento en Cloudflare R2.
- Nombre del contenedor o espacio de almacenamiento utilizado.
- Metadatos asociados al archivo, incluyendo:
  - Tipo de contenido (MIME type).
  - Tamaño del archivo.
  - Nombre original del archivo.
  - Identificador de factura asociado (si aplica).
  - Identificador de usuario que realizó la subida.
  - Código de referencia o identificador de correlación.

El Workflow accede tanto a los metadatos como, en etapas posteriores, al contenido completo del archivo. El acceso a los metadatos es inmediato y necesario para la validación y configuración inicial. Existen requisitos sobre el formato del archivo (por ejemplo, debe ser un archivo de factura válido en formato PDF, XML u otro permitido), el tipo de contenido debe ser compatible y el tamaño no debe exceder el límite configurado para el sistema.

## 3. Relación entre los datos del archivo y la lógica inicial del Workflow

El Workflow utiliza los datos recibidos para validar la integridad y elegibilidad del archivo antes de iniciar el procesamiento. Los campos obligatorios para el inicio son: identificador del archivo, nombre del contenedor, tipo de contenido, tamaño y nombre original. Si alguno de estos campos no está presente o no es válido, el Workflow rechaza el inicio y genera una respuesta de error. Para evitar duplicidad, el Workflow registra el identificador del archivo y verifica que no exista un proceso en curso o finalizado para el mismo archivo antes de proceder.

## 4. Respuesta inmediata generada al iniciar el Workflow

La respuesta inmediata generada tras el inicio exitoso del Workflow tiene una estructura definida que incluye:

- Indicador de éxito de la subida a Cloudflare R2.
- Indicador de inicio exitoso del Workflow.
- Identificador interno del Workflow generado.
- Identificador del archivo en Cloudflare R2.
- Identificador de factura (si aplica).
- Código de referencia o identificador de correlación.

En caso de éxito, todos los campos anteriores se completan y los indicadores de éxito se establecen en valor positivo. En caso de error, la respuesta incluye un indicador de fallo, un mensaje descriptivo, un código de error y el identificador de referencia para trazabilidad.

## 5. Coherencia con la validación posterior que realiza el Front End

Al inicio de la ejecución, el Workflow registra el identificador del archivo, el identificador interno del proceso y los metadatos relevantes, permitiendo que el sistema pueda resolver el identificador definitivo de la factura o el resultado del procesamiento en consultas posteriores. Se espera que, en condiciones normales, el sistema esté en estado consultable en pocos segundos tras el inicio. Sin embargo, pueden existir situaciones en las que el resultado no esté disponible de inmediato, por ejemplo, si el procesamiento requiere validaciones adicionales o si existen demoras en la propagación de estados.

## 6. Gestión de errores en la fase de inicio del Workflow

Los errores posibles en la fase de inicio incluyen: ausencia o invalidez de campos obligatorios, incompatibilidad de formato o tipo de archivo, tamaño excedido, o duplicidad de proceso para el mismo archivo. En caso de error, la respuesta inmediata contiene un mensaje descriptivo, un código de error, el identificador de referencia y los campos necesarios para que el Front End pueda mostrar un mensaje comprensible al usuario y disponer de información para soporte y trazabilidad.

---

**Este informe documenta el funcionamiento real y actual del Workflow de procesamiento de facturas en su integración con el almacenamiento Cloudflare R2 y el sistema que interactúa con el Front End.**
