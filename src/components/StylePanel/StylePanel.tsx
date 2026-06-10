import {motion} from "framer-motion";
import {X} from "lucide-react";
import {useStore, getThemeById} from "../../store/index.ts";
import type {StyleItem} from "../../themes/themeModel.ts";
import {StyleControl} from "./controls.tsx";

export default function StylePanel() {
  const {selectedModelId, setSelectedModel, themes, markdownThemeId, updateStyleValue} = useStore();
  if (!selectedModelId) return null;

  const theme = getThemeById(themes, markdownThemeId);
  const model = theme.model.find((m) => m.id === selectedModelId);
  if (!model) return null;

  // 渲染一个 style 项：有 children 则递归展开（path 累积 style.id 链）
  function renderItem(item: StyleItem, path: string[]) {
    if (item.children && item.children.length > 0) {
      return (
        <div key={item.id} className="mb-3">
          <div className="mb-1 text-xs text-text-muted">{item.id}</div>
          {item.children.map((c) => renderItem(c, [...path, c.id]))}
        </div>
      );
    }
    return (
      <div key={item.id} className="mb-2.5">
        <div className="mb-1 text-xs text-text-secondary">{item.id}</div>
        <StyleControl item={item} onChange={(value) => updateStyleValue(selectedModelId!, path, value)} />
      </div>
    );
  }

  return (
    <motion.div
      className="flex h-full w-[280px] flex-shrink-0 flex-col overflow-y-auto border-l border-border bg-bg-tertiary p-4"
      initial={{x: 20, opacity: 0}}
      animate={{x: 0, opacity: 1}}
      transition={{duration: 0.16, ease: [0.16, 1, 0.3, 1]}}
    >
      <div className="mb-3 flex items-center justify-between">
        <strong className="text-sm text-text">{model.label || model.id}</strong>
        <button
          onClick={() => setSelectedModel(null)}
          className="inline-flex h-7 w-7 items-center justify-center rounded-sm border-0 bg-transparent text-text-muted cursor-pointer transition-colors duration-fast hover:bg-bg-tertiary hover:text-text"
          aria-label="关闭面板"
        >
          <X size={16} />
        </button>
      </div>
      {model.styles.map((s) => renderItem(s, [s.id]))}
    </motion.div>
  );
}
