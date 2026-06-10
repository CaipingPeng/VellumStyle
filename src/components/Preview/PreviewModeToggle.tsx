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
    <div className="flex h-8 items-center gap-0.5 rounded-sm bg-bg-secondary p-0.5" aria-label="预览宽度">
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
              "inline-flex h-7 w-7 items-center justify-center rounded-sm border-0 bg-transparent text-text-muted cursor-pointer transition-colors duration-fast",
              active ? "bg-bg text-accent" : "hover:bg-bg hover:text-text",
            ].join(" ")}
          >
            <Icon size={15} />
          </button>
        );
      })}
    </div>
  );
}
