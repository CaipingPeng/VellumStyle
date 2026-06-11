import {test} from "node:test";
import assert from "node:assert/strict";
import {compileModel} from "./compileModel.ts";
import {validateModel} from "./themeModel.ts";
import defaultModel from "./default.json" with {type: "json"};
import happysimple from "./presets/happysimple.json" with {type: "json"};
import frontEndPeak from "./presets/mdnice-12.json" with {type: "json"};
import singularity from "./presets/mdnice-1377.json" with {type: "json"};
import seeYue from "./presets/see-yue.json" with {type: "json"};
import typoraSpring from "./presets/typora-spring.json" with {type: "json"};

function parseRules(css: string): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {};
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css))) {
    const selector = m[1].trim();
    const decls: Record<string, string> = {};
    for (const part of m[2].split(";")) {
      const i = part.indexOf(":");
      if (i === -1) continue;
      decls[part.slice(0, i).trim()] = part.slice(i + 1).trim();
    }
    out[selector] = {...(out[selector] || {}), ...decls};
  }
  return out;
}

test("default.json 通过 model 校验", () => {
  assert.equal(validateModel(defaultModel), true);
});

test("default 编译出 GitHub 风格关键视觉值", () => {
  const css = compileModel(defaultModel as never);
  assert.match(css, /#article p \{[^}]*font-size: 16px/);
  assert.match(css, /#article h1 \.content \{[^}]*font-size: 36px/);
  assert.match(css, /#article h1 \.content \{[^}]*color: rgba\(51, 51, 51, 1\)/);
  assert.match(css, /#article a \{[^}]*color: rgba\(65, 131, 196, 1\)/);
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
    assert.match(css, /#article \{/);
    assert.match(css, /#article p \{/);
    assert.match(css, /#article h1 \{/);
    assert.match(css, /#article h2 \{/);
    assert.match(css, /#article blockquote \{/);
    assert.match(css, /#article table \{/);
    assert.match(css, /#article pre\.custom \{/);
  }
});

test("Typora 映射主题保留微信可渲染的手动修正", () => {
  const happyCss = compileModel(happysimple.model as never);
  assert.match(happyCss, /#article h2 \{[^}]*border-bottom: none/);
  assert.match(happyCss, /#article h2 \.content \{[^}]*border-bottom: 3px solid #ff5d52/);

  const seeYueCss = compileModel(seeYue.model as never);
  assert.match(seeYueCss, /#article pre\.custom \{[^}]*padding: 8px 14px 14px/);
  assert.match(seeYueCss, /#article pre\.custom \{[^}]*border-top: 40px solid rgba\(167, 187, 195, 0\.6\)/);
  assert.match(seeYueCss, /#article mark \{[^}]*background-color: #7c9dca/);
  assert.match(seeYueCss, /#article del \{[^}]*color: #777777/);
});

test("mdnice 装饰性 h3 主题的脚注标题不被压成窄列", () => {
  for (const preset of [singularity, frontEndPeak]) {
    const rules = parseRules(compileModel(preset.model as never));
    const sepBefore = rules["#article .footnotes-sep::before"];

    assert.equal(sepBefore.content, '"参考资料"');
    assert.equal(sepBefore.width, "auto");
    assert.equal(sepBefore.height, "auto");
    assert.equal(sepBefore["background-image"], "none");
  }
});

test("Typora Spring 根容器和分隔线不向右撑出预览边界", () => {
  const rules = parseRules(compileModel(typoraSpring.model as never));

  assert.equal(rules["#article"]["box-sizing"], "border-box");
  assert.equal(rules["#article"]["max-width"], "100%");
  assert.equal(rules["#article hr"].width, "100%");
  assert.equal(rules["#article hr"]["box-sizing"], "border-box");
});
