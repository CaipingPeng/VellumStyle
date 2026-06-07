import {test} from "node:test";
import assert from "node:assert/strict";
import {compileModel} from "./compileModel.ts";
import {validateModel} from "./themeModel.ts";
import defaultModel from "./default.json" with {type: "json"};

test("default.json 通过 model 校验", () => {
  assert.equal(validateModel(defaultModel), true);
});

test("default 编译出 GitHub 风格关键视觉值", () => {
  const css = compileModel(defaultModel as never);
  assert.match(css, /#nice p \{[^}]*font-size: 16px/);
  assert.match(css, /#nice h1 \.content \{[^}]*font-size: 30px/);
  assert.match(css, /#nice h1 \.content \{[^}]*color: rgba\(36, 41, 47, 1\)/);
  assert.match(css, /#nice a \{[^}]*color: rgba\(9, 105, 218, 1\)/);
});

test("default 不含 mdnice 主题残留（绿色/网图背景）", () => {
  const css = compileModel(defaultModel as never);
  assert.ok(!/76, 175, 80/.test(css), "不应有草原绿绿色");
  assert.ok(!/files\.mdnice\.com/.test(css), "标题不应残留 mdnice 网图背景");
});
