import {useState, useRef, useEffect} from "react";
import {markdownThemes} from "../../themes/index.ts";
import {useStore} from "../../store/index.ts";

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

export default function ThemeMenu() {
  const {markdownThemeId, setMarkdownTheme} = useStore();
  const [open, setOpen] = useState(false);
  const ref = useClickOutside(() => setOpen(false));

  function pickTheme(id: string) {
    setMarkdownTheme(id);
    setOpen(false);
  }

  return (
    <div ref={ref} style={{position: "relative"}}>
      <button style={btnStyle} onClick={() => setOpen(!open)}>
        主题 ▾
      </button>
      {open && (
        <div style={panelStyle}>
          {markdownThemes.map((t) => {
            const active = t.id === markdownThemeId;
            return (
              <div
                key={t.id}
                style={{...itemStyle, background: active ? "#f0f6ff" : "#fff"}}
                onClick={() => pickTheme(t.id)}
              >
                <span>{t.name}</span>
                {active && <span style={{color: "#1e6eee"}}>✓</span>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
