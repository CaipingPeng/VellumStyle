import {useStore, getThemeById} from "../../store/index.ts";
import type {StyleItem} from "../../themes/themeModel.ts";
import {renderControl} from "./controls.tsx";

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
        <div key={item.id} style={{marginBottom: 12}}>
          <div style={{fontSize: 12, color: "#999", marginBottom: 4}}>{item.id}</div>
          {item.children.map((c) => renderItem(c, [...path, c.id]))}
        </div>
      );
    }
    return (
      <div key={item.id} style={{marginBottom: 10}}>
        <div style={{fontSize: 12, color: "#666", marginBottom: 4}}>{item.id}</div>
        {renderControl(item, (value) => updateStyleValue(selectedModelId!, path, value))}
      </div>
    );
  }

  return (
    <div
      style={{
        width: 280,
        flexShrink: 0,
        borderLeft: "1px solid #e8e8e8",
        background: "#fafafa",
        padding: 16,
        overflowY: "auto",
        height: "100%",
      }}
    >
      <div style={{display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12}}>
        <strong style={{fontSize: 14, color: "#333"}}>{model.label || model.id}</strong>
        <button
          onClick={() => setSelectedModel(null)}
          style={{border: "none", background: "transparent", fontSize: 18, color: "#999", cursor: "pointer"}}
          aria-label="关闭面板"
        >
          ×
        </button>
      </div>
      {model.styles.map((s) => renderItem(s, [s.id]))}
    </div>
  );
}
