import {useEffect, useRef, useState} from "react";
import {useStore} from "../../store/index.ts";
import {loadAllThemes, openThemesDir} from "../../themes/loader.ts";
import ThemeThumbnail from "./ThemeThumbnail.tsx";

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
  const {markdownThemeId, setMarkdownTheme, themes, setThemes} = useStore();
  const [page, setPage] = useState(0);
  const ref = useClickOutside(onClose);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const totalPages = Math.max(1, Math.ceil(themes.length / PAGE_SIZE));
  // themes 重新扫描后可能变少，page 越界则夹回最后一页，避免空白页。
  const safePage = Math.min(page, totalPages - 1);
  const pageThemes = themes.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

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

  return (
    <div
      ref={ref}
      style={{
        position: "fixed",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        width: 880,
        maxWidth: "92vw",
        maxHeight: "86vh",
        background: "#fff",
        borderRadius: 8,
        boxShadow: "0 8px 40px rgba(0,0,0,0.18)",
        zIndex: 1000,
        display: "flex",
        flexDirection: "column",
        padding: 20,
      }}
    >
      <button
        onClick={onClose}
        style={{
          position: "absolute",
          top: 12,
          right: 16,
          border: "none",
          background: "transparent",
          fontSize: 20,
          color: "#999",
          cursor: "pointer",
          lineHeight: 1,
        }}
        aria-label="关闭"
      >
        ×
      </button>

      <div
        style={{
          flex: 1,
          overflowY: "auto",
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 16,
          marginTop: 8,
        }}
      >
        {pageThemes.map((t) => {
          const active = t.id === markdownThemeId;
          return (
            <div
              key={t.id}
              style={{
                border: active ? "2px solid #1e6bb8" : "1px solid #e8e8e8",
                borderRadius: 6,
                padding: 8,
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              <ThemeThumbnail themeId={t.id} css={t.css} />
              <div style={{display: "flex", justifyContent: "space-between", alignItems: "center"}}>
                <span style={{fontSize: 13, color: "#333"}}>{t.name}</span>
                <button
                  onClick={() => pick(t.id)}
                  style={{
                    height: 26,
                    padding: "0 12px",
                    fontSize: 12,
                    border: "1px solid #1e6bb8",
                    borderRadius: 4,
                    background: active ? "#1e6bb8" : "#fff",
                    color: active ? "#fff" : "#1e6bb8",
                    cursor: "pointer",
                  }}
                >
                  {active ? "已用" : "使用"}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginTop: 16,
        }}
      >
        <button
          onClick={openFolder}
          style={{
            height: 28,
            padding: "0 12px",
            fontSize: 12,
            border: "1px solid #d9d9d9",
            borderRadius: 4,
            background: "#fff",
            color: "#1e6bb8",
            cursor: "pointer",
          }}
        >
          ＋ 打开主题文件夹
        </button>

        {totalPages > 1 && (
          <div style={{display: "flex", alignItems: "center", gap: 6}}>
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={safePage === 0}
              style={pageBtn(safePage === 0)}
            >
              ‹
            </button>
            {Array.from({length: totalPages}, (_, idx) => (
              <button
                key={idx}
                onClick={() => setPage(idx)}
                style={{
                  ...pageBtn(false),
                  background: idx === safePage ? "#1e6bb8" : "#fff",
                  color: idx === safePage ? "#fff" : "#333",
                }}
              >
                {idx + 1}
              </button>
            ))}
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={safePage === totalPages - 1}
              style={pageBtn(safePage === totalPages - 1)}
            >
              ›
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function pageBtn(disabled: boolean): React.CSSProperties {
  return {
    minWidth: 28,
    height: 28,
    border: "1px solid #d9d9d9",
    borderRadius: 4,
    background: "#fff",
    color: "#333",
    cursor: disabled ? "default" : "pointer",
    opacity: disabled ? 0.4 : 1,
    fontSize: 13,
  };
}
