import {useEffect, useMemo, useRef, useState} from "react";
import {createPortal} from "react-dom";
import {motion} from "framer-motion";
import {X, Plus, Upload, Search, Star} from "lucide-react";
import {useStore} from "../../store/index.ts";
import {loadAllThemes, openThemesDir, importMdniceTheme} from "../../themes/loader.ts";
import {toast} from "../Toast/toast.ts";
import ThemeThumbnail from "./ThemeThumbnail.tsx";
import {filterAndRankThemes} from "./themePickerModel.ts";

const PAGE_SIZE = 8;

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

// 无遮罩居中浮层：网格卡片（缩略图 + 名 + 使用）+ 分页 + 打开主题文件夹。
export default function ThemePickerDialog({onClose}: Props) {
  const {markdownThemeId, setMarkdownTheme, themes, setThemes, favoriteThemeIds, toggleFavoriteTheme} = useStore();
  const [page, setPage] = useState(0);
  const [query, setQuery] = useState("");
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
  }, [query]);

  const visibleThemes = useMemo(
    () => filterAndRankThemes(themes, query, favoriteThemeIds, markdownThemeId),
    [favoriteThemeIds, markdownThemeId, query, themes],
  );

  const totalPages = Math.max(1, Math.ceil(visibleThemes.length / PAGE_SIZE));
  // themes 重新扫描后可能变少，page 越界则夹回最后一页，避免空白页。
  const safePage = Math.min(page, totalPages - 1);
  const pageThemes = visibleThemes.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  function pick(id: string) {
    setMarkdownTheme(id);
    onClose();
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
          <div className="text-lg font-semibold text-text">选择排版主题</div>
          <div className="mt-1.5 text-[13px] text-text-secondary">预览主题效果，选择后会立即应用到右侧预览区。</div>
        </div>
        <button
          onClick={onClose}
          className="inline-flex h-8 w-8 flex-none items-center justify-center rounded-full border border-border bg-bg text-text-muted cursor-pointer transition-colors duration-fast hover:bg-bg-tertiary hover:text-text"
          aria-label="关闭"
        >
          <X size={16} />
        </button>
      </div>

      <div className="px-7 pb-4">
        <label className="flex h-9 items-center gap-2 rounded-sm border border-border bg-bg-secondary px-3 text-text-muted focus-within:ring-2 focus-within:ring-[color:var(--ring)]">
          <Search size={15} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索主题名称或 id"
            className="min-w-0 flex-1 border-0 bg-transparent text-[13px] text-text outline-none placeholder:text-text-muted"
          />
        </label>
      </div>

      <div className="grid flex-1 grid-cols-4 gap-[18px] overflow-y-auto px-7 pb-[22px] pt-1">
        {pageThemes.length === 0 && (
          <div className="col-span-4 flex min-h-[240px] items-center justify-center text-sm text-text-muted">
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
                "flex min-w-0 flex-col gap-2.5 rounded-md border bg-bg p-3 shadow-sm transition-colors duration-fast",
                active ? "border-accent ring-2 ring-[color:var(--accent)]" : "border-border",
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
                <button
                  onClick={() => pick(t.id)}
                  className={[
                    "h-7 min-w-[52px] flex-none whitespace-nowrap rounded-full border border-accent px-3.5 text-xs font-semibold cursor-pointer transition-colors duration-fast",
                    active ? "bg-accent text-white" : "bg-accent-subtle text-accent hover:bg-accent hover:text-white",
                  ].join(" ")}
                >
                  {active ? "已用" : "使用"}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-border bg-bg px-7 pb-[22px] pt-4">
        <div className="flex items-center gap-2">
          <button onClick={openFolder} className={secondaryBtnClass}>
            <Plus size={14} /> 打开主题文件夹
          </button>

          <button onClick={importTheme} className={secondaryBtnClass}>
            <Upload size={14} /> 导入 mdnice 主题
          </button>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={safePage === 0}
              className={pageBtnClass(safePage === 0)}
            >
              ‹
            </button>
            {Array.from({length: totalPages}, (_, idx) => (
              <button
                key={idx}
                onClick={() => setPage(idx)}
                className={[
                  pageBtnClass(false),
                  idx === safePage ? "border-accent bg-accent text-white" : "",
                ].join(" ")}
              >
                {idx + 1}
              </button>
            ))}
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={safePage === totalPages - 1}
              className={pageBtnClass(safePage === totalPages - 1)}
            >
              ›
            </button>
          </div>
        )}
      </div>
      </motion.div>
    </div>,
    document.body,
  );
}

const secondaryBtnClass =
  "inline-flex h-8 items-center gap-1 whitespace-nowrap rounded-full border border-border bg-bg px-3.5 text-xs font-medium text-accent cursor-pointer transition-colors duration-fast hover:bg-bg-tertiary";

function pageBtnClass(disabled: boolean): string {
  return [
    "inline-flex min-w-[30px] h-[30px] items-center justify-center rounded-full border border-border bg-bg text-[13px] text-text-secondary transition-colors duration-fast",
    disabled ? "opacity-[0.38] cursor-default" : "cursor-pointer hover:border-accent",
  ].join(" ");
}
