// 把 HTML 写入剪贴板，必须用 text/html MIME 类型，微信编辑器才会按格式渲染。
export async function copyHtml(html: string): Promise<boolean> {
  // 优先用现代 Clipboard API
  if (navigator.clipboard && typeof ClipboardItem !== "undefined") {
    try {
      const item = new ClipboardItem({
        "text/html": new Blob([html], {type: "text/html"}),
        "text/plain": new Blob([html], {type: "text/plain"}),
      });
      await navigator.clipboard.write([item]);
      return true;
    } catch {
      // 回退到 execCommand
    }
  }
  return copyViaExecCommand(html);
}

// 回退方案：监听 copy 事件写入 clipboardData（移植自 mdnice copySafari）。
function copyViaExecCommand(html: string): boolean {
  let input = document.getElementById("copy-input") as HTMLInputElement | null;
  if (!input) {
    input = document.createElement("input");
    input.id = "copy-input";
    input.style.position = "absolute";
    input.style.left = "-1000px";
    input.style.zIndex = "-1000";
    document.body.appendChild(input);
  }
  input.value = "NOTHING";
  input.setSelectionRange(0, 1);
  input.focus();

  let ok = false;
  const handler = (e: ClipboardEvent) => {
    e.preventDefault();
    e.clipboardData?.setData("text/html", html);
    e.clipboardData?.setData("text/plain", html);
    document.removeEventListener("copy", handler);
    ok = true;
  };
  document.addEventListener("copy", handler);
  document.execCommand("copy");
  return ok;
}


// 把纯文本写入剪贴板，用于复制出口 IP、密钥等无格式片段。
export async function copyPlainText(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Continue to the selection fallback below.
    }
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.left = "-1000px";
  textarea.style.top = "-1000px";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    document.body.removeChild(textarea);
  }
}
