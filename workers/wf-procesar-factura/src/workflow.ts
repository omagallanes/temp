import { Env } from "./types/env";
import { callOpenAI } from "./lib/openai";
import { putR2, getKV } from "./lib/storage";
import {
  buildErrorPathFromPdfKey,
  buildValidationErrorPayload,
  loadApioResponseOutput,
  validateAndNormalizeRO,
  ValidationFailure
} from "./lib/apioresponse";

export class ProcesarFacturaWorkflow {
  env: Env;
  constructor(env: Env) {
    this.env = env;
  }

  async run(event: any, step: any) {
    const { invoiceId, fileUrl, r2Key, originalFileName, contentType } = event.payload;
    const stepRunner = step?.do
      ? step
      : {
          do: async (_name: string, fn: any) => fn()
        };

    console.log("[P1] wf-facturas-extraer-texto: iniciando para invoiceId=", invoiceId);

    await stepRunner.do("wf-facturas-extraer-texto", async () => {
      try {
        const apiKey = await getKV(this.env.NSKV_SECRETOS, "OPENAI_API_KEY");
        if (!apiKey) throw new Error("OPENAI_API_KEY no encontrada en NSKV_SECRETOS");

        const plantilla = await getKV(this.env.NSKV_PROMPTS, "facturas-extraer-texto");
        if (!plantilla) throw new Error("Plantilla facturas-extraer-texto no encontrada en NSKV_PROMPTS");

        const plantillaProcesada = plantilla.replace(/\{\{ARCHIVO_URL\}\}/g, fileUrl);
        let requestBody;
        try {
          requestBody = JSON.parse(plantillaProcesada);
        } catch (parseError) {
          throw new Error(`Error parseando plantilla procesada: ${parseError}`);
        }

        const apioData = await callOpenAI(apiKey, requestBody, fetch);

        const documentoExito = {
          stepName: "wf-facturas-extraer-texto",
          workflowInstanceId: invoiceId,
          invoiceId,
          timestamp: new Date().toISOString(),
          status: "ok",
          apioResponse: apioData
        };

        await putR2(this.env.R2_FACTURAS, `facturas/${invoiceId}/facturas-extraer-texto.json`, JSON.stringify(documentoExito, null, 2));
        console.log(`[P1] Documento de resultado guardado en R2: facturas/${invoiceId}/facturas-extraer-texto.json`);
        return documentoExito;
      } catch (error: any) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error("[P1] Error durante procesamiento:", errorMessage);
        const timestamp = new Date().toISOString();
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
            details: error instanceof Error ? error.stack : undefined
          }
        };
        try {
          await putR2(this.env.R2_FACTURAS, `facturas/${invoiceId}/facturas-extraer-texto.json`, JSON.stringify(documentoError, null, 2));
          const errorTimestamp = new Date().toLocaleString("es-ES", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).replace(/(\d+)\/(\d+)\/(\d+),\s(\d+):(\d+)/, "$3$2$1_$4$5");
          await putR2(this.env.R2_FACTURAS, `facturas/${invoiceId}/facturas-extraer-texto-ERROR_${errorTimestamp}.json`, JSON.stringify(documentoError, null, 2));
        } catch (r2Error) {
          console.error("[P1] Error adicional al guardar en R2:", r2Error);
        }
        throw error;
      }
    });

    return stepRunner.do("lectura-apioresponse", async () => {
      try {
        const roRaw = await loadApioResponseOutput(this.env.R2_FACTURAS, invoiceId);
        const ro = validateAndNormalizeRO(roRaw);
        return {
          stepName: "lectura-apioresponse",
          workflowInstanceId: invoiceId,
          invoiceId,
          r2PdfKey: r2Key,
          fileUrl,
          originalFileName,
          contentType,
          timestamp: new Date().toISOString(),
          status: "ok",
          ro
        };
      } catch (error: any) {
        const failure =
          error instanceof ValidationFailure
            ? error
            : new ValidationFailure({
                tipo_error: "error_lectura_r2",
                descripcion: error instanceof Error ? error.message : String(error)
              });

        const errorPayload = buildValidationErrorPayload({
          tipo_error: failure.tipo_error,
          descripcion: failure.descripcion,
          invoiceId,
          archivo: { nombre_original: originalFileName, r2_pdf_key: r2Key, file_url: fileUrl },
          campos_faltantes: failure.campos_faltantes,
          campos_invalidos: failure.campos_invalidos
        });

        const errorKey = buildErrorPathFromPdfKey(r2Key);
        await putR2(this.env.R2_FACTURAS, errorKey, JSON.stringify(errorPayload, null, 2));
        console.error(`[lectura-apioresponse] Error validando RO, guardado en ${errorKey}`);
        throw failure;
      }
    });
  }
}

export default ProcesarFacturaWorkflow;
