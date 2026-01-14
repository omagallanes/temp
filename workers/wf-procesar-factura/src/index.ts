import { Env } from "./types/env";
import ProcesarFacturaWorkflow from "./workflow";
import { buildXlsxFromLineas, LineaFacturaRow } from "./lib/xlsx";

export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);

    if (url.pathname === "/prueba-sheetjs" && request.method === "GET") {
      return handlePruebaSheetjs(request, env);
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
  }
};

export { ProcesarFacturaWorkflow };

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
