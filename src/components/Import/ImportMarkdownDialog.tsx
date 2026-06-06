import type {ImportMarkdownProgress, ImportMarkdownResult} from "../../utils/markdownImport.ts";

interface Props {
  markdownPath: string;
  resourceRoot: string;
  progress: ImportMarkdownProgress | null;
  result: ImportMarkdownResult | null;
  error: string;
  importing: boolean;
  onPickMarkdown: () => void;
  onPickResourceRoot: () => void;
  onStart: () => void;
  onClose: () => void;
}

const phaseText: Record<string, string> = {
  reading: "读取 Markdown",
  scanning: "扫描图片引用",
  resolving: "解析本地路径",
  uploading: "上传图片素材",
  replacing: "替换 Markdown 链接",
  done: "处理完成",
};

export default function ImportMarkdownDialog({
  markdownPath,
  resourceRoot,
  progress,
  result,
  error,
  importing,
  onPickMarkdown,
  onPickResourceRoot,
  onStart,
  onClose,
}: Props) {
  const canStart = Boolean(markdownPath) && !importing;
  const totalUploaded = result ? result.uploadedLocal.length + result.uploadedRemote.length : 0;
  const totalFailed = result ? result.failed.length : 0;
  const totalUnsupported = result ? result.unsupported.length : 0;

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={panelStyle} onClick={(e) => e.stopPropagation()}>
        <div style={headerStyle}>
          <span>导入 Markdown</span>
          <button onClick={onClose} style={closeStyle} title="关闭">✕</button>
        </div>

        <div style={bodyStyle}>
          <p style={{margin: 0, fontSize: 13, color: "#666", lineHeight: 1.7}}>
            选择 Markdown 文件后，会识别本地和在线图片，上传到公众号永久素材库并替换为微信素材链接。Obsidian 的 <code>![[...]]</code> 图片语法也会转换成标准 Markdown 图片。
          </p>
          <p style={{margin: 0, fontSize: 12, color: "#b26b00", lineHeight: 1.6}}>
            导入成功后会替换当前编辑区全文；视频会被识别但暂不自动上传。
          </p>

          <div style={fieldStyle}>
            <div style={labelStyle}>Markdown 文件</div>
            <div style={rowStyle}>
              <input value={markdownPath} readOnly placeholder="请选择 .md 或 .markdown 文件" style={inputStyle} />
              <button onClick={onPickMarkdown} disabled={importing} style={btnStyle(false)}>选择文件</button>
            </div>
          </div>

          <div style={fieldStyle}>
            <div style={labelStyle}>资源根目录（可选）</div>
            <div style={rowStyle}>
              <input value={resourceRoot} readOnly placeholder="Obsidian 附件较分散时选择 vault 或附件目录" style={inputStyle} />
              <button onClick={onPickResourceRoot} disabled={importing} style={btnStyle(false)}>选择目录</button>
            </div>
          </div>

          {progress && (
            <div style={statusStyle}>
              <div>{phaseText[progress.phase] || progress.phase}</div>
              {typeof progress.total === "number" && (
                <div style={{color: "#888"}}>进度 {progress.completed || 0} / {progress.total}</div>
              )}
              {progress.current && <div style={pathStyle}>{progress.current}</div>}
            </div>
          )}

          {error && <div style={{...statusStyle, borderColor: "#ffccc7", background: "#fff2f0", color: "#a8071a"}}>{error}</div>}

          {result && (
            <div style={statusStyle}>
              <div style={{fontWeight: 600, marginBottom: 6}}>导入结果</div>
              <div>共识别 {result.totalRefs} 个媒体引用，成功上传 {totalUploaded} 张图片。</div>
              <div>本地图片 {result.uploadedLocal.length}，在线图片 {result.uploadedRemote.length}，失败 {totalFailed}，未处理 {totalUnsupported}。</div>
              {totalFailed > 0 && <DetailList title="失败项" items={result.failed} />}
              {totalUnsupported > 0 && <DetailList title="未处理项" items={result.unsupported} />}
            </div>
          )}
        </div>

        <div style={footerStyle}>
          <button onClick={onClose} style={btnStyle(false)}>{result ? "关闭" : "取消"}</button>
          <button onClick={onStart} disabled={!canStart} style={btnStyle(true)}>
            {importing ? "导入中…" : result ? "重新导入" : "开始导入"}
          </button>
        </div>
      </div>
    </div>
  );
}

function DetailList({title, items}: {title: string; items: Array<{originalUrl: string; reason?: string}>}) {
  return (
    <details style={{marginTop: 8}}>
      <summary style={{cursor: "pointer"}}>{title}</summary>
      <ul style={{margin: "6px 0 0", paddingLeft: 18, maxHeight: 120, overflow: "auto"}}>
        {items.slice(0, 20).map((item, index) => (
          <li key={`${item.originalUrl}-${index}`} style={{lineHeight: 1.5}}>
            <span style={{color: "#555"}}>{item.originalUrl}</span>
            {item.reason && <span style={{color: "#999"}}> — {item.reason}</span>}
          </li>
        ))}
      </ul>
    </details>
  );
}

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.35)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 100,
};

const panelStyle: React.CSSProperties = {
  width: 620,
  maxWidth: "92%",
  maxHeight: "88vh",
  background: "#fff",
  borderRadius: 8,
  boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
  overflow: "hidden",
  display: "flex",
  flexDirection: "column",
};

const headerStyle: React.CSSProperties = {
  height: 44,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "0 16px",
  borderBottom: "1px solid #eee",
  fontWeight: 600,
  color: "#333",
};

const closeStyle: React.CSSProperties = {
  border: "none",
  background: "transparent",
  cursor: "pointer",
  fontSize: 18,
  color: "#999",
};

const bodyStyle: React.CSSProperties = {
  padding: 16,
  display: "flex",
  flexDirection: "column",
  gap: 12,
  overflow: "auto",
};

const fieldStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
};

const labelStyle: React.CSSProperties = {
  fontSize: 13,
  color: "#555",
};

const rowStyle: React.CSSProperties = {
  display: "flex",
  gap: 8,
};

const inputStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  height: 34,
  padding: "0 10px",
  fontSize: 13,
  border: "1px solid #d9d9d9",
  borderRadius: 4,
  outline: "none",
  color: "#555",
};

const statusStyle: React.CSSProperties = {
  border: "1px solid #d9ecff",
  background: "#f5fbff",
  borderRadius: 6,
  padding: 10,
  fontSize: 12,
  color: "#333",
  lineHeight: 1.6,
};

const pathStyle: React.CSSProperties = {
  color: "#999",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const footerStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  gap: 8,
  padding: "0 16px 16px",
};

function btnStyle(primary: boolean): React.CSSProperties {
  return {
    height: 32,
    padding: "0 16px",
    fontSize: 13,
    borderRadius: 4,
    cursor: "pointer",
    border: primary ? "none" : "1px solid #d9d9d9",
    background: primary ? "#1e6bb8" : "#fff",
    color: primary ? "#fff" : "#333",
    opacity: undefined,
  };
}
