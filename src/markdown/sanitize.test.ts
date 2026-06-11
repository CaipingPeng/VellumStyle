import {test} from "node:test";
import assert from "node:assert/strict";

test("浏览器端 sanitizer 不依赖 Node 取向的 sanitize-html 包", async () => {
  const packageJson = await import("../../package.json", {with: {type: "json"}});
  const dependencies: Record<string, string | undefined> = packageJson.default.dependencies ?? {};
  const devDependencies: Record<string, string | undefined> = packageJson.default.devDependencies ?? {};

  assert.equal(dependencies["sanitize-html"], undefined);
  assert.equal(devDependencies["@types/sanitize-html"], undefined);
  assert.ok(dependencies.dompurify);
  assert.match(dependencies.dompurify, /^\^?\d+\.\d+\.\d+/);
});
