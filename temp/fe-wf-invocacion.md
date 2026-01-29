# Invocación HTTP del workflow de facturas (FE)

## Endpoint y método
- URL: `https://wafacturas.ahg-reformas.es/api/wf-procesar-factura` (la barra final es opcional).
- Método: `POST`.
- Content-Type: `application/json`.

## Cuerpo requerido
```json
{
  "invoiceId": "<uuid-o-id-de-la-factura>",
  "r2Key": "<prefijo>/ <invoiceId>/original/<nombre-archivo>",
  "originalFileName": "<nombre-archivo.pdf>",
  "contentType": "application/pdf",
  "fileUrl": "https://pub-4e5e6e57e45848fbbbec281180517b6e.r2.dev/<r2Key>"
}
```
Ejemplo real:
```json
{
  "invoiceId": "2b896d45-63d7-49da-82b6-f033774041ad",
  "r2Key": "facturas/2b896d45-63d7-49da-82b6-f033774041ad/original/162615.pdf",
  "originalFileName": "factura-162615.pdf",
  "contentType": "application/pdf",
  "fileUrl": "https://pub-4e5e6e57e45848fbbbec281180517b6e.r2.dev/facturas/2b896d45-63d7-49da-82b6-f033774041ad/original/162615.pdf"
}
```
Campos obligatorios: `invoiceId`, `r2Key`, `originalFileName`, `contentType`, `fileUrl`. Si falta alguno, responde 400.

## Respuestas
- 200 OK
  ```json
  { "workflow": "wf-procesar-factura", "instancia_id": "<uuid-de-la-instancia>" }
  ```
- 404 Not Found si el path no es `/api/wf-procesar-factura` (o con barra final).
- 405 Method Not Allowed si no es `POST`.

## Ejecución rápida (curl)
```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -d '{
    "invoiceId": "2b896d45-63d7-49da-82b6-f033774041ad",
    "r2Key": "facturas/2b896d45-63d7-49da-82b6-f033774041ad/original/162615.pdf",
    "originalFileName": "factura-162615.pdf",
    "contentType": "application/pdf",
    "fileUrl": "https://pub-4e5e6e57e45848fbbbec281180517b6e.r2.dev/facturas/2b896d45-63d7-49da-82b6-f033774041ad/original/162615.pdf"
  }' \
  https://wafacturas.ahg-reformas.es/api/wf-procesar-factura
```

## Scaffolding mínimo en FE (fetch)
```ts
async function lanzarWorkflowFactura(payload: {
  invoiceId: string;
  r2Key: string;
  originalFileName: string;
  contentType: string;
  fileUrl: string;
}) {
  const res = await fetch("https://wafacturas.ahg-reformas.es/api/wf-procesar-factura", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`WF error ${res.status}: ${text}`);
  }

  const data = await res.json();
  return data; // { workflow: "wf-procesar-factura", instancia_id: "..." }
}
```

## Consideraciones
- El path raíz `/` ya no inicia el workflow; usar siempre `/api/wf-procesar-factura`.
- Asegurar que `fileUrl` sea accesible (R2 público) y corresponda al `r2Key` enviado.
- `invoiceId` puede ser generado en FE (uuid) o provisto por el backend que sube a R2, pero debe ser consistente entre `invoiceId` y `r2Key`.
