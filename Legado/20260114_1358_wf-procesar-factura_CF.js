var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/index.ts
import {
  WorkflowEntrypoint
} from "cloudflare:workers";
var ProcesarFacturaWorkflow = class extends WorkflowEntrypoint {
  static {
    __name(this, "ProcesarFacturaWorkflow");
  }
  async run(event, step) {
    const { invoiceId, fileUrl } = event.payload;
    const resultadoP1 = await step.do(
      "wf-facturas-extraer-texto",
      async () => {
        console.log(
          "[P1] wf-facturas-extraer-texto: iniciando para invoiceId=",
          invoiceId
        );
        try {
          const apiKey = await this.env.NSKV_SECRETOS.get("OPENAI_API_KEY");
          if (!apiKey) {
            throw new Error(
              "OPENAI_API_KEY no encontrada en NSKV_SECRETOS"
            );
          }
          const plantilla = await this.env.NSKV_PROMPTS.get(
            "facturas-extraer-texto"
          );
          if (!plantilla) {
            throw new Error(
              "Plantilla facturas-extraer-texto no encontrada en NSKV_PROMPTS"
            );
          }
          const plantillaProcesada = plantilla.replace(/\{\{ARCHIVO_URL\}\}/g, fileUrl);
          let requestBody;
          try {
            requestBody = JSON.parse(plantillaProcesada);
          } catch (parseError) {
            throw new Error(
              `Error parseando plantilla procesada: ${parseError}`
            );
          }
          console.log(
            "[P1] Ejecutando llamada a https://api.openai.com/v1/responses"
          );
          const apioResponse = await fetch(
            "https://api.openai.com/v1/responses",
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json"
              },
              body: JSON.stringify(requestBody)
            }
          );
          const timestamp = (/* @__PURE__ */ new Date()).toISOString();
          if (!apioResponse.ok) {
            const errorBody = await apioResponse.text();
            console.error(
              `[P1] Error de APIO: status=${apioResponse.status}, body=${errorBody}`
            );
            const documentoError = {
              stepName: "wf-facturas-extraer-texto",
              workflowInstanceId: invoiceId,
              invoiceId,
              timestamp,
              status: "error",
              apioResponse: {},
              error: {
                code: apioResponse.status,
                message: `Error en llamada a APIO: ${apioResponse.statusText}`,
                details: errorBody.substring(0, 500)
                // Limitar tamaño
              }
            };
            await this.env.R2_FACTURAS.put(
              `facturas/${invoiceId}/facturas-extraer-texto.json`,
              JSON.stringify(documentoError, null, 2),
              {
                httpMetadata: {
                  contentType: "application/json"
                }
              }
            );
            const errorTimestamp = (/* @__PURE__ */ new Date()).toLocaleString("es-ES", {
              timeZone: "Europe/Madrid",
              year: "numeric",
              month: "2-digit",
              day: "2-digit",
              hour: "2-digit",
              minute: "2-digit"
            }).replace(/(\d+)\/(\d+)\/(\d+),\s(\d+):(\d+)/, "$3$2$1_$4$5");
            const errorDetails = {
              ...documentoError,
              rawResponse: errorBody,
              requestEndpoint: "https://api.openai.com/v1/responses",
              requestMethod: "POST"
            };
            await this.env.R2_FACTURAS.put(
              `facturas/${invoiceId}/facturas-extraer-texto-ERROR_${errorTimestamp}.json`,
              JSON.stringify(errorDetails, null, 2),
              {
                httpMetadata: {
                  contentType: "application/json"
                }
              }
            );
            return documentoError;
          }
          const apioData = await apioResponse.json();
          console.log(
            "[P1] Respuesta exitosa de APIO recibida"
          );
          const documentoExito = {
            stepName: "wf-facturas-extraer-texto",
            workflowInstanceId: invoiceId,
            invoiceId,
            timestamp,
            status: "ok",
            apioResponse: apioData
          };
          await this.env.R2_FACTURAS.put(
            `facturas/${invoiceId}/facturas-extraer-texto.json`,
            JSON.stringify(documentoExito, null, 2),
            {
              httpMetadata: {
                contentType: "application/json"
              }
            }
          );
          console.log(
            `[P1] Documento de resultado guardado en R2: facturas/${invoiceId}/facturas-extraer-texto.json`
          );
          return documentoExito;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.error(
            "[P1] Error durante procesamiento:",
            errorMessage
          );
          const timestamp = (/* @__PURE__ */ new Date()).toISOString();
          const documentoError = {
            stepName: "wf-facturas-extraer-texto",
            workflowInstanceId: invoiceId,
            invoiceId,
            timestamp,
            status: "error",
            apioResponse: {},
            error: {
              code: "PROCESSING_ERROR",
              message: errorMessage,
              details: error instanceof Error ? error.stack : void 0
            }
          };
          try {
            await this.env.R2_FACTURAS.put(
              `facturas/${invoiceId}/facturas-extraer-texto.json`,
              JSON.stringify(documentoError, null, 2),
              {
                httpMetadata: {
                  contentType: "application/json"
                }
              }
            );
            const errorTimestamp = (/* @__PURE__ */ new Date()).toLocaleString("es-ES", {
              timeZone: "Europe/Madrid",
              year: "numeric",
              month: "2-digit",
              day: "2-digit",
              hour: "2-digit",
              minute: "2-digit"
            }).replace(/(\d+)\/(\d+)\/(\d+),\s(\d+):(\d+)/, "$3$2$1_$4$5");
            await this.env.R2_FACTURAS.put(
              `facturas/${invoiceId}/facturas-extraer-texto-ERROR_${errorTimestamp}.json`,
              JSON.stringify(documentoError, null, 2),
              {
                httpMetadata: {
                  contentType: "application/json"
                }
              }
            );
          } catch (r2Error) {
            console.error(
              "[P1] Error adicional al guardar en R2:",
              r2Error
            );
          }
          return documentoError;
        }
      }
    );
    return resultadoP1;
  }
};
var index_default = {
  async fetch(request, env) {
    if (request.method !== "POST") {
      return new Response("Solo se admite POST", { status: 405 });
    }
    let payload;
    try {
      payload = await request.json();
    } catch {
      return new Response("Cuerpo JSON no v\xE1lido", { status: 400 });
    }
    const {
      invoiceId,
      r2Key,
      originalFileName,
      contentType,
      fileUrl
    } = payload;
    if (!invoiceId || !r2Key || !originalFileName || !contentType || !fileUrl) {
      return new Response(
        "Faltan campos obligatorios en el evento de factura",
        { status: 400 }
      );
    }
    const instance = await env.WF_PROCESAR_FACTURA.create({
      id: crypto.randomUUID(),
      params: payload
    });
    return Response.json({
      workflow: "wf-procesar-factura",
      instancia_id: instance.id
    });
  }
};
export {
  ProcesarFacturaWorkflow,
  index_default as default
};
//# sourceMappingURL=index.js.map
