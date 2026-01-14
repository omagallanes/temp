import * as XLSX from "xlsx";
import type { D1Database, R2Bucket } from "@cloudflare/workers-types";
import { ArchivosFailure } from "./archivos";

export type CabeceraFacturaExcel = {
  nif_proveedor: string;
  nombre_proveedor: string;
  numero_factura: string;
  numero_factura_normalizado: string;
  fecha_emision: string;
  moneda: string;
  importe_base_total: number;
  importe_impuestos_total: number;
  importe_retencion_total: number;
  importe_total: number;
  observaciones: string;
};

export type LineaFacturaExcel = {
  descripcion: string;
  codigo_producto: string | null;
  cantidad: number;
  precio_unitario: number;
  porcentaje_iva: number;
  importe_base: number;
  importe_impuesto: number;
  importe_total_linea: number;
};

export async function obtenerCabeceraFacturaExcel(db: D1Database, empresaId: number, facturaId: number): Promise<CabeceraFacturaExcel> {
  const result = await db
    .prepare(
      "SELECT fe.nif_proveedor, fe.nombre_proveedor, ff.numero_factura, ff.numero_factura_normalizado, ff.fecha_emision, ff.moneda, ff.importe_base_total, ff.importe_impuestos_total, ff.importe_retencion_total, ff.importe_total, ff.observaciones FROM fat_facturas ff JOIN fat_empresas fe ON ff.emisor_id = fe.id WHERE ff.id = ? AND ff.emisor_id = ? LIMIT 1"
    )
    .bind(facturaId, empresaId)
    .all();

  const rows = (result as any).results as CabeceraFacturaExcel[] | undefined;
  if (!rows || rows.length === 0) {
    throw new ArchivosFailure({
      tipo_error: "fat_facturas_archivos_consulta",
      descripcion: "No se encontró cabecera de factura para Excel"
    });
  }

  return rows[0];
}

export async function obtenerLineasFacturaExcel(db: D1Database, facturaId: number): Promise<LineaFacturaExcel[]> {
  const result = await db
    .prepare(
      "SELECT descripcion, codigo_producto, cantidad, precio_unitario, porcentaje_iva, importe_base, importe_impuesto, importe_total_linea FROM fat_factura_lineas WHERE factura_id = ? ORDER BY orden ASC"
    )
    .bind(facturaId)
    .all();

  const rows = (result as any).results as LineaFacturaExcel[] | undefined;
  if (!rows || rows.length === 0) {
    throw new ArchivosFailure({
      tipo_error: "fat_facturas_archivos_consulta",
      descripcion: "No se encontraron líneas para la factura en Excel"
    });
  }

  return rows;
}

export function buildExcelBuffer(cabecera: CabeceraFacturaExcel, lineas: LineaFacturaExcel[], nombreHoja: string): Uint8Array {
  const CABECERA_HEADERS = [
    "nif_proveedor",
    "nombre_proveedor",
    "numero_factura",
    "numero_factura_normalizado",
    "fecha_emision",
    "moneda",
    "importe_base_total",
    "importe_impuestos_total",
    "importe_retencion_total",
    "importe_total",
    "observaciones"
  ];

  const LINEA_HEADERS = [
    "descripcion",
    "codigo_producto",
    "cantidad",
    "precio_unitario",
    "porcentaje_iva",
    "importe_base",
    "importe_impuesto",
    "importe_total_linea"
  ];

  const data: any[][] = [
    CABECERA_HEADERS,
    [
      cabecera.nif_proveedor,
      cabecera.nombre_proveedor,
      cabecera.numero_factura,
      cabecera.numero_factura_normalizado,
      cabecera.fecha_emision,
      cabecera.moneda,
      cabecera.importe_base_total,
      cabecera.importe_impuestos_total,
      cabecera.importe_retencion_total,
      cabecera.importe_total,
      cabecera.observaciones
    ],
    LINEA_HEADERS,
    ...lineas.map((l) => [
      l.descripcion,
      l.codigo_producto ?? "",
      l.cantidad,
      l.precio_unitario,
      l.porcentaje_iva,
      l.importe_base,
      l.importe_impuesto,
      l.importe_total_linea
    ])
  ];

  const worksheet = XLSX.utils.aoa_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, nombreHoja);
  const buffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
  return new Uint8Array(buffer as ArrayBuffer);
}

export async function putExcelInR2(r2: R2Bucket, key: string, data: Uint8Array) {
  await r2.put(key, data, {
    httpMetadata: { contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }
  });
}
