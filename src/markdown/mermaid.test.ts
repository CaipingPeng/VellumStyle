import {test} from "node:test";
import assert from "node:assert/strict";
import {mountMermaidSvgStylesForRuntime} from "./mermaid.ts";

test("Mermaid SVG 样式同步到页面 head，保证 Tauri release WebView 能应用官方样式", () => {
  document.head.innerHTML = '<style nonce="tauri-nonce"></style>';
  const wrapper = document.createElement("div");
  wrapper.innerHTML = [
    '<svg id="mermaid-test" xmlns="http://www.w3.org/2000/svg">',
    "<style>#mermaid-test .node rect{fill:#ECECFF;stroke:#9370DB;}</style>",
    '<g class="node"><rect></rect></g>',
    "</svg>",
  ].join("");

  const svg = wrapper.querySelector<SVGElement>("svg");
  assert.ok(svg);

  mountMermaidSvgStylesForRuntime(svg);

  const mounted = document.head.querySelector<HTMLStyleElement>('style[data-vellumstyle-mermaid-style="mermaid-test"]');
  assert.equal(mounted?.textContent, "#mermaid-test .node rect{fill:#ECECFF;stroke:#9370DB;}");
  assert.equal(mounted?.nonce, "tauri-nonce");
});
