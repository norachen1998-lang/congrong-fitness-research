export default async function onRequest(context) {
  const { request, env } = context;
  if (request.method !== 'GET') return json({ ok: false, error: '请使用 GET。' }, 405);
  const token = new URL(request.url).searchParams.get('token') || '';
  if (token !== loadToken(env)) return json({ ok: false, error: '研究者口令不正确。' }, 401);

  const kv = getKV(env);
  if (!kv) return json({ ok: false, error: '服务器尚未绑定 KV 存储（变量名 congrong_kv）。' }, 503);
  try {
    const records = await readAll(kv);
    return json({ ok: true, count: records.length, records: records.slice(-2000) });
  } catch (err) {
    return json({ ok: false, error: '读取失败：' + (err && err.message ? err.message : String(err)) }, 500);
  }
}
