import { Env } from "./types/env";
import ProcesarFacturaWorkflow from "./workflow";

export default {
  async fetch(request: Request, env: Env) {
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
