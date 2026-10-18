#!/usr/bin/env python3
"""从容 · 社区公园智慧健身研究
静态站点托管 + 数据回收后端（仅用 Python 标准库）。

接口：
  POST /api/submit           前端提交一批事件（无需口令，只写入不读取）
  GET  /api/status           回收条数（不含任何作答内容）
  GET  /api/records?token=   读取全部事件（需研究者口令）
  GET  /api/export.csv?token= 宽表 CSV（需口令）
  GET  /api/export-raw.json?token= 原始 JSONL（需口令）

数据落盘：data/records.jsonl（每行一条 JSON，追加写，不去重、不覆盖）。
可选：设置环境变量 WEBHOOK_URL 后，每条记录会同步转发一份到该地址（异地备份）。
可选：设置 RESEARCH_TOKEN 覆盖研究者口令，默认读取 data/token.txt（首次自动写入 congrong2026）。
"""
import csv
import io
import json
import os
import sys
import threading
import urllib.request
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

BASE = os.path.dirname(os.path.abspath(__file__))
# 数据默认写在项目目录之外（~/.congrong-fitness），避免被静态托管把口令/记录当文件公开下载
DATA_DIR = os.environ.get('DATA_DIR') or os.path.join(os.path.expanduser('~'), '.congrong-fitness')
os.makedirs(DATA_DIR, exist_ok=True)
RECORDS = os.path.join(DATA_DIR, 'records.jsonl')
TOKEN_FILE = os.path.join(DATA_DIR, 'token.txt')
PORT = int(os.environ.get('PORT', '3000'))
DEFAULT_TOKEN = 'congrong2026'
WEBHOOK = os.environ.get('WEBHOOK_URL', '').strip()
LOCK = threading.Lock()

MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.txt': 'text/plain; charset=utf-8',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.pdf': 'application/pdf',
}
SAFE_FILES = {'index.html', 'app.js', 'style.css', 'assets.html', 'assets.css', 'README.md'}

# 条件字典：代码 -> (条件名称, 设置复杂度, 反馈方式)
CONDITIONS = {
    'A': ('简单 × 私密', '简单', '私密'),
    'B': ('复杂 × 私密', '复杂', '私密'),
    'C': ('简单 × 公开', '简单', '公开'),
    'D': ('复杂 × 公开', '复杂', '公开'),
}
STATUS_CN = {'not-started': '未开始', 'in-progress': '进行中', 'complete': '已完成', 'withdrawn': '已退出'}

# 题项原文（须与 app.js 中的 S1 / S2 保持一致）
S1_ITEMS = [
    '我能在触摸屏上找到需要的功能。', '我能用屏幕上的键盘打字。', '我能把手机或平板的声音调大、调小。',
    '我能把手机或平板连上无线网络，也就是 Wi-Fi。', '我能把手机或平板上的字调大、调小。', '我能把手机或平板的屏幕调亮、调暗。',
    '使用这项功能，能帮助我练得更好。', '使用这项功能，能帮助我达到锻炼的目的。', '总的来说，这项功能对我的锻炼有用。',
    '学会使用这项功能，对我来说很容易。', '我很容易让这项功能完成我想做的操作。', '使用这项功能时，我容易明白该怎样操作。',
    '总的来说，这项功能用起来很容易。', '旁边的人能看到或听到我的运动结果。', '旁边的人能知道这些运动结果是我的。',
    '我担心别人从运动结果中，发现我练得不好的地方。', '我担心别人根据运动结果，挑我的毛病。', '我担心这些运动结果，会给别人留下不好的印象。',
    '从这些结果中找出重要的内容，对我来说很费劲。', '器材这样显示或播报结果，让我不容易弄明白。', '把这些结果联系起来，弄明白自己练得怎么样，对我来说很难。',
    '以后有机会，我打算继续使用这项功能。', '以后有机会，我认为自己还会继续使用这项功能。',
]
S2_ITEMS = [
    '完成刚才的屏幕设置，需要我花很多心力。', '刚才的设置步骤，让我不容易弄明白。', '我需要记住很多操作内容，才能完成设置。',
    '我担心别人从刚才的运动结果中，发现我练得不好的地方。', '我担心别人根据刚才的运动结果，挑我的毛病。', '我担心刚才的运动结果，会给别人留下不好的印象。',
    '以后有机会，我打算继续使用刚才这种智慧反馈。', '以后有机会，我认为自己还会继续使用刚才这种智慧反馈。',
    '刚才反馈时，旁边的人能看到或听到我的运动结果。', '旁边的人能知道刚才这些运动结果是我的。',
    '刚才的屏幕操作步骤比较复杂。', '刚才我觉得有人在关注我的表现。',
]
# 维度区间：(起, 止, 维度, 是否反向计分)
S1_DIMS = [(1, 6, '日常数字操作', False), (7, 9, '有用性', False), (10, 13, '易用性', False),
           (14, 15, '结果公开与可识别', False), (16, 18, '担心被评价', False), (19, 21, '理解结果的难易', True),
           (22, 23, '继续使用意愿', False)]
S2_DIMS = [(1, 3, '设置认知负荷', True), (4, 6, '担心被评价', False), (7, 8, '继续使用意愿', False),
           (9, 10, '结果公开与可识别', False), (11, 11, '设置复杂度感知', True), (12, 12, '被关注感', False)]


def dim_of(dims, n):
    for a, b, name, rev in dims:
        if a <= n <= b:
            return name, rev
    return '', False


def load_token():
    tok = os.environ.get('RESEARCH_TOKEN', '').strip()
    if tok:
        return tok
    if os.path.exists(TOKEN_FILE):
        with open(TOKEN_FILE, encoding='utf-8') as f:
            return f.read().strip() or DEFAULT_TOKEN
    return DEFAULT_TOKEN


def load_webhook():
    if WEBHOOK:
        return WEBHOOK
    path = os.path.join(DATA_DIR, 'webhook.txt')
    if os.path.exists(path):
        with open(path, encoding='utf-8') as f:
            return f.read().strip()
    return ''


def append_records(items):
    saved = []
    with LOCK:
        with open(RECORDS, 'a', encoding='utf-8') as f:
            for rec in items:
                rec = dict(rec)
                rec['receivedAt'] = datetime.now(timezone.utc).isoformat()
                f.write(json.dumps(rec, ensure_ascii=False) + '\n')
                saved.append(rec)
    hook = load_webhook()
    if hook:
        for rec in saved:
            try:
                data = json.dumps(rec, ensure_ascii=False).encode('utf-8')
                req = urllib.request.Request(hook, data=data,
                                             headers={'Content-Type': 'application/json; charset=utf-8'})
                threading.Thread(target=lambda r=req: _post_webhook(r), daemon=True).start()
            except Exception as exc:  # noqa: BLE001
                print('webhook prepare failed:', exc, file=sys.stderr)
    return saved


def _post_webhook(req):
    try:
        urllib.request.urlopen(req, timeout=8).read()
    except Exception as exc:  # noqa: BLE001
        print('webhook post failed:', exc, file=sys.stderr)


def read_records():
    if not os.path.exists(RECORDS):
        return []
    out = []
    with open(RECORDS, encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                out.append(json.loads(line))
            except ValueError:
                continue
    return out


def count_records():
    if not os.path.exists(RECORDS):
        return 0
    with open(RECORDS, encoding='utf-8') as f:
        return sum(1 for line in f if line.strip())


def latest_by_person(records):
    latest = {}
    for r in records:
        pid, person = r.get('id'), r.get('person')
        if not pid or not isinstance(person, dict):
            continue
        prev = latest.get(pid)
        if prev is None or r.get('receivedAt', '') >= prev.get('receivedAt', ''):
            latest[pid] = r
    return latest


def cell(v):
    return '' if v is None else v


COMMON_HEADER = ['匿名编号', '研究', '次序', '条件代码', '条件名称', '设置复杂度', '反馈方式',
                 '计划观察者', '实际观察者', '观察者是否一致', '状态', '运动距离(米)', '运动秒数', '排名', '最后回收时间']


def _pad(values, length):
    out = [cell(v) for v in (values or [])][:length]
    return out + [''] * (length - len(out))


def collect_rows(records):
    """返回 (宽表行, Study1 分表行, Study2 分表行)。"""
    wide, s1_rows, s2_rows = [], [], []
    for pid, r in sorted(latest_by_person(records).items()):
        p = r.get('person') or {}
        s1 = p.get('s1') or {}
        s2 = p.get('s2') or {}
        stamp = r.get('receivedAt', '')
        common1 = [pid, 'Study 1', '—', '', '', '', '', '', '', '—',
                   STATUS_CN.get(s1.get('status', ''), s1.get('status', '')), '', '', '', stamp]
        ans1 = _pad(s1.get('answers'), 23)
        s1_rows.append(common1 + ans1)
        wide.append(common1 + ans1 + [''] * 12)
        for i, part in enumerate(s2.get('parts') or []):
            code = part.get('condition', '')
            name, simple, public = CONDITIONS.get(code, ('', '', ''))
            oa = part.get('observerActual')
            planned = bool(part.get('observerPlanned'))
            common2 = [pid, 'Study 2', f'Study 2-{i + 1}', code, name, simple, public,
                       '有' if planned else '无',
                       '未记录' if oa is None else ('有' if oa else '无'),
                       '—' if oa is None else ('一致' if bool(oa) == planned else '不一致'),
                       STATUS_CN.get(part.get('status', ''), part.get('status', '')),
                       cell(part.get('meters')), cell(part.get('seconds')), cell(part.get('rank')), stamp]
            ans2 = _pad(part.get('answers'), 12)
            s2_rows.append(common2 + ans2)
            wide.append(common2 + [''] * 23 + ans2)
    return wide, s1_rows, s2_rows


def build_csv(records):
    wide, _, _ = collect_rows(records)
    header = COMMON_HEADER + [f'S1-Q{i}' for i in range(1, 24)] + [f'S2-Q{i}' for i in range(1, 13)]
    buf = io.StringIO()
    csv.writer(buf).writerows([header] + wide)
    return '\ufeff' + buf.getvalue()


def build_items_csv():
    rows = [['研究', '题号', '题项标签', '作答时点', '所属维度', '是否反向计分', '计分方式', '题目原文']]
    for i, text in enumerate(S1_ITEMS, start=1):
        name, rev = dim_of(S1_DIMS, i)
        rows.append(['Study 1', i, f'S1-Q{i}', '问卷中作答', name, '是' if rev else '否',
                     '反向题：分析时用 6 − 原始分' if rev else '正向题：1–5 直接计分', text])
    for i, text in enumerate(S2_ITEMS, start=1):
        name, rev = dim_of(S2_DIMS, i)
        rows.append(['Study 2', i, f'S2-Q{i}', '设置完成后、运动前' if i <= 3 else '运动反馈完成后', name,
                     '是' if rev else '否',
                     '反向题：分析时用 6 − 原始分' if rev else '正向题：1–5 直接计分', text])
    rows.append(['', '', '', '', '', '', '计分：1=非常不同意，2=不同意，3=说不清，4=同意，5=非常同意', ''])
    rows.append(['', '', '', '', '', '', '说明：Study 1 与 Study 2 题号体系各自独立，S1-Q1 与 S2-Q1 不是同一道题，不能横向比较', ''])
    buf = io.StringIO()
    csv.writer(buf).writerows(rows)
    return '\ufeff' + buf.getvalue()


def build_xlsx(records):
    """三张表：Study 1 宽表 / Study 2 宽表 / 题项对照表。缺少 openpyxl 时返回 None。"""
    try:
        from openpyxl import Workbook
        from openpyxl.styles import Font
    except ImportError:
        return None
    _, s1_rows, s2_rows = collect_rows(records)
    items = list(csv.reader(io.StringIO(build_items_csv().lstrip('\ufeff'))))

    wb = Workbook()
    ws1 = wb.active
    ws1.title = 'Study 1 宽表'
    ws1.append(COMMON_HEADER + [f'S1-Q{i}' for i in range(1, 24)])
    for r in s1_rows:
        ws1.append(r)
    ws2 = wb.create_sheet('Study 2 宽表')
    ws2.append(COMMON_HEADER + [f'S2-Q{i}' for i in range(1, 13)])
    for r in s2_rows:
        ws2.append(r)
    ws3 = wb.create_sheet('题项对照表')
    for r in items:
        ws3.append(r)
    for ws in (ws1, ws2, ws3):
        for c in ws[1]:
            c.font = Font(bold=True)
        ws.freeze_panes = 'A2'
    out = io.BytesIO()
    wb.save(out)
    return out.getvalue()


class Handler(BaseHTTPRequestHandler):
    server_version = 'CongrongServer/1.0'

    def log_message(self, fmt, *args):
        sys.stderr.write('%s - %s\n' % (self.address_string(), fmt % args))

    def _send(self, code, body, ctype='application/json; charset=utf-8', extra=None):
        if isinstance(body, str):
            body = body.encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        # 允许部署在别的域名上的前端（如 EdgeOne）直接提交与读取数据
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        for k, v in (extra or {}):
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)

    def _json(self, code, obj):
        self._send(code, json.dumps(obj, ensure_ascii=False))

    def do_OPTIONS(self):
        self._send(204, b'', 'text/plain; charset=utf-8')

    def do_GET(self):
        url = urlparse(self.path)
        path, query = url.path, parse_qs(url.query)
        if path == '/api/status':
            self._json(200, {'ok': True, 'count': count_records()})
            return
        if path in ('/api/records', '/api/export.csv', '/api/export-items.csv',
                    '/api/export.xlsx', '/api/export-raw.json', '/api/export'):
            token = (query.get('token') or [''])[0]
            if token != load_token():
                self._json(401, {'ok': False, 'error': '研究者口令不正确。'})
                return
            # 统一导出入口（与 EdgeOne Edge Functions 版共用同一套前端链接）
            if path == '/api/export':
                fmt = (query.get('format') or ['wide'])[0].lower()
                stamp = datetime.now().strftime('%Y%m%d-%H%M')
                if fmt == 'items':
                    self._send(200, build_items_csv(), 'text/csv; charset=utf-8',
                               [('Content-Disposition', f'attachment; filename="congrong-items-{stamp}.csv"')])
                    return
                records = read_records()
                if fmt in ('json', 'raw'):
                    self._send(200, json.dumps(records, ensure_ascii=False, indent=2),
                               'application/json; charset=utf-8',
                               [('Content-Disposition', f'attachment; filename="congrong-raw-{stamp}.json"')])
                    return
                if fmt in ('xlsx', 'excel'):
                    data = build_xlsx(records)
                    if data is None:
                        self._json(500, {'ok': False, 'error': '服务器未安装 openpyxl，请改用 CSV 下载。'})
                        return
                    self._send(200, data,
                               'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                               [('Content-Disposition', f'attachment; filename="congrong-data-{stamp}.xlsx"')])
                    return
                self._send(200, build_csv(records), 'text/csv; charset=utf-8',
                           [('Content-Disposition', f'attachment; filename="congrong-records-{stamp}.csv"')])
                return
            records = read_records()
            stamp = datetime.now().strftime('%Y%m%d-%H%M')
            if path == '/api/records':
                self._json(200, {'ok': True, 'count': len(records), 'records': records[-2000:]})
                return
            if path == '/api/export-items.csv':
                self._send(200, build_items_csv(), 'text/csv; charset=utf-8',
                           [('Content-Disposition', f'attachment; filename="congrong-items-{stamp}.csv"')])
                return
            if path == '/api/export.xlsx':
                data = build_xlsx(records)
                if data is None:
                    self._json(500, {'ok': False, 'error': '服务器未安装 openpyxl，请改用 CSV 下载。'})
                    return
                self._send(200, data,
                           'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                           [('Content-Disposition', f'attachment; filename="congrong-data-{stamp}.xlsx"')])
                return
            if path == '/api/export.csv':
                self._send(200, build_csv(records), 'text/csv; charset=utf-8',
                           [('Content-Disposition', f'attachment; filename="congrong-records-{stamp}.csv"')])
                return
            self._send(200, json.dumps(records, ensure_ascii=False, indent=2),
                       'application/json; charset=utf-8',
                       [('Content-Disposition', f'attachment; filename="congrong-raw-{stamp}.json"')])
            return
        if path.startswith('/api/'):
            self._json(404, {'ok': False, 'error': '接口不存在。'})
            return
        self._serve_static(path)

    def _serve_static(self, path):
        name = 'index.html' if path in ('', '/') else path.lstrip('/')
        if name not in SAFE_FILES:
            self._send(404, '未找到该页面。', 'text/plain; charset=utf-8')
            return
        full = os.path.join(BASE, name)
        if not os.path.isfile(full):
            self._send(404, '未找到该页面。', 'text/plain; charset=utf-8')
            return
        ext = os.path.splitext(full)[1].lower()
        with open(full, 'rb') as f:
            self._send(200, f.read(), MIME.get(ext, 'application/octet-stream'))

    def do_POST(self):
        if urlparse(self.path).path != '/api/submit':
            self._json(404, {'ok': False, 'error': '接口不存在。'})
            return
        try:
            length = int(self.headers.get('Content-Length') or 0)
        except ValueError:
            length = 0
        if length <= 0 or length > 4_000_000:
            self._json(400, {'ok': False, 'error': '提交内容为空或过大。'})
            return
        try:
            payload = json.loads(self.rfile.read(length).decode('utf-8'))
        except (ValueError, UnicodeDecodeError):
            self._json(400, {'ok': False, 'error': '提交内容不是合法 JSON。'})
            return
        items = payload.get('records') if isinstance(payload, dict) else payload
        if isinstance(items, dict):
            items = [items]
        if not isinstance(items, list) or not items:
            self._json(400, {'ok': False, 'error': '没有可保存的记录。'})
            return
        clean = []
        for it in items[:200]:
            if not isinstance(it, dict):
                continue
            it.pop('receivedAt', None)
            if not it.get('id'):
                continue
            clean.append(it)
        if not clean:
            self._json(400, {'ok': False, 'error': '记录缺少匿名编号。'})
            return
        try:
            saved = append_records(clean)
        except OSError as exc:
            self._json(500, {'ok': False, 'error': f'写入失败：{exc}'})
            return
        self._json(200, {'ok': True, 'saved': len(saved), 'count': count_records()})


def main():
    print(f'从容研究服务启动：0.0.0.0:{PORT}  数据文件：{RECORDS}', flush=True)
    print(f'研究者口令：{load_token()}（设置环境变量 RESEARCH_TOKEN 可修改）', flush=True)
    ThreadingHTTPServer.daemon_threads = True
    ThreadingHTTPServer(('0.0.0.0', PORT), Handler).serve_forever()


if __name__ == '__main__':
    main()
