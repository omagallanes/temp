import { R2Bucket } from '@cloudflare/workers-types';

declare global {
  interface Env {
    NSKV_SECRETOS: KVNamespace;
    NSKV_PROMPTS: KVNamespace;
    R2_FACTURAS: R2Bucket;
    WF_PROCESAR_FACTURA: {
      create: (opts: { id: string; params?: any }) => Promise<{ id: string }>;
    };
  }
}

export {};
