/* 自动生成，请勿直接编辑：源文件在 functions-src/（运行 node build-functions.mjs 重新生成） */
/* 从容 · 社区公园智慧健身研究 —— EdgeOne Edge Functions 共享逻辑
 * 本文件与各 handler 源拼接后部署，零第三方依赖（边缘运行时不支持 npm 包）。
 * 内容与 server.py（自托管 Python 版）保持一致，导出格式逐列对齐。
 */

/* ---------- 常量字典（须与 app.js 保持一致） ---------- */
const CONDITIONS = {
  A: ['简单 × 私密', '简单', '私密'],
  B: ['复杂 × 私密', '复杂', '私密'],
  C: ['简单 × 公开', '简单', '公开'],
  D: ['复杂 × 公开', '复杂', '公开'],
};
const STATUS_CN = {
  'not-started': '未开始',
  'in-progress': '进行中',
  complete: '已完成',
  withdrawn: '已退出',
};
const S1_ITEMS = [
  '我能在触摸屏上找到需要的功能。', '我能用屏幕上的键盘打字。', '我能把手机或平板的声音调大、调小。',
  '我能把手机或平板连上无线网络，也就是 Wi-Fi。', '我能把手机或平板上的字调大、调小。', '我能把手机或平板的屏幕调亮、调暗。',
  '使用这项功能，能帮助我练得更好。', '使用这项功能，能帮助我达到锻炼的目的。', '总的来说，这项功能对我的锻炼有用。',
  '学会使用这项功能，对我来说很容易。', '我很容易让这项功能完成我想做的操作。', '使用这项功能时，我容易明白该怎样操作。',
  '总的来说，这项功能用起来很容易。', '旁边的人能看到或听到我的运动结果。', '旁边的人能知道这些运动结果是我的。',
  '我担心别人从运动结果中，发现我练得不好的地方。', '我担心别人根据运动结果，挑我的毛病。', '我担心这些运动结果，会给别人留下不好的印象。',
  '从这些结果中找出重要的内容，对我来说很费劲。', '器材这样显示或播报结果，让我不容易弄明白。', '把这些结果联系起来，弄明白自己练得怎么样，对我来说很难。',
  '以后有机会，我打算继续使用这项功能。', '以后有机会，我认为自己还会继续使用这项功能。',
];
const S2_ITEMS = [
  '完成刚才的屏幕设置，需要我花很多心力。', '刚才的设置步骤，让我不容易弄明白。', '我需要记住很多操作内容，才能完成设置。',
  '我担心别人从刚才的运动结果中，发现我练得不好的地方。', '我担心别人根据刚才的运动结果，挑我的毛病。', '我担心刚才的运动结果，会给别人留下不好的印象。',
  '以后有机会，我打算继续使用刚才这种智慧反馈。', '以后有机会，我认为自己还会继续使用刚才这种智慧反馈。',
  '刚才反馈时，旁边的人能看到或听到我的运动结果。', '旁边的人能知道刚才这些运动结果是我的。',
  '刚才的屏幕操作步骤比较复杂。', '刚才我觉得有人在关注我的表现。',
];
const S1_DIMS = [[1, 6, '日常数字操作', false], [7, 9, '有用性', false], [10, 13, '易用性', false],
  [14, 15, '结果公开与可识别', false], [16, 18, '担心被评价', false], [19, 21, '理解结果的难易', true],
  [22, 23, '继续使用意愿', false]];
const S2_DIMS = [[1, 3, '设置认知负荷', true], [4, 6, '担心被评价', false], [7, 8, '继续使用意愿', false],
  [9, 10, '结果公开与可识别', false], [11, 11, '设置复杂度感知', true], [12, 12, '被关注感', false]];

const COMMON_HEADER = ['匿名编号', '研究', '次序', '条件代码', '条件名称', '设置复杂度', '反馈方式',
  '计划观察者', '实际观察者', '观察者是否一致', '状态', '运动距离(米)', '运动秒数', '排名', '最后回收时间'];

function dimOf(dims, n) {
  for (const [a, b, name, rev] of dims) if (n >= a && n <= b) return [name, rev];
  return ['', false];
}
function cell(v) { return v === null || v === undefined ? '' : v; }

/* ---------- 基础工具 ---------- */
function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra },
  });
}
function file(body, type, filename) {
  const headers = { 'Content-Type': type, 'Cache-Control': 'no-store' };
  if (filename) headers['Content-Disposition'] = `attachment; filename="${filename}"`;
  return new Response(body, { status: 200, headers });
}
function loadToken(env) {
  const t = (env && env.RESEARCH_TOKEN ? String(env.RESEARCH_TOKEN) : '').trim();
  return t || 'congrong2026';
}
function nowStamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}-${p(d.getUTCHours())}${p(d.getUTCMinutes())}`;
}
function randId(len) {
  const ab = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  let out = '';
  for (const b of bytes) out += ab[b % ab.length];
  return out;
}

/* ---------- KV 访问 ----------
 * EdgeOne 的 KV 命名空间是「全局变量」，不是 env.KV；
 * 变量名由控制台绑定时填写，默认 congrong_kv，可用环境变量 KV_BINDING 覆盖。
 */
const KV_PREFIX = 'congrong_shard_';
const META_KEY = 'congrong_meta';
const SHARD_MAX_BYTES = 900 * 1024; // 单片上限，远低于 KV 单值 25MB 限制

function getKV(env) {
  const name = (env && env.KV_BINDING ? String(env.KV_BINDING).trim() : '') || 'congrong_kv';
  const kv = globalThis[name];
  return kv && typeof kv.get === 'function' ? kv : null;
}

async function readMeta(kv) {
  const raw = await kv.get(META_KEY);
  if (!raw) return { shards: 0, count: 0 };
  try {
    const m = JSON.parse(raw);
    return { shards: Number(m.shards) || 0, count: Number(m.count) || 0 };
  } catch { return { shards: 0, count: 0 }; }
}

async function writeMeta(kv, meta) {
  await kv.put(META_KEY, JSON.stringify(meta));
}

async function readAll(kv) {
  const meta = await readMeta(kv);
  const out = [];
  for (let i = 0; i < meta.shards; i++) {
    const raw = await kv.get(KV_PREFIX + String(i));
    if (!raw) continue;
    for (const line of String(raw).split('\n')) {
      const t = line.trim();
      if (!t) continue;
      try { out.push(JSON.parse(t)); } catch { /* 跳过损坏行 */ }
    }
  }
  return out;
}

async function appendAll(kv, items) {
  const stamped = [];
  for (const rec of items) {
    const r = Object.assign({}, rec);
    delete r.receivedAt;
    r.receivedAt = new Date().toISOString();
    stamped.push(r);
  }
  const meta = await readMeta(kv);
  let idx = Math.max(0, meta.shards - 1);
  let raw = idx >= 0 ? await kv.get(KV_PREFIX + String(idx)) : null;
  if (raw === null || raw === undefined || String(raw).length > SHARD_MAX_BYTES) {
    idx = meta.shards;
    raw = '';
  }
  let text = raw ? String(raw) : '';
  for (const r of stamped) text += (text ? '\n' : '') + JSON.stringify(r);
  await kv.put(KV_PREFIX + String(idx), text);
  const nextShards = Math.max(meta.shards, idx + 1);
  await writeMeta(kv, { shards: nextShards, count: meta.count + stamped.length });
  return { saved: stamped, count: meta.count + stamped.length };
}

/* ---------- 导出：宽表 / 分表 ---------- */
function pad(values, length) {
  const src = Array.isArray(values) ? values : [];
  const out = src.slice(0, length).map(cell);
  while (out.length < length) out.push('');
  return out;
}

function latestByPerson(records) {
  const latest = {};
  for (const r of records) {
    const pid = r && r.id;
    const person = r && r.person;
    if (!pid || !person || typeof person !== 'object') continue;
    const prev = latest[pid];
    if (!prev || String(r.receivedAt || '') >= String(prev.receivedAt || '')) latest[pid] = r;
  }
  return latest;
}

function collectRows(records) {
  const wide = [], s1Rows = [], s2Rows = [];
  const latest = latestByPerson(records);
  for (const pid of Object.keys(latest).sort()) {
    const r = latest[pid];
    const p = r.person || {};
    const s1 = p.s1 || {};
    const s2 = p.s2 || {};
    const stamp = r.receivedAt || '';
    const common1 = [pid, 'Study 1', '—', '', '', '', '', '', '', '—',
      STATUS_CN[s1.status] || s1.status || '', '', '', '', stamp];
    const ans1 = pad(s1.answers, 23);
    s1Rows.push(common1.concat(ans1));
    wide.push(common1.concat(ans1, new Array(12).fill('')));
    const parts = Array.isArray(s2.parts) ? s2.parts : [];
    parts.forEach((part, i) => {
      const code = part.condition || '';
      const [name, simple, pub] = CONDITIONS[code] || ['', '', ''];
      const oa = part.observerActual;
      const planned = !!part.observerPlanned;
      const common2 = [pid, 'Study 2', `Study 2-${i + 1}`, code, name, simple, pub,
        planned ? '有' : '无',
        oa === null || oa === undefined ? '未记录' : (oa ? '有' : '无'),
        oa === null || oa === undefined ? '—' : (!!oa === planned ? '一致' : '不一致'),
        STATUS_CN[part.status] || part.status || '',
        cell(part.meters), cell(part.seconds), cell(part.rank), stamp];
      const ans2 = pad(part.answers, 12);
      s2Rows.push(common2.concat(ans2));
      wide.push(common2.concat(new Array(23).fill(''), ans2));
    });
  }
  return { wide, s1Rows, s2Rows };
}

function csvEscape(v) {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function toCsv(rows) {
  return '\ufeff' + rows.map((r) => r.map(csvEscape).join(',')).join('\r\n') + '\r\n';
}

function wideHeader() {
  const q = [];
  for (let i = 1; i <= 23; i++) q.push(`S1-Q${i}`);
  for (let i = 1; i <= 12; i++) q.push(`S2-Q${i}`);
  return COMMON_HEADER.concat(q);
}
function buildWideCsv(records) {
  const { wide } = collectRows(records);
  return toCsv([wideHeader()].concat(wide));
}
function buildItemsCsv() {
  const rows = [['研究', '题号', '题项标签', '作答时点', '所属维度', '是否反向计分', '计分方式', '题目原文']];
  S1_ITEMS.forEach((text, i) => {
    const n = i + 1;
    const [name, rev] = dimOf(S1_DIMS, n);
    rows.push(['Study 1', n, `S1-Q${n}`, '问卷中作答', name, rev ? '是' : '否',
      rev ? '反向题：分析时用 6 − 原始分' : '正向题：1–5 直接计分', text]);
  });
  S2_ITEMS.forEach((text, i) => {
    const n = i + 1;
    const [name, rev] = dimOf(S2_DIMS, n);
    rows.push(['Study 2', n, `S2-Q${n}`, n <= 3 ? '设置完成后、运动前' : '运动反馈完成后', name, rev ? '是' : '否',
      rev ? '反向题：分析时用 6 − 原始分' : '正向题：1–5 直接计分', text]);
  });
  rows.push(['', '', '', '', '', '', '计分：1=非常不同意，2=不同意，3=说不清，4=同意，5=非常同意', '']);
  rows.push(['', '', '', '', '', '', '说明：Study 1 与 Study 2 题号体系各自独立，S1-Q1 与 S2-Q1 不是同一道题，不能横向比较', '']);
  return toCsv(rows);
}

/* ---------- 导出：零依赖 XLSX（store 模式 zip） ---------- */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function zipStore(files) {
  const enc = new TextEncoder();
  const locals = [], central = [];
  let offset = 0;
  const dosTime = 0x6000, dosDate = 0x5a21; // 固定时间戳，仅用于压缩头
  for (const f of files) {
    const nameBuf = enc.encode(f.name);
    const dataBuf = typeof f.data === 'string' ? enc.encode(f.data) : f.data;
    const crc = crc32(dataBuf);
    const lh = new Uint8Array(30 + nameBuf.length);
    const dv = new DataView(lh.buffer);
    dv.setUint32(0, 0x04034b50, true);
    dv.setUint16(4, 20, true);
    dv.setUint16(6, 0x0800, true); // UTF-8 文件名
    dv.setUint16(8, 0, true); // store
    dv.setUint16(10, dosTime, true);
    dv.setUint16(12, dosDate, true);
    dv.setUint32(14, crc, true);
    dv.setUint32(18, dataBuf.length, true);
    dv.setUint32(22, dataBuf.length, true);
    dv.setUint16(26, nameBuf.length, true);
    dv.setUint16(28, 0, true);
    lh.set(nameBuf, 30);
    locals.push(lh, dataBuf);
    const ch = new Uint8Array(46 + nameBuf.length);
    const cv = new DataView(ch.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, dosTime, true);
    cv.setUint16(14, dosDate, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, dataBuf.length, true);
    cv.setUint32(24, dataBuf.length, true);
    cv.setUint16(28, nameBuf.length, true);
    cv.setUint32(42, offset, true);
    ch.set(nameBuf, 46);
    central.push(ch);
    offset += lh.length + dataBuf.length;
  }
  const centralSize = central.reduce((s, b) => s + b.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  const parts = locals.concat(central, [eocd]);
  const total = parts.reduce((s, b) => s + b.length, 0);
  const out = new Uint8Array(total);
  let p = 0;
  for (const b of parts) { out.set(b, p); p += b.length; }
  return out;
}
function xmlEsc(s) {
  return String(s === null || s === undefined ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}
function colName(n) {
  let s = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}
function sheetXml(rows) {
  let body = '';
  rows.forEach((row, ri) => {
    const r = ri + 1;
    let cells = '';
    row.forEach((v, ci) => {
      if (v === '' || v === null || v === undefined) return;
      const ref = colName(ci + 1) + r;
      if (typeof v === 'number' && isFinite(v)) cells += `<c r="${ref}"><v>${v}</v></c>`;
      else cells += `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlEsc(v)}</t></is></c>`;
    });
    body += `<row r="${r}">${cells}</row>`;
  });
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
    + '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
    + `<sheetData>${body}</sheetData></worksheet>`;
}
function buildXlsx(records) {
  const { s1Rows, s2Rows } = collectRows(records);
  const items = buildItemsCsv().replace(/^\ufeff/, '').trim().split('\r\n').map(parseCsvLine);
  const sheets = [
    { name: 'Study 1 宽表', rows: [COMMON_HEADER.concat(Array.from({ length: 23 }, (_, i) => `S1-Q${i + 1}`))].concat(s1Rows) },
    { name: 'Study 2 宽表', rows: [COMMON_HEADER.concat(Array.from({ length: 12 }, (_, i) => `S2-Q${i + 1}`))].concat(s2Rows) },
    { name: '题项对照表', rows: items },
  ];
  const ct = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
    + '<Default Extension="xml" ContentType="application/xml"/>'
    + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
    + sheets.map((s, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')
    + '</Types>';
  const rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
    + '</Relationships>';
  const wb = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'
    + sheets.map((s, i) => `<sheet name="${xmlEsc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')
    + '</sheets></workbook>';
  const wbRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + sheets.map((s, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')
    + '</Relationships>';
  const files = [
    { name: '[Content_Types].xml', data: ct },
    { name: '_rels/.rels', data: rels },
    { name: 'xl/workbook.xml', data: wb },
    { name: 'xl/_rels/workbook.xml.rels', data: wbRels },
  ];
  sheets.forEach((s, i) => files.push({ name: `xl/worksheets/sheet${i + 1}.xml`, data: sheetXml(s.rows) }));
  return zipStore(files);
}
function parseCsvLine(line) {
  const out = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else inQ = false;
      } else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

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
