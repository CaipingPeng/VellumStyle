import {Moon, Sun} from "lucide-react";
import {useStore} from "../../store/index.ts";

export default function AppearanceToggle() {
  const appearanceMode = useStore((s) => s.appearanceMode);
  const toggleAppearanceMode = useStore((s) => s.toggleAppearanceMode);
  const Icon = appearanceMode === "light" ? Sun : Moon;
  const title = appearanceMode === "light" ? "切换到暗色模式" : "切换到亮色模式";

  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={appearanceMode === "dark"}
      onClick={toggleAppearanceMode}
      className="inline-flex h-5 w-5 cursor-pointer items-center justify-center rounded-sm border-0 bg-transparent p-0 text-text-muted outline-none transition-colors duration-fast hover:bg-bg-tertiary hover:text-text focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] active:scale-95"
    >
      <Icon size={13} aria-hidden="true" />
    </button>
  );
}
