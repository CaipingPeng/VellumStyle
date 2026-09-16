import assert from "node:assert/strict";
import {after, test} from "node:test";
import {act} from "react";
import {createRoot, type Root} from "react-dom/client";
import FontSizePanel from "./FontSizePanel.tsx";
import {DEFAULT_TYPOGRAPHY, ROOT_ROLE} from "../../themes/typography.ts";

(globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true;

const ANCHOR = {left: 120, top: 200, width: 320, height: 28};

interface Handlers {
  onRoleScale: Array<[string, number]>;
  onGlobalScale: number[];
  onReset: number;
  onClose: number;
}

let host: HTMLDivElement | null = null;
let root: Root | null = null;

function unmount() {
  if (root) act(() => root!.unmount());
  host?.remove();
  root = null;
  host = null;
  // 面板走 portal 挂在 body 上，卸载后要确认没有残留，否则下个用例会点到旧面板。
  for (const stale of Array.from(document.querySelectorAll(".vs-font-size-panel"))) {
    stale.remove();
  }
}

function mount(props: Partial<Parameters<typeof FontSizePanel>[0]> = {}) {
  unmount();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  const handlers: Handlers = {onRoleScale: [], onGlobalScale: [], onReset: 0, onClose: 0};

  act(() => {
    root!.render(
      <FontSizePanel
        roleKey="h2"
        anchorRect={ANCHOR}
        typography={DEFAULT_TYPOGRAPHY}
        onRoleScale={(roleKey, scale) => handlers.onRoleScale.push([roleKey, scale])}
        onGlobalScale={(scale) => handlers.onGlobalScale.push(scale)}
        onReset={() => {
          handlers.onReset += 1;
        }}
        onClose={() => {
          handlers.onClose += 1;
        }}
        {...props}
      />,
    );
  });

  return {handlers, panel: () => document.querySelector<HTMLElement>(".vs-font-size-panel")};
}

function click(element: Element | null | undefined) {
  assert.ok(element, "按钮应存在");
  act(() => {
    element.dispatchEvent(new window.MouseEvent("click", {bubbles: true}));
  });
}

function button(label: string): HTMLButtonElement | null {
  return document.querySelector<HTMLButtonElement>(`.vs-font-size-panel button[aria-label="${label}"]`);
}

after(() => {
  unmount();
});

test("面板渲染角色名、说明与两档倍率", () => {
  const {panel} = mount();
  const el = panel();
  assert.ok(el, "应渲染面板");
  assert.match(el.textContent ?? "", /二级标题/);
  assert.match(el.textContent ?? "", /本元素/);
  assert.match(el.textContent ?? "", /全局/);
  assert.equal(document.querySelectorAll(".vs-font-size-value").length, 2);
  assert.equal(document.querySelectorAll(".vs-font-size-value")[0].textContent, "100%");
});

test("点「本元素」加减把角色倍率交给 store", () => {
  const {handlers} = mount();
  click(button("本元素放大"));
  click(button("本元素缩小"));
  assert.deepEqual(handlers.onRoleScale, [
    ["h2", 1.05],
    ["h2", 0.95],
  ]);
  // 角色倍率不该顺带改到全局
  assert.deepEqual(handlers.onGlobalScale, []);
});

test("点「全局」加减把全局倍率交给 store", () => {
  const {handlers} = mount();
  click(button("全局放大"));
  assert.deepEqual(handlers.onGlobalScale, [1.05]);
  assert.deepEqual(handlers.onRoleScale, []);
});

test("当前倍率等于默认值时「复位」按钮禁用", () => {
  mount();
  assert.equal(button("本元素恢复默认")?.disabled, true);
  assert.equal(button("全局恢复默认")?.disabled, true);
  assert.equal(button("本元素缩小")?.disabled, false);
  assert.equal(button("本元素放大")?.disabled, false);
});

test("倍率到区间边界后对应按钮禁用", () => {
  mount({typography: {global: 1.5, roles: {h2: 2}}});
  assert.equal(button("全局放大")?.disabled, true);
  assert.equal(button("本元素放大")?.disabled, true);
  assert.equal(button("全局缩小")?.disabled, false);
  assert.equal(button("本元素恢复默认")?.disabled, false);
});

test("非默认倍率下点复位交回默认值", () => {
  const {handlers} = mount({typography: {global: 1.25, roles: {h2: 1.5}}});
  click(button("本元素恢复默认"));
  click(button("全局恢复默认"));
  assert.deepEqual(handlers.onRoleScale, [["h2", 1]]);
  assert.deepEqual(handlers.onGlobalScale, [1]);
});

test("「全文」角色只显示全局控制", () => {
  mount({roleKey: ROOT_ROLE});
  assert.match(document.querySelector(".vs-font-size-panel")?.textContent ?? "", /全文排版/);
  assert.equal(document.querySelectorAll(".vs-font-size-value").length, 1);
  assert.equal(button("本元素放大"), null);
});

test("关闭按钮与 Escape 都能收起面板", () => {
  const {handlers} = mount();
  click(button("关闭字号面板"));
  assert.equal(handlers.onClose, 1);

  act(() => {
    window.dispatchEvent(new window.KeyboardEvent("keydown", {key: "Escape"}));
  });
  assert.equal(handlers.onClose, 2);
});

test("面板挂在 body 上且避开锚点元素（不覆盖被点的文字）", () => {
  const {panel} = mount();
  const el = panel()!;
  assert.equal(el.parentElement, document.body);
  const top = Number.parseFloat(el.style.top);
  assert.ok(top >= ANCHOR.top + ANCHOR.height, `面板不应压住锚点元素（top=${top}）`);
});

test("全部恢复默认交回 store", () => {
  const {handlers} = mount({typography: {global: 1.25, roles: {h2: 1.5}}});
  const resetAll = document.querySelector<HTMLButtonElement>(".vs-font-size-reset-all");
  click(resetAll);
  assert.equal(handlers.onReset, 1);
});
