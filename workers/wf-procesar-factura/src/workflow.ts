// Helper para persistir fallo en fat_facturas_archivos
async function persistFailureInArchivos(env: Env, {
  invoiceId,
  metadatos,
  log,
  facturasFallidasFacturaId,
  estado = "pendiente"
}: {
  invoiceId: string,
  metadatos: any,
  log: any[],
  facturasFallidasFacturaId: number | string | null | undefined,
  estado?: string
}) {
  if (!facturasFallidasFacturaId) return;
  try {
    await upsertFacturasArchivos(env.DB_FAT_EMPRESAS, {
      factura_id: Number(facturasFallidasFacturaId),
      invoiceId,
      r2_pdf_key: metadatos.r2_pdf_key,
      original_file_name: metadatos.nombre_original,
      file_url: metadatos.file_url,
      estado_validacion: estado,
      r2_excel_key: null,
      log
    });
  } catch (e) {
    // No relanzar, solo loguear
    console.error(`[persistFailureInArchivos] Error persistiendo fallo en fat_facturas_archivos:`, e?.message ?? e);
  }
}
import { WorkflowEntrypoint } from "cloudflare:workers";
import { Env } from "./types/env";
import { callOpenAI } from "./lib/openai";
import { putR2, getKV, getOptionalConfig, getRequiredConfig } from "./lib/storage";
import { buildErrorPath, buildValidationErrorPayload, loadApioResponseOutput, validateAndNormalizeRO, ValidationFailure } from "./lib/apioresponse";
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
  overwriteFacturaSiExiste,
  insertarCabeceraFactura
} from "./lib/cabecera";
import {
  validateLineasInput,
  borrarLineasFactura,
  insertarLineasFactura,
  LineasFailure
} from "./lib/lineas";
import { LogEvent, upsertFacturasArchivos } from "./lib/archivos";
import {
  buildExcelBuffer,
  obtenerCabeceraFacturaExcel,
  obtenerLineasFacturaExcel,
  putExcelInR2
} from "./lib/excel";
import { sendWorkflowNotification } from "./lib/notificacion";

const ESTADO_VALIDACION_PENDIENTE = "pendiente";
const ESTADO_VALIDACION_VALIDADA = "validada";

export default class ProcesarFacturaWorkflow extends WorkflowEntrypoint<Env> {
  async run(event: any, step: any) {
    const { invoiceId, fileUrl, r2Key, originalFileName, contentType } = event.payload;
    const stepRunner = step?.do
      ? step
      : {
          do: async (_name: string, fn: any) => fn()
        };

    const logBuffer: LogEvent[] = [];
    const nowIso = () => new Date().toISOString();
    const pushLogEvent = (tipo: string, extras?: Partial<LogEvent>) => {
      logBuffer.push({ tipo, timestamp: nowIso(), invoiceId, ...extras });
    };

    const r2Prefix = await getRequiredConfig(this.env, "R2_FACTURAS_PREFIX");
    const sinProveedorEmpresaId = await getOptionalConfig(this.env, "SIN_PROVEEDOR_EMPRESA_ID");
    const facturasFallidasFacturaId = await getOptionalConfig(this.env, "FACTURAS_FALLIDAS_FACTURA_ID");
    void sinProveedorEmpresaId;
    void facturasFallidasFacturaId;

    const envioEmailHabilitado = `${this.env.var_envio_email ?? "false"}` === "true";

    const notificationContext = {
      invoiceId,
      r2Prefix,
      r2PdfKey: r2Key,
      originalFileName,
      fileUrl,
      facturaId: null as number | null,
      r2ExcelKey: null as string | null,
      estadoFinal: null as string | null,
      log: logBuffer
    };
    let metadatos = {
      invoiceId,
      r2_pdf_key: r2Key,
      file_url: fileUrl,
      nombre_original: originalFileName,
      contentType
    };
    try {
      pushLogEvent("inicio_caso");

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

          pushLogEvent("extraccion_ia_ok");

          await putR2(this.env.R2_FACTURAS, `${r2Prefix}/${invoiceId}/facturas-extraer-texto.json`, JSON.stringify(documentoExito, null, 2));
          console.log(`[P1] Documento de resultado guardado en R2: ${r2Prefix}/${invoiceId}/facturas-extraer-texto.json`);
          return documentoExito;
        } catch (error: any) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          pushLogEvent("extraccion_ia_error", { detalle: errorMessage });
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
            await putR2(this.env.R2_FACTURAS, `${r2Prefix}/${invoiceId}/facturas-extraer-texto.json`, JSON.stringify(documentoError, null, 2));
            const errorTimestamp = new Date().toLocaleString("es-ES", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).replace(/(\d+)\/(\d+)\/(\d+),\s(\d+):(\d+)/, "$3$2$1_$4$5");
            await putR2(this.env.R2_FACTURAS, `${r2Prefix}/${invoiceId}/facturas-extraer-texto-ERROR_${errorTimestamp}.json`, JSON.stringify(documentoError, null, 2));
          } catch (r2Error) {
            console.error("[P1] Error adicional al guardar en R2:", r2Error);
          }
          throw error;
        }
      });

    const lectura = await stepRunner.do("lectura-apioresponse", async () => {
      try {
        const roRaw = await loadApioResponseOutput(this.env.R2_FACTURAS, r2Prefix, invoiceId);
        const ro = validateAndNormalizeRO(roRaw);
        const resultado = {
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

        pushLogEvent("validacion_ro_ok");

        return resultado;
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

        const errorKey = buildErrorPath(r2Prefix, invoiceId);
        await putR2(this.env.R2_FACTURAS, errorKey, JSON.stringify(errorPayload, null, 2));
        pushLogEvent("validacion_ro_error", { detalle: failure.message });
        // Persistir log y fila fallida
        await persistFailureInArchivos(this.env, {
          invoiceId,
          metadatos,
          log: logBuffer,
          facturasFallidasFacturaId,
          estado: ESTADO_VALIDACION_PENDIENTE
        });
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

        const resultado = {
          stepName: "proveedor_fat_empresas",
          workflowInstanceId: invoiceId,
          invoiceId,
          timestamp: new Date().toISOString(),
          status: "ok",
          empresaId,
          ro,
          metadatos: entradaMetadatos,
          nombreNormalizadoProveedor: nombre_normalizado
        };

        pushLogEvent("proveedor_ok");

        return resultado;
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

        // Guardar en R2 y persistir, pero sin relanzar si falla
        try {
          const errorKey = buildErrorPath(r2Prefix, invoiceId);
          await putR2(this.env.R2_FACTURAS, errorKey, JSON.stringify(errorPayload, null, 2));
          pushLogEvent("proveedor_error", { detalle: failure.message });
          // Persistir log y fila fallida
          await persistFailureInArchivos(this.env, {
            invoiceId,
            metadatos,
            log: logBuffer,
            facturasFallidasFacturaId,
            estado: ESTADO_VALIDACION_PENDIENTE
          });
          console.error(`[proveedor_fat_empresas] Error resolviendo proveedor, guardado en ${errorKey}`);
        } catch (persistError) {
          console.error(`[proveedor_fat_empresas] Error persistiendo fallo:`, persistError?.message ?? persistError);
          pushLogEvent("proveedor_error", { detalle: failure.message });
        }
        
        // Para errores no-retryables (validación), no relanzar. Devolver resultado con error.
        const isNonRetryable = failure.tipo_error === "fat_empresas_mismatch";
        if (isNonRetryable) {
          return {
            stepName: "proveedor_fat_empresas",
            workflowInstanceId: invoiceId,
            invoiceId,
            timestamp: new Date().toISOString(),
            status: "error",
            error: failure,
            isTerminalError: true
          };
        }
        
        throw failure;
      }
    });

    // Si hay error terminal en proveedor, parar el workflow
    if ((proveedor as any).status === "error" && (proveedor as any).isTerminalError) {
      console.log(`[workflow] Error terminal en proveedor (${(proveedor as any).error?.tipo_error}), deteniendo flujo`);
      notificationContext.estadoFinal = "error_validacion_terminal";
      await sendWorkflowNotification(this.env, notificationContext);
      return;
    }

    if ((proveedor as any).status === "error") {
      throw (proveedor as any).error;
    }

    const cabecera = await stepRunner.do("cabecera_fat_empresas", async () => {
      try {
        const entrada = validateCabeceraInput({ ro: lectura.ro, metadatos, empresaId: proveedor.empresaId });

        const numero_factura_normalizado = normalizeNumeroFactura(entrada.ro.datos_generales.numero_factura);

        await overwriteFacturaSiExiste(this.env.DB_FAT_EMPRESAS, proveedor.empresaId, entrada.ro.datos_generales.numero_factura);

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

        const resultado = {
          stepName: "cabecera_fat_empresas",
          workflowInstanceId: invoiceId,
          invoiceId,
          timestamp: new Date().toISOString(),
          status: "ok",
          facturaId,
          numeroFacturaNormalizado: numero_factura_normalizado,
          empresaId: proveedor.empresaId,
          ro: entrada.ro,
          metadatos,
          nombreNormalizadoProveedor: proveedor.nombreNormalizadoProveedor
        };

        pushLogEvent("cabecera_ok", { facturaId });

        return resultado;
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

        // Guardar en R2 y persistir, pero sin relanzar si falla
        try {
          const errorKey = buildErrorPath(r2Prefix, invoiceId);
          await putR2(this.env.R2_FACTURAS, errorKey, JSON.stringify(errorPayload, null, 2));
          pushLogEvent("cabecera_error", { detalle: failure.message });
          // Persistir log y fila fallida
          await persistFailureInArchivos(this.env, {
            invoiceId,
            metadatos,
            log: logBuffer,
            facturasFallidasFacturaId,
            estado: ESTADO_VALIDACION_PENDIENTE
          });
          console.error(`[cabecera_fat_empresas] Error en cabecera, guardado en ${errorKey}`);
        } catch (persistError) {
          console.error(`[cabecera_fat_empresas] Error persistiendo fallo:`, persistError?.message ?? persistError);
          pushLogEvent("cabecera_error", { detalle: failure.message });
        }
        
        // Errores no-retryables: validación de campo obligatorio
        const isNonRetryable = 
          (failure as any).tipo_error === "campo_obligatorio_faltante" ||
          (failure as any).tipo_error === "campo_obligatorio_invalido" ||
          (failure as any).tipo_error === "estructura_ro_invalida";
        
        if (isNonRetryable) {
          return {
            stepName: "cabecera_fat_empresas",
            workflowInstanceId: invoiceId,
            invoiceId,
            timestamp: new Date().toISOString(),
            status: "error",
            error: failure,
            isTerminalError: true
          };
        }
        
        throw failure;
      }
    });

    // Si hay error terminal en cabecera, parar el workflow
    if ((cabecera as any).status === "error" && (cabecera as any).isTerminalError) {
      console.log(`[workflow] Error terminal en cabecera (${(cabecera as any).error?.tipo_error}), deteniendo flujo`);
      notificationContext.estadoFinal = "error_validacion_terminal";
      await sendWorkflowNotification(this.env, notificationContext);
      return;
    }

    if ((cabecera as any).status === "error") {
      throw (cabecera as any).error;
    }

    notificationContext.facturaId = cabecera.facturaId;

    const archivosMetadatos = await stepRunner.do("fat_facturas_archivos", async () => {
      try {
        pushLogEvent("archivo_pendiente_ok", { facturaId: cabecera.facturaId, estado: ESTADO_VALIDACION_PENDIENTE });

        await upsertFacturasArchivos(this.env.DB_FAT_EMPRESAS, {
          factura_id: cabecera.facturaId,
          invoiceId,
          r2_pdf_key: metadatos.r2_pdf_key,
          original_file_name: metadatos.nombre_original,
          file_url: metadatos.file_url,
          estado_validacion: ESTADO_VALIDACION_PENDIENTE,
          r2_excel_key: null,
          log: logBuffer
        });

        return {
          stepName: "fat_facturas_archivos",
          workflowInstanceId: invoiceId,
          invoiceId,
          timestamp: new Date().toISOString(),
          status: "ok",
          facturaId: cabecera.facturaId,
          metadatos
        };
      } catch (error: any) {
        const errorPayload = buildValidationErrorPayload({
          tipo_error: "estructura_ro_invalida",
          descripcion: error?.message ?? "Error guardando metadatos de factura",
          invoiceId,
          archivo: { nombre_original: originalFileName, r2_pdf_key: r2Key, file_url: fileUrl },
          origen: "fat_facturas_archivos"
        });

        const errorKey = buildErrorPath(r2Prefix, invoiceId);
        await putR2(this.env.R2_FACTURAS, errorKey, JSON.stringify(errorPayload, null, 2));
        pushLogEvent("archivo_pendiente_error", { detalle: error?.message, facturaId: cabecera.facturaId });
        console.error(`[fat_facturas_archivos] Error guardando metadatos, guardado en ${errorKey}`);
        throw error;
      }
    });

    const lineas = await stepRunner.do("lineas_fat_empresas", async () => {
      try {
        const entrada = validateLineasInput({
          ro: cabecera.ro,
          metadatos,
          empresaId: cabecera.empresaId,
          facturaId: cabecera.facturaId,
          numeroFacturaNormalizado: cabecera.numeroFacturaNormalizado,
          nombreNormalizadoProveedor: cabecera.nombreNormalizadoProveedor
        });

        await borrarLineasFactura(this.env.DB_FAT_EMPRESAS, entrada.facturaId);

        const lineasInsertadas = await insertarLineasFactura(
          this.env.DB_FAT_EMPRESAS,
          entrada.facturaId,
          entrada.ro.lineas
        );

        pushLogEvent("lineas_ok", { facturaId: entrada.facturaId });

        await upsertFacturasArchivos(this.env.DB_FAT_EMPRESAS, {
          factura_id: cabecera.facturaId,
          invoiceId,
          r2_pdf_key: metadatos.r2_pdf_key,
          original_file_name: metadatos.nombre_original,
          file_url: metadatos.file_url,
          estado_validacion: ESTADO_VALIDACION_PENDIENTE,
          r2_excel_key: null,
          log: logBuffer
        });

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

        // Guardar en R2 y persistir, pero sin relanzar si falla
        try {
          const errorKey = buildErrorPath(r2Prefix, invoiceId);
          await putR2(this.env.R2_FACTURAS, errorKey, JSON.stringify(errorPayload, null, 2));
          pushLogEvent("lineas_error", { detalle: failure.message, facturaId: cabecera.facturaId });
          await upsertFacturasArchivos(this.env.DB_FAT_EMPRESAS, {
            factura_id: cabecera.facturaId,
            invoiceId,
            r2_pdf_key: metadatos.r2_pdf_key,
            original_file_name: metadatos.nombre_original,
            file_url: metadatos.file_url,
            estado_validacion: ESTADO_VALIDACION_PENDIENTE,
            r2_excel_key: null,
            log: logBuffer
          });
          console.error(`[lineas_fat_empresas] Error en líneas, guardado en ${errorKey}`);
        } catch (persistError) {
          console.error(`[lineas_fat_empresas] Error persistiendo fallo:`, persistError?.message ?? persistError);
          pushLogEvent("lineas_error", { detalle: failure.message, facturaId: cabecera.facturaId });
        }
        
        // Errores no-retryables: validación de campo obligatorio o estructura
        const isNonRetryable =
          (failure as any).tipo_error === "campo_obligatorio_faltante" ||
          (failure as any).tipo_error === "campo_obligatorio_invalido" ||
          (failure as any).tipo_error === "estructura_ro_invalida";
        
        if (isNonRetryable) {
          return {
            stepName: "lineas_fat_empresas",
            workflowInstanceId: invoiceId,
            invoiceId,
            timestamp: new Date().toISOString(),
            status: "error",
            error: failure,
            isTerminalError: true
          };
        }
        
        throw failure;
      }
    });

    // Si hay error terminal en lineas, parar el workflow
    if ((lineas as any).status === "error" && (lineas as any).isTerminalError) {
      console.log(`[workflow] Error terminal en lineas (${(lineas as any).error?.tipo_error}), deteniendo flujo`);
      notificationContext.estadoFinal = "error_validacion_terminal";
      await sendWorkflowNotification(this.env, notificationContext);
      return;
    }

    if ((lineas as any).status === "error") {
      throw (lineas as any).error;
    }

    const excelResult = await stepRunner.do("excel_fat_empresas", async () => {
      try {
        const cabeceraExcel = await obtenerCabeceraFacturaExcel(this.env.DB_FAT_EMPRESAS, lineas.empresaId, lineas.facturaId);
        const lineasExcel = await obtenerLineasFacturaExcel(this.env.DB_FAT_EMPRESAS, lineas.facturaId);
        const nombreHoja = cabeceraExcel.numero_factura_normalizado;
        const excelBuffer = buildExcelBuffer(cabeceraExcel, lineasExcel, nombreHoja);

        const excelKey = buildExcelKey(
          r2Prefix,
          invoiceId,
          lineas.nombreNormalizadoProveedor ?? cabeceraExcel.nombre_proveedor,
          lineas.numeroFacturaNormalizado
        );

        await putExcelInR2(this.env.R2_FACTURAS, excelKey, excelBuffer);

        pushLogEvent("excel_ok", { facturaId: lineas.facturaId, estado: ESTADO_VALIDACION_VALIDADA });

        await upsertFacturasArchivos(this.env.DB_FAT_EMPRESAS, {
          factura_id: lineas.facturaId,
          invoiceId,
          r2_pdf_key: metadatos.r2_pdf_key,
          original_file_name: metadatos.nombre_original,
          file_url: metadatos.file_url,
          estado_validacion: ESTADO_VALIDACION_VALIDADA,
          r2_excel_key: excelKey,
          log: logBuffer
        });

        return {
          stepName: "excel_fat_empresas",
          workflowInstanceId: invoiceId,
          invoiceId,
          timestamp: new Date().toISOString(),
          status: "ok",
          excelKey,
          facturaId: lineas.facturaId,
          numeroFacturaNormalizado: lineas.numeroFacturaNormalizado,
          nombreNormalizadoProveedor: lineas.nombreNormalizadoProveedor,
          metadatos,
          archivosMetadatos
        };
      } catch (error: any) {
        const message = error instanceof Error ? error.message : String(error);
        pushLogEvent("excel_error", { detalle: message, facturaId: lineas?.facturaId });
        try {
          await upsertFacturasArchivos(this.env.DB_FAT_EMPRESAS, {
            factura_id: lineas?.facturaId ?? cabecera.facturaId,
            invoiceId,
            r2_pdf_key: metadatos.r2_pdf_key,
            original_file_name: metadatos.nombre_original,
            file_url: metadatos.file_url,
            estado_validacion: ESTADO_VALIDACION_PENDIENTE,
            r2_excel_key: null,
            log: logBuffer
          });
        } catch (_ignore) {
          // best effort; no impacto en contrato HTTP
        }
        const errorPayload = buildValidationErrorPayload({
          tipo_error: "error_lectura_r2",
          descripcion: message,
          invoiceId,
          archivo: { nombre_original: originalFileName, r2_pdf_key: r2Key, file_url: fileUrl },
          origen: "excel_fat_empresas"
        });

        const errorKey = buildErrorPath(r2Prefix, invoiceId);
        await putR2(this.env.R2_FACTURAS, errorKey, JSON.stringify(errorPayload, null, 2));
        console.error(`[excel_fat_empresas] Error generando Excel, guardado en ${errorKey}`);
        throw error;
      }
    });

    notificationContext.facturaId = notificationContext.facturaId ?? lineas.facturaId;
    notificationContext.r2ExcelKey = excelResult.excelKey;
    notificationContext.estadoFinal = ESTADO_VALIDACION_VALIDADA;

    return excelResult;
    } catch (error) {
      notificationContext.estadoFinal = notificationContext.estadoFinal ?? ESTADO_VALIDACION_PENDIENTE;
      throw error;
    } finally {
      try {
        if (envioEmailHabilitado) {
          await sendWorkflowNotification(this.env, notificationContext);
        }
      } catch (notifyError: any) {
        console.error("[notificacion] Error en envio de cierre:", notifyError?.message ?? notifyError);
      }
    }
  }
}

function buildExcelKey(r2Prefix: string, invoiceId: string, nombreNormalizadoProveedor: string, numeroFacturaNormalizado: string) {
  return `${r2Prefix}/${invoiceId}/${nombreNormalizadoProveedor}_${numeroFacturaNormalizado}.xlsx`;
}
