# 从容 · 社区公园智慧健身研究（网页原型，含数据回收）

已从「纯本机暂存」升级为**可真正回收数据**的版本。同一套前端代码支持两种部署方式：

| 部署方式 | 后端 | 数据落在哪 |
| --- | --- | --- |
| **EdgeOne Makers**（推荐，线上链接） | `edge-functions/`（Edge Functions，零依赖） | EdgeOne KV 命名空间 |
| **自托管 / 本地** | `server.py`（Python 标准库） | `data/records.jsonl` 文件 |

两种方式的接口与导出格式完全一致，前端无需改动。

## 目录

| 路径 | 作用 |
| --- | --- |
| `index.html` / `app.js` / `style.css` | 参与者与研究者双界面 |
| `assets.html` / `assets.css` | 网页素材板 |
| `edge-functions/api/*.js` | EdgeOne 线上后端（submit / status / records / export），自动生成 |
| `functions-src/` | 上面这些函数的源码（lib.js + handlers/），改这里 |
| `build-functions.mjs` | 把源码拼成自包含函数文件：`node build-functions.mjs` |
| `tools/test-functions.mjs` | 本地用内存模拟 KV 跑通四个接口：`node tools/test-functions.mjs` |
| `server.py` | 自托管 Python 后端（静态托管 + 同样四个接口） |
| `data/records.jsonl` | 自托管版回收到的原始记录（每行一条 JSON，追加写） |
| `data/token.txt` | 自托管版研究者口令，默认 `congrong2026`，请自行修改 |
| `data/webhook.txt` | 可选：填一个接收 JSON 的 Webhook，每条记录同步转发一份做异地备份 |

> 边缘运行时不支持跨文件 import，也不支持 npm 包，所以每个函数文件都由 `build-functions.mjs` 拼成自包含文件。改完 `functions-src/` 记得重新生成。

## 本地启动（自托管版）

```bash
python3 server.py          # 默认 3000 端口，可用 PORT=xxxx 指定
```

打开 `http://localhost:3000/`。Study 1 直达入口是 `?direct=study1`。

## 部署到 EdgeOne（线上链接）

1. 在 [EdgeOne 控制台](https://console.cloud.tencent.com/edgeone/pages) 创建 Pages 项目；
2. **绑定 KV 命名空间**（必需，否则数据无处可存）：
   控制台 → 项目 → KV 存储 → 新建命名空间 → 绑定到项目，**变量名填 `congrong_kv`**。
   若用了别的名字，在「环境变量」里设 `KV_BINDING` 为该名字；
3. 可选：环境变量 `RESEARCH_TOKEN` 改研究者口令（默认 `congrong2026`）、`WEBHOOK_URL` 填转发地址；
4. 部署（二选一）：
   - 命令行：`edgeone makers deploy -n <项目名> -t <API Token>`
   - 或把代码推到 Git 仓库，在控制台「从 Git 导入」，后续推送自动重新构建。

## 数据是怎么回收的

1. 参与者每答一题，前端会（防抖 1.2 秒）把当前进度整体快照 `POST /api/submit` 上传；
2. Study 1 提交、Study 2 每次体验完成、退出研究，会额外上传一条 `complete` / `withdraw` 事件；
3. 断网时事件先排进本机 `localStorage` 队列，页面底部显示「待上传 N 条」，联网后自动补传，也可在研究者端点「立即上传本机队列」；
4. 服务端按事件保存，不去重、不覆盖，保留全过程（KV 版按分片追加，Python 版追加写文件）；
5. 研究者端「在线回收数据」页输入口令后，可查看已回收参与者、进度与最后回收时间，并下载 CSV 宽表 / 题项对照表 / Excel / 原始 JSON。

接口一览（两种部署通用）：

| 接口 | 说明 |
| --- | --- |
| `POST /api/submit` | 提交事件（无需口令，只写不读） |
| `GET /api/status` | 累计事件条数（不含作答内容） |
| `GET /api/records?token=` | 读取事件（需口令） |
| `GET /api/export?format=wide&token=` | 宽表 CSV（需口令） |
| `GET /api/export?format=items&token=` | 题项对照表 CSV（需口令） |
| `GET /api/export?format=xlsx&token=` | Excel 三张表（需口令） |
| `GET /api/export?format=json&token=` | 原始 JSON（需口令） |

自托管版还保留旧路径 `/api/export.csv`、`/api/export-items.csv`、`/api/export.xlsx`、`/api/export-raw.json`。

## 导出格式

**宽表**（每人一行 Study 1 + 每次体验一行 Study 2）：`次序` 列写明 `Study 2-1 … Study 2-4`，并给出条件代码、条件名称（如「简单 × 公开」）、设置复杂度、反馈方式；观察者分「计划 / 实际 / 是否一致」三列；状态为中文（未开始 / 进行中 / 已完成 / 已退出）。题项列分两套：`S1-Q1…S1-Q23` 与 `S2-Q1…S2-Q12`，两套题号体系独立，不能横向比较。

**题项对照表**：题项标签 → 题目原文、作答时点、所属维度、是否反向计分、计分方式。

**Excel**：三张工作表 —— Study 1 宽表 / Study 2 宽表 / 题项对照表，避免两种行混在一张表里列数不齐。

反向计分题：Study 1 第 19–21 题、Study 2 第 1–3 题与第 11 题。

## 重要提醒（正式收数前必读）

- **定期导出备份**：KV 与云主机都不是长期归档。请每天导出一次 CSV/Excel；或配置 `WEBHOOK_URL`（EdgeOne 版）/ `data/webhook.txt`（自托管版）把每条记录转发一份到自己的地方。
- **KV 是最终一致的**：刚提交的记录最多 60 秒后才在所有节点可读，导出时若发现少一条，稍等再导。
- 口令只防君子：读取接口靠 `token` 参数保护，建议改成足够长的随机串（EdgeOne 版用环境变量 `RESEARCH_TOKEN`），且不要写进公开文档。
- 记录里没有姓名、电话、IP 与设备指纹，但仍属于研究数据，需按获批的伦理方案保存与销毁。
- 本页不是经批准的正式知情同意书；语音播报、耳机/扬声器、现场观察者等都无法由网页保证，须研究者现场核对。
