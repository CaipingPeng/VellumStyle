import {test} from "node:test";
import assert from "node:assert/strict";
import {createMathJaxConfig} from "./mathjax.ts";

test("MathJax preview disables assistive MathML to avoid duplicate visible formulas in packaged WebView", () => {
  const config = createMathJaxConfig();

  assert.equal(config.options.enableAssistiveMml, false);
  assert.equal(config.options.menuOptions.settings.assistiveMml, false);
});
