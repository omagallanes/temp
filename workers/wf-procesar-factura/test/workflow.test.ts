import { describe, it, expect, vi } from "vitest";
import ProcesarFacturaWorkflow from "../src/workflow";
import { ValidationFailure } from "../src/lib/apioresponse";
import { ProveedorFailure } from "../src/lib/proveedor";

const step = {
  do: async (_name: string, fn: any) => fn()
};

describe("workflow logic", () => {
  const createDbMock = (initial: Array<{ nif: string; id: number }>) => {
    const data = [...initial];
    return {
      prepare(sql: string) {
        return {
          all: async (...params: any[]) => {
            if (sql.startsWith("SELECT id FROM fat_empresas")) {
              const nif = params[0];
              const matches = data.filter((r) => r.nif === nif);
              return { results: matches.map((m) => ({ id: m.id })) } as any;
            }
            if (sql.startsWith("INSERT INTO fat_empresas")) {
              const nif = params[0];
              const id = data.length ? Math.max(...data.map((d) => d.id)) + 1 : 1;
              data.push({ nif, id });
              return { results: [{ id }] } as any;
            }
            if (sql.startsWith("SELECT last_insert_rowid()")) {
              return { id: data[data.length - 1]?.id ?? 1 } as any;
            }
            return { results: [] } as any;
          },
          first: async () => ({ id: data[data.length - 1]?.id ?? 1 })
        } as any;
      }
    } as any;
  };

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
      },
      DB_FAT_EMPRESAS: createDbMock([{ nif: "X123", id: 10 }])
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
    expect(result.empresaId).toBe(10);
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
      },
      DB_FAT_EMPRESAS: createDbMock([])
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

  it("inserta proveedor cuando no existe", async () => {
    const env: any = {
      NSKV_SECRETOS: { get: async (k: string) => (k === "OPENAI_API_KEY" ? "test-key" : null) },
      NSKV_PROMPTS: { get: async (k: string) => (k === "facturas-extraer-texto" ? JSON.stringify({}) : null) },
      R2_FACTURAS: {
        put: async () => true,
        get: async () => ({
          text: async () =>
            JSON.stringify({
              apioResponse: {
                output: {
                  datos_generales: {
                    nombre_proveedor: "Nuevo Proveedor",
                    nif_proveedor: "Z999",
                    fecha_emision: "2026-01-01",
                    moneda: "EUR",
                    importe_base_total: "100",
                    importe_impuestos_total: "21",
                    importe_retencion_total: "0",
                    importe_total: "121",
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
      },
      DB_FAT_EMPRESAS: createDbMock([])
    };

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ output: {} }), { status: 200 })) as any
    );

    const wf = new ProcesarFacturaWorkflow(env as any);
    const result = await wf.run(
      {
        payload: {
          invoiceId: "inv-new",
          fileUrl: "https://file",
          r2Key: "facturas/inv-new/factura.pdf",
          originalFileName: "factura.pdf",
          contentType: "application/pdf"
        }
      },
      step
    );

    expect(result.empresaId).toBe(1);
    expect(result.metadatos.invoiceId).toBe("inv-new");
  });

  it("genera error_validacion_factura.json cuando proveedor tiene campos vacios", async () => {
    const putCalls: Array<{ key: string; value: string }> = [];
    const env: any = {
      NSKV_SECRETOS: { get: async (k: string) => (k === "OPENAI_API_KEY" ? "test-key" : null) },
      NSKV_PROMPTS: { get: async (k: string) => (k === "facturas-extraer-texto" ? JSON.stringify({}) : null) },
      R2_FACTURAS: {
        put: async (k: string, v: string) => {
          putCalls.push({ key: k, value: v });
          return true;
        },
        get: async () => ({
          text: async () =>
            JSON.stringify({
              apioResponse: {
                output: {
                  datos_generales: {
                    nombre_proveedor: "",
                    nif_proveedor: "",
                    fecha_emision: "2026-01-01",
                    moneda: "EUR",
                    importe_base_total: "100",
                    importe_impuestos_total: "21",
                    importe_retencion_total: "0",
                    importe_total: "121",
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
      },
      DB_FAT_EMPRESAS: createDbMock([])
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
            invoiceId: "inv-bad",
            fileUrl: "https://file",
            r2Key: "facturas/inv-bad/factura.pdf",
            originalFileName: "factura.pdf",
            contentType: "application/pdf"
          }
        },
        step
      )
    ).rejects.toBeInstanceOf(ProveedorFailure);

    const errorPut = putCalls.find((c) => c.key.endsWith("error_validacion_factura.json"));
    expect(errorPut).toBeTruthy();
    const parsed = JSON.parse(errorPut!.value);
    expect(parsed.origen).toBe("proveedor_fat_empresas");
    expect(parsed.detalle_validacion.campos_invalidos).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ campo: "ro.datos_generales.nif_proveedor" }),
        expect.objectContaining({ campo: "ro.datos_generales.nombre_proveedor" })
      ])
    );
  });

  it("propaga error cuando hay duplicidad en fat_empresas", async () => {
    const putCalls: Array<{ key: string; value: string }> = [];
    const env: any = {
      NSKV_SECRETOS: { get: async (k: string) => (k === "OPENAI_API_KEY" ? "test-key" : null) },
      NSKV_PROMPTS: { get: async (k: string) => (k === "facturas-extraer-texto" ? JSON.stringify({}) : null) },
      R2_FACTURAS: {
        put: async (k: string, v: string) => {
          putCalls.push({ key: k, value: v });
          return true;
        },
        get: async () => ({
          text: async () =>
            JSON.stringify({
              apioResponse: {
                output: {
                  datos_generales: {
                    nombre_proveedor: "Prov",
                    nif_proveedor: "DUPL",
                    fecha_emision: "2026-01-01",
                    moneda: "EUR",
                    importe_base_total: "100",
                    importe_impuestos_total: "21",
                    importe_retencion_total: "0",
                    importe_total: "121",
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
      },
      DB_FAT_EMPRESAS: {
        prepare: (sql: string) => ({
          all: async (_: any) => {
            if (sql.startsWith("SELECT id FROM fat_empresas")) {
              return { results: [{ id: 1 }, { id: 2 }] } as any;
            }
            return { results: [] } as any;
          },
          first: async () => ({})
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
            invoiceId: "inv-dupl",
            fileUrl: "https://file",
            r2Key: "facturas/inv-dupl/factura.pdf",
            originalFileName: "factura.pdf",
            contentType: "application/pdf"
          }
        },
        step
      )
    ).rejects.toBeInstanceOf(ProveedorFailure);

    const errorPut = putCalls.find((c) => c.key.endsWith("error_validacion_factura.json"));
    expect(errorPut).toBeTruthy();
    const parsed = JSON.parse(errorPut!.value);
    expect(parsed.tipo_error).toBe("fat_empresas_duplicado");
  });
});
