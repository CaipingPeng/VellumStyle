import {spawnSync} from "node:child_process";
import {readdirSync} from "node:fs";
import {join, resolve} from "node:path";
import {fileURLToPath, pathToFileURL} from "node:url";

const TEST_FILE_PATTERN = /\.test\.tsx?$/;

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

function runTests() {
  const projectRoot = fileURLToPath(new URL("..", import.meta.url));
  const testFiles = [
    fileURLToPath(new URL("./run-tests.test.mjs", import.meta.url)),
    ...collectTestFiles(join(projectRoot, "src")),
  ];
  const result = spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "--import",
      pathToFileURL(join(projectRoot, "src", "test", "setupDom.ts")).href,
      "--test",
      ...testFiles,
    ],
    {cwd: projectRoot, stdio: "inherit"},
  );

  if (result.error) throw result.error;
  return result.status ?? 1;
}

const isMain = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isMain) process.exitCode = runTests();
