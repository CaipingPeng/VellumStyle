import {Maximize2, Monitor, Smartphone} from "lucide-react";
import type {LucideIcon} from "lucide-react";
import {useStore} from "../../store/index.ts";
import {PREVIEW_MODES, type PreviewModeId} from "./previewModes.ts";

const icons: Record<PreviewModeId, LucideIcon> = {
  fluid: Maximize2,
  wechat: Monitor,
  mobile: Smartphone,
};

export default function PreviewModeToggle() {
  const previewMode = useStore((s) => s.previewMode);
  const setPreviewMode = useStore((s) => s.setPreviewMode);

  return (
    <div className="flex h-8 items-center overflow-hidden rounded-sm border border-border bg-bg" aria-label="预览宽度">
      {PREVIEW_MODES.map((mode) => {
        const Icon = icons[mode.id];
        const active = mode.id === previewMode;
        return (
          <button
            key={mode.id}
            type="button"
            title={mode.label}
            onClick={() => setPreviewMode(mode.id)}
            className={[
              "inline-flex h-8 w-8 items-center justify-center border-0 border-r border-border bg-transparent text-text-muted cursor-pointer transition-colors duration-fast last:border-r-0",
              active ? "bg-accent-subtle text-accent" : "hover:bg-bg-tertiary hover:text-text",
            ].join(" ")}
          >
            <Icon size={15} />
          </button>
        );
      })}
    </div>
  );
}
