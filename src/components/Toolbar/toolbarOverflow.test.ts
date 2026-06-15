import test from "node:test";
import assert from "node:assert/strict";
import {computeToolbarAvailableWidth, computeVisibleActionCount} from "./toolbarOverflow.ts";

test("工具栏可用宽度由顶栏空间决定，不受当前工具栏内容宽度影响", () => {
  const available = computeToolbarAvailableWidth({
    headerWidth: 1440,
    paddingLeft: 16,
    paddingRight: 16,
    gap: 12,
    leftMinWidth: 30,
  });

  assert.equal(available, 1366);
});

test("宽度足够时保留全部次级按钮，不显示更多", () => {
  const count = computeVisibleActionCount({
    availableWidth: 1366,
    secondaryWidths: [84, 58, 96, 58, 30],
    primaryWidths: [70, 112],
    moreWidth: 30,
  });

  assert.equal(count, 5);
});

test("宽度不足时从右侧逐步收入更多", () => {
  const count = computeVisibleActionCount({
    availableWidth: 430,
    secondaryWidths: [84, 58, 96, 58, 30],
    primaryWidths: [70, 112],
    moreWidth: 30,
  });

  assert.equal(count, 2);
});

test("导出作为导入旁边的次级按钮参与溢出计算", () => {
  const count = computeVisibleActionCount({
    availableWidth: 496,
    secondaryWidths: [84, 58, 96, 58, 30],
    primaryWidths: [70, 112],
    moreWidth: 30,
  });

  assert.equal(count, 3);
});
