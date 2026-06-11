import {Maximize2, Monitor, Smartphone} from "lucide-react";
import type {LucideIcon} from "lucide-react";
import {useStore} from "../../store/index.ts";
import {PREVIEW_MODES, type PreviewModeId} from "./previewModes.ts";

const icons: Record<PreviewModeId, LucideIcon> = {
  fluid: Maximize2,
  wechat: Monitor,
  mobile: Smartphone,
};

interface Props {
  variant?: "toolbar" | "status";
}

const sizes = {
  toolbar: {
    wrap: "h-8 bg-bg-secondary",
    button: "h-7 w-7",
    icon: 15,
  },
  status: {
    wrap: "h-6 bg-bg-tertiary",
    button: "h-5 w-6",
    icon: 13,
  },
};

export default function PreviewModeToggle({variant = "toolbar"}: Props) {
  const previewMode = useStore((s) => s.previewMode);
  const setPreviewMode = useStore((s) => s.setPreviewMode);
  const size = sizes[variant];

  return (
    <div className={["flex items-center gap-0.5 rounded-sm p-0.5", size.wrap].join(" ")} aria-label="预览宽度">
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
              "inline-flex items-center justify-center rounded-sm border-0 bg-transparent text-text-muted cursor-pointer transition-colors duration-fast",
              size.button,
              active ? "bg-bg text-accent" : "hover:bg-bg hover:text-text",
            ].join(" ")}
          >
            <Icon size={size.icon} />
          </button>
        );
      })}
    </div>
  );
}
