import {Component, type ErrorInfo, type ReactNode} from "react";
import {toast} from "./Toast/toast.ts";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

// 全局错误边界：渲染异常不再白屏，降级为可恢复的提示页。
// 未捕获的异步异常由 main.tsx 的 window 级监听兜底（toast 提示）。
export default class ErrorBoundary extends Component<Props, State> {
  state: State = {hasError: false};

  static getDerivedStateFromError(): State {
    return {hasError: true};
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error("渲染异常：", error, info.componentStack);
  }

  private handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          role="alert"
          style={{
            display: "flex",
            height: "100vh",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 12,
            background: "var(--bg)",
            color: "var(--text)",
            fontFamily: "system-ui, sans-serif",
          }}
        >
          <div style={{fontSize: 18, fontWeight: 600}}>界面出了点问题</div>
          <div style={{fontSize: 13, opacity: 0.7}}>可以点击下方按钮重新加载，未保存的内容已在自动保存中。</div>
          <button
            type="button"
            onClick={this.handleReload}
            style={{
              marginTop: 8,
              padding: "6px 18px",
              borderRadius: 6,
              border: "1px solid var(--border)",
              background: "var(--bg-secondary)",
              color: "var(--text)",
              cursor: "pointer",
            }}
          >
            重新加载
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// 注册全局兜底：异步未捕获异常不静默，用 toast 提示（应用主体仍在时）。
export function installGlobalErrorHandlers(): void {
  window.addEventListener("error", (event) => {
    console.error("未捕获错误：", event.error ?? event.message);
    toast.show("发生未预期的错误，请查看控制台", "error", 4000);
  });
  window.addEventListener("unhandledrejection", (event) => {
    console.error("未处理的 Promise 拒绝：", event.reason);
    toast.show("后台操作失败，请重试或查看控制台", "error", 4000);
  });
}
