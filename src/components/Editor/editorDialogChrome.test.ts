import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

test("公式快捷项通过二级菜单按分类渲染且原生按钮清除默认黑边", async () => {
  const source = await readFile(new URL("./FormulaEditorDialog.tsx", import.meta.url), "utf8");

  assert.match(source, /shortcutGridRef/);
  assert.match(source, /typesetMath\(root\)/);
  assert.match(source, /`\\\\\(\$\{snippet\}\\\\\)`/);
  assert.match(source, /onClick=\{\(\) => setDisplayMode\(false\)\} className=\{`[^`]*border-0/);
  assert.doesNotMatch(source, /id="formula-preset-group"/);
  assert.match(source, /aria-label="公式预设"/);
  assert.match(source, /aria-haspopup="menu"/);
  assert.match(source, /onMouseEnter=\{\(\) => setGroupIndex\(index\)\}/);
  assert.match(source, /FORMULA_PRESET_GROUPS\.map/);
  assert.match(source, /grid min-h-0 flex-1 grid-cols-2/);
});

test("表格操作按钮清除默认黑边且单元格使用 border-box", async () => {
  const source = await readFile(new URL("./TableEditorDialog.tsx", import.meta.url), "utf8");

  for (const title of ["切换对齐方式", "删除此列", "删除此行"]) {
    const button = source.split(`title=\"${title}\"`)[1]?.split("</button>")[0] ?? "";
    assert.match(button, /border-0/, `${title} 应清除浏览器默认边框`);
  }
  assert.equal((source.match(/className=\"box-border h-8 min-w-0 w-full/g) ?? []).length, 2);
  assert.match(source, /group-hover:opacity-100 group-focus-within:opacity-100/);
});

test("表格按行列就地插入，不保留顶部说明和底部全局添加按钮", async () => {
  const source = await readFile(new URL("./TableEditorDialog.tsx", import.meta.url), "utf8");

  assert.doesNotMatch(source, /点击列标题上方图标切换对齐方式/);
  assert.doesNotMatch(source, /onClick=\{addRow\}/);
  assert.doesNotMatch(source, /onClick=\{addColumn\}/);
  assert.match(source, /在上方插入行/);
  assert.match(source, /在下方插入行/);
  assert.match(source, /在左侧插入列/);
  assert.match(source, /在右侧插入列/);
});

test("新表格先通过 Word 式微缩网格选择尺寸，再显示单元格编辑器", async () => {
  const source = await readFile(new URL("./TableEditorDialog.tsx", import.meta.url), "utf8");

  assert.match(source, /const SIZE_PICKER_ROWS = 10/);
  assert.match(source, /const SIZE_PICKER_COLUMNS = 10/);
  assert.match(source, /aria-label="选择表格尺寸"/);
  assert.match(source, /onMouseEnter=\{\(\) => setHoveredSize\(size\)\}/);
  assert.match(source, /onClick=\{\(\) => selectTableSize\(size\)\}/);
  assert.match(source, /\{!tableReady \? \(/);
  assert.match(source, /disabled=\{!tableReady\}/);
});

test("表格使用紧凑默认列宽并支持拖动列分隔条调整宽度", async () => {
  const source = await readFile(new URL("./TableEditorDialog.tsx", import.meta.url), "utf8");

  assert.match(source, /const DEFAULT_COLUMN_WIDTH = 96/);
  assert.match(source, /onPointerDown=\{\(event\) => startColumnResize\(event, column\)\}/);
  assert.match(source, /role="separator"/);
  assert.match(source, /cursor-col-resize/);
  assert.match(source, /`\$\{hoveredSize\.rows\} 行 × \$\{hoveredSize\.columns\} 列`/);
});

test("公式输入示例在运行时只包含一个反斜杠", async () => {
  const source = await readFile(new URL("./FormulaEditorDialog.tsx", import.meta.url), "utf8");

  assert.match(source, /placeholder=\{\"例如：\\\\frac\{a\}\{b\}\"\}/);
  assert.doesNotMatch(source, /placeholder="例如：\\\\frac/);
});
