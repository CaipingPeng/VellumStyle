import {test} from "node:test";
import assert from "node:assert/strict";
import {validateModel, type StyleModel} from "./themeModel.ts";

test("合法 model 通过校验", () => {
  const m: StyleModel[] = [
    {id: "p", label: "段落", styles: [
      {id: "fontSize", value: "16px", keys: [{selector: "#nice p", key: "font-size", format: null}], children: null},
    ]},
  ];
  assert.equal(validateModel(m), true);
});

test("非数组返回 false", () => {
  assert.equal(validateModel({} as unknown), false);
});

test("缺 id/styles 的项返回 false", () => {
  assert.equal(validateModel([{label: "x"}] as unknown), false);
});
