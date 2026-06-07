// 发布草稿箱：上传封面拿 media_id + add_draft；发布前校验正文无未上传外链图。
import {invoke} from "@tauri-apps/api/core";
import {scanMarkdownMedia} from "./markdownMediaScanner.ts";

const MMBIZ_HOSTS = ["mmbiz.qpic.cn", "mmbiz.qlogo.cn"];

// 返回正文里仍为非 mmbiz 远程/本地图片的 url 列表（发布前需先上传）。
export function findUnuploadedImages(markdown: string): string[] {
  const refs = scanMarkdownMedia(markdown);
  const bad: string[] = [];
  for (const ref of refs) {
    if (ref.mediaType !== "image") continue;
    if (ref.sourceType === "remote") {
      const isMmbiz = MMBIZ_HOSTS.some((h) => ref.originalUrl.includes(h));
      if (!isMmbiz) bad.push(ref.originalUrl);
    } else if (ref.sourceType === "local") {
      bad.push(ref.originalUrl);
    }
  }
  return bad;
}

export async function uploadThumb(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const bytes = Array.from(new Uint8Array(buf));
  return invoke<string>("upload_thumb", {
    bytes,
    filename: file.name || "thumb",
    mime: file.type,
  });
}

export function addDraft(title: string, content: string, thumbMediaId: string): Promise<string> {
  return invoke<string>("add_draft", {title, content, thumbMediaId});
}
