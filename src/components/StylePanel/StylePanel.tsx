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
type DirectionGroup = "margin" | "padding";

const TYPOGRAPHY_ORDER = ["fontSize", "lineHeight", "letterSpacing", "fontWeight", "textAlign", "fontColor", "color"];
const TYPOGRAPHY_STYLE_IDS = new Set(TYPOGRAPHY_ORDER);
const SPACING_STYLE_IDS = new Set(["marginPadding", "margin", "padding"]);
const DIRECTION_ORDER: Record<DirectionGroup, string[]> = {
  margin: ["marginTop", "marginRight", "marginBottom", "marginLeft"],
  padding: ["paddingTop", "paddingRight", "paddingBottom", "paddingLeft"],
};

const TYPOGRAPHY_SPANS: Record<string, string> = {
  fontSize: "col-span-2",
  lineHeight: "col-span-2",
  letterSpacing: "col-span-2",
  fontWeight: "col-span-3",
  textAlign: "col-span-3",
  fontColor: "col-span-6",
  color: "col-span-6",
};

const DIRECTION_LABELS: Record<string, string> = {
  marginTop: "上",
  marginRight: "右",
  marginBottom: "下",
  marginLeft: "左",
  paddingTop: "上",
  paddingRight: "右",
  paddingBottom: "下",
  paddingLeft: "左",
};

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

  function renderField(
    item: StyleItem,
    path: string[],
    options: {className?: string; label?: string; compact?: boolean} = {},
  ) {
    const {className = "col-span-6", label = getStyleLabel(item.id), compact = false} = options;
    return (
      <div key={item.id} className={`min-w-0 ${className}`}>
        <div className="mb-1 text-[10px] font-medium leading-4 text-text-secondary" title={item.id}>
          {label}
        </div>
        <StyleControl item={item} compact={compact} onChange={(value) => handleStyleChange(path, value)} />
      </div>
    );
  }

  function renderNestedGroup(item: StyleItem, path: string[]) {
    if (!item.children?.length) return renderField(item, path);
    return (
      <div key={item.id} className="col-span-6 min-w-0">
        <div className="mb-2 text-[11px] font-semibold text-text" title={item.id}>
          {getStyleLabel(item.id)}
        </div>
        <div className="grid grid-cols-6 gap-x-2 gap-y-2">
          {item.children.map((child) =>
            child.children?.length
              ? renderNestedGroup(child, [...path, child.id])
              : renderField(child, [...path, child.id], {className: "col-span-6"}),
          )}
        </div>
      </div>
    );
  }

  function renderDirectionalRow(
    label: string,
    children: StyleItem[],
    parentPath: string[],
    order: string[],
  ) {
    const byId = new Map(children.map((child) => [child.id, child]));
    const orderedChildren = order.map((id) => byId.get(id)).filter((child): child is StyleItem => Boolean(child));
    if (orderedChildren.length === 0) return null;

    return (
      <div className="min-w-0">
        <div className="mb-1.5 flex items-center justify-between text-[10px] font-semibold text-text-secondary">
          <span>{label}</span>
          <span className="font-normal text-text-muted">{label === "外边距" ? "margin" : "padding"}</span>
        </div>
        <div className="grid grid-cols-4 gap-1.5">
          {orderedChildren.map((child) =>
            renderField(child, [...parentPath, child.id], {
              className: "min-w-0",
              label: DIRECTION_LABELS[child.id] ?? getStyleLabel(child.id),
              compact: true,
            }),
          )}
        </div>
      </div>
    );
  }

  function renderSpacingSection(items: StyleItem[]) {
    const spacingItems = items.filter((item) => SPACING_STYLE_IDS.has(item.id));
    if (spacingItems.length === 0) return null;

    return (
      <section className="border-b border-border px-3 py-2.5">
        <div className="mb-2 text-xs font-semibold text-text">间距</div>
        <div className="space-y-2.5">
          {spacingItems.map((item) => {
            if (item.id !== "marginPadding" || !item.children?.length) {
              return renderField(item, [item.id], {className: "col-span-6"});
            }
            return (
              <div key={item.id} className="space-y-2.5">
                {renderDirectionalRow("外边距", item.children, [item.id], DIRECTION_ORDER.margin)}
                {renderDirectionalRow("内边距", item.children, [item.id], DIRECTION_ORDER.padding)}
              </div>
            );
          })}
        </div>
      </section>
    );
  }

  const status = getSaveStatus(editMode, saveState);
  const typographyItems = model
    ? TYPOGRAPHY_ORDER.map((id) => model.styles.find((item) => item.id === id)).filter(
        (item): item is StyleItem => Boolean(item),
      )
    : [];
  const otherItems = model
    ? model.styles.filter((item) => !TYPOGRAPHY_STYLE_IDS.has(item.id) && !SPACING_STYLE_IDS.has(item.id))
    : [];

  return (
    <motion.aside
      className={`fixed right-2 top-[60px] bottom-9 z-[70] flex w-[clamp(420px,31vw,480px)] max-w-[calc(100vw-16px)] flex-col overflow-hidden rounded-lg border border-border bg-bg shadow-lg ${isOpen ? "pointer-events-auto" : "pointer-events-none"}`}
      initial={false}
      animate={{opacity: isOpen ? 1 : 0, x: isOpen ? 0 : 420}}
      transition={{duration: 0.18, ease: [0.16, 1, 0.3, 1]}}
      aria-hidden={!isOpen}
    >
      {model && (
        <>
          <header className="border-b border-border bg-bg px-3 pb-2 pt-2.5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-text" title={model.id}>
                  {model.label || getModelLabel(model.id)}
                </div>
                <div className="mt-0.5 truncate text-[10px] text-text-muted" title={`${theme.name} · ${theme.id}`}>
                  {theme.name} · {theme.id}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedModel(null)}
                className="inline-flex h-7 w-7 flex-none cursor-pointer items-center justify-center rounded-sm border-0 bg-transparent text-text-muted transition-colors duration-fast hover:bg-bg-tertiary hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]"
                aria-label="关闭面板"
                title="关闭面板"
              >
                <X size={15} />
              </button>
            </div>

            <div className="mt-2 grid grid-cols-2 gap-0.5 rounded-sm bg-bg-tertiary p-0.5">
              <button type="button" onClick={() => switchMode("temporary")} className={modeButtonClass(editMode === "temporary")}>
                临时修改
              </button>
              <button type="button" onClick={() => switchMode("permanent")} className={modeButtonClass(editMode === "permanent")}>
                永久修改
              </button>
            </div>
            <p className="mt-1 text-[10px] leading-4 text-text-muted">
              {editMode === "temporary"
                ? "仅影响当前预览，关闭或切换主题后不会写回。"
                : "保存后写回当前主题文件，之后的新文档也会沿用。"}
            </p>
          </header>

          <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto bg-bg">
            {typographyItems.length > 0 && (
              <section className="border-b border-border px-3 py-2.5">
                <div className="mb-2 text-xs font-semibold text-text">文字</div>
                <div className="grid grid-cols-6 gap-x-2 gap-y-2">
                  {typographyItems.map((item) =>
                    renderField(item, [item.id], {
                      className: TYPOGRAPHY_SPANS[item.id] ?? "col-span-6",
                      compact: TYPOGRAPHY_SPANS[item.id] === "col-span-2",
                    }),
                  )}
                </div>
              </section>
            )}

            {renderSpacingSection(model.styles)}

            {otherItems.length > 0 && (
              <section className="px-3 py-2.5">
                <div className="mb-2 text-xs font-semibold text-text">其他属性</div>
                <div className="grid grid-cols-6 gap-x-2 gap-y-2.5">
                  {otherItems.map((item) => renderNestedGroup(item, [item.id]))}
                </div>
              </section>
            )}
          </div>

          <footer className="flex items-center justify-between gap-2 border-t border-border bg-bg px-3 py-2">
            <div className="flex min-w-0 items-center gap-2 text-[11px] text-text-muted">
              <span className={statusDotClass(status.tone)} aria-hidden="true" />
              <span className="truncate">{status.label}</span>
            </div>
            <button
              type="button"
              onClick={handleSave}
              disabled={saveState === "saving"}
              className="inline-flex h-7 flex-none cursor-pointer appearance-none items-center justify-center rounded-sm border-0 bg-accent px-3 text-[11px] font-semibold text-white shadow-none transition-colors duration-fast hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] disabled:cursor-default disabled:opacity-60"
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
    "h-[26px] appearance-none rounded-sm border-0 px-2 text-[11px] font-semibold shadow-none transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]",
    active
      ? "bg-bg-secondary text-text cursor-default"
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
  return `h-1.5 w-1.5 flex-none rounded-full ${color}`;
}
