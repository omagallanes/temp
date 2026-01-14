import type { D1Database } from "@cloudflare/workers-types";
import { ValidationFailure, ValidationInvalidField, RO } from "./apioresponse";
import { MetadatosLectura } from "../types/env";

export class LineasFailure extends Error {
  tipo_error: "error_borrando_lineas" | "error_insertando_lineas";
  descripcion: string;

  constructor(params: { tipo_error: LineasFailure["tipo_error"]; descripcion: string }) {
    super(params.descripcion);
    this.tipo_error = params.tipo_error;
    this.descripcion = params.descripcion;
  }
}

interface ValidateLineasInputParams {
  ro: RO;
  metadatos?: MetadatosLectura;
  empresaId: number;
  facturaId: number;
  numeroFacturaNormalizado: string;
  nombreNormalizadoProveedor?: string;
}

const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

export function validateLineasInput(params: ValidateLineasInputParams) {
  const { ro, metadatos, empresaId, facturaId, numeroFacturaNormalizado, nombreNormalizadoProveedor } = params;

  if (!ro) {
    throw new ValidationFailure({
      tipo_error: "estructura_ro_invalida",
      descripcion: "RO ausente en la entrada de líneas"
    });
  }

  if (!Array.isArray(ro.lineas) || ro.lineas.length === 0) {
    throw new ValidationFailure({
      tipo_error: "campo_obligatorio_faltante",
      descripcion: "lineas no presentes o vacías",
      campos_faltantes: ["lineas"]
    });
  }

  ro.lineas.forEach((linea, idx) => {
    const invalid: ValidationInvalidField[] = [];
    if (!linea.descripcion || typeof linea.descripcion !== "string") invalid.push({ campo: `lineas[${idx}].descripcion`, valor: linea.descripcion, motivo: "descripcion requerida" });
    if (linea.codigo_producto && typeof linea.codigo_producto !== "string") invalid.push({ campo: `lineas[${idx}].codigo_producto`, valor: linea.codigo_producto, motivo: "codigo_producto debe ser texto" });
    if (!isNumber(linea.cantidad)) invalid.push({ campo: `lineas[${idx}].cantidad`, valor: linea.cantidad, motivo: "cantidad debe ser numérica" });
    if (!isNumber(linea.precio_unitario)) invalid.push({ campo: `lineas[${idx}].precio_unitario`, valor: linea.precio_unitario, motivo: "precio_unitario debe ser numérico" });
    if (!isNumber(linea.porcentaje_iva)) invalid.push({ campo: `lineas[${idx}].porcentaje_iva`, valor: linea.porcentaje_iva, motivo: "porcentaje_iva debe ser numérico" });
    if (!isNumber(linea.importe_base)) invalid.push({ campo: `lineas[${idx}].importe_base`, valor: linea.importe_base, motivo: "importe_base debe ser numérico" });
    if (!isNumber(linea.importe_impuesto)) invalid.push({ campo: `lineas[${idx}].importe_impuesto`, valor: linea.importe_impuesto, motivo: "importe_impuesto debe ser numérico" });
    if (!isNumber(linea.importe_total_linea)) invalid.push({ campo: `lineas[${idx}].importe_total_linea`, valor: linea.importe_total_linea, motivo: "importe_total_linea debe ser numérico" });

    if (invalid.length > 0) {
      throw new ValidationFailure({
        tipo_error: "campo_obligatorio_invalido",
        descripcion: "Campos inválidos en líneas",
        campos_invalidos: invalid
      });
    }
  });

  return {
    ro,
    metadatos,
    empresaId,
    facturaId,
    numeroFacturaNormalizado,
    nombreNormalizadoProveedor
  };
}

export async function borrarLineasFactura(db: D1Database, facturaId: number) {
  const stmt = db.prepare("DELETE FROM fat_factura_lineas WHERE factura_id = ?");
  const result = await stmt.bind(facturaId).all();
  if (result.error) {
    throw new LineasFailure({ tipo_error: "error_borrando_lineas", descripcion: result.error });
  }
}

export async function insertarLineasFactura(db: D1Database, facturaId: number, lineas: RO["lineas"]) {
  let inserted = 0;
  for (const [idx, linea] of lineas.entries()) {
    const stmt = db.prepare(
      "INSERT INTO fat_factura_lineas (factura_id, descripcion, codigo_producto, cantidad, precio_unitario, porcentaje_iva, importe_base, importe_impuesto, importe_total_linea, orden) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    );

    const result = await stmt
      .bind(
        facturaId,
        linea.descripcion,
        linea.codigo_producto ?? null,
        linea.cantidad,
        linea.precio_unitario,
        linea.porcentaje_iva,
        linea.importe_base,
        linea.importe_impuesto,
        linea.importe_total_linea,
        idx + 1
      )
      .all();

    if (result.error) {
      throw new LineasFailure({ tipo_error: "error_insertando_lineas", descripcion: result.error });
    }

    inserted += 1;
  }

  return inserted;
}
