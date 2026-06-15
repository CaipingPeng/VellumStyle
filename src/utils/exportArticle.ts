import {invoke} from "@tauri-apps/api/core";
import {waitForMathJaxIdle} from "../markdown/mathjax.ts";
import {solveHtml} from "../markdown/converter.ts";
import {ARTICLE_BOX_ID} from "../articleRoot.ts";
import {isTauriRuntime} from "./tauriEnv.ts";

export type ExportFormat = "png" | "pdf" | "html";

export interface ExportFormatMeta {
  extension: string;
  mimeType: string;
  label: string;
}

export interface ExportResult {
  status: "saved" | "downloaded" | "cancelled";
  fileName: string;
  path?: string;
}

export interface A4ExportLayout {
  pageWidthMm: number;
  pageHeightMm: number;
  marginMm: number;
  pageWidthPx: number;
  contentWidthPx: number;
  marginPx: number;
}

export interface ExportRenderTarget {
  element: HTMLElement;
  cleanup: () => void;
}

export interface ExportArticleDependencies {
  waitForMathJaxIdle: () => Promise<void> | void;
  readArticleHtml: () => string;
  renderArticleCanvas: () => Promise<HTMLCanvasElement>;
  saveExportBlob: (blob: Blob, format: ExportFormat, fileName: string) => Promise<ExportResult>;
  pickExportPath: (format: ExportFormat, fileName: string) => Promise<string | null>;
  exportPdfFile: (html: string, path: string) => Promise<void>;
  isTauriRuntime: () => boolean;
}

const CSS_PX_PER_MM = 96 / 25.4;
const A4_PAGE_WIDTH_MM = 210;
const A4_PAGE_HEIGHT_MM = 297;
const A4_MARGIN_MM = 12;

const EXPORT_FORMATS: Record<ExportFormat, ExportFormatMeta> = {
  png: {
    extension: "png",
    mimeType: "image/png",
    label: "PNG 长图",
  },
  pdf: {
    extension: "pdf",
    mimeType: "application/pdf",
    label: "PDF",
  },
  html: {
    extension: "html",
    mimeType: "text/html;charset=utf-8",
    label: "HTML",
  },
};

export function getExportFormatMeta(format: ExportFormat): ExportFormatMeta {
  return EXPORT_FORMATS[format];
}

export function getA4ExportLayout(): A4ExportLayout {
  const pageWidthPx = Math.round(A4_PAGE_WIDTH_MM * CSS_PX_PER_MM);
  const marginPx = Math.round(A4_MARGIN_MM * CSS_PX_PER_MM);
  return {
    pageWidthMm: A4_PAGE_WIDTH_MM,
    pageHeightMm: A4_PAGE_HEIGHT_MM,
    marginMm: A4_MARGIN_MM,
    pageWidthPx,
    contentWidthPx: pageWidthPx - marginPx * 2,
    marginPx,
  };
}

export function buildDefaultExportName(docPath: string | null, format: ExportFormat): string {
  const meta = getExportFormatMeta(format);
  const rawName = (docPath?.split(/[\\/]/).pop() ?? "")
    .replace(/\.(md|markdown)$/i, "")
    .trim();
  const baseName = rawName || "文澜排版导出";
  const safeName =
    baseName
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
      .replace(/\s+/g, " ")
      .replace(/[. ]+$/g, "")
      .slice(0, 80) || "文澜排版导出";
  return `${safeName}.${meta.extension}`;
}

export async function exportArticle(
  format: ExportFormat,
  docPath: string | null,
  dependencyOverrides: Partial<ExportArticleDependencies> = {},
): Promise<ExportResult> {
  const dependencies = createExportArticleDependencies(dependencyOverrides);
  await dependencies.waitForMathJaxIdle();
  const fileName = buildDefaultExportName(docPath, format);

  if (format === "html") {
    const html = dependencies.readArticleHtml();
    if (!html) {
      throw new Error("没有可导出的预览内容");
    }
    const meta = getExportFormatMeta(format);
    const blob = new Blob([buildStandaloneHtml(html)], {type: meta.mimeType});
    return dependencies.saveExportBlob(blob, format, fileName);
  }

  if (format === "pdf") {
    const html = dependencies.readArticleHtml();
    if (!html) {
      throw new Error("没有可导出的预览内容");
    }
    const printHtml = buildPdfPrintDocument(html, fileName);
    if (!dependencies.isTauriRuntime()) {
      const blob = new Blob([printHtml], {type: "text/html;charset=utf-8"});
      return dependencies.saveExportBlob(blob, "html", fileName.replace(/\.pdf$/i, ".html"));
    }

    const path = await dependencies.pickExportPath(format, fileName);
    if (!path) {
      return {status: "cancelled", fileName};
    }
    await dependencies.exportPdfFile(printHtml, path);
    return {status: "saved", fileName, path};
  }

  const canvas = await dependencies.renderArticleCanvas();
  const meta = getExportFormatMeta(format);
  return dependencies.saveExportBlob(await canvasToBlob(canvas, meta.mimeType), format, fileName);
}

function createExportArticleDependencies(overrides: Partial<ExportArticleDependencies>): ExportArticleDependencies {
  return {
    waitForMathJaxIdle,
    readArticleHtml: solveHtml,
    renderArticleCanvas,
    saveExportBlob,
    pickExportPath,
    exportPdfFile,
    isTauriRuntime,
    ...overrides,
  };
}

async function renderArticleCanvas(): Promise<HTMLCanvasElement> {
  const box = document.getElementById(ARTICLE_BOX_ID) as HTMLElement | null;
  if (!box) {
    throw new Error("没有找到预览区域");
  }

  const {default: html2canvas} = await import("html2canvas");
  const target = createA4ExportRenderTarget(box);
  try {
    return await html2canvas(target.element, {
      backgroundColor: "#ffffff",
      scale: Math.min(2, window.devicePixelRatio || 1),
      useCORS: true,
      allowTaint: false,
      logging: false,
      windowWidth: Math.max(target.element.scrollWidth, target.element.offsetWidth),
      windowHeight: Math.max(target.element.scrollHeight, target.element.offsetHeight),
    });
  } finally {
    target.cleanup();
  }
}

export function createA4ExportRenderTarget(source: HTMLElement, _format: "png" = "png"): ExportRenderTarget {
  const layout = getA4ExportLayout();
  const clone = cloneArticleBoxForA4(source, layout.contentWidthPx);
  const element = document.createElement("div");
  element.style.position = "fixed";
  element.style.left = "-10000px";
  element.style.top = "0";
  element.style.width = `${layout.pageWidthPx}px`;
  element.style.boxSizing = "border-box";
  element.style.padding = `${layout.marginPx}px`;
  element.style.background = "#fff";
  element.style.pointerEvents = "none";
  element.appendChild(clone);

  document.body.appendChild(element);
  return {
    element,
    cleanup: () => element.remove(),
  };
}

function cloneArticleBoxForA4(source: HTMLElement, contentWidthPx: number): HTMLElement {
  const clone = source.cloneNode(true) as HTMLElement;
  clone.style.width = `${contentWidthPx}px`;
  clone.style.maxWidth = `${contentWidthPx}px`;
  clone.style.margin = "0";
  clone.style.padding = "0";
  clone.style.minHeight = "0";
  clone.style.background = "#fff";
  clone.style.boxSizing = "border-box";

  for (const element of Array.from(clone.querySelectorAll<HTMLElement>(".preview-edit-hover, .preview-edit-selected"))) {
    element.classList.remove("preview-edit-hover", "preview-edit-selected");
  }

  return clone;
}

function canvasToBlob(canvas: HTMLCanvasElement, mimeType: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error("生成图片失败"));
      }
    }, mimeType);
  });
}

function buildStandaloneHtml(articleHtml: string): string {
  return [
    "<!doctype html>",
    '<html lang="zh-CN">',
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    "<title>文澜排版导出</title>",
    '<style>body{margin:0;background:#f5f5f5;padding:24px;}main{box-sizing:border-box;max-width:760px;margin:0 auto;background:#fff;padding:24px 32px;}</style>',
    "</head>",
    "<body>",
    `<main>${articleHtml}</main>`,
    "</body>",
    "</html>",
  ].join("");
}

export function buildPdfPrintDocument(articleHtml: string, fileName: string): string {
  const title = escapeHtml(fileName.replace(/\.pdf$/i, "") || "文澜排版导出");
  const htmlWithHeadingAnchors = addHeadingAnchors(articleHtml);
  const css = [
    "@page { size: A4; margin: 12mm; }",
    "html,body{margin:0;padding:0;background:#fff;color:#111;-webkit-print-color-adjust:exact;print-color-adjust:exact;}",
    "body{font-family:-apple-system,BlinkMacSystemFont,\"Segoe UI\",\"Microsoft YaHei\",sans-serif;}",
    ".article-print-page{box-sizing:border-box;width:100%;max-width:186mm;margin:0 auto;background:#fff;}",
    ".article-print-page img,.article-print-page svg{max-width:100%;height:auto;}",
    ".article-print-page table{max-width:100%;border-collapse:collapse;}",
    ".article-print-page pre,.article-print-page blockquote,.article-print-page table,.article-print-page figure{break-inside:avoid;page-break-inside:avoid;}",
    ".article-print-page h1,.article-print-page h2,.article-print-page h3,.article-print-page h4,.article-print-page h5,.article-print-page h6{break-after:avoid-page;page-break-after:avoid;}",
    ".article-print-page p{orphans:2;widows:2;}",
    "@media screen{body{background:#f3f4f6;padding:24px;}.article-print-page{width:210mm;max-width:210mm;min-height:297mm;padding:12mm;box-shadow:0 12px 40px rgba(15,23,42,.14);}}",
    "@media print{.article-print-page{width:auto;max-width:none;margin:0;padding:0;box-shadow:none;}}",
  ].join("\n");

  return [
    "<!doctype html>",
    '<html lang="zh-CN">',
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${title}</title>`,
    `<style>${css}</style>`,
    "</head>",
    "<body>",
    `<main class="article-print-page">${htmlWithHeadingAnchors}</main>`,
    "</body>",
    "</html>",
  ].join("");
}

function addHeadingAnchors(articleHtml: string): string {
  const template = document.createElement("template");
  template.innerHTML = articleHtml;
  let index = 0;
  for (const heading of Array.from(template.content.querySelectorAll<HTMLHeadingElement>("h1,h2,h3,h4,h5,h6"))) {
    if (heading.id) continue;
    index += 1;
    const text = heading.textContent?.trim() || `heading-${index}`;
    heading.id = `pdf-${slugifyHeading(text)}-${index}`;
  }
  return template.innerHTML;
}

function slugifyHeading(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "heading"
  );
}

async function exportPdfFile(html: string, path: string): Promise<void> {
  await invoke("export_pdf_file", {html, path});
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function saveExportBlob(blob: Blob, format: ExportFormat, fileName: string): Promise<ExportResult> {
  if (isTauriRuntime()) {
    const path = await pickExportPath(format, fileName);
    if (!path) {
      return {status: "cancelled", fileName};
    }
    const bytes = Array.from(new Uint8Array(await blob.arrayBuffer()));
    await invoke("write_export_file", {path, bytes});
    return {status: "saved", fileName, path};
  }

  downloadBlob(blob, fileName);
  return {status: "downloaded", fileName};
}

async function pickExportPath(format: ExportFormat, fileName: string): Promise<string | null> {
  const {save} = await import("@tauri-apps/plugin-dialog");
  const meta = getExportFormatMeta(format);
  return save({
    title: "导出文章",
    defaultPath: fileName,
    filters: [{name: meta.label, extensions: [meta.extension]}],
  });
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
