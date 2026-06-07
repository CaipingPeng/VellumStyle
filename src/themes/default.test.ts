import {test} from "node:test";
import assert from "node:assert/strict";
import {compileModel} from "./compileModel.ts";
import {validateModel} from "./themeModel.ts";
import defaultModel from "./default.json" with {type: "json"};

test("default.json 通过 model 校验", () => {
  assert.equal(validateModel(defaultModel), true);
});

test("default 编译出关键元素的预期视觉值", () => {
  const css = compileModel(defaultModel as never);
  assert.match(css, /#nice p \{[^}]*font-size: 16px/);
  assert.match(css, /#nice h1 \.content \{[^}]*font-size: 24px/);
  assert.match(css, /#nice a \{[^}]*color: #1e6bb8/);
});

test("default 不含草原绿主题色", () => {
  const css = compileModel(defaultModel as never);
  // 标题应为黑色，不应出现草原绿的绿色值
  assert.ok(!/76, 175, 80/.test(css), "标题不应是草原绿绿色");
});
