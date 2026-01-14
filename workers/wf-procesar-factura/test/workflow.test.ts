import { describe, it, expect } from 'vitest';
import ProcesarFacturaWorkflow from '../src/workflow';

describe('workflow logic', () => {
  it('processes successfully with mocked services', async () => {
    const env: any = {
      NSKV_SECRETOS: { get: async (k: string) => (k === 'OPENAI_API_KEY' ? 'test-key' : null) },
      NSKV_PROMPTS: { get: async (k: string) => (k === 'facturas-extraer-texto' ? JSON.stringify({ example: true }) : null) },
      R2_FACTURAS: { put: async (_k: string, _v: string) => true }
    };

    const wf = new ProcesarFacturaWorkflow(env as any);
    const result = await wf.run({ payload: { invoiceId: 'inv-1', fileUrl: 'https://file' } }, {});
    expect(result).toHaveProperty('status');
  });
});
