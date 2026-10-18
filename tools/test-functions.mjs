#!/usr/bin/env node
/* 本地验证 Edge Functions：用内存模拟 KV，跑通 submit / status / records / export，
 * 并把导出的 xlsx 写到 /tmp 供 Python（openpyxl）校验。
 * 用法：node tools/test-functions.mjs [记录文件.jsonl]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const base = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = process.argv[2] || join(base, 'data/records.jsonl');

function makeKV() {
  const store = new Map();
  return {
    store,
    async get(k) { return store.has(k) ? store.get(k) : null; },
    async put(k, v) { store.set(k, String(v)); },
    async delete(k) { store.delete(k); },
  };
}
const kv = makeKV();
globalThis.congrong_kv = kv;

const records = readFileSync(src, 'utf-8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
const load = (n) => import(join(base, 'edge-functions/api', n + '.js')).then((m) => m.default);
const [submit, status, recordsH, exportH] = await Promise.all(
  ['submit', 'status', 'records', 'export'].map(load));

const call = async (fn, path, init) => fn({ request: new Request('https://example.com' + path, init), env: {}, waitUntil: (p) => p });

let r = await call(submit, '/api/submit', { method: 'POST', body: JSON.stringify({ records }) });
console.log('submit:', JSON.stringify(await r.json()));
r = await call(submit, '/api/submit', { method: 'POST', body: JSON.stringify({ records: records.slice(-1) }) });
console.log('submit 重复提交:', JSON.stringify(await r.json()));
r = await call(status, '/api/status');
console.log('status:', await r.text());
r = await call(recordsH, '/api/records?token=wrong');
console.log('records 错口令:', r.status, await r.text());
r = await call(recordsH, '/api/records?token=congrong2026');
const recJson = await r.json();
console.log('records 正确口令:', r.status, '条数', recJson.count);

const wide = await (await call(exportH, '/api/export?format=wide&token=congrong2026')).text();
writeFileSync('/tmp/edge-wide.csv', wide, 'utf-8');
console.log('宽表首行前 15 列:', wide.split('\r\n')[0].split(',').slice(0, 15).join(' | '));
console.log('宽表数据行:', wide.trim().split('\r\n').length - 1);
console.log('宽表 Study2 第 3 行前 11 列:', wide.trim().split('\r\n')[3].split(',').slice(0, 11).join(' | '));

const items = await (await call(exportH, '/api/export?format=items&token=congrong2026')).text();
writeFileSync('/tmp/edge-items.csv', items, 'utf-8');
console.log('题项表行数:', items.trim().split('\r\n').length);

const xr = await call(exportH, '/api/export?format=xlsx&token=congrong2026');
const buf = Buffer.from(await xr.arrayBuffer());
writeFileSync('/tmp/edge-data.xlsx', buf);
console.log('xlsx 字节数:', buf.length, '| content-type:', xr.headers.get('content-type'));

const raw = await (await call(exportH, '/api/export?format=json&token=congrong2026')).text();
console.log('原始 JSON 条数:', JSON.parse(raw).length);
console.log('KV keys:', [...kv.store.keys()].join(', '));
