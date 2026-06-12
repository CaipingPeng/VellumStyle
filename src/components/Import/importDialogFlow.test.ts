import {test} from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

test("导入进度完成后使用完成图标，不继续使用旋转图标", async () => {
  const source = await readFile(new URL("./ImportMarkdownDialog.tsx", import.meta.url), "utf8");

  assert.match(source, /progress\.phase === "done"[\s\S]*?<CheckCircle2/);
  assert.doesNotMatch(
    source,
    /<Loader2 size=\{14\} className="animate-spin text-accent" \/>\s*\{phaseText\[progress\.phase\]/,
  );
});

test("导入成功路径会关闭导入对话框", async () => {
  const source = await readFile(new URL("./ImportButton.tsx", import.meta.url), "utf8");
  const successPath = source.match(/try \{[\s\S]*?await importMarkdownFile[\s\S]*?await openDocument\(newPath\);[\s\S]*?\} catch/);

  assert.ok(successPath, "expected import success path to open the imported document before catch block");
  assert.match(successPath[0], /setOpenDialog\(false\)/);
});
