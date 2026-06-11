import {type FormEvent, useEffect, useMemo, useRef, useState} from "react";
import {createPortal} from "react-dom";
import {motion} from "framer-motion";
import {ArrowRight, Braces, Check, ChevronLeft, ChevronRight, FolderOpen, Palette, Search, Star, Upload, X} from "lucide-react";
import {getThemeById, useStore} from "../../store/index.ts";
import {CODE_THEMES, getCodeThemeById} from "../../markdown/codeThemes.ts";
import {loadAllThemes, openThemesDir, importMdniceTheme} from "../../themes/loader.ts";
import {toast} from "../Toast/toast.ts";
import IconButton from "../ui/IconButton.tsx";
import CodeThemeThumbnail from "./CodeThemeThumbnail.tsx";
import ThemeThumbnail from "./ThemeThumbnail.tsx";
import {
  filterAndRankCodeThemes,
  filterAndRankThemes,
  getPageJumpRange,
  getPageJumpTarget,
  shouldShowPageJumpInput,
} from "./themePickerModel.ts";

const MARKDOWN_PAGE_SIZE = 8;
const CODE_PAGE_SIZE = 12;
const PAGE_JUMP_COUNT = 6;
const PAGE_INPUT_THRESHOLD = 10;

type ThemeTab = "markdown" | "code";

function useClickOutside(onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);
  return ref;
}

interface Props {
  onClose: () => void;
}

// 居中浮层：网格卡片（缩略图 + 名 + 使用）+ 分页 + 主题文件操作。
export default function ThemePickerDialog({onClose}: Props) {
  const {markdownThemeId, setMarkdownTheme, codeThemeId, setCodeTheme, themes, setThemes, favoriteThemeIds, toggleFavoriteTheme} = useStore();
  const [activeTab, setActiveTab] = useState<ThemeTab>("markdown");
  const [page, setPage] = useState(0);
  const [query, setQuery] = useState("");
  const [jumpPage, setJumpPage] = useState("");
  const ref = useClickOutside(onClose);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    setPage(0);
    setJumpPage("");
  }, [activeTab, query]);

  const visibleThemes = useMemo(
    () => filterAndRankThemes(themes, query, favoriteThemeIds, markdownThemeId),
    [favoriteThemeIds, markdownThemeId, query, themes],
  );
  const visibleCodeThemes = useMemo(
    () => filterAndRankCodeThemes(CODE_THEMES, query, codeThemeId),
    [codeThemeId, query],
  );

  const isCodeTab = activeTab === "code";
  const pageSize = isCodeTab ? CODE_PAGE_SIZE : MARKDOWN_PAGE_SIZE;
  const visibleCount = isCodeTab ? visibleCodeThemes.length : visibleThemes.length;
  const totalPages = Math.max(1, Math.ceil(visibleCount / pageSize));
  // themes 重新扫描后可能变少，page 越界则夹回最后一页，避免空白页。
  const safePage = Math.min(page, totalPages - 1);
  const pageThemes = visibleThemes.slice(safePage * MARKDOWN_PAGE_SIZE, safePage * MARKDOWN_PAGE_SIZE + MARKDOWN_PAGE_SIZE);
  const pageCodeThemes = visibleCodeThemes.slice(safePage * CODE_PAGE_SIZE, safePage * CODE_PAGE_SIZE + CODE_PAGE_SIZE);
  const pageJumpRange = getPageJumpRange(safePage, totalPages, PAGE_JUMP_COUNT);
  const showPageJumpInput = shouldShowPageJumpInput(totalPages, PAGE_INPUT_THRESHOLD);
  const currentTheme = getThemeById(themes, markdownThemeId);
  const currentCodeTheme = getCodeThemeById(codeThemeId);

  function pick(id: string) {
    setMarkdownTheme(id);
    onClose();
  }

  function pickCodeTheme(id: string) {
    setCodeTheme(id);
  }

  function jumpToPage(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const target = getPageJumpTarget(jumpPage, totalPages);
    if (target === null) {
      setJumpPage("");
      return;
    }
    setPage(target);
    setJumpPage("");
  }

  async function openFolder() {
    // 非 Tauri（web 调试）下 openThemesDir 会 reject，吞掉错误仍尝试重新扫描。
    try {
      await openThemesDir();
    } catch {
      // 无 Tauri 环境，忽略
    }
    setThemes(await loadAllThemes());
  }

  function importTheme() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const raw = await file.text();
      const name = file.name.replace(/\.json$/i, "");
      try {
        await importMdniceTheme(name, raw);
        setThemes(await loadAllThemes());
      } catch (e) {
        toast.show(`导入失败：${(e as Error).message}`, "error");
      }
    };
    input.click();
  }

  return createPortal(
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-[rgba(20,20,30,0.32)]">
      <motion.div
        ref={ref}
        initial={{opacity: 0, scale: 0.96, y: 8}}
        animate={{opacity: 1, scale: 1, y: 0}}
        transition={{duration: 0.13}}
        className="flex w-[920px] max-w-[92vw] max-h-[86vh] flex-col overflow-hidden rounded-lg border border-border bg-bg shadow-lg"
      >
      <div className="flex items-start justify-between gap-4 px-7 pb-[18px] pt-6">
        <div>
          <div className="text-lg font-semibold text-text">选择主题</div>
          <div className="mt-1.5 text-[13px] text-text-secondary">
            {isCodeTab
              ? `${visibleCodeThemes.length} 个代码主题 · 当前 ${currentCodeTheme.name}`
              : `${visibleThemes.length} 个排版主题 · ${favoriteThemeIds.length} 个收藏 · 当前 ${currentTheme.name}`}
          </div>
        </div>
        <IconButton
          onClick={onClose}
          aria-label="关闭"
          title="关闭"
          className="flex-none text-text-muted hover:text-text"
        >
          <X size={16} />
        </IconButton>
      </div>

      <div className="px-7 pb-3">
        <div className="inline-flex h-9 overflow-hidden rounded-sm border border-border bg-bg-secondary p-0.5 shadow-sm" role="tablist" aria-label="主题类型">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "markdown"}
            onClick={() => setActiveTab("markdown")}
            className={tabButtonClass(activeTab === "markdown")}
          >
            <Palette size={14} />
            排版主题
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "code"}
            onClick={() => setActiveTab("code")}
            className={tabButtonClass(activeTab === "code")}
          >
            <Braces size={14} />
            代码主题
          </button>
        </div>
      </div>

      <div className="px-7 pb-4">
        <label className="flex h-9 items-center gap-2 rounded-sm border border-border bg-bg-secondary px-3 text-text-muted focus-within:ring-2 focus-within:ring-[color:var(--ring)]">
          <Search size={15} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={isCodeTab ? "搜索代码主题名称、id 或分组" : "搜索排版主题名称或 id"}
            className="min-w-0 flex-1 border-0 bg-transparent text-[13px] text-text outline-none placeholder:text-text-muted"
          />
        </label>
      </div>

      {isCodeTab ? (
        <div className="grid flex-1 grid-cols-[repeat(auto-fit,minmax(210px,1fr))] auto-rows-max gap-[14px] overflow-y-auto px-7 pb-[22px] pt-1">
          {pageCodeThemes.length === 0 && (
            <div className="col-span-full flex min-h-[240px] items-center justify-center text-sm text-text-muted">
              没有匹配的主题
            </div>
          )}
          {pageCodeThemes.map((theme) => {
            const active = theme.id === currentCodeTheme.id;
            return (
              <div
                key={theme.id}
                className={[
                  "group flex min-w-0 flex-col gap-2.5 rounded-sm border bg-bg p-3 shadow-sm transition-all duration-fast ease-smooth hover:border-border-strong hover:shadow-md",
                  active ? "border-accent bg-[rgba(94,106,210,0.035)] ring-2 ring-[color:var(--ring)]" : "border-border",
                ].join(" ")}
              >
                <CodeThemeThumbnail theme={theme} />
                <div className="flex min-w-0 items-center justify-between gap-2.5">
                  <div className="min-w-0">
                    <div
                      title={`${theme.name} (${theme.id})`}
                      className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[13px] font-medium text-text"
                    >
                      {theme.name}
                    </div>
                    <div className="mt-0.5 overflow-hidden text-ellipsis whitespace-nowrap text-[11px] text-text-muted">
                      {theme.group}
                    </div>
                  </div>
                  {active ? (
                    <span className="inline-flex h-7 flex-none items-center gap-1 whitespace-nowrap rounded-sm bg-accent-subtle px-2.5 text-xs font-medium text-accent">
                      <Check size={13} />
                      已应用
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => pickCodeTheme(theme.id)}
                      className="h-7 flex-none whitespace-nowrap rounded-sm border border-transparent bg-transparent px-2.5 text-xs font-medium text-text-muted cursor-pointer transition-colors duration-fast hover:bg-accent-subtle hover:text-accent focus-visible:bg-accent-subtle focus-visible:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]"
                    >
                      使用
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="grid flex-1 grid-cols-[repeat(auto-fit,minmax(190px,1fr))] auto-rows-max gap-[18px] overflow-y-auto px-7 pb-[22px] pt-1">
          {pageThemes.length === 0 && (
            <div className="col-span-full flex min-h-[240px] items-center justify-center text-sm text-text-muted">
              没有匹配的主题
            </div>
          )}
          {pageThemes.map((t) => {
            const active = t.id === markdownThemeId;
            const favorite = favoriteThemeIds.includes(t.id);
            return (
              <div
                key={t.id}
                className={[
                  "group flex min-w-0 flex-col gap-2.5 rounded-sm border bg-bg p-3 shadow-sm transition-all duration-fast ease-smooth hover:border-border-strong hover:shadow-md",
                  active ? "border-accent bg-[rgba(94,106,210,0.035)] ring-2 ring-[color:var(--ring)]" : "border-border",
                ].join(" ")}
              >
                <ThemeThumbnail themeId={t.id} css={t.css} />
                <div className="flex min-w-0 items-center justify-between gap-2.5">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => toggleFavoriteTheme(t.id)}
                      title={favorite ? "取消收藏" : "收藏主题"}
                      className={[
                        "inline-flex h-6 w-6 flex-none items-center justify-center rounded-sm border-0 bg-transparent cursor-pointer transition-colors duration-fast",
                        favorite ? "text-accent" : "text-text-muted hover:bg-bg-tertiary hover:text-text",
                      ].join(" ")}
                    >
                      <Star size={14} fill={favorite ? "currentColor" : "none"} />
                    </button>
                    <span
                      title={`${t.name} (${t.id})`}
                      className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[13px] font-medium text-text"
                    >
                      {t.name}
                    </span>
                  </div>
                  {active ? (
                    <span className="inline-flex h-7 flex-none items-center gap-1 whitespace-nowrap rounded-sm bg-accent-subtle px-2.5 text-xs font-medium text-accent">
                      <Check size={13} />
                      已应用
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => pick(t.id)}
                      className="h-7 flex-none whitespace-nowrap rounded-sm border border-transparent bg-transparent px-2.5 text-xs font-medium text-text-muted cursor-pointer transition-colors duration-fast hover:bg-accent-subtle hover:text-accent focus-visible:bg-accent-subtle focus-visible:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]"
                    >
                      使用
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex items-center justify-between gap-3 border-t border-border bg-bg px-7 pb-[22px] pt-4">
        {isCodeTab ? (
          <div className="text-xs font-medium text-text-muted">
            Highlight.js · Base16 · {CODE_THEMES.length} 个主题
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <button onClick={openFolder} className={secondaryBtnClass}>
              <FolderOpen size={14} /> 打开主题文件夹
            </button>

            <button onClick={importTheme} className={secondaryBtnClass}>
              <Upload size={14} /> 导入主题文件
            </button>
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex flex-wrap items-center justify-end gap-2">
            <div className="inline-flex h-8 items-center overflow-hidden rounded-sm border border-border bg-bg shadow-sm">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={safePage === 0}
                className={pageNavBtnClass}
                aria-label="上一页"
              >
                <ChevronLeft size={15} />
              </button>
              {pageJumpRange.map((pageIndex) => {
                const active = pageIndex === safePage;
                return (
                  <button
                    key={pageIndex}
                    type="button"
                    onClick={() => setPage(pageIndex)}
                    aria-current={active ? "page" : undefined}
                    aria-label={`跳转到第 ${pageIndex + 1} 页`}
                    className={[pageJumpBtnClass, active ? pageJumpActiveClass : pageJumpIdleClass].join(" ")}
                  >
                    {pageIndex + 1}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={safePage === totalPages - 1}
                className={`${pageNavBtnClass} border-l border-border`}
                aria-label="下一页"
              >
                <ChevronRight size={15} />
              </button>
            </div>

            {showPageJumpInput && (
              <form
                onSubmit={jumpToPage}
                className="inline-flex h-8 items-center overflow-hidden rounded-sm border border-border bg-bg shadow-sm focus-within:ring-2 focus-within:ring-[color:var(--ring)]"
              >
                <span className="flex h-full items-center border-r border-border px-2 text-xs font-medium text-text-muted">
                  跳至
                </span>
                <input
                  value={jumpPage}
                  onChange={(e) => setJumpPage(e.target.value)}
                  type="number"
                  min={1}
                  max={totalPages}
                  step={1}
                  inputMode="numeric"
                  placeholder={`${safePage + 1}`}
                  aria-label={`输入要跳转的页码，共 ${totalPages} 页`}
                  className="h-full w-[52px] border-0 bg-bg px-2 text-center text-xs font-medium tabular-nums text-text outline-none placeholder:text-text-muted"
                />
                <button
                  type="submit"
                  disabled={jumpPage.trim() === ""}
                  className="inline-flex h-full w-8 items-center justify-center border-0 border-l border-border bg-bg text-text-secondary transition-colors duration-fast enabled:cursor-pointer enabled:hover:bg-bg-tertiary enabled:hover:text-text disabled:cursor-default disabled:opacity-[0.38]"
                  aria-label="跳转到输入页码"
                  title="跳转"
                >
                  <ArrowRight size={14} />
                </button>
              </form>
            )}
          </div>
        )}
      </div>
      </motion.div>
    </div>,
    document.body,
  );
}

const secondaryBtnClass =
  "inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-sm border border-transparent bg-transparent px-2.5 text-xs font-medium text-text-muted cursor-pointer transition-colors duration-fast ease-smooth hover:bg-bg-secondary hover:text-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] [&>svg]:opacity-70 [&>svg]:transition-opacity [&>svg]:duration-fast hover:[&>svg]:opacity-100";

function tabButtonClass(active: boolean) {
  return [
    "inline-flex h-full items-center gap-1.5 whitespace-nowrap rounded-sm border-0 px-3 text-xs font-medium transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]",
    active
      ? "bg-bg text-text shadow-sm cursor-default"
      : "bg-transparent text-text-muted cursor-pointer hover:text-text",
  ].join(" ");
}

const pageNavBtnClass =
  "inline-flex h-full w-8 items-center justify-center border-0 bg-bg text-text-secondary transition-colors duration-fast enabled:cursor-pointer enabled:hover:bg-bg-tertiary enabled:hover:text-text disabled:cursor-default disabled:opacity-[0.38]";

const pageJumpBtnClass =
  "inline-flex h-full min-w-8 items-center justify-center border-0 border-l border-border px-2 text-xs font-medium tabular-nums transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color:var(--ring)]";

const pageJumpIdleClass =
  "bg-bg text-text-secondary cursor-pointer hover:bg-bg-tertiary hover:text-text";

const pageJumpActiveClass =
  "bg-accent-subtle text-accent cursor-default";
