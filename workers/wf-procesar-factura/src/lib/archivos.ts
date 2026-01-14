import type { D1Database } from "@cloudflare/workers-types";

export type ArchivosMetadatos = {
  factura_id: number;
  invoiceId: string;
  r2_pdf_key: string;
  original_file_name: string;
  file_url: string;
  estado_validacion: string;
  r2_excel_key?: string | null;
};

export class ArchivosFailure extends Error {
  tipo_error:
    | "fat_facturas_archivos_consulta"
    | "fat_facturas_archivos_insercion"
    | "fat_facturas_archivos_inconsistente";
  descripcion: string;

  constructor(params: { tipo_error: ArchivosFailure["tipo_error"]; descripcion: string }) {
    super(params.descripcion);
    this.tipo_error = params.tipo_error;
    this.descripcion = params.descripcion;
  }
}

export async function upsertFacturasArchivos(db: D1Database, metadatos: ArchivosMetadatos) {
  const { factura_id, invoiceId, r2_pdf_key, original_file_name, file_url, estado_validacion, r2_excel_key } = metadatos;

  try {
    const existingResult = await db.prepare("SELECT factura_id FROM fat_facturas_archivos WHERE invoiceId = ? LIMIT 1").bind(invoiceId).all();
    const existingRows = (existingResult as any).results as Array<{ factura_id: number }> | undefined;

    if (existingRows && existingRows.length > 0) {
      const existingFacturaId = existingRows[0].factura_id;
      if (existingFacturaId !== factura_id) {
        throw new ArchivosFailure({
          tipo_error: "fat_facturas_archivos_inconsistente",
          descripcion: "Existe fila para invoiceId con factura_id distinto"
        });
      }

      const updateResult = await db
        .prepare(
          "UPDATE fat_facturas_archivos SET factura_id = ?, r2_pdf_key = ?, original_file_name = ?, file_url = ?, estado_validacion = ?, r2_excel_key = COALESCE(?, r2_excel_key) WHERE invoiceId = ?"
        )
        .bind(factura_id, r2_pdf_key, original_file_name, file_url, estado_validacion, r2_excel_key ?? null, invoiceId)
        .all();

      if ((updateResult as any).error) {
        throw new ArchivosFailure({
          tipo_error: "fat_facturas_archivos_insercion",
          descripcion: (updateResult as any).error
        });
      }

      return { actualizado: true };
    }

    const insertResult = await db
      .prepare(
        "INSERT INTO fat_facturas_archivos (factura_id, invoiceId, r2_pdf_key, original_file_name, file_url, estado_validacion, r2_excel_key) VALUES (?, ?, ?, ?, ?, ?, ?)"
      )
      .bind(factura_id, invoiceId, r2_pdf_key, original_file_name, file_url, estado_validacion, r2_excel_key ?? null)
      .all();

    if ((insertResult as any).error) {
      throw new ArchivosFailure({
        tipo_error: "fat_facturas_archivos_insercion",
        descripcion: (insertResult as any).error
      });
    }

    return { insertado: true };
  } catch (error: any) {
    if (error instanceof ArchivosFailure) throw error;
    throw new ArchivosFailure({
      tipo_error: "fat_facturas_archivos_consulta",
      descripcion: error?.message ?? "Error en fat_facturas_archivos"
    });
  }
}
