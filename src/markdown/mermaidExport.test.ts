import {test} from "node:test";
import assert from "node:assert/strict";
import {inlineMermaidSvgStylesForWechat} from "./mermaidExport.ts";

test("导出 Mermaid SVG 时移除预览复用缓存属性", () => {
  const html = [
    '<pre class="mermaid" data-mermaid-rendered-source="graph TD&#10;A--&gt;B">',
    '<svg id="chart"><g><text>A</text></g></svg>',
    "</pre>",
  ].join("");

  const result = inlineMermaidSvgStylesForWechat(html, () => ({}));

  assert.doesNotMatch(result, /data-mermaid-rendered-source/);
  assert.match(result, /<svg id="chart"/);
});

test("导出 Mermaid SVG 前内联关键样式，避免微信清洗 style 后丢字和丢色", () => {
  const html = [
    '<pre class="mermaid" data-line="1">',
    '<svg class="flowchart" viewBox="0 0 120 60">',
    "<style>.node{fill:#fff}</style>",
    '<g class="node">',
    '<rect class="basic label-container" x="4" y="4" width="80" height="32"></rect>',
    '<text class="nodeLabel" x="12" y="24">标题</text>',
    '<path class="flowchart-link" d="M84 20L112 20"></path>',
    "</g>",
    "</svg>",
    "</pre>",
  ].join("");

  const result = inlineMermaidSvgStylesForWechat(html, (element) => {
    if (element.tagName.toLowerCase() === "rect") {
      return {fill: "#ffffff", stroke: "#333333", strokeWidth: "2px"};
    }
    if (element.tagName.toLowerCase() === "text") {
      return {fill: "#111111", fontFamily: "Arial", fontSize: "16px", fontWeight: "400"};
    }
    if (element.tagName.toLowerCase() === "path") {
      return {fill: "none", stroke: "#333333", strokeWidth: "2px"};
    }
    return {};
  });

  assert.match(result, /<svg[^>]*style="[^"]*max-width: 100%;[^"]*height: auto;/);
  assert.match(result, /<rect[^>]*fill="#ffffff"[^>]*stroke="#333333"[^>]*stroke-width="2px"/);
  assert.match(result, /<text[^>]*fill="#111111"[^>]*font-family="Arial"[^>]*font-size="16px"[^>]*font-weight="400"/);
  assert.match(result, /<path[^>]*fill="none"[^>]*stroke="#333333"[^>]*stroke-width="2px"/);
  assert.doesNotMatch(result, /<style>/);
});

test("导出 Mermaid SVG 时不会因为移除 style 节点导致样式写错元素", () => {
  const html = [
    '<pre class="mermaid">',
    "<svg>",
    "<style>.ignored{}</style>",
    "<defs><marker><path></path></marker></defs>",
    '<g><rect></rect><text>节点</text><path></path></g>',
    "</svg>",
    "</pre>",
  ].join("");

  const result = inlineMermaidSvgStylesForWechat(html, (element) => {
    const tag = element.tagName.toLowerCase();
    if (tag === "rect") return {fill: "#f8f8f8", stroke: "#333333"};
    if (tag === "text") return {fill: "#222222", fontSize: "16px"};
    if (tag === "path") return {fill: "none", stroke: "#333333"};
    return {};
  });

  const doc = new DOMParser().parseFromString(result, "text/html");
  const rect = doc.querySelector("g rect");
  const text = doc.querySelector("text");
  const edgePath = doc.querySelector("g > path");
  assert.equal(rect?.getAttribute("fill"), "#f8f8f8");
  assert.equal(text?.getAttribute("fill"), "#222222");
  assert.equal(edgePath?.getAttribute("stroke"), "#333333");
});

test("导出 Mermaid SVG 时 computed style 为空也为常见图元写入默认视觉属性", () => {
  const html = [
    '<pre class="mermaid">',
    '<svg class="flowchart">',
    "<style>.node{fill:#fff}</style>",
    '<marker><path class="arrowMarkerPath"></path></marker>',
    '<g class="edgePaths"><path class="flowchart-link"></path></g>',
    '<g class="edgeLabels"><rect class="background"></rect><text><tspan>没有</tspan></text></g>',
    '<g class="node"><rect class="basic label-container"></rect><text><tspan>节点</tspan></text></g>',
    "</svg>",
    "</pre>",
  ].join("");

  const result = inlineMermaidSvgStylesForWechat(html, () => ({}));
  const doc = new DOMParser().parseFromString(result, "text/html");

  assert.equal(doc.querySelector(".node .label-container")?.getAttribute("fill"), "#ECECFF");
  assert.equal(doc.querySelector(".node .label-container")?.getAttribute("stroke"), "#9370DB");
  assert.equal(doc.querySelector(".flowchart-link")?.getAttribute("fill"), "none");
  assert.equal(doc.querySelector(".flowchart-link")?.getAttribute("stroke"), "#333333");
  assert.equal(doc.querySelector(".arrowMarkerPath")?.getAttribute("fill"), "#333333");
  assert.equal(doc.querySelector(".edgeLabels .background")?.getAttribute("fill"), "#ffffff");
  assert.equal(doc.querySelector(".node text")?.getAttribute("fill"), "#333333");
  assert.equal(doc.querySelector(".edgeLabels text")?.getAttribute("fill"), "#333333");
});

test("导出 Mermaid SVG 时移除空 style 属性，避免微信端空样式覆盖显式属性", () => {
  const html = [
    '<pre class="mermaid">',
    "<svg>",
    '<g class="node">',
    '<rect class="label-container" style=" ; "></rect>',
    "</g>",
    '<path class="flowchart-link" style=""></path>',
    "</svg>",
    "</pre>",
  ].join("");

  const result = inlineMermaidSvgStylesForWechat(html, () => ({}));

  assert.doesNotMatch(result, /style="\s*;?\s*"/);
  assert.match(result, /<rect[^>]*fill="#ECECFF"[^>]*stroke="#9370DB"/);
  assert.match(result, /<path[^>]*fill="none"[^>]*stroke="#333333"/);
});

test("导出 Mermaid SVG 时把 foreignObject 节点标签转为可复制的 SVG text", () => {
  const html = [
    '<pre class="mermaid">',
    '<svg class="flowchart">',
    '<g class="node" transform="translate(100, 80)">',
    '<rect class="label-container" x="-60" y="-30" width="120" height="60"></rect>',
    '<g class="label" transform="translate(-50, -20)">',
    '<foreignObject width="100" height="40">',
    '<div><span>第一行</span><br><span>第二行</span></div>',
    "</foreignObject>",
    "</g>",
    "</g>",
    "</svg>",
    "</pre>",
  ].join("");

  const result = inlineMermaidSvgStylesForWechat(html, () => ({}));
  const doc = new DOMParser().parseFromString(result, "text/html");
  const text = doc.querySelector(".node .label text");
  const tspans = Array.from(doc.querySelectorAll(".node .label text tspan"));

  assert.doesNotMatch(result, /foreignObject/i);
  assert.equal(text?.getAttribute("x"), "50");
  assert.equal(text?.getAttribute("y"), "20");
  assert.equal(text?.getAttribute("text-anchor"), "middle");
  assert.equal(tspans.length, 2);
  assert.equal(tspans[0].textContent, "第一行");
  assert.equal(tspans[1].textContent, "第二行");
  assert.equal(tspans[1].getAttribute("dy"), "1.2em");
});
