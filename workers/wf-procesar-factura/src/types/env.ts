import type { R2Bucket, D1Database } from "@cloudflare/workers-types";

export type EmailContent = {
  type: "text/plain" | "text/html";
  value: string;
};

export type EmailSender = {
  send: (message: { from: string; to: string[]; subject: string; content: EmailContent[] }) => Promise<unknown>;
};

export type MetadatosLectura = {
  invoiceId: string;
  r2_pdf_key: string;
  file_url: string;
  nombre_original: string;
  contentType: string;
};

export interface Env {
  NSKV_SECRETOS: KVNamespace;
  NSKV_PROMPTS: KVNamespace;
  NSKV_VARIABLES?: KVNamespace;
  R2_FACTURAS: R2Bucket;
  DB_FAT_EMPRESAS: D1Database;
  WF_PROCESAR_FACTURA: {
    create: (opts: { id: string; params?: any }) => Promise<{ id: string }>;
  };
  EMAIL_ROUTING?: EmailSender;
  var_envio_email?: string | boolean;
}
