# -*- coding: utf-8 -*-
"""build_deploy.py — PetTrack 构建脚本
模板/产物分离（防空转）：读 index.tpl.html 模板、写 index.html 产物。
管线：合并 js/ → app.js（node --check 语法校验）→ 注入模板占位符 → 产出 index.html。
"""
import io
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
NODE = r"C:\Users\wangcw\.workbuddy\binaries\node\versions\22.22.2-3\node.exe"

# 合并顺序不可乱序（依赖：config → utils → store/fence → algo → rsa → aircloud → app）
JS_ORDER = [
    "js/config.js",
    "js/utils.js",
    "js/pet-store.js",
    "js/fence.js",
    "js/algo/imufilter.js",
    "js/algo/stepcount.js",
    "js/algo/attitude.js",
    "js/algo/wgs2gcj.js",
    "js/algo/alg.js",
    "js/api/rsa-pkcs1.js",
    "js/api/aircloud.js",
    "js/app/map.js",
    "js/app/petstatus.js",
    "js/app/views.js",
    "js/app/main.js",
]

TPL = "index.tpl.html"
OUT = "index.html"
APP = "app.js"


def read(p):
    return io.open(os.path.join(ROOT, p), encoding="utf-8").read()


def write(p, s):
    io.open(os.path.join(ROOT, p), "w", encoding="utf-8", newline="\n").write(s)


def main():
    # 1) 合并业务 js
    parts = []
    for f in JS_ORDER:
        src = read(f)
        parts.append("/* ==== %s ==== */\n%s" % (f, src))
    app_js = "\n".join(parts)
    write(APP, app_js)
    print("[1/4] 合并 %d 个 js → %s (%d bytes)" % (len(JS_ORDER), APP, len(app_js.encode("utf-8"))))

    # 2) node --check 语法校验（app.js + leaflet）
    for check in (APP, os.path.join("vendor", "leaflet.min.js")):
        r = subprocess.run([NODE, "--check", os.path.join(ROOT, check)],
                           capture_output=True, text=True)
        if r.returncode != 0:
            print("语法校验失败: %s\n%s%s" % (check, r.stdout, r.stderr))
            sys.exit(1)
    print("[2/4] node --check 语法校验通过（app.js + leaflet.min.js）")

    # 3) 注入模板（占位符消失 = 模板被误当产物，立刻报错防二次构建空转）
    tpl = read(TPL)
    for ph in ("__LEAFLET_CSS__", "__STYLE__", "__LEAFLET_JS__", "__SCRIPT__"):
        if ph not in tpl:
            print("模板占位符缺失: %s —— 请确认构建读的是 index.tpl.html 而非产物" % ph)
            sys.exit(1)
    html = tpl
    html = html.replace("__LEAFLET_CSS__", read(os.path.join("vendor", "leaflet.css")))
    html = html.replace("__STYLE__", read(os.path.join("css", "style.css")))
    html = html.replace("__LEAFLET_JS__", read(os.path.join("vendor", "leaflet.min.js")))
    html = html.replace("__SCRIPT__", app_js)
    write(OUT, html)
    size = len(html.encode("utf-8"))
    print("[3/4] 注入模板 → %s (%d bytes ≈ %.1f KB)" % (OUT, size, size / 1024.0))
    if size > 1024 * 1024:
        print("警告：产物超过 1MB")

    # 4) 产物自检：不允许出现的外链/危险字样
    import re
    bad_patterns = [
        (r"<script\s+src=", "外链 <script src>"),
        (r"<link\s[^>]*href=", "外链 <link href>"),
        (r"\beval\s*\(", "eval("),
        (r"new\s+Function", "new Function"),
        (r"document\.write", "document.write"),
        (r"document\.cookie", "document.cookie"),
        (r"sortFunction", "sortFunction（Leaflet 补丁失效）"),
        (r"leafletjs\.com", "leafletjs.com"),
        (r"https?://(?!(api-iot\.luatos\.com|iot\.luatos\.com|www\.w3\.org|[a-z0-9{s}]+\.is\.autonavi\.com))", "未白名单外域"),
    ]
    ok = True
    for pat, label in bad_patterns:
        hits = re.findall(pat, html)
        if hits:
            print("审核红线命中 [%s] × %d" % (label, len(hits)))
            ok = False
    # 协议字面量：javascript:/data: 只允许 unicode 转义形式
    if re.search(r"(?<!\\)(javascript:|data:)", html):
        print("审核红线命中 [javascript:/data: 未转义字面量]")
        ok = False
    print("[4/4] 产物审核自检：%s" % ("通过" if ok else "未通过"))
    if not ok:
        sys.exit(2)
    print("构建完成 ✔")


if __name__ == "__main__":
    main()
