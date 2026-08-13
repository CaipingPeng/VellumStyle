import {useEffect} from "react";

// 模态弹窗 ESC 关闭的统一实现（capture 阶段拦截，避免与下层输入冲突）。
export function useDialogEscape(onClose: () => void, enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [enabled, onClose]);
}
