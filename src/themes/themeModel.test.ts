import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync, readdirSync} from "node:fs";
import {join} from "node:path";
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

test("内置主题源文件使用短文章根选择器", () => {
  const themeFiles = [
    join(process.cwd(), "src", "themes", "default.json"),
    ...readdirSync(join(process.cwd(), "src", "themes", "presets"))
      .filter((name) => name.endsWith(".json"))
      .map((name) => join(process.cwd(), "src", "themes", "presets", name)),
  ];

  for (const file of themeFiles) {
    const text = readFileSync(file, "utf-8");
    assert.ok(!text.includes("#nice"), `${file} still contains #nice`);
    assert.ok(!text.includes("#wechat-article"), `${file} still contains #wechat-article`);
    assert.ok(text.includes("#article"), `${file} should contain #article`);
  }
});
