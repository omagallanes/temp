export class WorkflowEntrypoint<TEnv = unknown> {
  // Minimal stub for tests; in runtime, Cloudflare provides concrete implementation.
  constructor(public env?: TEnv) {}
  async run(_event: unknown, _step?: unknown): Promise<unknown> {
    return undefined;
  }
}
