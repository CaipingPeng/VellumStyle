import {test} from "node:test";
import assert from "node:assert/strict";
import {compileModel} from "./compileModel.ts";
import type {StyleModel} from "./themeModel.ts";

// 把 CSS 解析成 {selector: {prop: value}}，比较时忽略顺序与空白
function parseRules(css: string): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {};
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css))) {
    const sel = m[1].trim();
    const decls: Record<string, string> = {};
    for (const part of m[2].split(";")) {
      const i = part.indexOf(":");
      if (i === -1) continue;
      decls[part.slice(0, i).trim()] = part.slice(i + 1).trim();
    }
    out[sel] = {...(out[sel] || {}), ...decls};
  }
  return out;
}

test("普通 keys 项编译为规则", () => {
  const models: StyleModel[] = [
    {id: "p", label: "p", styles: [
      {id: "fontSize", value: "16px", keys: [{selector: "#nice p", key: "font-size", format: null}], children: null},
      {id: "fontColor", value: "rgba(43,43,43,1)", keys: [{selector: "#nice p", key: "color", format: null}], children: null},
    ]},
  ];
  const r = parseRules(compileModel(models));
  assert.deepEqual(r["#nice p"], {"font-size": "16px", color: "rgba(43,43,43,1)"});
});

test("children 复合项递归展开", () => {
  const models: StyleModel[] = [
    {id: "h1", label: "h1", styles: [
      {id: "marginPadding", value: null, keys: null, children: [
        {id: "marginTop", value: "30px", keys: [{selector: "#nice h1", key: "margin-top", format: null}], children: null},
        {id: "marginBottom", value: "15px", keys: [{selector: "#nice h1", key: "margin-bottom", format: null}], children: null},
      ]},
    ]},
  ];
  const r = parseRules(compileModel(models));
  assert.deepEqual(r["#nice h1"], {"margin-top": "30px", "margin-bottom": "15px"});
});

test("common 项原样输出", () => {
  const models: StyleModel[] = [
    {id: "h1", label: "h1", styles: [
      {id: "common", value: "#nice h1 .prefix { display: none; }", keys: null, children: null},
    ]},
  ];
  const r = parseRules(compileModel(models));
  assert.deepEqual(r["#nice h1 .prefix"], {display: "none"});
});

test("同一 value 写多个 selector", () => {
  const models: StyleModel[] = [
    {id: "blockquote", label: "bq", styles: [
      {id: "fontColor", value: "rgba(0,0,0,1)", keys: [
        {selector: "#nice blockquote p", key: "color", format: null},
        {selector: "#nice .custom-blockquote p", key: "color", format: null},
      ], children: null},
    ]},
  ];
  const r = parseRules(compileModel(models));
  assert.equal(r["#nice blockquote p"].color, "rgba(0,0,0,1)");
  assert.equal(r["#nice .custom-blockquote p"].color, "rgba(0,0,0,1)");
});
