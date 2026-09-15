import {test} from "node:test";
import assert from "node:assert/strict";
import {readdirSync, readFileSync} from "node:fs";
import {join} from "node:path";
import {scopeCssTo} from "../components/Theme/scopeCss.ts";
import {articleRootBackgroundIsSolid} from "./articleRootBackground.ts";

const BUILTIN_DIR = join(process.cwd(), "src", "themes", "builtin");

test("内置主题 css 文件均非空且可作用域改写", () => {
  const files = readdirSync(BUILTIN_DIR).filter((f) => f.endsWith(".css"));
  assert.ok(files.length >= 1, "应有至少一个内置主题");
  for (const file of files) {
    const css = readFileSync(join(BUILTIN_DIR, file), "utf8");
    assert.ok(css.trim().length > 0, `${file} 不应为空`);
    const scoped = scopeCssTo(css, "#article");
    assert.ok(scoped.includes("#article"), `${file} 作用域后应包含 #article`);
  }
});

test("articleRootBackgroundIsSolid 判断主题根背景", () => {
  assert.equal(articleRootBackgroundIsSolid("#article { color: #333 }"), false);
  assert.equal(articleRootBackgroundIsSolid("#article { background-color: rgba(0,0,0,0) }"), false);
  assert.equal(articleRootBackgroundIsSolid("#article { background: #fff }"), true);
  assert.equal(articleRootBackgroundIsSolid("p { color: red }"), false);
});

// 回归：部分主题原先把超链接着色写成 `#article p .footnote-word`，而列表项内容是
// <li><section>（不在 <p> 里），选择器不命中，列表项中的超链接就掉回正文色
// （碧涧、紫陌、绯云、青岚、沧蓝、素简都踩过）。这里对全部内置主题断言：
// 列表项内的超链接配色必须与段落内完全一致。
test("各内置主题：列表项内的超链接着色与段落内一致", () => {
  const files = readdirSync(BUILTIN_DIR).filter((file) => file.endsWith(".css"));
  let checked = 0;

  for (const file of files) {
    const css = readFileSync(join(BUILTIN_DIR, file), "utf8");
    // 主题没给超链接单独着色时，列表项与段落都走继承色，没有可断言的差异。
    if (!css.includes(".footnote-word")) continue;

    const style = document.createElement("style");
    style.textContent = scopeCssTo(css, "#article");
    document.head.appendChild(style);

    const root = document.createElement("div");
    root.id = "article";
    root.innerHTML =
      '<ul><li><section><span class="footnote-word">术语</span><sup class="footnote-ref">[1]</sup></section></li></ul>' +
      '<p><span class="footnote-word">术语</span><sup class="footnote-ref">[1]</sup></p>';
    document.body.appendChild(root);

    const color = (selector: string) => {
      const el = root.querySelector(selector);
      assert.ok(el, `${file}: 应有节点 ${selector}`);
      return window.getComputedStyle(el).color;
    };

    assert.equal(
      color("ul li section .footnote-word"),
      color("p .footnote-word"),
      `${file}: 列表项内的链接文字掉色`,
    );
    assert.equal(
      color("ul li section .footnote-ref"),
      color("p .footnote-ref"),
      `${file}: 列表项内的链接编号掉色`,
    );

    style.remove();
    root.remove();
    checked++;
  }

  assert.ok(checked >= 6, `应至少覆盖 6 个给超链接着色的内置主题，实际只覆盖 ${checked} 个`);
});

// 回归：「墨岚」v4 起去掉整页背景，底色交给预览/微信的白底兜底。
test("「墨岚」不再设置整页背景", () => {
  const css = readFileSync(join(BUILTIN_DIR, "ink-haze.css"), "utf8");
  assert.equal(articleRootBackgroundIsSolid(scopeCssTo(css, "#article")), false);
});
