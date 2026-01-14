import { describe, it, expect } from 'vitest';
import handler from '../src/index';

describe('fetch handler', () => {
  it('returns 405 for non-POST', async () => {
    const res = await (handler as any).fetch(new Request('https://example.test/'), {});
    expect(res.status).toBe(405);
  });

  it('enqueues workflow on valid POST', async () => {
    const mockCreate = async (opts: any) => ({ id: 'mock-instance-id' });
    const env: any = { WF_PROCESAR_FACTURA: { create: mockCreate } };
    const body = JSON.stringify({ invoiceId: 'inv-1', r2Key: 'k', originalFileName: 'f', contentType: 'text/plain', fileUrl: 'https://example.com/file.pdf' });
    const res = await (handler as any).fetch(new Request('https://example.test/', { method: 'POST', body }), env);
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.workflow).toBe('wf-procesar-factura');
    expect(data.instancia_id).toBe('mock-instance-id');
  });
});
