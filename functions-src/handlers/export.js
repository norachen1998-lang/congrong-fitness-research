export default async function onRequest(context) {
  const { request, env } = context;
  if (request.method !== 'GET') return json({ ok: false, error: '请使用 GET。' }, 405);
  const url = new URL(request.url);
  const format = (url.searchParams.get('format') || 'wide').toLowerCase();
  const token = url.searchParams.get('token') || '';
  if (token !== loadToken(env)) return json({ ok: false, error: '研究者口令不正确。' }, 401);

  const stamp = nowStamp();

  // 题项对照表是静态内容，不依赖 KV
  if (format === 'items') {
    return file(buildItemsCsv(), 'text/csv; charset=utf-8', `congrong-items-${stamp}.csv`);
  }

  const kv = getKV(env);
  if (!kv) return json({ ok: false, error: '服务器尚未绑定 KV 存储（变量名 congrong_kv）。' }, 503);

  let records;
  try {
    records = await readAll(kv);
  } catch (err) {
    return json({ ok: false, error: '读取失败：' + (err && err.message ? err.message : String(err)) }, 500);
  }

  if (format === 'json' || format === 'raw') {
    return file(JSON.stringify(records, null, 2), 'application/json; charset=utf-8', `congrong-raw-${stamp}.json`);
  }
  if (format === 'xlsx' || format === 'excel') {
    try {
      const data = buildXlsx(records);
      return file(data,
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        `congrong-data-${stamp}.xlsx`);
    } catch (err) {
      return json({ ok: false, error: '生成 Excel 失败：' + (err && err.message ? err.message : String(err)) }, 500);
    }
  }
  return file(buildWideCsv(records), 'text/csv; charset=utf-8', `congrong-records-${stamp}.csv`);
}
