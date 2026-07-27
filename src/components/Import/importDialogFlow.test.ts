import {test} from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

test("导入窗口只保留创建文档期间的短暂忙碌状态", async () => {
  const source = await readFile(new URL("./ImportMarkdownDialog.tsx", import.meta.url), "utf8");

  assert.match(source, /\{importing \? \([\s\S]*?<Loader2[\s\S]*?导入中/);
  assert.doesNotMatch(source, /progress\.phase|导入结果|DetailList/);
});

test("导入成功后先打开文章并关闭窗口，再加入后台图片队列", async () => {
  const source = await readFile(new URL("./ImportButton.tsx", import.meta.url), "utf8");
  const successPath = source.match(/try \{[\s\S]*?await prepareMarkdownImport[\s\S]*?await openDocument\(newPath\);[\s\S]*?\} catch/);

  assert.ok(successPath, "expected import success path to open the imported document before catch block");
  assert.match(successPath[0], /setOpenDialog\(false\)/);
  assert.ok(successPath[0].indexOf("setOpenDialog(false)") < successPath[0].indexOf("enqueueMarkdownImageImport"));
});

test("导入按钮使用批量 Markdown 文件选择命令", async () => {
  const source = await readFile(new URL("./ImportButton.tsx", import.meta.url), "utf8");

  assert.match(source, /invoke<string\[\] \| null>\("pick_markdown_files"\)/);
  assert.match(source, /setMarkdownPaths\(selected\)/);
});

test("批量导入先完整预读源文件并始终创建唯一文章，失败时回滚", async () => {
  const source = await readFile(new URL("./ImportButton.tsx", import.meta.url), "utf8");
  const preflight = source.indexOf("preparedImports.push(await prepareMarkdownImport");
  const creation = source.indexOf("for (const prepared of preparedImports)");

  assert.ok(preflight >= 0 && creation > preflight);
  assert.doesNotMatch(source, /treeHasPath|writeDocument\(target/);
  assert.match(source, /newPath = await createDocument\(dir, name\)/);
  assert.match(source, /Promise\.allSettled\(createdPaths\.map\(\(path\) => deleteEntry\(path\)\)\)/);
});

test("资源根目录选择作为 Markdown 文件标题行里的内联高级选项", async () => {
  const source = await readFile(new URL("./ImportMarkdownDialog.tsx", import.meta.url), "utf8");

  assert.match(source, /showResourceRoot/);
  assert.match(source, /headerAction\?: ReactNode/);
  assert.match(source, /headerAction=\{[\s\S]*?手动指定资源目录/);
  assert.match(source, /\{showResourceRoot && \(\s*<FieldPicker[\s\S]*?label="资源根目录"/);
  assert.doesNotMatch(source, /min-h-\[46px\] cursor-pointer items-start[\s\S]*?手动指定资源根目录/);
});
