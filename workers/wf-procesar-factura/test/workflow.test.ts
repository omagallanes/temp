import { describe, it, expect, vi } from "vitest";
import ProcesarFacturaWorkflow from "../src/workflow";
import { ValidationFailure } from "../src/lib/apioresponse";

const step = {
  do: async (_name: string, fn: any) => fn()
};

describe("workflow logic", () => {
  it("valida y normaliza RO en exito", async () => {
    const putCalls: string[] = [];
    const env: any = {
      NSKV_SECRETOS: { get: async (k: string) => (k === "OPENAI_API_KEY" ? "test-key" : null) },
      NSKV_PROMPTS: {
        get: async (k: string) => (k === "facturas-extraer-texto" ? JSON.stringify({}) : null)
      },
      R2_FACTURAS: {
        put: async (k: string, _v: string) => {
          putCalls.push(k);
          return true;
        },
        get: async (_k: string) => ({
          text: async () =>
            JSON.stringify({
              apioResponse: {
                output: {
                  datos_generales: {
                    nombre_proveedor: "Prov",
                    nif_proveedor: "X123",
                    fecha_emision: "2026-01-01",
                    moneda: "EUR",
                    importe_base_total: "100.00",
                    importe_impuestos_total: "21.00",
                    importe_retencion_total: "0",
                    importe_total: "121.00",
                    observaciones: ""
                  },
                  lineas: [
                    {
                      descripcion: "Item",
                      codigo_producto: "SKU",
                      cantidad: "1",
                      precio_unitario: "100",
                      porcentaje_iva: "21",
                      importe_base: "100",
                      importe_impuesto: "21",
                      importe_total_linea: "121"
                    }
                  ]
                }
              }
            })
        })
      }
    };

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ output: {} }), { status: 200 })) as any
    );

    const wf = new ProcesarFacturaWorkflow(env as any);
    const result = await wf.run(
      {
        payload: {
          invoiceId: "inv-1",
          fileUrl: "https://file",
          r2Key: "facturas/inv-1/factura.pdf",
          originalFileName: "factura.pdf",
          contentType: "application/pdf"
        }
      },
      step
    );

    expect(result.status).toBe("ok");
    expect(result.ro.datos_generales.importe_total).toBeCloseTo(121);
    expect(result.ro.lineas[0].cantidad).toBe(1);
    expect(putCalls.some((k) => k.endsWith("facturas-extraer-texto.json"))).toBe(true);
    expect(putCalls.some((k) => k.endsWith("error_validacion_factura.json"))).toBe(false);
  });

  it("genera error_validacion_factura.json cuando faltan campos", async () => {
    const putCalls: Array<{ key: string; value: string }> = [];
    const env: any = {
      NSKV_SECRETOS: { get: async (k: string) => (k === "OPENAI_API_KEY" ? "test-key" : null) },
      NSKV_PROMPTS: {
        get: async (k: string) => (k === "facturas-extraer-texto" ? JSON.stringify({}) : null)
      },
      R2_FACTURAS: {
        put: async (k: string, v: string) => {
          putCalls.push({ key: k, value: v });
          return true;
        },
        get: async (_k: string) => ({
          text: async () =>
            JSON.stringify({
              apioResponse: {
                output: {
                  datos_generales: {
                    nombre_proveedor: "Prov",
                    nif_proveedor: "X123",
                    fecha_emision: "2026-01-01",
                    moneda: "EUR",
                    importe_base_total: "100.00",
                    importe_impuestos_total: "21.00",
                    importe_retencion_total: "0",
                    importe_total: "121.00",
                    observaciones: ""
                  },
                  lineas: [
                    {
                      descripcion: "Item",
                      codigo_producto: "SKU",
                      cantidad: "1",
                      precio_unitario: "100",
                      porcentaje_iva: "21",
                      importe_base: "100",
                      importe_impuesto: "21"
                    }
                  ]
                }
              }
            })
        })
      }
    };

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ output: {} }), { status: 200 })) as any
    );

    const wf = new ProcesarFacturaWorkflow(env as any);

    await expect(
      wf.run(
        {
          payload: {
            invoiceId: "inv-err",
            fileUrl: "https://file",
            r2Key: "facturas/inv-err/factura.pdf",
            originalFileName: "factura.pdf",
            contentType: "application/pdf"
          }
        },
        step
      )
    ).rejects.toBeInstanceOf(ValidationFailure);

    const errorPut = putCalls.find((c) => c.key.endsWith("error_validacion_factura.json"));
    expect(errorPut).toBeTruthy();
    const parsed = JSON.parse(errorPut!.value);
    expect(parsed.detalle_validacion.campos_faltantes).toContain("lineas[0].importe_total_linea");
    expect(parsed.tipo_error).toBe("campo_obligatorio_faltante");
  });
});
