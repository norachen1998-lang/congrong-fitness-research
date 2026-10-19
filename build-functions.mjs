#!/usr/bin/env node
/* 把 functions-src 的共享逻辑与各 handler 拼接为自包含的 Edge Functions 文件。
 * 边缘运行时对跨文件 import 的支持不稳定，因此每个函数文件都自带全部依赖，零 npm 包。
 * 用法：node build-functions.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const base = dirname(fileURLToPath(import.meta.url));
const lib = readFileSync(join(base, 'functions-src/lib.js'), 'utf-8');
const outDir = join(base, 'edge-functions/api');
mkdirSync(outDir, { recursive: true });

const targets = ['submit', 'status', 'records', 'export', 'reset'];
for (const name of targets) {
  const handler = readFileSync(join(base, `functions-src/handlers/${name}.js`), 'utf-8');
  const banner = `/* 自动生成，请勿直接编辑：源文件在 functions-src/（运行 node build-functions.mjs 重新生成） */\n`;
  writeFileSync(join(outDir, `${name}.js`), banner + lib + '\n' + handler, 'utf-8');
  console.log('已生成 edge-functions/api/' + name + '.js');
}
