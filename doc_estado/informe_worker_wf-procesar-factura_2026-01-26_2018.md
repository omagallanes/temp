# Informe técnico: Cloudflare Worker — wf-procesar-factura ✅

Fecha: 2026-01-26 20:18

---

## Resumen ejecutivo ✨

Este documento describe exclusivamente el comportamiento, responsabilidades y límites del Cloudflare Worker que forma parte del componente denominado `wf-procesar-factura`. No se hace referencia ni se documenta ningún comportamiento de componentes externos que puedan recibir o procesar los eventos que el Worker genera.

---

## Rol general del Cloudflare Worker 🎯

- El Worker actúa como **punto de entrada web para peticiones HTTP**, exponiendo un manejador que acepta tanto peticiones de tipo obtención como peticiones de tipo envío de datos.
- Su función es **validar y aceptar o rechazar eventos** entrantes, realizar comprobaciones de seguridad y, en casos de operaciones de prueba, ejecutar consultas de verificación y almacenar artefactos de prueba en el almacenamiento de objetos.
- El Worker finaliza su responsabilidad devolviendo respuestas HTTP que informan del resultado de la validación o de la operación de prueba. Cualquier procesamiento adicional no forma parte de las responsabilidades descritas en este documento.

Referencias observables: archivo `workers/wf-procesar-factura/src/index.ts` y documentación local `workers/wf-procesar-factura/README.md`.

---

## Tipos de solicitudes recibidas y contexto de actuación 📥

- Peticiones HTTP con el **método de obtención** (GET) dirigidas a la ruta de prueba para generación de hojas de cálculo de ejemplo. Estas peticiones están pensadas para uso de comprobación funcional y desarrollo.
- Peticiones HTTP con el **método de envío de datos** (POST) que contienen el evento de factura en formato JSON. Estas peticiones son el mecanismo habitual para notificar al sistema sobre un nuevo archivo o un nuevo evento de factura que debe ser gestionado por componentes subsiguientes.

Contexto: El Worker se encuentra dentro del paquete del proyecto y se utiliza en entornos de desarrollo y despliegue para recibir eventos entrantes y validar datos iniciales antes de delegar cualquier procesamiento posterior.

---

## Validaciones, comprobaciones y decisiones realizadas por el Worker ✅

Antes de aceptar una petición para su tramitación, el Worker realiza las siguientes comprobaciones observables:

- Verificación del método HTTP: rechaza métodos distintos a los esperados con un código de estado apropiado.
- Validación del cuerpo de la petición: comprueba que el cuerpo de la petición sea JSON válido cuando corresponde y devuelve un error claro en caso contrario.
- Validación de campos obligatorios en eventos de tipo envío: comprueba la presencia de campos requeridos en el objeto JSON entrante. En ausencia de cualquier campo obligatorio, responde con un error que indica la falta de datos.
- Comprobación de token de prueba para la ruta de verificación: en la ruta de prueba, compara un valor de token suministrado por la petición con un secreto almacenado en el entorno y rechaza la petición si la comprobación de autenticidad falla.
- En la operación de prueba, comprueba que existan datos de ejemplo en la base de datos antes de generar artefactos de salida; devuelve un estado claro cuando no hay datos de prueba disponibles.

Estas comprobaciones permiten al Worker aceptar sólo eventos con formato y datos mínimos correctos y proporcionar respuestas de error detalladas cuando la entrada no es válida.

---

## Flujo lógico completo del Cloudflare Worker (hasta el punto en que finaliza su responsabilidad) 🔁

1. Recepción de la petición HTTP por el manejador del Worker.
2. Validación del método HTTP. Si el método no es aceptado, devuelve un error inmediato y termina la ejecución.
3. Si la petición corresponde a la ruta de prueba de hoja de cálculo:
   - Extrae un token desde cabeceras o parámetros de consulta.
   - Recupera un secreto de comprobación desde el espacio de nombres de tipo Key-Value configurado en el entorno.
   - Si la comprobación de token falla, responde con un estado de acceso denegado y finaliza.
   - Si la comprobación es exitosa, realiza una consulta a la base de datos para recuperar datos de prueba.
   - Si no hay datos de prueba, responde con un estado que lo indica y finaliza.
   - Si hay datos, construye un artefacto de hoja de cálculo en memoria y lo guarda en el almacenamiento de objetos; finalmente responde con un objeto JSON que indica la clave o localización del artefacto y finaliza.
4. Si la petición corresponde al flujo habitual de notificación de factura (peticiones de tipo envío con cuerpos JSON):
   - Intenta parsear el cuerpo como JSON. Si esto falla, responde con un error de formato y finaliza.
   - Verifica la presencia de campos obligatorios en el objeto JSON entrante. Si faltan campos, responde con un error que indica los campos faltantes y finaliza.
   - Si las validaciones anteriores son correctas, **el Worker delega el procesamiento posterior a un componente externo configurado en el entorno de despliegue y responde con un objeto JSON que indica la aceptación del evento y contiene un identificador de instancia**. En este punto el Worker consigna su responsabilidad como finalizada para esa petición.
5. En todos los casos, el Worker responde con encabezados y códigos de estado HTTP apropiados y con cuerpos que facilitan el diagnóstico (por ejemplo, mensajes de error claros o datos de confirmación en formato JSON).

> Nota: el desglose anterior describe exclusivamente las acciones realizadas por el Worker. No se incluye ni se documenta en este informe ningún comportamiento o responsabilidad de componentes externos que puedan continuar el procesamiento.

---

## Componentes y recursos de Cloudflare que utiliza el Cloudflare Worker ☁️

A partir de la configuración y del código fuente del Worker, se identifican los siguientes recursos y la forma en que el Worker los utiliza:

- Espacio de nombres Key-Value para secretos (Key-Value namespace para secretos):
  - Uso: recuperar valores sensibles de configuración, por ejemplo un token de comprobación para rutas de prueba y claves de acceso a servicios externos cuando se requiera.
  - Momento de intervención: validación de peticiones de prueba y comprobaciones de seguridad antes de realizar operaciones que produzcan efectos.

- Espacio de nombres Key-Value para plantillas (Key-Value namespace para plantillas):
  - Uso: almacenamiento de plantillas o configuraciones textuales que podrían ser empleadas por componentes que se ejecuten fuera del Worker.
  - Momento de intervención: lectura de plantillas cuando el Worker necesita realizar operaciones de verificación o generar datos de prueba; el contenido se lee de forma puntual durante la ejecución de la petición.

- Almacenamiento de objetos R2:
  - Uso: persistencia de artefactos generados por el Worker en la ruta de prueba, por ejemplo hojas de cálculo de ejemplo o JSON de resultados de prueba.
  - Momento de intervención: después de la generación del artefacto de verificación en la ruta de prueba, el Worker escribe el fichero en el bucket de objetos y devuelve la referencia al cliente.

- Base de datos D1:
  - Uso: consultar datos de ejemplo para las peticiones de verificación y comprobación funcional.
  - Momento de intervención: durante la ejecución de la ruta de prueba, antes de generar artefactos, el Worker realiza una consulta y actúa según el resultado.

- Runtime de Cloudflare Workers y capacidades de red saliente:
  - Uso: exponer el manejador HTTP, procesar las peticiones y devolver respuestas; realizar en su caso llamadas salientes si fuera necesario para la validación inicial.
  - Momento de intervención: en la recepción y en la respuesta a cada petición HTTP.

---

## Límites y alcance de la responsabilidad del Cloudflare Worker ✋

- El Worker se limita a la validación inicial, comprobaciones de seguridad, ejecución de operaciones de prueba y a la delegación de cualquier procesamiento adicional a componentes externos configurados en el entorno de despliegue.
- No realiza procesamiento persistente complejo de la factura ni operaciones de orquestación de varios pasos; su responsabilidad finaliza al aceptar el evento y devolver una respuesta de confirmación o al rechazar la petición con errores claros.
- El Worker ofrece una funcionalidad de prueba que sí genera artefactos y persiste resultados en el almacenamiento de objetos, lo que permite verificar la integridad de algunas dependencias (por ejemplo, acceso a la base de datos y escritura en el bucket), pero estos usos son claramente de carácter de verificación y no constituyen el procesamiento principal del evento.

---

## Archivos clave consultados 📁

- `workers/wf-procesar-factura/src/index.ts` — implementa el manejador HTTP y las validaciones descritas.
- `workers/wf-procesar-factura/README.md` — documentación del entorno y lista de recursos esperados por el Worker.
- `workers/wf-procesar-factura/test/fetch.handler.test.ts` — pruebas que cubren el comportamiento del manejador `fetch` del Worker.

---

Si lo desea, puedo generar una checklist de pruebas de integración y seguridad específicas para validar estos puntos operativos del Worker. 💡
