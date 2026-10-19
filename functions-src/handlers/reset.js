export default async function onRequest(context) {
  const { request, env } = context;
  if (request.method !== 'POST') return json({ ok: false, error: '请使用 POST。' }, 405);

  let token = '';
  try {
    const body = await request.json();
    token = String((body && body.token) || '').trim();
  } catch {}
  if (token !== loadToken(env)) return json({ ok: false, error: '研究者口令不正确。' }, 401);

  const kv = getKV(env);
  if (!kv) return json({ ok: false, error: '服务器尚未绑定 KV 存储（变量名 congrong_kv）。' }, 503);

  try {
    let cleared = 0;
    if (typeof kv.list === 'function') {
      const list = await kv.list({ prefix: KV_PREFIX });
      const keys = (list && list.keys) || [];
      for (const k of keys) {
        await kv.delete(typeof k === 'string' ? k : k.name);
        cleared++;
      }
    } else {
      // 无 list 能力时按元数据里的分片数逐个删除
      const meta = await readMeta(kv);
      for (let i = 0; i < (meta.shards || 0); i++) {
        await kv.delete(KV_PREFIX + String(i));
        cleared++;
      }
    }
    await kv.delete(META_KEY);
    return json({ ok: true, count: 0, cleared });
  } catch (err) {
    return json({ ok: false, error: '清空失败：' + (err && err.message ? err.message : String(err)) }, 500);
  }
}
