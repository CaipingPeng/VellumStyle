import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {mkdir, mkdtemp, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join, relative, resolve, sep} from "node:path";
import {fileURLToPath, pathToFileURL} from "node:url";
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

test("parseRunnerArguments forwards options while separating explicit test files", async () => {
  const {parseRunnerArguments} = await import("./run-tests.mjs");

  assert.deepEqual(
    parseRunnerArguments([
      "--",
      "--test-name-pattern",
      "publish flow",
      "--test-reporter=spec",
      "--test-only",
      "src/utils/publish.test.ts",
      "src/components/Publish/publishFlow.test.tsx",
    ]),
    {
      forwardedOptions: ["--test-name-pattern", "publish flow", "--test-reporter=spec", "--test-only"],
      explicitFiles: ["src/utils/publish.test.ts", "src/components/Publish/publishFlow.test.tsx"],
    },
  );
});

test("runTests uses explicit files instead of automatic enumeration and forwards options", async () => {
  const {runTests} = await import("./run-tests.mjs");
  const projectRoot = join(tmpdir(), "vellumstyle-runner-project");
  let automaticEnumerationCalls = 0;
  let invocation;

  const status = runTests(
    ["--test-name-pattern", "publish", "src/utils/publish.test.ts"],
    {
      projectRoot,
      executable: "node-20",
      collect: () => {
        automaticEnumerationCalls++;
        return [join(projectRoot, "src", "should-not-run.test.ts")];
      },
      spawn: (command, args, options) => {
        invocation = {command, args, options};
        return {status: 0};
      },
    },
  );

  assert.equal(status, 0);
  assert.equal(automaticEnumerationCalls, 0);
  assert.deepEqual(invocation, {
    command: "node-20",
    args: [
      "--import",
      "tsx",
      "--import",
      pathToFileURL(join(projectRoot, "src", "test", "setupDom.ts")).href,
      "--test",
      "--test-name-pattern",
      "publish",
      resolve(projectRoot, "src/utils/publish.test.ts"),
    ],
    options: {cwd: projectRoot, stdio: "inherit"},
  });
});

test("runTests returns the child process exit code", async () => {
  const {runTests} = await import("./run-tests.mjs");

  const status = runTests(["src/utils/publish.test.ts"], {
    projectRoot: join(tmpdir(), "vellumstyle-runner-project"),
    spawn: () => ({status: 23}),
  });

  assert.equal(status, 23);
});

test("npm entry preserves the double-separated name pattern and explicit file", () => {
  const projectRoot = fileURLToPath(new URL("..", import.meta.url));
  const npmArguments = [
    "test",
    "--",
    "--",
    "--test-name-pattern=npm-entry-selected",
    "scripts/npm-argument-probe.test.mjs",
  ];
  const childEnvironment = {...process.env};
  delete childEnvironment.NODE_TEST_CONTEXT;
  const spawnOptions = {cwd: projectRoot, encoding: "utf8", env: childEnvironment};
  const result =
    process.platform === "win32"
      ? spawnSync(
          process.env.ComSpec ?? "cmd.exe",
          ["/d", "/s", "/c", ["npm", ...npmArguments].join(" ")],
          spawnOptions,
        )
      : spawnSync("npm", npmArguments, spawnOptions);
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;

  assert.equal(result.status, 0, output);
  assert.match(output, /NPM_ARGUMENT_PROBE_SELECTED/);
  assert.doesNotMatch(output, /NPM_ARGUMENT_PROBE_REJECTED/);
});
