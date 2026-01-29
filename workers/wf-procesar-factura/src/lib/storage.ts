export async function putR2(r2: any, key: string, value: string) {
  return r2.put(key, value, { httpMetadata: { contentType: "application/json" } });
}

export async function getKV(kv: any, key: string) {
  return kv.get(key);
}

export async function getRequiredKV(kv: any, key: string) {
  const value = await kv.get(key);
  if (value === null || value === undefined) {
    throw new Error(`Config missing: ${key}`);
  }
  return value;
}

export async function getOptionalConfig(env: any, key: string) {
  if (env.NSKV_VARIABLES) {
    const value = await env.NSKV_VARIABLES.get(key);
    if (value !== null && value !== undefined) return value;
  }
  if (env.NSKV_SECRETOS) {
    return env.NSKV_SECRETOS.get(key);
  }
  return null;
}

export async function getRequiredConfig(env: any, key: string) {
  const value = await getOptionalConfig(env, key);
  if (value === null || value === undefined) {
    throw new Error(`Config missing: ${key}`);
  }
  return value;
}

export async function getR2Json<T = unknown>(r2: any, key: string): Promise<T | null> {
  const obj = await r2.get(key);
  if (!obj) return null;
  const text = await obj.text();
  return JSON.parse(text) as T;
}
