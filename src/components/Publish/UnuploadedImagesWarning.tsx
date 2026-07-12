import {useEffect, useId, type RefObject} from "react";
import type {UnuploadedImage, UnuploadedImageReason} from "../../utils/publish.ts";
import Button from "../ui/Button.tsx";

interface Props {
  items: UnuploadedImage[];
  busy: boolean;
  onBack: () => void;
  onContinue: () => void;
  backButtonRef: RefObject<HTMLButtonElement>;
}

const reasonLabels: Record<UnuploadedImageReason, string> = {
  local: "本地图片",
  external: "外部图片",
  temporary: "临时图片",
  unsupported: "不支持的图片地址",
};

export default function UnuploadedImagesWarning({items, busy, onBack, onContinue, backButtonRef}: Props) {
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) {
        event.preventDefault();
        onBack();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [busy, onBack]);

  return (
    <section role="region" aria-labelledby={titleId} aria-describedby={descriptionId} className="flex min-h-0 flex-col">
      <div className="border-b border-border px-5 py-4">
        <h2 id={titleId} className="text-base font-semibold text-danger">发现未上传的图片</h2>
        <p id={descriptionId} className="mt-1.5 text-sm leading-6 text-text-secondary">
          以下图片尚未上传到微信素材库，仍然发布后可能无法在微信文章中正常显示。请返回检查并上传，或确认风险后继续。
        </p>
      </div>

      <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto px-5 py-4">
        {items.map((item, index) => {
          const displayedUrl = item.url || "（空地址）";
          return (
            <li key={`${item.line}-${item.column}-${index}`} className="rounded-sm border border-border bg-bg-secondary p-3">
              <div className="text-[13px] font-medium text-text">第 {item.line} 行 · {reasonLabels[item.reason]}</div>
              <code title={item.url || undefined} className="mt-1 block select-text break-all whitespace-pre-wrap text-xs leading-5 text-text-secondary">
                {displayedUrl}
              </code>
            </li>
          );
        })}
      </ul>

      <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
        <button ref={backButtonRef} type="button" disabled={busy} onClick={onBack} className="inline-flex h-8 items-center justify-center rounded-sm bg-bg-secondary px-3 text-[13px] font-medium text-text-secondary hover:bg-bg-tertiary focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] disabled:cursor-default disabled:opacity-60">返回检查</button>
        <Button type="button" disabled={busy} onClick={onContinue} className="bg-danger text-white border-0 hover:bg-danger">仍然发布</Button>
      </div>
    </section>
  );
}
