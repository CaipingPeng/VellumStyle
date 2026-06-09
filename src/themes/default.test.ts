import {test} from "node:test";
import assert from "node:assert/strict";
import {compileModel} from "./compileModel.ts";
import {validateModel} from "./themeModel.ts";
import defaultModel from "./default.json" with {type: "json"};
import happysimple from "./presets/happysimple.json" with {type: "json"};
import seeYue from "./presets/see-yue.json" with {type: "json"};

test("default.json 通过 model 校验", () => {
  assert.equal(validateModel(defaultModel), true);
});

test("default 编译出 GitHub 风格关键视觉值", () => {
  const css = compileModel(defaultModel as never);
  assert.match(css, /#nice p \{[^}]*font-size: 16px/);
  assert.match(css, /#nice h1 \.content \{[^}]*font-size: 36px/);
  assert.match(css, /#nice h1 \.content \{[^}]*color: rgba\(51, 51, 51, 1\)/);
  assert.match(css, /#nice a \{[^}]*color: rgba\(65, 131, 196, 1\)/);
});

test("default 不含 mdnice 主题残留（绿色/网图背景）", () => {
  const css = compileModel(defaultModel as never);
  assert.ok(!/76, 175, 80/.test(css), "不应有草原绿绿色");
  assert.ok(!/files\.mdnice\.com/.test(css), "标题不应残留 mdnice 网图背景");
});

test("Typora 映射预置主题通过 model 校验并编译关键选择器", () => {
  for (const model of [happysimple.model, seeYue.model]) {
    assert.equal(validateModel(model), true);
    const css = compileModel(model as never);
    assert.match(css, /#nice \{/);
    assert.match(css, /#nice p \{/);
    assert.match(css, /#nice h1 \{/);
    assert.match(css, /#nice h2 \{/);
    assert.match(css, /#nice blockquote \{/);
    assert.match(css, /#nice table \{/);
    assert.match(css, /#nice pre\.custom \{/);
  }
});

test("Typora 映射主题保留微信可渲染的手动修正", () => {
  const happyCss = compileModel(happysimple.model as never);
  assert.match(happyCss, /#nice h2 \{[^}]*border-bottom: none/);
  assert.match(happyCss, /#nice h2 \.content \{[^}]*border-bottom: 3px solid #ff5d52/);

  const seeYueCss = compileModel(seeYue.model as never);
  assert.match(seeYueCss, /#nice pre\.custom \{[^}]*padding: 8px 14px 14px/);
  assert.match(seeYueCss, /#nice pre\.custom \{[^}]*border-top: 40px solid rgba\(167, 187, 195, 0\.6\)/);
  assert.match(seeYueCss, /#nice mark \{[^}]*background-color: #7c9dca/);
  assert.match(seeYueCss, /#nice del \{[^}]*color: #777777/);
});
