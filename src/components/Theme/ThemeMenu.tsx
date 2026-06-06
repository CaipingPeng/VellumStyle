import {useState, useRef, useEffect} from "react";
import {useStore} from "../../store/index.ts";
import {loadAllThemes, openThemesDir} from "../../themes/loader.ts";

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

const btnStyle: React.CSSProperties = {
  height: 32,
  padding: "0 12px",
  border: "1px solid #e8e8e8",
  borderRadius: 4,
  background: "#fff",
  cursor: "pointer",
  fontSize: 13,
};

const panelStyle: React.CSSProperties = {
  position: "absolute",
  top: 36,
  left: 0,
  minWidth: 160,
  background: "#fff",
  border: "1px solid #e8e8e8",
  borderRadius: 4,
  boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
  zIndex: 100,
  padding: "4px 0",
};

const itemStyle: React.CSSProperties = {
  padding: "6px 12px",
  cursor: "pointer",
  fontSize: 13,
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
};

const groupTitleStyle: React.CSSProperties = {
  padding: "6px 12px 4px",
  fontSize: 12,
  color: "#999",
};

function renderThemeItem(id: string, name: string, activeId: string, onPick: (id: string) => void) {
  const active = id === activeId;
  return (
    <div
      key={id}
      style={{...itemStyle, background: active ? "#f0f6ff" : "#fff"}}
      onClick={() => onPick(id)}
    >
      <span>{name}</span>
      {active && <span style={{color: "#1e6eee"}}>✓</span>}
    </div>
  );
}

export default function ThemeMenu() {
  const {markdownThemeId, setMarkdownTheme, themes, setThemes} = useStore();
  const [open, setOpen] = useState(false);
  const ref = useClickOutside(() => setOpen(false));

  function pickTheme(id: string) {
    setMarkdownTheme(id);
    setOpen(false);
  }

  // 打开主题文件夹后重新扫描，方便用户丢入新 CSS 后立即看到。
  async function openFolder() {
    await openThemesDir();
    setThemes(await loadAllThemes());
  }

  return (
    <>
      <div ref={ref} style={{position: "relative"}}>
        <button style={btnStyle} onClick={() => setOpen(!open)}>
          主题 ▾
        </button>
        {open && (
          <div style={panelStyle}>
            <div style={groupTitleStyle}>主题</div>
            {themes.map((t) => renderThemeItem(t.id, t.name, markdownThemeId, pickTheme))}
            <div style={{borderTop: "1px solid #f0f0f0", marginTop: 4, paddingTop: 4}}>
              <div
                style={{...itemStyle, color: "#1e6eee"}}
                onClick={openFolder}
              >
                <span>＋ 打开主题文件夹</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
