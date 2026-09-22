import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {test} from "node:test";

test("点击预览即可调整排版，无需切换模式或保存全局默认", async () => {
  const [preview, toolbar, themePicker] = await Promise.all([
    readFile(new URL("../components/Preview/Preview.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/Preview/LayoutToolbar.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/Theme/ThemePickerDialog.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(preview, /onClick=\{onArticleClick\}/);
  assert.doesNotMatch(preview, /layoutMode/);
  assert.doesNotMatch(toolbar, /调整排版|完成排版|设为新文章默认/);
  assert.match(toolbar, /仅当前文章/);
  assert.doesNotMatch(themePicker, /开启“调整排版”/);
});

test("新文章不继承旧版保存过的全局排版，仍保留逐篇排版记录", async () => {
  const store = await readFile(new URL("./index.ts", import.meta.url), "utf8");
  assert.doesNotMatch(store, /defaultLayout|saveLayoutAsDefault|layoutMode/);
  assert.match(store, /state\.documentLayouts\[path\] \?\? sanitizeLayout\(\{markdownThemeId: storedThemeId\}\)/);
  assert.match(store, /JSON\.stringify\(\{version: 1, documents: documentLayouts\}\)/);
  assert.match(store, /const documentLayouts = sanitizeLayouts\(raw\.documents\)/);
});

test("最近删除入口不显示浏览器默认黑边框", async () => {
  const tree = await readFile(new URL("../components/DocTree/DocTree.tsx", import.meta.url), "utf8");
  const trashButton = tree.split("\n").find((line) => line.includes(">最近删除</button>"));
  assert.match(trashButton ?? "", /className="[^"]*border-0 bg-transparent/);
});
