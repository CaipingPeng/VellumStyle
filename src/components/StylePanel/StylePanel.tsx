import {motion} from "framer-motion";
import {X} from "lucide-react";
import {useStore, getThemeById} from "../../store/index.ts";
import type {StyleItem} from "../../themes/themeModel.ts";
import {StyleControl} from "./controls.tsx";
import {getModelLabel} from "./elementMap.ts";
import {getStyleLabel} from "./styleLabels.ts";

export default function StylePanel() {
  const {selectedModelId, setSelectedModel, themes, markdownThemeId, updateStyleValue} = useStore();
  const isOpen = Boolean(selectedModelId);

  const theme = getThemeById(themes, markdownThemeId);
  const model = isOpen ? theme.model.find((m) => m.id === selectedModelId) : null;

  // 渲染一个 style 项：有 children 则递归展开（path 累积 style.id 链）
  function renderItem(item: StyleItem, path: string[]) {
    if (item.children && item.children.length > 0) {
      return (
        <div key={item.id} className="mb-3">
          <div className="mb-1 text-xs font-medium text-text-muted" title={item.id}>{getStyleLabel(item.id)}</div>
          {item.children.map((c) => renderItem(c, [...path, c.id]))}
        </div>
      );
    }
    return (
      <div key={item.id} className="mb-2.5">
        <div className="mb-1 text-xs text-text-secondary" title={item.id}>{getStyleLabel(item.id)}</div>
        <StyleControl item={item} onChange={(value) => updateStyleValue(selectedModelId!, path, value)} />
      </div>
    );
  }

  return (
    <motion.div
      className="flex h-full flex-shrink-0 flex-col overflow-hidden border-l border-border bg-bg-tertiary"
      initial={{width: 0}}
      animate={{width: isOpen ? 280 : 0}}
      transition={{duration: 0.16, ease: [0.16, 1, 0.3, 1]}}
    >
      {model && (
        <motion.div
          className="flex h-full w-[280px] flex-col overflow-y-auto p-4"
          initial={{opacity: 0}}
          animate={{opacity: 1}}
          transition={{duration: 0.13, delay: 0.05}}
        >
          <div className="mb-3 flex items-center justify-between">
            <strong className="text-sm text-text" title={model.id}>{model.label || getModelLabel(model.id)}</strong>
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
      )}
    </motion.div>
  );
}
