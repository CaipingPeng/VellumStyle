import {test} from "node:test";
import assert from "node:assert/strict";
import {FONT_PANEL_GAP, panelPositionForRect, viewportRectOf} from "./fontSizePanel.ts";

const SIZE = {width: 236, height: 190};
const VIEWPORT = {width: 1200, height: 800};

test("默认贴在锚点元素下方", () => {
  const rect = {left: 300, top: 100, width: 400, height: 40};
  const {left, top} = panelPositionForRect(rect, SIZE, VIEWPORT.width, VIEWPORT.height);
  assert.equal(left, 300);
  assert.equal(top, 100 + 40 + FONT_PANEL_GAP);
});

test("下方空间不够时翻到元素上方", () => {
  const rect = {left: 300, top: 700, width: 400, height: 60};
  const {top} = panelPositionForRect(rect, SIZE, VIEWPORT.width, VIEWPORT.height);
  assert.equal(top, 700 - SIZE.height - FONT_PANEL_GAP);
});

test("左右越界时收进视口", () => {
  const right = panelPositionForRect({left: 1150, top: 100, width: 40, height: 40}, SIZE, VIEWPORT.width, VIEWPORT.height);
  assert.ok(right.left + SIZE.width <= VIEWPORT.width, `右越界：${right.left}`);
  assert.ok(right.left >= FONT_PANEL_GAP);

  const left = panelPositionForRect({left: -20, top: 100, width: 40, height: 40}, SIZE, VIEWPORT.width, VIEWPORT.height);
  assert.equal(left.left, FONT_PANEL_GAP);
});

test("窗口比面板还小时不会算出负坐标", () => {
  const {left, top} = panelPositionForRect({left: 0, top: 0, width: 10, height: 10}, SIZE, 120, 100);
  assert.equal(left, FONT_PANEL_GAP);
  assert.equal(top, FONT_PANEL_GAP);
});

test("viewportRectOf 取元素在视口里的矩形", () => {
  const element = document.createElement("div");
  document.body.appendChild(element);
  const rect = viewportRectOf(element);
  assert.deepEqual(Object.keys(rect).sort(), ["height", "left", "top", "width"]);
  assert.ok(Number.isFinite(rect.left) && Number.isFinite(rect.top));
  element.remove();
});
