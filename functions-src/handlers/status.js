export default async function onRequest(context) {
  const { env } = context;
  const kv = getKV(env);
  if (!kv) return json({ ok: false, error: '服务器尚未绑定 KV 存储（变量名 congrong_kv）。', count: 0 }, 503);
  try {
    const meta = await readMeta(kv);
    return json({ ok: true, count: meta.count, shards: meta.shards });
  } catch (err) {
    return json({ ok: false, error: '读取失败：' + (err && err.message ? err.message : String(err)), count: 0 }, 500);
  }
}
