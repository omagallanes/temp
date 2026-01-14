import * as XLSX from "xlsx";

export type LineaFacturaRow = {
  factura_id: number;
  descripcion: string;
  cantidad: number;
  precio_unitario: number;
  porcentaje_iva: number;
  importe_base: number;
  importe_impuesto: number;
  importe_total_linea: number;
};

export function buildXlsxFromLineas(rows: LineaFacturaRow[]): Uint8Array {
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(rows, {
    header: [
      "factura_id",
      "descripcion",
      "cantidad",
      "precio_unitario",
      "porcentaje_iva",
      "importe_base",
      "importe_impuesto",
      "importe_total_linea"
    ]
  });
  XLSX.utils.book_append_sheet(workbook, worksheet, "lineas");
  const buffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
  return new Uint8Array(buffer as ArrayBuffer);
}
