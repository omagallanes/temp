import { R2Bucket, D1Database } from '@cloudflare/workers-types';

declare global {
  interface Env {
    NSKV_SECRETOS: KVNamespace;
    NSKV_PROMPTS: KVNamespace;
    R2_FACTURAS: R2Bucket;
    DB_FAT_EMPRESAS: D1Database;
    WF_PROCESAR_FACTURA: {
      create: (opts: { id: string; params?: any }) => Promise<{ id: string }>;
    };
  }
}

export {};
