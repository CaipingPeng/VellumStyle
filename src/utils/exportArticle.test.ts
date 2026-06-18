import {test} from "node:test";
import assert from "node:assert/strict";
import * as exportArticleModule from "./exportArticle.ts";
import {
  exportArticle,
  buildDefaultExportName,
  createA4ExportRenderTarget,
  getA4ExportLayout,
  getExportFormatMeta,
} from "./exportArticle.ts";

test("导出格式元信息包含 PNG 长图、PDF、HTML 和 Markdown", () => {
  assert.deepEqual(getExportFormatMeta("png"), {
    extension: "png",
    mimeType: "image/png",
    label: "PNG 长图",
  });
  assert.deepEqual(getExportFormatMeta("pdf"), {
    extension: "pdf",
    mimeType: "application/pdf",
    label: "PDF",
  });
  assert.deepEqual(getExportFormatMeta("html"), {
    extension: "html",
    mimeType: "text/html;charset=utf-8",
    label: "HTML",
  });
  assert.deepEqual(getExportFormatMeta("markdown"), {
    extension: "md",
    mimeType: "text/markdown;charset=utf-8",
    label: "Markdown",
  });
});

test("默认导出文件名来自当前文档名，并清理 Windows 不安全字符", () => {
  assert.equal(buildDefaultExportName("选题/增长:复盘?.md", "png"), "增长_复盘_.png");
  assert.equal(buildDefaultExportName("草稿.md", "pdf"), "草稿.pdf");
  assert.equal(buildDefaultExportName(null, "html"), "文澜排版导出.html");
  assert.equal(buildDefaultExportName("草稿.markdown", "markdown"), "草稿.md");
});

test("Markdown 导出原样保存当前源文本，不读取预览 HTML", async () => {
  const source = "# 标题\n\n原样 **Markdown**。\n";
  let capturedBlobType: string | null = null;
  let capturedBlobText: string | null = null;

  const result = await exportArticle("markdown", "草稿.md", {
    waitForMathJaxIdle: () => {
      throw new Error("Markdown 导出不应等待预览渲染");
    },
    readMarkdownSource: () => source,
    readArticleHtml: () => {
      throw new Error("Markdown 导出不应读取预览 HTML");
    },
    saveExportBlob: async (blob, format, fileName) => {
      capturedBlobType = blob.type;
      capturedBlobText = await blob.text();
      assert.equal(format, "markdown");
      assert.equal(fileName, "草稿.md");
      return {status: "downloaded", fileName};
    },
  });

  assert.equal(result.status, "downloaded");
  assert.equal(result.fileName, "草稿.md");
  assert.equal(capturedBlobType, "text/markdown;charset=utf-8");
  assert.equal(capturedBlobText, source);
});

test("PDF 打印文档使用 A4 版式并保留真实正文 HTML", () => {
  const buildPdfPrintDocument = (exportArticleModule as {
    buildPdfPrintDocument?: (articleHtml: string, fileName: string) => string;
  }).buildPdfPrintDocument;

  assert.equal(typeof buildPdfPrintDocument, "function");
  const html = buildPdfPrintDocument!("<h1>标题</h1><p>正文内容</p>", "草稿.pdf");

  assert.match(html, /@page\s*\{\s*size:\s*A4;\s*margin:\s*12mm;\s*\}/);
  assert.match(html, /<main class="article-print-page">/);
  assert.match(html, /<h1 id="pdf-标题-1">标题<\/h1><p>正文内容<\/p>/);
  assert.doesNotMatch(html, /data:image\/png|<canvas|html2canvas|addImage/);
});

test("PDF 打印文档给标题补充锚点，便于生成 PDF 大纲定位", () => {
  const buildPdfPrintDocument = (exportArticleModule as {
    buildPdfPrintDocument?: (articleHtml: string, fileName: string) => string;
  }).buildPdfPrintDocument;

  const html = buildPdfPrintDocument!(
    '<h1>总标题</h1><h2 id="kept">已有锚点</h2><h2>二级 标题</h2>',
    "草稿.pdf",
  );

  assert.match(html, /<h1 id="pdf-总标题-1">总标题<\/h1>/);
  assert.match(html, /<h2 id="kept">已有锚点<\/h2>/);
  assert.match(html, /<h2 id="pdf-二级-标题-2">二级 标题<\/h2>/);
});

test("PDF 导出保存为干净 A4 PDF，不打开打印窗口", async () => {
  let capturedHtml = "";
  let capturedPath = "";

  const result = await exportArticle("pdf", "草稿.md", {
    waitForMathJaxIdle: async () => {},
    readArticleHtml: () => "<section><p>正文内容</p></section>",
    isTauriRuntime: () => true,
    pickExportPath: async () => "C:\\Users\\Administrator\\Desktop\\草稿.pdf",
    exportPdfFile: async (html: string, path: string) => {
      capturedHtml = html;
      capturedPath = path;
    },
    renderArticleCanvas: async () => {
      throw new Error("PDF 不应调用截图渲染");
    },
    saveExportBlob: async () => {
      throw new Error("PDF 不应保存图片 PDF blob");
    },
  });

  assert.equal(result.status, "saved");
  assert.equal(result.fileName, "草稿.pdf");
  assert.equal(result.path, "C:\\Users\\Administrator\\Desktop\\草稿.pdf");
  assert.equal(capturedPath, "C:\\Users\\Administrator\\Desktop\\草稿.pdf");
  assert.match(capturedHtml, /@page\s*\{\s*size:\s*A4;\s*margin:\s*12mm;\s*\}/);
  assert.match(capturedHtml, /正文内容/);
  assert.doesNotMatch(capturedHtml, /data:image\/png|<canvas|html2canvas|addImage|window\.print/);
});

test("PNG 导出使用 A4 宽度，不继承当前预览模式宽度", () => {
  const source = document.createElement("div");
  source.id = "article-box";
  source.style.width = "390px";
  source.style.padding = "24px 32px";
  source.innerHTML = '<section id="article"><p>正文</p></section>';

  const layout = getA4ExportLayout();
  const pngTarget = createA4ExportRenderTarget(source, "png");

  try {
    assert.equal(layout.pageWidthPx, 794);
    assert.equal(layout.contentWidthPx, 704);
    assert.equal(pngTarget.element.style.width, "794px");
    const pngArticle = pngTarget.element.firstElementChild as HTMLDivElement | null;
    assert.ok(pngArticle);
    assert.equal(pngArticle.style.width, "704px");
    assert.equal(pngArticle.style.padding, "0px");
  } finally {
    pngTarget.cleanup();
  }
});
