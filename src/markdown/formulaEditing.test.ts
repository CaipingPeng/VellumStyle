import assert from "node:assert/strict";
import test from "node:test";
import {findFormulaForSelection, unwrapFormula, wrapFormula} from "./formulaEditing.ts";

test("识别并规范化四种公式包裹", () => {
  assert.deepEqual(unwrapFormula("$x+1$"), {latex: "x+1", displayMode: false});
  assert.deepEqual(unwrapFormula("\\[x+1\\]"), {latex: "x+1", displayMode: true});
  assert.equal(wrapFormula(" x+1 ", true), "$$\nx+1\n$$");
});

test("根据光标或选区找到待编辑公式", () => {
  const source = "文字 $a+b$ 后面\n\n$$\nc+d\n$$";
  assert.equal(findFormulaForSelection(source, source.indexOf("a+b") + 1, source.indexOf("a+b") + 1)?.latex, "a+b");
  assert.equal(findFormulaForSelection(source, source.indexOf("c+d") + 1, source.indexOf("c+d") + 1)?.displayMode, true);
  const selected = findFormulaForSelection(source, 0, 2);
  assert.equal(selected?.source, "文字");
});

test("单行块公式、相邻公式和转义美元符号不会互相误判", () => {
  const source = "价格 \\$5，公式 $$x^2$$，相邻 $a$ $b$";
  assert.equal(findFormulaForSelection(source, source.indexOf("$5") + 1, source.indexOf("$5") + 1), null);
  assert.deepEqual(findFormulaForSelection(source, source.indexOf("x^2") + 1, source.indexOf("x^2") + 1), {
    from: source.indexOf("$$x^2$$"),
    to: source.indexOf("$$x^2$$") + 7,
    source: "$$x^2$$",
    latex: "x^2",
    displayMode: true,
  });
  assert.equal(findFormulaForSelection(source, source.indexOf("a"), source.indexOf("a"))?.latex, "a");
  assert.equal(findFormulaForSelection(source, source.lastIndexOf("b"), source.lastIndexOf("b"))?.latex, "b");
});
