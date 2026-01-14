export async function putR2(r2: any, key: string, value: string) {
  return r2.put(key, value, { httpMetadata: { contentType: "application/json" } });
}

export async function getKV(kv: any, key: string) {
  return kv.get(key);
}

export async function getR2Json<T = unknown>(r2: any, key: string): Promise<T | null> {
  const obj = await r2.get(key);
  if (!obj) return null;
  const text = await obj.text();
  return JSON.parse(text) as T;
}
