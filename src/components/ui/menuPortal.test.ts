import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

test("菜单弹层通过 portal 渲染，避免被顶栏 overflow-hidden 裁剪", async () => {
  const source = await readFile(new URL("./Menu.tsx", import.meta.url), "utf8");

  assert.match(source, /createPortal/);
  assert.match(source, /getBoundingClientRect/);
  assert.match(source, /position: "fixed"/);
  assert.doesNotMatch(source, /"absolute top-\[34px\] z-10/);
});
