import type { D1Database } from "@cloudflare/workers-types";
import { RO } from "./apioresponse";

export type MetadatosFactura = {
  invoiceId: string;
  r2_pdf_key: string;
  file_url: string;
  nombre_original: string;
  contentType: string;
};

export type ProveedorStepInput = {
  ro: RO;
  metadatos: MetadatosFactura;
};

export type ProveedorValidationIssue = {
  campo: string;
  valor?: unknown;
  motivo: string;
};

export class ProveedorFailure extends Error {
  tipo_error:
    | "entrada_invalida"
    | "fat_empresas_duplicado"
    | "fat_empresas_insercion"
    | "fat_empresas_consulta"
    | "nombre_normalizado_vacio";
  descripcion: string;
  issues: ProveedorValidationIssue[];

  constructor(params: { tipo_error: ProveedorFailure["tipo_error"]; descripcion: string; issues?: ProveedorValidationIssue[] }) {
    super(params.descripcion);
    this.tipo_error = params.tipo_error;
    this.descripcion = params.descripcion;
    this.issues = params.issues ?? [];
  }
}

export function validateProveedorInput(payload: any): ProveedorStepInput {
  const issues: ProveedorValidationIssue[] = [];

  if (!payload || typeof payload !== "object") {
    throw new ProveedorFailure({ tipo_error: "entrada_invalida", descripcion: "Payload de proveedor inválido" });
  }

  const { ro, metadatos } = payload as { ro: unknown; metadatos: unknown };

  if (!ro || typeof ro !== "object" || Array.isArray(ro)) {
    throw new ProveedorFailure({ tipo_error: "entrada_invalida", descripcion: "RO faltante o inválido" });
  }

  const datosGenerales: any = (ro as any).datos_generales;
  if (!datosGenerales || typeof datosGenerales !== "object" || Array.isArray(datosGenerales)) {
    issues.push({ campo: "ro.datos_generales", motivo: "Debe ser objeto con nif_proveedor y nombre_proveedor" });
  }

  const nif = datosGenerales?.nif_proveedor;
  const nombre = datosGenerales?.nombre_proveedor;

  if (typeof nif !== "string" || nif.length === 0) {
    issues.push({ campo: "ro.datos_generales.nif_proveedor", valor: nif, motivo: "Texto utilizable requerido" });
  }
  if (typeof nombre !== "string" || nombre.length === 0) {
    issues.push({ campo: "ro.datos_generales.nombre_proveedor", valor: nombre, motivo: "Texto utilizable requerido" });
  }

  if (!metadatos || typeof metadatos !== "object" || Array.isArray(metadatos)) {
    issues.push({ campo: "metadatos", motivo: "Objeto metadatos requerido" });
  }

  const invoiceId = (metadatos as any)?.invoiceId;
  const r2_pdf_key = (metadatos as any)?.r2_pdf_key;
  const file_url = (metadatos as any)?.file_url;
  const nombre_original = (metadatos as any)?.nombre_original;
  const contentType = (metadatos as any)?.contentType;

  const metaPairs: Array<[string, unknown]> = [
    ["metadatos.invoiceId", invoiceId],
    ["metadatos.r2_pdf_key", r2_pdf_key],
    ["metadatos.file_url", file_url],
    ["metadatos.nombre_original", nombre_original],
    ["metadatos.contentType", contentType]
  ];

  metaPairs.forEach(([campo, valor]) => {
    if (typeof valor !== "string" || valor.length === 0) {
      issues.push({ campo, valor, motivo: "Texto utilizable requerido" });
    }
  });

  if (issues.length) {
    throw new ProveedorFailure({ tipo_error: "entrada_invalida", descripcion: "Entrada mínima de proveedor incompleta", issues });
  }

  return {
    ro: ro as RO,
    metadatos: {
      invoiceId,
      r2_pdf_key,
      file_url,
      nombre_original,
      contentType
    }
  };
}

export function normalizeNombreProveedor(nombre: string): string {
  const sinDiacriticos = nombre.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const minusculas = sinDiacriticos.toLowerCase();
  const sinEspaciosYPuntuacion = minusculas.replace(/[\s.,\-_/()\[\]{}:;"'`´+*?¿¡!@#$%^&=|<>~]/g, "");
  const soloAlfanumerico = sinEspaciosYPuntuacion.replace(/[^a-z0-9]/g, "");

  if (!soloAlfanumerico.length) {
    throw new ProveedorFailure({ tipo_error: "nombre_normalizado_vacio", descripcion: "nombre_normalizado quedó vacío tras normalizar" });
  }

  return soloAlfanumerico;
}

export async function findEmpresaIdByNif(db: D1Database, nif: string): Promise<number | null> {
  try {
    const result = await db.prepare("SELECT id FROM fat_empresas WHERE nif_proveedor = ?").bind(nif).all();
    const rows = (result as any).results as Array<{ id: number }> | undefined;
    if (!rows || rows.length === 0) return null;
    if (rows.length > 1) {
      throw new ProveedorFailure({
        tipo_error: "fat_empresas_duplicado",
        descripcion: "fat_empresas devolvió múltiples filas para nif_proveedor"
      });
    }
    return rows[0].id;
  } catch (error: any) {
    if (error instanceof ProveedorFailure) throw error;
    throw new ProveedorFailure({ tipo_error: "fat_empresas_consulta", descripcion: error?.message ?? "Error consultando fat_empresas" });
  }
}

export async function insertEmpresa(
  db: D1Database,
  params: { nif_proveedor: string; nombre_proveedor: string; nombre_normalizado: string }
): Promise<number> {
  try {
    const result = await db.prepare(
      "INSERT INTO fat_empresas (nif_proveedor, nombre_proveedor, nombre_normalizado) VALUES (?, ?, ?) RETURNING id"
    ).bind(params.nif_proveedor, params.nombre_proveedor, params.nombre_normalizado).all();
    const rows = (result as any).results as Array<{ id: number }> | undefined;
    if (rows && rows.length > 0 && typeof rows[0].id === "number") return rows[0].id;

    // Fallback: intentar recuperar last_insert_rowid si RETURNING no está disponible
    const fallback = await db.prepare("SELECT last_insert_rowid() as id").first();
    const id = (fallback as any)?.id;
    if (typeof id === "number") return id;

    throw new ProveedorFailure({ tipo_error: "fat_empresas_insercion", descripcion: "No se pudo recuperar id tras insertar" });
  } catch (error: any) {
    if (error instanceof ProveedorFailure) throw error;
    const message = error?.message ?? "Error insertando fat_empresas";
    throw new ProveedorFailure({ tipo_error: "fat_empresas_insercion", descripcion: message });
  }
}

export async function resolveProveedorEmpresa(
  db: D1Database,
  nif_proveedor: string,
  nombre_proveedor: string,
  nombre_normalizado: string
): Promise<number> {
  const existingId = await findEmpresaIdByNif(db, nif_proveedor);
  if (existingId !== null) return existingId;
  return insertEmpresa(db, { nif_proveedor, nombre_proveedor, nombre_normalizado });
}

export function buildProveedorErrorPayload(params: {
  tipo_error: ProveedorFailure["tipo_error"];
  descripcion: string;
  invoiceId: string;
  archivo: { nombre_original: string; r2_pdf_key: string; file_url: string };
  issues?: ProveedorValidationIssue[];
  fecha_error?: string;
}) {
  return {
    tipo_error: params.tipo_error,
    descripcion: params.descripcion,
    origen: "proveedor_fat_empresas",
    invoiceId: params.invoiceId,
    archivo: {
      nombre_original: params.archivo.nombre_original,
      r2_pdf_key: params.archivo.r2_pdf_key,
      file_url: params.archivo.file_url
    },
    detalle_validacion: {
      campos_faltantes: (params.issues ?? []).filter((i) => i.valor === undefined).map((i) => i.campo),
      campos_invalidos: (params.issues ?? []).filter((i) => i.valor !== undefined).map((i) => ({ campo: i.campo, valor: i.valor, motivo: i.motivo }))
    },
    fecha_error: params.fecha_error ?? new Date().toISOString()
  };
}
