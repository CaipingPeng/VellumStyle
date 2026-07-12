import {spawnSync} from "node:child_process";
import {readdirSync} from "node:fs";
import {join, resolve} from "node:path";
import {fileURLToPath, pathToFileURL} from "node:url";

const TEST_FILE_PATTERN = /\.test\.tsx?$/;
const OPTIONS_WITH_VALUE = new Set([
  "--experimental-test-isolation",
  "--test-concurrency",
  "--test-coverage-branches",
  "--test-coverage-exclude",
  "--test-coverage-functions",
  "--test-coverage-include",
  "--test-coverage-lines",
  "--test-global-setup",
  "--test-isolation",
  "--test-name-pattern",
  "--test-reporter",
  "--test-reporter-destination",
  "--test-shard",
  "--test-skip-pattern",
  "--test-timeout",
]);

export function collectTestFiles(root) {
  const files = [];

  function visit(directory) {
    const entries = readdirSync(directory, {withFileTypes: true}).sort((left, right) =>
      left.name < right.name ? -1 : left.name > right.name ? 1 : 0,
    );

    for (const entry of entries) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(path);
      } else if (entry.isFile() && TEST_FILE_PATTERN.test(entry.name)) {
        files.push(path);
      }
    }
  }

  visit(resolve(root));
  return files;
}

export function parseRunnerArguments(args) {
  const forwardedOptions = [];
  const explicitFiles = [];

  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    if (argument === "--") continue;
    if (!argument.startsWith("-")) {
      explicitFiles.push(argument);
      continue;
    }

    forwardedOptions.push(argument);
    const optionName = argument.split("=", 1)[0];
    if (!argument.includes("=") && OPTIONS_WITH_VALUE.has(optionName) && index + 1 < args.length) {
      forwardedOptions.push(args[++index]);
    }
  }

  return {forwardedOptions, explicitFiles};
}

export function runTests(
  args = process.argv.slice(2),
  {
    projectRoot = fileURLToPath(new URL("..", import.meta.url)),
    executable = process.execPath,
    collect = collectTestFiles,
    spawn = spawnSync,
  } = {},
) {
  const {forwardedOptions, explicitFiles} = parseRunnerArguments(args);
  const testFiles = explicitFiles.length
    ? explicitFiles.map((file) => resolve(projectRoot, file))
    : [
        fileURLToPath(new URL("./run-tests.test.mjs", import.meta.url)),
        ...collect(join(projectRoot, "src")),
      ];
  const result = spawn(
    executable,
    [
      "--import",
      "tsx",
      "--import",
      pathToFileURL(join(projectRoot, "src", "test", "setupDom.ts")).href,
      "--test",
      ...forwardedOptions,
      ...testFiles,
    ],
    {cwd: projectRoot, stdio: "inherit"},
  );

  if (result.error) throw result.error;
  return result.status ?? 1;
}

const isMain = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isMain) process.exitCode = runTests();
