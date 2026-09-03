import assert from "node:assert/strict";
import test from "node:test";
import {FORMULA_PRESET_COUNT, FORMULA_PRESET_GROUPS} from "./formulaPresets.ts";

test("公式预设覆盖 PDF 的 3.1 至 3.19 全部分类和主要符号", () => {
  assert.equal(FORMULA_PRESET_GROUPS.length, 20);
  assert.ok(FORMULA_PRESET_COUNT >= 350, `当前仅有 ${FORMULA_PRESET_COUNT} 个预设`);
  assert.equal(new Set(FORMULA_PRESET_GROUPS.map((group) => group.id)).size, 20);
  assert.equal(FORMULA_PRESET_GROUPS.filter((group) => /^3\.\d+ /.test(group.label)).length, 19);
  assert.ok(FORMULA_PRESET_GROUPS.find((group) => group.id === "ams-negated-relations")?.items.includes("\\nLeftrightarrow"));
});

test("非数学符号使用 MathJax 数学模式可渲染的写法", () => {
  const symbols = FORMULA_PRESET_GROUPS.find((group) => group.id === "non-math")?.items;
  assert.deepEqual(symbols, ["\\dagger", "\\ddagger", "\\S", "¶", "©", "£"]);
});
