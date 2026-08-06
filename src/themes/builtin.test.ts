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
