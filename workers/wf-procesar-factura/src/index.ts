import PostalMime from "postal-mime";
import type { EmailMessage, EmailMessageAttachment } from "@cloudflare/workers-types";
import { Env } from "./types/env";
import { getRequiredConfig } from "./lib/storage";
import ProcesarFacturaWorkflow from "./workflow";
import { buildXlsxFromLineas, LineaFacturaRow } from "./lib/xlsx";

const ALLOWED_MIME = new Set(["application/pdf"]);

export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);
    const { pathname } = url;

    if (pathname === "/prueba-sheetjs" && request.method === "GET") {
      return handlePruebaSheetjs(request, env);
    }

    const isWorkflowPath = pathname === "/api/wf-procesar-factura" || pathname === "/api/wf-procesar-factura/";

    if (!isWorkflowPath) {
      return new Response("Ruta no encontrada", { status: 404 });
    }

    if (request.method !== "POST") {
      return new Response("Solo se admite POST", { status: 405 });
    }
    let payload: any;
    try {
      payload = await request.json();
    } catch (e) {
      return new Response("Cuerpo JSON no válido", { status: 400 });
    }
    const { invoiceId, r2Key, originalFileName, contentType, fileUrl } = payload;
    if (!invoiceId || !r2Key || !originalFileName || !contentType || !fileUrl) {
      return new Response("Faltan campos obligatorios en el evento de factura", { status: 400 });
    }
    const instance = await env.WF_PROCESAR_FACTURA.create({ id: crypto.randomUUID(), params: payload });
    return new Response(JSON.stringify({ workflow: "wf-procesar-factura", instancia_id: instance.id }), { headers: { "Content-Type": "application/json" } });
  },

  async email(message: EmailMessage, env: Env) {
    try {
      const attachments = await getAttachments(message);
      const attachment = pickPrimaryAttachment(attachments);
      if (!attachment) {
        console.error("[email] No se encontró adjunto válido en el correo recibido");
        return;
      }

      const originalFileName = attachment.filename || attachment.name || "archivo";
      const contentType = attachment.contentType || "application/octet-stream";

      const fileBuffer = await toArrayBuffer(attachment);
      const invoiceId = crypto.randomUUID();
      const r2Prefix = await getRequiredConfig(env, "R2_FACTURAS_PREFIX");
      const r2Key = buildEmailR2Key(invoiceId, originalFileName, r2Prefix);

      await env.R2_FACTURAS.put(r2Key, fileBuffer, {
        httpMetadata: { contentType }
      });

      const fileUrl = buildR2PublicUrl(r2Key);

      const payload = {
        invoiceId,
        r2Key,
        originalFileName,
        contentType,
        fileUrl,
        emailMeta: {
          from: message.from,
          to: message.to,
          subject: message.headers.get("subject"),
          messageId: message.headers.get("message-id")
        }
      };

      const instance = await env.WF_PROCESAR_FACTURA.create({ id: crypto.randomUUID(), params: payload });
      console.log(`[email] evento encolado workflow=${instance.id} invoiceId=${invoiceId} r2Key=${r2Key}`);
    } catch (error: any) {
      const messageId = message.headers?.get("message-id");
      console.error(`[email] Error procesando correo message-id=${messageId ?? "(sin id)"}:`, error?.message ?? error);
    }
  }
};

export { ProcesarFacturaWorkflow };

async function getAttachments(message: EmailMessage): Promise<EmailMessageAttachment[]> {
  if (message.attachments && message.attachments.length > 0) {
    return message.attachments;
  }

  try {
    const parser = new PostalMime();
    const parsed = await parser.parse(message.raw as any);
    return (parsed.attachments || []).map((att) => ({
      filename: att.filename || att.name,
      name: att.filename || att.name,
      contentType: att.mimeType || att.contentType || "",
      content: att.content
    })) as EmailMessageAttachment[];
  } catch (err: any) {
    console.error("[email] Error parseando adjuntos desde raw:", err?.message ?? err);
    return [];
  }
}

function pickPrimaryAttachment(attachments: EmailMessageAttachment[]): EmailMessageAttachment | undefined {
  if (!attachments?.length) {
    return undefined;
  }

  const summary = attachments.map((att, idx) => {
    const filename = att?.filename || att?.name || "(sin-nombre)";
    const contentType = att?.contentType || "(sin contentType)";
    return `#${idx + 1} name=${filename} contentType=${contentType}`;
  });
  console.log(`[email] ${attachments.length} adjuntos recibidos: ${summary.join(" | ")}`);

  for (const att of attachments) {
    if (!att) continue;
    if (att.contentType && ALLOWED_MIME.has(att.contentType)) return att;
  }

  for (const att of attachments) {
    if (!att) continue;
    const filename = (att.filename || att.name || "").toLowerCase();
    if (filename.endsWith(".pdf")) return att;
  }

  return attachments.find((att) => att?.contentType);
}

async function toArrayBuffer(att: EmailMessageAttachment): Promise<ArrayBuffer> {
  if (att.content instanceof ArrayBuffer) return att.content;
  if (att.content instanceof Uint8Array) return att.content.buffer.slice(att.content.byteOffset, att.content.byteOffset + att.content.byteLength);
  // Fallback: attempt to read via Response if content is a stream-like object
  try {
    const response = new Response(att.content as any);
    return await response.arrayBuffer();
  } catch (err) {
    throw new Error(`No se pudo leer el adjunto: ${err instanceof Error ? err.message : String(err)}`);
  }
}

function buildEmailR2Key(invoiceId: string, originalFileName: string, r2Prefix: string): string {
  const safeName = sanitizeFileName(originalFileName || "archivo");
  return `${r2Prefix}/${invoiceId}/original/${safeName}`;
}

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function buildR2PublicUrl(r2Key: string): string {
  return `https://pub-4e5e6e57e45848fbbbec281180517b6e.r2.dev/${r2Key}`;
}

async function handlePruebaSheetjs(request: Request, env: Env) {
  const url = new URL(request.url);
  const token = request.headers.get("x-test-token") ?? url.searchParams.get("token") ?? "";
  const expected = await env.NSKV_SECRETOS.get("SHEETJS_TEST_TOKEN");
  if (!expected || token !== expected) {
    return new Response("Forbidden", { status: 403 });
  }

  try {
    const result = await env.DB_FAT_EMPRESAS.prepare(
      "SELECT factura_id, descripcion, cantidad, precio_unitario, porcentaje_iva, importe_base, importe_impuesto, importe_total_linea FROM fat_factura_lineas LIMIT 10"
    ).all();
    const rows = (result as any).results as LineaFacturaRow[] | undefined;

    if (!rows || rows.length === 0) {
      return new Response("Sin datos de prueba en fat_factura_lineas", { status: 404 });
    }

    const xlsxData = buildXlsxFromLineas(rows);
    const key = "pruebas/xlsx/prueba_sheetjs.xlsx";

    await env.R2_FACTURAS.put(key, xlsxData, {
      httpMetadata: { contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }
    });

    return new Response(JSON.stringify({ ok: true, key }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (error: any) {
    return new Response(`Error ejecutando prueba SheetJS: ${error?.message ?? error}`, { status: 500 });
  }
}
