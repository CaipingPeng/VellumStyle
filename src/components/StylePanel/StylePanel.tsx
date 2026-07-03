import {useEffect, useState} from "react";
import {motion} from "framer-motion";
import {X} from "lucide-react";
import {useStore, getThemeById} from "../../store/index.ts";
import type {StyleItem} from "../../themes/themeModel.ts";
import {saveUserTheme} from "../../themes/loader.ts";
import {StyleControl} from "./controls.tsx";
import {getModelLabel} from "./elementMap.ts";
import {getStyleLabel} from "./styleLabels.ts";

type StyleEditMode = "temporary" | "permanent";
type SaveState = "temporary" | "dirty" | "saving" | "saved" | "error";

export default function StylePanel() {
  const {selectedModelId, setSelectedModel, themes, markdownThemeId, updateStyleValue} = useStore();
  const [editMode, setEditMode] = useState<StyleEditMode>("temporary");
  const [saveState, setSaveState] = useState<SaveState>("temporary");
  const isOpen = Boolean(selectedModelId);

  const theme = getThemeById(themes, markdownThemeId);
  const model = isOpen ? theme.model.find((m) => m.id === selectedModelId) : null;

  useEffect(() => {
    setSaveState(editMode === "permanent" ? "dirty" : "temporary");
  }, [editMode, selectedModelId]);

  function switchMode(mode: StyleEditMode) {
    setEditMode(mode);
    setSaveState(mode === "permanent" ? "dirty" : "temporary");
  }

  function handleStyleChange(path: string[], value: string) {
    if (!selectedModelId) return;
    updateStyleValue(selectedModelId, path, value);
    setSaveState(editMode === "permanent" ? "dirty" : "temporary");
  }

  async function handleSave() {
    if (editMode === "temporary") {
      setSaveState("temporary");
      return;
    }

    setSaveState("saving");
    try {
      await saveUserTheme(theme.id, JSON.stringify(theme.model));
      setSaveState("saved");
    } catch (error) {
      console.error("保存主题文件失败：", error);
      setSaveState("error");
    }
  }

  // 渲染一个 style 项：有 children 则递归展开（path 累积 style.id 链）
  function renderItem(item: StyleItem, path: string[]) {
    if (item.children && item.children.length > 0) {
      return (
        <section key={item.id} className="rounded-sm border border-border bg-bg px-3 py-2.5">
          <div className="mb-2 text-xs font-semibold text-text" title={item.id}>
            {getStyleLabel(item.id)}
          </div>
          <div className="space-y-2.5">
            {item.children.map((c) => renderItem(c, [...path, c.id]))}
          </div>
        </section>
      );
    }
    return (
      <div key={item.id} className="min-w-0">
        <div className="mb-1 text-xs font-medium text-text-secondary" title={item.id}>
          {getStyleLabel(item.id)}
        </div>
        <StyleControl item={item} onChange={(value) => handleStyleChange(path, value)} />
      </div>
    );
  }

  const status = getSaveStatus(editMode, saveState);

  return (
    <motion.aside
      className={`fixed right-2 top-[60px] bottom-9 z-[70] flex w-[min(392px,calc(100vw-12px))] max-w-[calc(100vw-12px)] flex-col overflow-hidden rounded-lg border border-border bg-bg shadow-lg ${isOpen ? "pointer-events-auto" : "pointer-events-none"}`}
      initial={false}
      animate={{opacity: isOpen ? 1 : 0, x: isOpen ? 0 : 420}}
      transition={{duration: 0.18, ease: [0.16, 1, 0.3, 1]}}
      aria-hidden={!isOpen}
    >
      {model && (
        <>
          <header className="border-b border-border bg-bg px-4 pb-3 pt-3.5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-text" title={model.id}>
                  {model.label || getModelLabel(model.id)}
                </div>
                <div className="mt-1 truncate text-[11px] text-text-muted" title={`${theme.name} · ${theme.id}`}>
                  {theme.name} · {theme.id}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedModel(null)}
                className="inline-flex h-8 w-8 flex-none cursor-pointer items-center justify-center rounded-sm border border-border bg-bg text-text-muted transition-colors duration-fast hover:bg-bg-tertiary hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]"
                aria-label="关闭面板"
                title="关闭面板"
              >
                <X size={16} />
              </button>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-1 rounded-sm border border-border bg-bg-secondary p-1">
              <button
                type="button"
                onClick={() => switchMode("temporary")}
                className={modeButtonClass(editMode === "temporary")}
              >
                临时修改
              </button>
              <button
                type="button"
                onClick={() => switchMode("permanent")}
                className={modeButtonClass(editMode === "permanent")}
              >
                永久修改
              </button>
            </div>
            <p className="mt-2 text-xs leading-5 text-text-muted">
              {editMode === "temporary"
                ? "临时修改只影响当前预览，关闭或切换主题后不写回主题文件。"
                : "永久修改保存后写回当前主题文件，之后新文档和下次启动都会沿用。"}
            </p>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto bg-bg-secondary/60 px-3 py-3">
            <div className="space-y-3">
              {model.styles.map((s) => renderItem(s, [s.id]))}
            </div>
          </div>

          <footer className="flex items-center justify-between gap-3 border-t border-border bg-bg px-4 py-3">
            <div className="flex min-w-0 items-center gap-2 text-xs text-text-muted">
              <span className={statusDotClass(status.tone)} aria-hidden="true" />
              <span className="truncate">{status.label}</span>
            </div>
            <button
              type="button"
              onClick={handleSave}
              disabled={saveState === "saving"}
              className="inline-flex h-8 flex-none cursor-pointer items-center justify-center rounded-sm border border-accent bg-accent px-3 text-xs font-semibold text-white transition-colors duration-fast hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] disabled:cursor-default disabled:opacity-60"
            >
              {editMode === "temporary" ? "应用临时修改" : "保存到主题文件"}
            </button>
          </footer>
        </>
      )}
    </motion.aside>
  );
}

function modeButtonClass(active: boolean) {
  return [
    "h-7 rounded-sm border-0 px-2 text-xs font-semibold transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]",
    active
      ? "bg-bg text-accent shadow-sm cursor-default"
      : "bg-transparent text-text-muted cursor-pointer hover:text-text",
  ].join(" ");
}

function getSaveStatus(editMode: StyleEditMode, saveState: SaveState): {label: string; tone: "idle" | "saving" | "success" | "error"} {
  if (editMode === "temporary") return {label: "预览中临时生效", tone: "idle"};
  if (saveState === "saving") return {label: "正在保存主题文件", tone: "saving"};
  if (saveState === "saved") return {label: "已写回主题文件", tone: "success"};
  if (saveState === "error") return {label: "主题文件保存失败", tone: "error"};
  return {label: "等待保存到主题文件", tone: "idle"};
}

function statusDotClass(tone: "idle" | "saving" | "success" | "error") {
  const color = {
    idle: "bg-warning",
    saving: "bg-accent",
    success: "bg-success",
    error: "bg-danger",
  }[tone];
  return `h-2 w-2 flex-none rounded-full ${color}`;
}
