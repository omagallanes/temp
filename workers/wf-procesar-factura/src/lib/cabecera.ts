import type { D1Database } from "@cloudflare/workers-types";
import { RO, ValidationFailure } from "./apioresponse";
import { ProveedorFailure } from "./proveedor";

export type CabeceraStepInput = {
  ro: RO;
  metadatos: {
    invoiceId: string;
    r2_pdf_key: string;
    file_url: string;
    nombre_original: string;
    contentType: string;
  };
  empresaId: number;
};

export function validateCabeceraInput(payload: any): CabeceraStepInput {
  if (!payload || typeof payload !== "object") {
    throw new ValidationFailure({ tipo_error: "estructura_ro_invalida", descripcion: "Entrada cabecera inválida" });
  }
  const { ro, metadatos, empresaId } = payload as CabeceraStepInput;
  if (!ro || typeof ro !== "object" || Array.isArray(ro)) {
    throw new ValidationFailure({ tipo_error: "estructura_ro_invalida", descripcion: "RO faltante en cabecera" });
  }
  if (!metadatos || typeof metadatos !== "object" || Array.isArray(metadatos)) {
    throw new ValidationFailure({ tipo_error: "estructura_ro_invalida", descripcion: "Metadatos faltantes en cabecera" });
  }
  if (typeof empresaId !== "number" || Number.isNaN(empresaId)) {
    throw new ValidationFailure({ tipo_error: "estructura_ro_invalida", descripcion: "empresaId inválido" });
  }

  const dg: any = (ro as any).datos_generales;
  if (!dg || typeof dg !== "object" || Array.isArray(dg)) {
    throw new ValidationFailure({ tipo_error: "estructura_ro_invalida", descripcion: "datos_generales faltante en cabecera" });
  }

  const numero_factura = dg.numero_factura;
  if (typeof numero_factura !== "string" || numero_factura.trim().length === 0) {
    throw new ValidationFailure({
      tipo_error: "campo_obligatorio_faltante",
      descripcion: "numero_factura es obligatorio y debe ser texto utilizable",
      campos_faltantes: ["datos_generales.numero_factura"]
    });
  }

  return {
    ro,
    metadatos,
    empresaId
  };
}

export function normalizeNumeroFactura(numero: string): string {
  const sinDiacriticos = numero.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const minusculas = sinDiacriticos.toLowerCase();
  const sinEspaciosYPuntuacion = minusculas.replace(/[\s.,\-_/()\[\]{}:;"'`´+*?¿¡!@#$%^&=|<>~]/g, "");
  const soloAlfanumerico = sinEspaciosYPuntuacion.replace(/[^a-z0-9]/g, "");
  if (!soloAlfanumerico.length) {
    throw new ValidationFailure({ tipo_error: "campo_obligatorio_invalido", descripcion: "numero_factura_normalizado quedó vacío" });
  }
  return soloAlfanumerico;
}

export async function overwriteFacturaSiExiste(db: D1Database, emisorId: number, numero_factura: string) {
  try {
    const result = await db
      .prepare("SELECT id FROM fat_facturas WHERE emisor_id = ? AND numero_factura = ?")
      .bind(emisorId, numero_factura)
      .all();
    const rows = (result as any).results as Array<{ id: number }> | undefined;
    if (!rows || rows.length === 0) {
      return { deletedFacturaId: null };
    }

    const facturaId = rows[0].id;

    // Borrar registros en fat_facturas_archivos que referencian a esta factura
    const deleteArchivos = await db.prepare("DELETE FROM fat_facturas_archivos WHERE factura_id = ?").bind(facturaId).all();
    if ((deleteArchivos as any).error) {
      throw new ProveedorFailure({ tipo_error: "fat_empresas_insercion", descripcion: (deleteArchivos as any).error });
    }

    const deleteLineas = await db.prepare("DELETE FROM fat_factura_lineas WHERE factura_id = ?").bind(facturaId).all();
    if ((deleteLineas as any).error) {
      throw new ProveedorFailure({ tipo_error: "fat_empresas_insercion", descripcion: (deleteLineas as any).error });
    }

    const deleteCabecera = await db.prepare("DELETE FROM fat_facturas WHERE id = ?").bind(facturaId).all();
    if ((deleteCabecera as any).error) {
      throw new ProveedorFailure({ tipo_error: "fat_empresas_insercion", descripcion: (deleteCabecera as any).error });
    }

    return { deletedFacturaId: facturaId };
  } catch (error: any) {
    if (error instanceof ProveedorFailure) throw error;
    throw new ProveedorFailure({ tipo_error: "fat_empresas_consulta", descripcion: error?.message ?? "Error consultando fat_facturas" });
  }
}

export async function insertarCabeceraFactura(
  db: D1Database,
  params: {
    emisor_id: number;
    numero_factura: string;
    numero_factura_normalizado: string;
    fecha_emision: string;
    moneda: string;
    importe_base_total: number;
    importe_impuestos_total: number;
    importe_retencion_total: number;
    importe_total: number;
    observaciones: string;
  }
): Promise<number> {
  try {
    const result = await db
      .prepare(
        "INSERT INTO fat_facturas (emisor_id, numero_factura, numero_factura_normalizado, fecha_emision, moneda, importe_base_total, importe_impuestos_total, importe_retencion_total, importe_total, observaciones) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id"
      )
      .bind(
        params.emisor_id,
        params.numero_factura,
        params.numero_factura_normalizado,
        params.fecha_emision,
        params.moneda,
        params.importe_base_total,
        params.importe_impuestos_total,
        params.importe_retencion_total,
        params.importe_total,
        params.observaciones
      )
      .all();

    const rows = (result as any).results as Array<{ id: number }> | undefined;
    if (rows && rows.length > 0 && typeof rows[0].id === "number") return rows[0].id;

    const fallback = await db.prepare("SELECT last_insert_rowid() as id").first();
    const id = (fallback as any)?.id;
    if (typeof id === "number") return id;

    throw new ProveedorFailure({ tipo_error: "fat_empresas_insercion", descripcion: "No se pudo recuperar id tras insertar fat_facturas" });
  } catch (error: any) {
    if (error instanceof ProveedorFailure) throw error;
    throw new ProveedorFailure({ tipo_error: "fat_empresas_insercion", descripcion: error?.message ?? "Error insertando fat_facturas" });
  }
}
