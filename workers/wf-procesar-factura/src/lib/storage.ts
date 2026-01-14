export async function putR2(r2: any, key: string, value: string) {
  return r2.put(key, value, { httpMetadata: { contentType: "application/json" } });
}

export async function getKV(kv: any, key: string) {
  return kv.get(key);
}
