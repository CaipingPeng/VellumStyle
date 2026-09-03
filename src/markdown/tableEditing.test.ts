import assert from "node:assert/strict";
import test from "node:test";
import {
  buildMarkdownTable,
  findAllMarkdownTables,
  findMarkdownTableAt,
  parseMarkdownTable,
  relocateMarkdownTable,
} from "./tableEditing.ts";

test("表格解析和生成保留对齐并转义单元格", () => {
  const parsed = parseMarkdownTable("| 姓名 | 说明 |\n| :--- | ---: |\n| 张三 | A\\|B |");
  assert.deepEqual(parsed, {
    header: ["姓名", "说明"],
    aligns: ["left", "right"],
    rows: [["张三", "A|B"]],
  });
  assert.match(buildMarkdownTable(parsed!), /A\\\|B/);
});

test("扫描时忽略代码块中的表格", () => {
  const source = "```md\n| 假 | 表 |\n| --- | --- |\n```\n\n| 真 | 表 |\n| --- | --- |\n| 1 | 2 |";
  const tables = findAllMarkdownTables(source);
  assert.equal(tables.length, 1);
  assert.match(tables[0].text, /真/);
});

test("文档上方变化后重新定位表格，表格自身变化则拒绝", () => {
  const source = "开头\n\n| A | B |\n| --- | --- |\n| 1 | 2 |";
  const stored = findMarkdownTableAt(source, source.indexOf("| A"));
  assert.ok(stored);
  const shifted = `新增\n${source}`;
  assert.equal(relocateMarkdownTable(shifted, stored)?.text, stored.text);
  assert.equal(relocateMarkdownTable(source.replace("| 1 | 2 |", "| 3 | 4 |"), stored), null);
});
