import {useEffect, useState} from "react";
import {toast, type ToastItem} from "./toast.ts";

// 固定右下角堆叠显示。挂在 App 根，订阅 toast 单例。
export default function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([]);
  useEffect(() => toast.subscribe(setItems), []);

  return (
    <div
      style={{
        position: "fixed",
        right: 16,
        bottom: 40,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        zIndex: 1000,
        pointerEvents: "none",
      }}
    >
      {items.map((it) => (
        <div
          key={it.id}
          style={{
            maxWidth: 360,
            padding: "10px 14px",
            borderRadius: 6,
            background: "rgba(40,40,40,0.92)",
            color: "#fff",
            fontSize: 13,
            lineHeight: 1.5,
            boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
            borderLeft: it.type === "error" ? "3px solid #e54545" : "3px solid #07c160",
          }}
        >
          {it.message}
        </div>
      ))}
    </div>
  );
}
