import {test} from "node:test";
import assert from "node:assert/strict";
import {mountMermaidSvgStylesForRuntime, reuseRenderedMermaidCharts} from "./mermaid.ts";

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

test("下一次预览刷新复用未变更的 Mermaid SVG，避免先回退成源码块再异步重绘", () => {
  const source = "graph TD\n  A[开始] --> B[结束]";
  const currentRoot = document.createElement("section");
  currentRoot.innerHTML = [
    '<pre class="mermaid" data-mermaid-rendered-source="graph TD&#10;  A[开始] --&gt; B[结束]">',
    '<svg id="mermaid-stable" xmlns="http://www.w3.org/2000/svg">',
    '<style>#mermaid-stable .node rect{fill:#fff;}</style>',
    "<g><text>开始</text></g>",
    "</svg>",
    "</pre>",
  ].join("");

  const nextHtml = [
    "<p>编辑了别处的文字</p>",
    '<pre class="mermaid" data-mermaid-source="true">',
    "graph TD\n  A[开始] --&gt; B[结束]",
    "</pre>",
  ].join("");

  const reused = reuseRenderedMermaidCharts(nextHtml, currentRoot);
  const reusedDoc = new DOMParser().parseFromString(reused, "text/html");
  const reusedChart = reusedDoc.querySelector("pre.mermaid");

  assert.match(reused, /<svg id="mermaid-stable"/);
  assert.equal(reusedChart?.getAttribute("data-mermaid-rendered-source"), source);
  assert.doesNotMatch(reused, /data-mermaid-source="true"/);
  assert.doesNotMatch(reused, /<pre class="mermaid" data-mermaid-source="true">graph TD/);
  assert.equal(source, currentRoot.querySelector("pre")?.getAttribute("data-mermaid-rendered-source"));
});
