import {useState} from "react";
import {solveHtml} from "../../markdown/converter.ts";
import {waitForMathJaxIdle} from "../../markdown/mathjax.ts";
import {copyHtml} from "../../utils/clipboard.ts";

// 复制到微信：生成内联 HTML 并写入剪贴板（text/html）。
export default function CopyButton() {
  const [status, setStatus] = useState<"idle" | "copying" | "ok" | "fail">("idle");

  const handleCopy = async () => {
    setStatus("copying");
    try {
      await waitForMathJaxIdle();
      const html = solveHtml();
      if (!html) {
        setStatus("fail");
        window.setTimeout(() => setStatus("idle"), 2000);
        return;
      }
      const ok = await copyHtml(html);
      setStatus(ok ? "ok" : "fail");
    } catch (error) {
      console.error("复制前 MathJax 排版失败", error);
      setStatus("fail");
    }
    window.setTimeout(() => setStatus("idle"), 2000);
  };

  const label = status === "ok" ? "✓ 已复制" : status === "fail" ? "复制失败" : status === "copying" ? "复制中…" : "复制到微信";

  return (
    <button
      onClick={handleCopy}
      disabled={status === "copying"}
      style={{
        padding: "6px 16px",
        background: status === "ok" ? "#07c160" : "#1e6bb8",
        color: "#fff",
        border: "none",
        borderRadius: 4,
        cursor: "pointer",
        fontSize: 14,
      }}
    >
      {label}
    </button>
  );
}
