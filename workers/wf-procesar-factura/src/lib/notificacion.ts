import { Env } from "../types/env";
import { appendLogEvents, getFacturaArchivoByInvoiceId, LogEvent } from "./archivos";
import { getKV } from "./storage";

const ESTADO_VALIDACION_VALIDADA = "validada";

export type NotificationContext = {
  invoiceId: string;
  r2Prefix: string;
  r2PdfKey: string;
  originalFileName: string;
  fileUrl: string;
  facturaId?: number | null;
  r2ExcelKey?: string | null;
  estadoFinal?: string | null;
  log: LogEvent[];
};

type NotificationOutcome = {
  tipo: "exito" | "fallo_controlado_ff" | "fallo_sin_proveedor" | "fallo_no_controlado";
  estadoFinal: string;
  resumen: string;
  ultimoEvento?: LogEvent;
};

export async function sendWorkflowNotification(env: Env, ctx: NotificationContext) {
  const existingRow = await getFacturaArchivoByInvoiceId(env.DB_FAT_EMPRESAS, ctx.invoiceId);
  const fullLog = mergeLogs(existingRow?.log, ctx.log);

  if (alreadyNotified(fullLog)) {
    return;
  }

  const estadoFinal = ctx.estadoFinal ?? existingRow?.estado_validacion ?? "pendiente";
  const outcome = classifyOutcome(estadoFinal, fullLog);

  const toRaw = await getKV(env.NSKV_SECRETOS, "NOTIFICACIONES_EMAIL_TO");
  const from = await getKV(env.NSKV_SECRETOS, "NOTIFICACIONES_EMAIL_FROM");
  const subjectPrefix = (await getKV(env.NSKV_SECRETOS, "NOTIFICACIONES_EMAIL_SUBJECT_PREFIX")) ?? "[Facturas]";

  if (!env.EMAIL_ROUTING || !toRaw || !from) {
    await appendLogEvents(env.DB_FAT_EMPRESAS, ctx.invoiceId, [buildNotificationEvent(ctx.invoiceId, "notificacion_omitida_config", "Falta binding o config de correo")]);
    return;
  }

  const to = toRaw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  if (!to.length) {
    await appendLogEvents(env.DB_FAT_EMPRESAS, ctx.invoiceId, [buildNotificationEvent(ctx.invoiceId, "notificacion_omitida_config", "Lista de destinatarios vacía")]);
    return;
  }

  const { subject, body } = buildEmailMessage(subjectPrefix, outcome, ctx);

  try {
    await env.EMAIL_ROUTING.send({
      from,
      to,
      subject,
      content: [{ type: "text/plain", value: body }]
    });
    await appendLogEvents(env.DB_FAT_EMPRESAS, ctx.invoiceId, [buildNotificationEvent(ctx.invoiceId, "notificacion_enviada", outcome.resumen)]);
  } catch (error: any) {
    const detalle = error?.message ?? String(error);
    await appendLogEvents(env.DB_FAT_EMPRESAS, ctx.invoiceId, [buildNotificationEvent(ctx.invoiceId, "notificacion_error", detalle)]);
    console.error(`[notificacion] Error enviando correo invoiceId=${ctx.invoiceId}:`, detalle);
  }
}

function classifyOutcome(estadoFinal: string, log: LogEvent[]): NotificationOutcome {
  const lastError = [...log].reverse().find((ev) => ev.tipo?.endsWith("_error"));
  const hasFacturasFallidas = log.some((ev) => ev.tipo?.includes("facturas_fallidas"));
  const hasSinProveedor = log.some((ev) => ev.tipo?.includes("sin_proveedor"));

  if (estadoFinal === ESTADO_VALIDACION_VALIDADA) {
    return {
      tipo: "exito",
      estadoFinal,
      resumen: "Proceso finalizado correctamente con Excel generado",
      ultimoEvento: lastError
    };
  }

  if (hasFacturasFallidas) {
    return {
      tipo: "fallo_controlado_ff",
      estadoFinal,
      resumen: "Fallo controlado: asociado a Facturas Fallidas",
      ultimoEvento: lastError
    };
  }

  if (hasSinProveedor) {
    return {
      tipo: "fallo_sin_proveedor",
      estadoFinal,
      resumen: "Fallo por proveedor no identificado",
      ultimoEvento: lastError
    };
  }

  return {
    tipo: "fallo_no_controlado",
    estadoFinal,
    resumen: lastError?.detalle || "Fallo no recuperable",
    ultimoEvento: lastError
  };
}

function buildEmailMessage(prefix: string, outcome: NotificationOutcome, ctx: NotificationContext) {
  const etiqueta = buildEtiqueta(outcome.tipo);
  const subject = `${prefix} invoice ${ctx.invoiceId} · ${etiqueta}`;
  const r2ErrorKey = `${ctx.r2Prefix}/${ctx.invoiceId}/error_validacion_factura.json`;

  const lines = [
    `Resultado: ${etiqueta}`,
    `Estado final: ${outcome.estadoFinal}`,
    `Resumen: ${outcome.resumen}`,
    `InvoiceId: ${ctx.invoiceId}`,
    `FacturaId: ${ctx.facturaId ?? "(no disponible)"}`,
    `Archivo original: ${ctx.originalFileName}`,
    `R2 PDF: ${ctx.r2PdfKey}`,
    `R2 Excel: ${ctx.r2ExcelKey ?? "(no generado)"}`,
    `R2 Error: ${r2ErrorKey}`,
    `Último evento: ${outcome.ultimoEvento?.tipo ?? "(no disponible)"}`,
    outcome.ultimoEvento?.detalle ? `Detalle: ${outcome.ultimoEvento.detalle}` : undefined,
    `Archivo fuente: ${ctx.fileUrl}`
  ].filter(Boolean) as string[];

  return {
    subject,
    body: lines.join("\n")
  };
}

function mergeLogs(existingLog: string | null | undefined, nuevos: LogEvent[]): LogEvent[] {
  const parsedExisting = existingLog ? safeParseLog(existingLog) : [];
  return [...parsedExisting, ...nuevos];
}

function safeParseLog(raw: string): LogEvent[] {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed as LogEvent[];
    }
  } catch (_err) {
    return [];
  }
  return [];
}

function alreadyNotified(log: LogEvent[]) {
  return log.some((ev) => ev.tipo === "notificacion_enviada");
}

function buildNotificationEvent(invoiceId: string, tipo: string, detalle?: string): LogEvent {
  return {
    tipo,
    timestamp: new Date().toISOString(),
    invoiceId,
    detalle
  };
}

function buildEtiqueta(tipo: NotificationOutcome["tipo"]) {
  switch (tipo) {
    case "exito":
      return "Exito";
    case "fallo_controlado_ff":
      return "Fallo controlado (FF)";
    case "fallo_sin_proveedor":
      return "Fallo sin proveedor";
    default:
      return "Fallo";
  }
}
