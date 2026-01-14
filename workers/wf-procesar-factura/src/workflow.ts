import { WorkflowEntrypoint } from "cloudflare:workers";
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
import {
  buildProveedorErrorPayload,
  normalizeNombreProveedor,
  ProveedorFailure,
  resolveProveedorEmpresa,
  validateProveedorInput
} from "./lib/proveedor";
import {
  validateCabeceraInput,
  normalizeNumeroFactura,
  ensureFacturaNoDuplicada,
  insertarCabeceraFactura
} from "./lib/cabecera";
import {
  validateLineasInput,
  borrarLineasFactura,
  insertarLineasFactura,
  LineasFailure
} from "./lib/lineas";

export default class ProcesarFacturaWorkflow extends WorkflowEntrypoint<Env> {
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
        // Descargar PDF desde fileUrl y subirlo a R2
        console.log(`[P1] Descargando PDF desde ${fileUrl}`);
        const pdfResponse = await fetch(fileUrl);
        if (!pdfResponse.ok) {
          throw new Error(`Error descargando PDF: ${pdfResponse.status} ${pdfResponse.statusText}`);
        }
        const pdfBuffer = await pdfResponse.arrayBuffer();
        await putR2(this.env.R2_FACTURAS, r2Key, pdfBuffer as any);
        console.log(`[P1] PDF subido a R2: ${r2Key}`);

        // URL pública de R2
        const r2PublicUrl = `https://pub-4e5e6e57e45848fbbbec281180517b6e.r2.dev/${r2Key}`;

        const apiKey = await getKV(this.env.NSKV_SECRETOS, "OPENAI_API_KEY");
        if (!apiKey) throw new Error("OPENAI_API_KEY no encontrada en NSKV_SECRETOS");

        const plantilla = await getKV(this.env.NSKV_PROMPTS, "facturas-extraer-texto");
        if (!plantilla) throw new Error("Plantilla facturas-extraer-texto no encontrada en NSKV_PROMPTS");

        const plantillaProcesada = plantilla.replace(/\{\{ARCHIVO_URL\}\}/g, r2PublicUrl);
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

    const lectura = await stepRunner.do("lectura-apioresponse", async () => {
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

    const metadatos = {
      invoiceId,
      r2_pdf_key: r2Key,
      file_url: fileUrl,
      nombre_original: originalFileName,
      contentType
    };

    const proveedor = await stepRunner.do("proveedor_fat_empresas", async () => {
      try {
        const { ro, metadatos: entradaMetadatos } = validateProveedorInput({ ro: lectura.ro, metadatos });
        const nombre_normalizado = normalizeNombreProveedor(ro.datos_generales.nombre_proveedor);
        const empresaId = await resolveProveedorEmpresa(
          this.env.DB_FAT_EMPRESAS,
          ro.datos_generales.nif_proveedor,
          ro.datos_generales.nombre_proveedor,
          nombre_normalizado
        );

        return {
          stepName: "proveedor_fat_empresas",
          workflowInstanceId: invoiceId,
          invoiceId,
          timestamp: new Date().toISOString(),
          status: "ok",
          empresaId,
          ro,
          metadatos: entradaMetadatos
        };
      } catch (error: any) {
        const failure =
          error instanceof ProveedorFailure
            ? error
            : new ProveedorFailure({
                tipo_error: "fat_empresas_consulta",
                descripcion: error instanceof Error ? error.message : String(error)
              });

        const errorPayload = buildProveedorErrorPayload({
          tipo_error: failure.tipo_error,
          descripcion: failure.descripcion,
          invoiceId,
          archivo: { nombre_original: originalFileName, r2_pdf_key: r2Key, file_url: fileUrl },
          issues: failure.issues
        });

        const errorKey = buildErrorPathFromPdfKey(r2Key);
        await putR2(this.env.R2_FACTURAS, errorKey, JSON.stringify(errorPayload, null, 2));
        console.error(`[proveedor_fat_empresas] Error resolviendo proveedor, guardado en ${errorKey}`);
        throw failure;
      }
    });

    const cabecera = await stepRunner.do("cabecera_fat_empresas", async () => {
      try {
        const entrada = validateCabeceraInput({
          ro: lectura.ro,
          metadatos,
          empresaId: proveedor.empresaId
        });

        const numero_factura_normalizado = normalizeNumeroFactura(entrada.ro.datos_generales.numero_factura);

        await ensureFacturaNoDuplicada(
          this.env.DB_FAT_EMPRESAS,
          proveedor.empresaId,
          entrada.ro.datos_generales.numero_factura
        );

        const facturaId = await insertarCabeceraFactura(this.env.DB_FAT_EMPRESAS, {
          emisor_id: proveedor.empresaId,
          numero_factura: entrada.ro.datos_generales.numero_factura,
          numero_factura_normalizado,
          fecha_emision: entrada.ro.datos_generales.fecha_emision,
          moneda: entrada.ro.datos_generales.moneda,
          importe_base_total: entrada.ro.datos_generales.importe_base_total,
          importe_impuestos_total: entrada.ro.datos_generales.importe_impuestos_total,
          importe_retencion_total: entrada.ro.datos_generales.importe_retencion_total,
          importe_total: entrada.ro.datos_generales.importe_total,
          observaciones: entrada.ro.datos_generales.observaciones
        });

        return {
          stepName: "cabecera_fat_empresas",
          workflowInstanceId: invoiceId,
          invoiceId,
          timestamp: new Date().toISOString(),
          status: "ok",
          facturaId,
          numeroFacturaNormalizado: numero_factura_normalizado,
          empresaId: proveedor.empresaId,
          ro: entrada.ro,
          metadatos
        };
      } catch (error: any) {
        const failure =
          error instanceof ValidationFailure || error instanceof ProveedorFailure
            ? error
            : new ValidationFailure({ tipo_error: "error_lectura_r2", descripcion: error instanceof Error ? error.message : String(error) });

        const errorPayload = buildValidationErrorPayload({
          tipo_error: (failure as any).tipo_error ?? "error_lectura_r2",
          descripcion: failure.message,
          invoiceId,
          archivo: { nombre_original: originalFileName, r2_pdf_key: r2Key, file_url: fileUrl },
          campos_faltantes: (failure as any).campos_faltantes,
          campos_invalidos: (failure as any).campos_invalidos,
          origen: "cabecera_fat_empresas"
        });

        const errorKey = buildErrorPathFromPdfKey(r2Key);
        await putR2(this.env.R2_FACTURAS, errorKey, JSON.stringify(errorPayload, null, 2));
        console.error(`[cabecera_fat_empresas] Error en cabecera, guardado en ${errorKey}`);
        throw failure;
      }
    });

    return stepRunner.do("lineas_fat_empresas", async () => {
      try {
        const entrada = validateLineasInput({
          ro: cabecera.ro,
          metadatos,
          empresaId: cabecera.empresaId,
          facturaId: cabecera.facturaId,
          numeroFacturaNormalizado: cabecera.numeroFacturaNormalizado,
          nombreNormalizadoProveedor: (cabecera as any).nombreNormalizadoProveedor
        });

        await borrarLineasFactura(this.env.DB_FAT_EMPRESAS, entrada.facturaId);

        const lineasInsertadas = await insertarLineasFactura(
          this.env.DB_FAT_EMPRESAS,
          entrada.facturaId,
          entrada.ro.lineas
        );

        return {
          stepName: "lineas_fat_empresas",
          workflowInstanceId: invoiceId,
          invoiceId,
          timestamp: new Date().toISOString(),
          status: "ok",
          lineasInsertadas,
          facturaId: entrada.facturaId,
          numeroFacturaNormalizado: entrada.numeroFacturaNormalizado,
          nombreNormalizadoProveedor: entrada.nombreNormalizadoProveedor,
          empresaId: entrada.empresaId,
          ro: entrada.ro,
          metadatos
        };
      } catch (error: any) {
        const failure =
          error instanceof ValidationFailure || error instanceof ProveedorFailure || error instanceof LineasFailure
            ? error
            : new ValidationFailure({
                tipo_error: "estructura_ro_invalida",
                descripcion: error instanceof Error ? error.message : String(error)
              });

        const errorPayload = buildValidationErrorPayload({
          tipo_error: (failure as any).tipo_error ?? "estructura_ro_invalida",
          descripcion: failure.message,
          invoiceId,
          archivo: { nombre_original: originalFileName, r2_pdf_key: r2Key, file_url: fileUrl },
          campos_faltantes: (failure as any).campos_faltantes,
          campos_invalidos: (failure as any).campos_invalidos,
          origen: "lineas_fat_empresas"
        });

        const errorKey = buildErrorPathFromPdfKey(r2Key);
        await putR2(this.env.R2_FACTURAS, errorKey, JSON.stringify(errorPayload, null, 2));
        console.error(`[lineas_fat_empresas] Error en líneas, guardado en ${errorKey}`);
        throw failure;
      }
    });
  }
}
