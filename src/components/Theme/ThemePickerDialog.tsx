import {useEffect, useRef, useState} from "react";
import {useStore} from "../../store/index.ts";
import {loadAllThemes, openThemesDir, importMdniceTheme} from "../../themes/loader.ts";
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
        window.alert("导入失败：" + (e as Error).message);
      }
    };
    input.click();
  }

  return (
    <div
      ref={ref}
      style={{
        position: "fixed",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        width: 920,
        maxWidth: "92vw",
        maxHeight: "86vh",
        background: "#fbfcfe",
        border: "1px solid rgba(20, 35, 60, 0.08)",
        borderRadius: 18,
        boxShadow: "0 24px 70px rgba(15, 23, 42, 0.18)",
        zIndex: 1000,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "24px 28px 18px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 16,
        }}
      >
        <div>
          <div style={{fontSize: 18, fontWeight: 650, color: "#172033"}}>选择排版主题</div>
          <div style={{marginTop: 6, fontSize: 13, color: "#7b8496"}}>预览主题效果，选择后会立即应用到右侧预览区。</div>
        </div>
        <button
          onClick={onClose}
          style={{
            width: 32,
            height: 32,
            border: "1px solid #e6e9ef",
            borderRadius: 999,
            background: "#fff",
            fontSize: 20,
            color: "#8b93a3",
            cursor: "pointer",
            lineHeight: "28px",
            flex: "0 0 auto",
          }}
          aria-label="关闭"
        >
          ×
        </button>
      </div>

      <div
        style={{
          flex: 1,
          overflowY: "auto",
          display: "grid",
          gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
          gap: 18,
          padding: "4px 28px 22px",
        }}
      >
        {pageThemes.map((t) => {
          const active = t.id === markdownThemeId;
          return (
            <div
              key={t.id}
              style={{
                border: "1px solid " + (active ? "#2f7dd3" : "#e8ebf1"),
                borderRadius: 14,
                padding: 12,
                background: "#fff",
                boxShadow: active ? "0 0 0 3px rgba(30, 107, 184, 0.12)" : "0 10px 24px rgba(15, 23, 42, 0.04)",
                display: "flex",
                flexDirection: "column",
                gap: 10,
                minWidth: 0,
              }}
            >
              <ThemeThumbnail themeId={t.id} css={t.css} />
              <div style={{display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, minWidth: 0}}>
                <span
                  title={t.name}
                  style={{
                    minWidth: 0,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    fontSize: 13,
                    fontWeight: 550,
                    color: "#273142",
                  }}
                >
                  {t.name}
                </span>
                <button
                  onClick={() => pick(t.id)}
                  style={{
                    height: 28,
                    minWidth: 52,
                    padding: "0 14px",
                    fontSize: 12,
                    fontWeight: 600,
                    border: "1px solid #1e6bb8",
                    borderRadius: 999,
                    background: active ? "#1e6bb8" : "#f7fbff",
                    color: active ? "#fff" : "#1e6bb8",
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                    flex: "0 0 auto",
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
          gap: 12,
          padding: "16px 28px 22px",
          borderTop: "1px solid #edf0f5",
          background: "#fff",
        }}
      >
        <div style={{display: "flex", alignItems: "center", gap: 8}}>
          <button
            onClick={openFolder}
            style={secondaryBtn()}
          >
            ＋ 打开主题文件夹
          </button>

          <button
            onClick={importTheme}
            style={secondaryBtn()}
          >
            ↑ 导入 mdnice 主题
          </button>
        </div>

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
                  borderColor: idx === safePage ? "#1e6bb8" : "#dfe3ea",
                  color: idx === safePage ? "#fff" : "#334155",
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

function secondaryBtn(): React.CSSProperties {
  return {
    height: 32,
    padding: "0 14px",
    fontSize: 12,
    fontWeight: 550,
    border: "1px solid #dfe3ea",
    borderRadius: 999,
    background: "#fff",
    color: "#1e6bb8",
    cursor: "pointer",
    whiteSpace: "nowrap",
  };
}

function pageBtn(disabled: boolean): React.CSSProperties {
  return {
    minWidth: 30,
    height: 30,
    border: "1px solid #dfe3ea",
    borderRadius: 999,
    background: "#fff",
    color: "#334155",
    cursor: disabled ? "default" : "pointer",
    opacity: disabled ? 0.38 : 1,
    fontSize: 13,
  };
}
