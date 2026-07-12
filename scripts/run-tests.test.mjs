import assert from "node:assert/strict";
import {mkdir, mkdtemp, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join, relative, sep} from "node:path";
import test from "node:test";

const toPosixPath = (value) => value.split(sep).join("/");

test("collectTestFiles recursively enumerates only .test.ts and .test.tsx files", async () => {
  const {collectTestFiles} = await import("./run-tests.mjs");
  const root = await mkdtemp(join(tmpdir(), "vellumstyle-tests-"));

  try {
    await mkdir(join(root, "components", "nested"), {recursive: true});
    await Promise.all([
      writeFile(join(root, "root.test.tsx"), ""),
      writeFile(join(root, "components", "alpha.test.ts"), ""),
      writeFile(join(root, "components", "nested", "beta.test.tsx"), ""),
      writeFile(join(root, "components", "ignored.spec.ts"), ""),
      writeFile(join(root, "components", "ignored.test.js"), ""),
      writeFile(join(root, "components", "ignored.test.tsx.bak"), ""),
    ]);

    assert.deepEqual(
      collectTestFiles(root).map((file) => toPosixPath(relative(root, file))),
      ["components/alpha.test.ts", "components/nested/beta.test.tsx", "root.test.tsx"],
    );
  } finally {
    await rm(root, {recursive: true, force: true});
  }
});
