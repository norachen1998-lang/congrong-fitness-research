export default async function onRequest(context) {
  const { request, env } = context;
  if (request.method !== 'POST') return json({ ok: false, error: '请使用 POST 提交。' }, 405);

  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ ok: false, error: '提交内容不是合法 JSON。' }, 400);
  }
  let items = payload && payload.records !== undefined ? payload.records : payload;
  if (items && !Array.isArray(items)) items = [items];
  if (!Array.isArray(items) || !items.length) return json({ ok: false, error: '没有可保存的记录。' }, 400);

  const clean = [];
  for (const it of items.slice(0, 200)) {
    if (!it || typeof it !== 'object') continue;
    const rec = Object.assign({}, it);
    delete rec.receivedAt;
    if (!rec.id) continue;
    clean.push(rec);
  }
  if (!clean.length) return json({ ok: false, error: '记录缺少匿名编号。' }, 400);

  const kv = getKV(env);
  if (!kv) {
    return json({ ok: false, error: '服务器尚未绑定 KV 存储，数据无法保存。请在 EdgeOne 控制台绑定 KV 命名空间，变量名设为 congrong_kv。' }, 503);
  }

  let result;
  try {
    result = await appendAll(kv, clean);
  } catch (err) {
    return json({ ok: false, error: '写入失败：' + (err && err.message ? err.message : String(err)) }, 500);
  }

  // 可选：异地备份转发（控制台环境变量 WEBHOOK_URL）
  const hook = (env && env.WEBHOOK_URL ? String(env.WEBHOOK_URL) : '').trim();
  if (hook) {
    const task = (async () => {
      for (const rec of result.saved) {
        try {
          await fetch(hook, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json; charset=utf-8' },
            body: JSON.stringify(rec),
          });
        } catch { /* 转发失败不影响主流程 */ }
      }
    })();
    if (context && typeof context.waitUntil === 'function') context.waitUntil(task);
  }

  return json({ ok: true, saved: result.saved.length, count: result.count });
}
