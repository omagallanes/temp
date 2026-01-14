import type { D1Database } from "@cloudflare/workers-types";

export type ImportesFactura = {
  base: number;
  impuestos: number;
  total: number;
};

export const TOLERANCIA_VALIDACION = 0.1;

export class ValidacionProcesoFailure extends Error {
  tipo_error:
    | "fat_factura_inexistente"
    | "fat_factura_lineas_inexistentes"
    | "fat_factura_consulta"
    | "fat_factura_lineas_consulta";
  descripcion: string;
  campos_faltantes?: string[];

  constructor(params: {
    tipo_error: ValidacionProcesoFailure["tipo_error"];
    descripcion: string;
    campos_faltantes?: string[];
  }) {
    super(params.descripcion);
    this.tipo_error = params.tipo_error;
    this.descripcion = params.descripcion;
    this.campos_faltantes = params.campos_faltantes;
  }
}

export class DiferenciaDetectada extends Error {
  descripcion: string;
  constructor(descripcion: string) {
    super(descripcion);
    this.descripcion = descripcion;
  }
}

export async function leerImportesCabecera(db: D1Database, facturaId: number): Promise<ImportesFactura> {
  try {
    const result = await db
      .prepare("SELECT importe_base_total AS base, importe_impuestos_total AS impuestos, importe_total AS total FROM fat_facturas WHERE id = ?")
      .bind(facturaId)
      .all();
    const rows = (result as any).results as Array<ImportesFactura> | undefined;
    if (!rows || rows.length === 0) {
      throw new ValidacionProcesoFailure({
        tipo_error: "fat_factura_inexistente",
        descripcion: "No existe cabecera para facturaId",
        campos_faltantes: ["facturaId"]
      });
    }
    return rows[0];
  } catch (error: any) {
    if (error instanceof ValidacionProcesoFailure) throw error;
    throw new ValidacionProcesoFailure({
      tipo_error: "fat_factura_consulta",
      descripcion: error?.message ?? "Error consultando fat_facturas"
    });
  }
}

export async function sumarImportesLineas(db: D1Database, facturaId: number): Promise<ImportesFactura> {
  try {
    const result = await db
      .prepare(
        "SELECT SUM(importe_base) AS base, SUM(importe_impuesto) AS impuestos, SUM(importe_total_linea) AS total FROM fat_factura_lineas WHERE factura_id = ?"
      )
      .bind(facturaId)
      .all();
    const rows = (result as any).results as Array<ImportesFactura> | undefined;
    if (!rows || rows.length === 0 || rows[0] === undefined) {
      throw new ValidacionProcesoFailure({
        tipo_error: "fat_factura_lineas_inexistentes",
        descripcion: "No existen líneas para facturaId",
        campos_faltantes: ["lineas"]
      });
    }
    const valores = rows[0];
    if (valores.base === null || valores.impuestos === null || valores.total === null) {
      throw new ValidacionProcesoFailure({
        tipo_error: "fat_factura_lineas_inexistentes",
        descripcion: "Líneas sin importes acumulables",
        campos_faltantes: ["lineas"]
      });
    }
    return valores;
  } catch (error: any) {
    if (error instanceof ValidacionProcesoFailure) throw error;
    throw new ValidacionProcesoFailure({
      tipo_error: "fat_factura_lineas_consulta",
      descripcion: error?.message ?? "Error consultando fat_factura_lineas"
    });
  }
}

export function compararImportes(
  esperado: ImportesFactura,
  calculado: ImportesFactura,
  tolerancia: number
): { ok: boolean; diferencias: ImportesFactura } {
  const diferencias: ImportesFactura = {
    base: calculado.base - esperado.base,
    impuestos: calculado.impuestos - esperado.impuestos,
    total: calculado.total - esperado.total
  };

  const ok =
    Math.abs(diferencias.base) <= tolerancia &&
    Math.abs(diferencias.impuestos) <= tolerancia &&
    Math.abs(diferencias.total) <= tolerancia;

  return { ok, diferencias };
}

export function buildDiferenciaPayload(params: {
  invoiceId: string;
  archivo: { nombre_original: string; r2_pdf_key: string; file_url: string };
  esperado: ImportesFactura;
  calculado: ImportesFactura;
  diferencias: ImportesFactura;
  tolerancia: number;
}) {
  return {
    origen: "validar_fat_empresas",
    invoiceId: params.invoiceId,
    archivo: {
      nombre_original: params.archivo.nombre_original,
      r2_pdf_key: params.archivo.r2_pdf_key,
      file_url: params.archivo.file_url
    },
    detalle_validacion: {
      campos_verificados: ["base", "impuestos", "total"],
      esperado: params.esperado,
      calculado: params.calculado,
      diferencias: params.diferencias,
      tolerancia: params.tolerancia
    },
    fecha_error: new Date().toISOString()
  };
}

export function buildDiferenciaPathFromPdfKey(r2PdfKey: string) {
  const lastSlash = r2PdfKey.lastIndexOf("/");
  if (lastSlash === -1) return "diferencia_validacion_factura.json";
  const base = r2PdfKey.slice(0, lastSlash);
  return `${base}/diferencia_validacion_factura.json`;
}
