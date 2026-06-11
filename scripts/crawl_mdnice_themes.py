#!/usr/bin/env python3
# 爬取 mdnice 全部主题并存为 app 可导入的 model JSON。
# 需先抓包拿到自己的 token 和某篇文章 outId（F12 看 editor.mdnice.com 的请求）：
#   set MDNICE_TOKEN=<Bearer token 去掉 Bearer 前缀>
#   set MDNICE_OUT_ID=<某文章 writingOutId>   （可选，有默认）
# 用法:
#   python crawl_mdnice_themes.py --count   只翻页统计总数，不取详情
#   python crawl_mdnice_themes.py           正式爬取并写入 app 主题目录
import json
import os
import sys
import time
import urllib.request

TOKEN = os.environ.get("MDNICE_TOKEN", "")
OUT_ID = os.environ.get("MDNICE_OUT_ID", "4c8dce25753141d094b873cc20fa1b08")
APP_THEMES_DIR = os.path.join(
    os.environ["APPDATA"], "com.vellumstyle.desktop", "themes"
)

if not TOKEN:
    sys.exit("请先设置环境变量 MDNICE_TOKEN（mdnice 的 Bearer token，不含 'Bearer ' 前缀）")

HEADERS = {
    "accept": "application/json, text/plain, */*",
    "authorization": "Bearer " + TOKEN,
    "referer": "https://editor.mdnice.com/",
    "content-type": "application/json;charset=UTF-8",
}


def req(url, method="GET", body=None):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(url, data=data, headers=HEADERS, method=method)
    with urllib.request.urlopen(r, timeout=30) as resp:
        return json.load(resp)


def list_all_themes():
    """翻页拉全部主题元信息（themeId+name），直到某页为空。"""
    themes = []
    page = 1
    while True:
        d = req(f"https://api.mdnice.com/themes?pageSize=12&currentPage={page}")
        items = d.get("data", {}).get("themeList", [])
        if not items:
            break
        themes.extend(items)
        print(f"  page {page}: +{len(items)} (total {len(themes)})")
        page += 1
        time.sleep(0.3)
    return themes


def fetch_model(theme_id):
    """取单个主题的 styleModelList 数组。"""
    d = req(
        "https://api.mdnice.com/articles/styles",
        method="PUT",
        body={"outId": OUT_ID, "themeId": theme_id},
    )
    return d.get("data", {}).get("styleModelList")


def main():
    count_only = "--count" in sys.argv
    print("拉取主题列表...")
    themes = list_all_themes()
    print(f"共 {len(themes)} 个主题")
    if count_only:
        for t in themes:
            print(f"  {t['themeId']:>6}  {t['name']}")
        return

    os.makedirs(APP_THEMES_DIR, exist_ok=True)
    ok, fail = 0, 0
    for i, t in enumerate(themes, 1):
        tid, name = t["themeId"], t["name"]
        # 文件名（= app 主题 id）用 mdnice-{id} 保证合法唯一；中文显示名存进 name 字段。
        fname = f"mdnice-{tid}"
        path = os.path.join(APP_THEMES_DIR, fname + ".json")
        try:
            model = fetch_model(tid)
            if not isinstance(model, list) or not model:
                print(f"  [{i}/{len(themes)}] {name}({tid}) 无 model，跳过")
                fail += 1
                continue
            # {name, model} 形态：app 的 list_user_themes 会读 name 作显示名
            with open(path, "w", encoding="utf-8") as f:
                json.dump({"name": name, "model": model}, f, ensure_ascii=False)
            ok += 1
            print(f"  [{i}/{len(themes)}] {name}({tid}) -> {fname}.json")
        except Exception as e:
            fail += 1
            print(f"  [{i}/{len(themes)}] {name}({tid}) 失败: {e}")
        time.sleep(0.3)
    print(f"\n完成：成功 {ok}，失败/跳过 {fail}")
    print(f"写入目录：{APP_THEMES_DIR}")


if __name__ == "__main__":
    main()
