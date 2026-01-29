import { describe, it, expect, vi, beforeEach } from "vitest";
import handler from "../src/index";

const bufferFrom = (text: string) => new TextEncoder().encode(text).buffer;

const makeHeaders = (entries: Record<string, string>) => ({
  get: (key: string) => entries[key.toLowerCase()] ?? null
});

describe("email handler", () => {
  let put: ReturnType<typeof vi.fn>;
  let create: ReturnType<typeof vi.fn>;
  let env: any;

  beforeEach(() => {
    put = vi.fn(async () => undefined);
    create = vi.fn(async ({ id }: { id: string; params: any }) => ({ id: `wf-${id}` }));
    env = {
      R2_FACTURAS: { put },
      WF_PROCESAR_FACTURA: { create },
      NSKV_SECRETOS: {
        get: async (key: string) => (key === "R2_FACTURAS_PREFIX" ? "facturas" : null)
      }
    } as any;
  });

  it("procesa un correo con adjunto pdf y encola el workflow", async () => {
    const message: any = {
      from: "origen@example.com",
      to: ["destino@example.com"],
      headers: makeHeaders({ subject: "Factura", "message-id": "<abc123@correo>" }),
      attachments: [
        {
          filename: "factura.pdf",
          name: "factura.pdf",
          contentType: "application/pdf",
          content: bufferFrom("contenido pdf")
        }
      ]
    };

    await (handler as any).email(message, env);

    expect(put).toHaveBeenCalledTimes(1);
    const putArgs = put.mock.calls[0];
    const r2Key = putArgs[0];
  expect(r2Key).toMatch(/^facturas\//);
    expect(create).toHaveBeenCalledTimes(1);
    const params = create.mock.calls[0][0].params;
    expect(params.originalFileName).toBe("factura.pdf");
    expect(params.contentType).toBe("application/pdf");
    expect(params.r2Key).toBe(r2Key);
    expect(params.invoiceId).toBeDefined();
    expect(params.fileUrl).toContain(r2Key);
    expect(params.emailMeta?.from).toBe("origen@example.com");
  });

  it("acepta adjunto con nombre .pdf aunque no traiga contentType", async () => {
    const message: any = {
      from: "origen@example.com",
      to: ["destino@example.com"],
      headers: makeHeaders({}),
      attachments: [
        {
          filename: "factura-sin-ct.pdf",
          name: "factura-sin-ct.pdf",
          content: bufferFrom("contenido pdf")
        }
      ]
    };

    await (handler as any).email(message, env);

    expect(put).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledTimes(1);
    const params = create.mock.calls[0][0].params;
    expect(params.originalFileName).toBe("factura-sin-ct.pdf");
    expect(params.contentType).toBe("application/octet-stream");
  });

  it("acepta adjunto application/octet-stream si el nombre es .pdf", async () => {
    const message: any = {
      from: "origen@example.com",
      to: ["destino@example.com"],
      headers: makeHeaders({}),
      attachments: [
        {
          filename: "factura-octet.pdf",
          name: "factura-octet.pdf",
          contentType: "application/octet-stream",
          content: bufferFrom("contenido")
        }
      ]
    };

    await (handler as any).email(message, env);

    expect(put).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledTimes(1);
    const params = create.mock.calls[0][0].params;
    expect(params.contentType).toBe("application/octet-stream");
    expect(params.originalFileName).toBe("factura-octet.pdf");
  });

  it("ignora correos sin adjuntos válidos", async () => {
    const message: any = {
      from: "origen@example.com",
      to: ["destino@example.com"],
      headers: makeHeaders({}),
      attachments: []
    };

    await (handler as any).email(message, env);

    expect(put).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });
});
