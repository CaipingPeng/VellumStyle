import {useCallback, useEffect, useRef, useState} from "react";
import {ImagePlus, RefreshCw, Search, Sparkles} from "lucide-react";
import {
  aiImageAppendRelatedSearch,
  aiImageGetExample,
  aiImageGetPic,
  aiImageGetSession,
  aiImageGetStyle,
  aiImageInsertPic,
  aiImageRelatedSearch,
  aiImageStartCreation,
} from "../../utils/publish.ts";
import {waitBackendCommand} from "../../utils/wechatBackend.ts";
import {toast} from "../Toast/toast.ts";
import Button from "../ui/Button.tsx";
import Dialog from "../ui/Dialog.tsx";

interface Props {
  open: boolean;
  canInsert: boolean;
  onClose: () => void;
  onPick: (markdown: string) => void;
  onNeedSettings?: () => void;
}

interface ScaleOption {
  name: string;
  value: string;
}

interface StyleOption {
  name: string;
  value: string;
  tmpUrl: string;
}

interface AiImage {
  id: string;
  taskId: string;
  prompt: string;
  tmpUrl: string;
  scale: string;
  status: number;
  isSuggestion?: boolean;
}

type Phase = "loading" | "ready" | "error";

const GEN_POLL_INTERVAL_MS = 5000;
const GEN_TIMEOUT_MS = 3 * 60 * 1000;
const SEARCH_LIMIT = 24;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorMessage(error: unknown): string {
  return typeof error === "string" ? error : (error as Error)?.message || "未知错误";
}

function parseErrorHint(source: string): string {
  const text = source.trim();
  if (!text) return "接口返回为空";
  if (!text.startsWith("{")) return `返回内容不是 JSON：${text.slice(0, 120)}`;
  try {
    const data = JSON.parse(text) as {
      vs_error?: boolean;
      reason?: string;
      message?: string;
      base_resp?: {ret?: number; err_msg?: string};
    };
    if (data?.vs_error) {
      return `后台页面脚本异常：${data.reason || data.message || "未知"}`;
    }
    if (data?.base_resp && data.base_resp.ret !== undefined && data.base_resp.ret !== 0) {
      return `微信接口错误(${data.base_resp.ret})：${data.base_resp.err_msg || ""}`;
    }
  } catch {
    // JSON 解析失败走下面的兜底提示
  }
  return `接口返回内容异常：${text.slice(0, 120)}`;
}

function isOk(source: string): boolean {
  try {
    const data = JSON.parse(source) as {base_resp?: {ret?: number}};
    return data?.base_resp?.ret === 0;
  } catch {
    return false;
  }
}

function parseSessionResponse(source: string): string | null {
  if (!isOk(source)) return null;
  try {
    const data = JSON.parse(source) as {session_id?: string};
    return data?.session_id || null;
  } catch {
    return null;
  }
}

function parseStyleResponse(source: string): {scales: ScaleOption[]; styles: StyleOption[]} | null {
  if (!isOk(source)) return null;
  try {
    const data = JSON.parse(source) as {
      scale_info?: Array<Record<string, unknown>>;
      style_info?: Array<Record<string, unknown>>;
    };
    const scales = (data?.scale_info ?? [])
      .filter((item) => typeof item.name === "string" && typeof item.value === "string")
      .map((item) => ({name: item.name as string, value: item.value as string}));
    const styles = (data?.style_info ?? [])
      .filter((item) => typeof item.name === "string" && typeof item.value === "string")
      .map((item) => ({
        name: item.name as string,
        value: item.value as string,
        tmpUrl: typeof item.tmp_url === "string" ? (item.tmp_url as string) : "",
      }));
    return {scales, styles};
  } catch {
    return null;
  }
}

function parseExampleResponse(source: string): string[] | null {
  if (!isOk(source)) return null;
  try {
    const data = JSON.parse(source) as {example?: unknown[]};
    return (data?.example ?? []).map((item) => String(item)).filter(Boolean);
  } catch {
    return null;
  }
}

function parseStartResponse(source: string): {taskId: string; sensitive: boolean} | null {
  if (!isOk(source)) return null;
  try {
    const data = JSON.parse(source) as {task_id?: string; is_sensitive_prompt?: boolean};
    return {taskId: data?.task_id || "", sensitive: Boolean(data?.is_sensitive_prompt)};
  } catch {
    return null;
  }
}

function parseGetPicResponse(source: string): AiImage[] | null {
  if (!isOk(source)) return null;
  try {
    const data = JSON.parse(source) as {
      ai_image_info_list?: {list?: Array<{image?: Array<Record<string, unknown>>}>};
    };
    const groups = data?.ai_image_info_list?.list ?? [];
    const images: AiImage[] = [];
    for (const group of groups) {
      for (const item of group?.image ?? []) {
        images.push({
          id: String(item.id ?? ""),
          taskId: String(item.task_id ?? ""),
          prompt: String(item.prompt ?? item.revised_prompt ?? ""),
          tmpUrl: typeof item.tmp_url === "string" ? (item.tmp_url as string) : "",
          scale: String(item.scale ?? ""),
          status: Number(item.status ?? 0),
        });
      }
    }
    return images;
  } catch {
    return null;
  }
}

function parseRelatedSearchResponse(source: string): {images: AiImage[]; taskId: string} | null {
  if (!isOk(source)) return null;
  try {
    const data = JSON.parse(source) as {
      list?: {image?: Array<Record<string, unknown>>};
      task_id?: string;
    };
    const images = (data?.list?.image ?? [])
      .filter((item) => typeof item.search_url === "string" && item.search_url)
      .map((item) => ({
        id: String(item.id ?? ""),
        taskId: String(item.task_id ?? ""),
        prompt: String(item.prompt ?? ""),
        tmpUrl: (item.tmp_url as string) || (item.search_url as string),
        scale: String(item.scale ?? ""),
        status: 3,
        isSuggestion: true,
      }));
    return {images, taskId: String(data?.task_id ?? "")};
  } catch {
    return null;
  }
}

function parseAppendResponse(source: string): string | null {
  if (!isOk(source)) return null;
  try {
    const data = JSON.parse(source) as {id?: string};
    return data?.id || null;
  } catch {
    return null;
  }
}

function parseInsertResponse(source: string): {fileid: string; cdnUrl: string} | null {
  if (!isOk(source)) return null;
  try {
    const data = JSON.parse(source) as {fileid?: string | number; cdn_url?: string};
    if (!data?.cdn_url) return null;
    return {fileid: String(data.fileid ?? ""), cdnUrl: data.cdn_url};
  } catch {
    return null;
  }
}

function imageKey(image: AiImage, index: number): string {
  return image.id || image.tmpUrl || `image-${index}`;
}

export default function AiImageDialog({open, canInsert, onClose, onPick, onNeedSettings}: Props) {
  const [sessionId, setSessionId] = useState("");
  const [scales, setScales] = useState<ScaleOption[]>([]);
  const [styles, setStyles] = useState<StyleOption[]>([]);
  const [examples, setExamples] = useState<string[]>([]);
  const [prompt, setPrompt] = useState("");
  const [selectedScaleName, setSelectedScaleName] = useState("");
  const [selectedStyle, setSelectedStyle] = useState("");
  const [phase, setPhase] = useState<Phase>("loading");
  const [generating, setGenerating] = useState(false);
  const [results, setResults] = useState<AiImage[]>([]);
  const [suggestions, setSuggestions] = useState<AiImage[]>([]);
  const [suggestionTaskId, setSuggestionTaskId] = useState("");
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [insertingId, setInsertingId] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);
  const sessionRef = useRef(0);

  // 打开对话框：先创建（或沿用）AI 会话，再拉取比例/风格/示例。
  useEffect(() => {
    if (!open) return;
    const session = ++sessionRef.current;
    setSessionId("");
    setScales([]);
    setStyles([]);
    setExamples([]);
    setPrompt("");
    setSelectedScaleName("");
    setSelectedStyle("");
    setPhase("loading");
    setGenerating(false);
    setResults([]);
    setSuggestions([]);
    setSuggestionTaskId("");
    setSuggestionsLoading(false);
    setInsertingId(null);

    void (async () => {
      try {
        const response = await waitBackendCommand(
          () => aiImageGetSession(),
          (text) => parseSessionResponse(text) !== null,
        );
        if (session !== sessionRef.current) return;
        const id = parseSessionResponse(response);
        if (!id) {
          setPhase("error");
          toast.show(`创建 AI 会话失败：${parseErrorHint(response)}`, "error", 6000);
          return;
        }
        setSessionId(id);
        const [styleSource, exampleSource] = await Promise.all([
          aiImageGetStyle(id),
          aiImageGetExample(id).catch(() => "{}"),
        ]);
        if (session !== sessionRef.current) return;
        const style = parseStyleResponse(styleSource);
        if (!style) {
          setPhase("error");
          toast.show(`获取 AI 风格失败：${parseErrorHint(styleSource)}`, "error", 6000);
          return;
        }
        setScales(style.scales);
        setStyles(style.styles);
        if (style.scales.length > 0 && !selectedScaleName) {
          setSelectedScaleName(style.scales[0].name);
        }
        const examples = parseExampleResponse(exampleSource);
        if (examples) setExamples(examples);
        setPhase("ready");
      } catch (error) {
        if (session !== sessionRef.current) return;
        setPhase("error");
        toast.show(`AI 配图初始化失败：${errorMessage(error)}`, "error");
      }
    })();

    return () => {
      sessionRef.current += 1;
    };
  }, [open, retryToken]);

  const selectedScaleValue =
    scales.find((scale) => scale.name === selectedScaleName)?.value || "";

  const generate = useCallback(async () => {
    const query = prompt.trim();
    if (!query || generating) return;
    const session = sessionRef.current;
    setGenerating(true);
    try {
      const data = JSON.stringify({
        session_id: sessionId,
        prompt: query,
        scale: selectedScaleValue,
        gen_type: 5,
        ...(selectedStyle ? {style: selectedStyle} : {}),
      });
      const response = await aiImageStartCreation(data);
      if (session !== sessionRef.current) return;
      const start = parseStartResponse(response);
      if (!start) throw new Error(parseErrorHint(response));
      if (start.sensitive) {
        toast.show("输入的内容可能包含敏感词汇，请修改后重新开始创作", "error");
        return;
      }
      if (!start.taskId) {
        throw new Error("生成任务未返回任务号，请稍后重试");
      }
      const taskId = start.taskId;
      const deadline = Date.now() + GEN_TIMEOUT_MS;
      for (;;) {
        await delay(GEN_POLL_INTERVAL_MS);
        if (session !== sessionRef.current) return;
        if (Date.now() > deadline) {
          toast.show("生成超时，请稍后重试", "error");
          return;
        }
        const picResponse = await aiImageGetPic(taskId, sessionId);
        if (session !== sessionRef.current) return;
        const images = parseGetPicResponse(picResponse);
        if (!images || images.length === 0) continue;
        const done = images.some((image) => image.status === 3 || image.status === 4);
        if (!done) continue;
        const ok = images.filter((image) => image.status === 3);
        setResults(ok);
        if (ok.length === 0) {
          toast.show("生成失败，请调整提示词后重试", "error");
        } else {
          toast.show(`已生成 ${ok.length} 张图片`, "info");
        }
        return;
      }
    } catch (error) {
      if (session !== sessionRef.current) return;
      const message = errorMessage(error);
      if (message.includes("NOT_CONFIGURED")) {
        onNeedSettings?.();
      } else {
        toast.show(`生成失败：${message}`, "error");
      }
    } finally {
      if (session === sessionRef.current) setGenerating(false);
    }
  }, [generating, onNeedSettings, prompt, selectedScaleValue, selectedStyle, sessionId]);

  const loadSuggestions = useCallback(async () => {
    const query = prompt.trim();
    if (!query || suggestionsLoading || generating || !sessionId) return;
    const session = sessionRef.current;
    setSuggestionsLoading(true);
    try {
      const response = await aiImageRelatedSearch(
        sessionId,
        query,
        selectedScaleName,
        SEARCH_LIMIT,
        0,
      );
      if (session !== sessionRef.current) return;
      const parsed = parseRelatedSearchResponse(response);
      if (!parsed) throw new Error(parseErrorHint(response));
      setSuggestions(parsed.images);
      setSuggestionTaskId(parsed.taskId);
      if (parsed.images.length === 0) {
        toast.show("没有找到相关图片，试试换个说法", "info");
      }
    } catch (error) {
      if (session !== sessionRef.current) return;
      toast.show(`相关图搜索失败：${errorMessage(error)}`, "error");
    } finally {
      if (session === sessionRef.current) setSuggestionsLoading(false);
    }
  }, [generating, prompt, selectedScaleName, sessionId, suggestionsLoading]);

  const insertImage = useCallback(
    async (image: AiImage) => {
      if (!canInsert || insertingId) return;
      const session = sessionRef.current;
      setInsertingId(imageKey(image, 0));
      try {
        let picId = image.id;
        let taskId = image.taskId;
        if (image.isSuggestion) {
          const appendResponse = await aiImageAppendRelatedSearch(
            JSON.stringify({
              session_id: sessionId,
              task_id: taskId || suggestionTaskId || "",
              img_url: image.tmpUrl,
            }),
          );
          if (session !== sessionRef.current) return;
          const appendedId = parseAppendResponse(appendResponse);
          if (!appendedId) throw new Error(parseErrorHint(appendResponse));
          picId = appendedId;
          taskId = taskId || suggestionTaskId || "";
        }
        const insertResponse = await aiImageInsertPic(
          JSON.stringify({
            pic_id: picId,
            task_id: taskId || "",
            session_id: sessionId,
          }),
        );
        if (session !== sessionRef.current) return;
        const inserted = parseInsertResponse(insertResponse);
        if (!inserted?.cdnUrl) throw new Error(parseErrorHint(insertResponse));
        onPick(`![AI配图](${inserted.cdnUrl})`);
        toast.show("已插入 AI 配图（永久素材链接）", "info");
        onClose();
      } catch (error) {
        if (session !== sessionRef.current) return;
        const message = errorMessage(error);
        if (message.includes("NOT_CONFIGURED")) {
          onNeedSettings?.();
        } else {
          toast.show(`插入失败：${message}`, "error");
        }
      } finally {
        if (session === sessionRef.current) setInsertingId(null);
      }
    },
    [canInsert, insertingId, onClose, onNeedSettings, onPick, sessionId, suggestionTaskId],
  );

  const renderImageGrid = (images: AiImage[], emptyText: string) => {
    if (images.length === 0) {
      return (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 p-6 text-text-muted">
          <ImagePlus size={28} />
          <div className="text-xs">{emptyText}</div>
        </div>
      );
    }
    return (
      <div className="grid min-h-0 flex-1 auto-rows-max grid-cols-2 gap-3 overflow-y-auto p-4">
        {images.map((image, index) => {
          const key = imageKey(image, index);
          const inserting = insertingId === key;
          return (
            <div
              key={key}
              className="group relative aspect-[4/3] overflow-hidden rounded-md border border-border bg-bg-secondary"
            >
              <img
                src={image.tmpUrl}
                alt={image.prompt || "AI 配图"}
                loading="lazy"
                decoding="async"
                className="block h-full w-full object-cover"
              />
              <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-gradient-to-t from-black/60 to-transparent p-2 opacity-0 transition-opacity duration-fast group-hover:opacity-100">
                <span className="min-w-0 truncate text-[11px] text-white">{image.prompt || "AI 配图"}</span>
                <Button
                  type="button"
                  variant="primary"
                  state={inserting ? "loading" : "idle"}
                  loadingText="插入中…"
                  className="!h-7 !px-2 !text-xs"
                  disabled={!canInsert || Boolean(insertingId)}
                  title={!canInsert ? "请先打开一篇文章" : "插入到正文"}
                  onClick={() => void insertImage(image)}
                >
                  插入
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <Dialog
      open={open}
      title={
        <span className="flex items-center gap-1.5">
          <Sparkles size={16} />
          AI 配图
        </span>
      }
      onClose={onClose}
      closeDisabled={generating || Boolean(insertingId)}
      width="min(94vw,900px)"
      contentPadding={false}
      footer={
        <div className="flex w-full items-center justify-between gap-3">
          <span className="text-xs font-normal text-text-muted">
            生成图片经微信 AI 配图转换为永久素材，插入后不会触发“未上传图片”提醒
          </span>
          <Button type="button" variant="secondary" state="idle" disabled={generating || Boolean(insertingId)} onClick={onClose}>
            关闭
          </Button>
        </div>
      }
    >
      <div className="flex h-[clamp(440px,calc(86vh-120px),760px)] min-h-0 flex-col">
        {phase === "loading" && (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 p-6">
            <div className="h-52 w-52 animate-pulse rounded-lg bg-bg-tertiary" />
            <div className="text-sm text-text-muted">正在初始化 AI 配图…</div>
          </div>
        )}

        {phase === "error" && (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-6">
            <Sparkles size={32} className="text-text-muted" />
            <div className="text-sm text-text-secondary">AI 配图初始化失败</div>
            <Button type="button" variant="secondary" state="idle" onClick={() => setRetryToken((token) => token + 1)}>
              重试
            </Button>
          </div>
        )}

        {phase === "ready" && (
          <div className="grid min-h-0 flex-1 grid-cols-[320px_1fr]">
            <div className="flex min-h-0 flex-col gap-3 overflow-y-auto border-r border-border p-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-text" htmlFor="ai-prompt">
                  描述图片
                </label>
                <textarea
                  id="ai-prompt"
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  placeholder="例如：一个失落的男孩"
                  rows={3}
                  maxLength={200}
                  className="w-full resize-none rounded-sm border border-border bg-bg-secondary px-2.5 py-2 text-[13px] text-text outline-none transition-colors duration-fast placeholder:text-text-muted focus:border-accent focus:ring-2 focus:ring-[color:var(--ring)]"
                />
                {examples.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {examples.map((example) => (
                      <button
                        key={example}
                        type="button"
                        onClick={() => setPrompt(example)}
                        className="rounded-sm border border-border bg-bg-secondary px-2 py-0.5 text-[11px] text-text-secondary transition-colors duration-fast hover:border-accent hover:text-text"
                      >
                        {example}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-text">图片比例</label>
                <div className="flex flex-wrap gap-1.5">
                  {scales.map((scale) => {
                    const active = scale.name === selectedScaleName;
                    return (
                      <button
                        key={scale.name}
                        type="button"
                        onClick={() => setSelectedScaleName(scale.name)}
                        className={`rounded-sm border px-2.5 py-1 text-xs transition-colors duration-fast ${
                          active
                            ? "vs-btn-accent border-0 text-white"
                            : "border-border bg-bg-secondary text-text-secondary hover:border-accent hover:text-text"
                        }`}
                      >
                        {scale.name}
                      </button>
                    );
                  })}
                </div>
              </div>

              {styles.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-text">风格（可不选）</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedStyle("")}
                      className={`flex h-16 items-center justify-center rounded-sm border px-1 text-[11px] transition-colors duration-fast ${
                        !selectedStyle
                          ? "border-transparent vs-btn-accent text-white"
                          : "border-border bg-bg-secondary text-text-secondary hover:border-accent hover:text-text"
                      }`}
                    >
                      不选风格
                    </button>
                    {styles.map((style) => {
                      const active = style.value === selectedStyle;
                      return (
                        <button
                          key={style.value}
                          type="button"
                          onClick={() => setSelectedStyle(active ? "" : style.value)}
                          className={`flex items-center gap-1.5 overflow-hidden rounded-sm border p-1 text-left transition-colors duration-fast ${
                            active
                              ? "border-transparent vs-btn-accent"
                              : "border-border bg-bg-secondary hover:border-accent"
                          }`}
                        >
                          {style.tmpUrl && (
                            <img
                              src={style.tmpUrl}
                              alt=""
                              loading="lazy"
                              decoding="async"
                              className="h-9 w-9 flex-none rounded-sm object-cover"
                            />
                          )}
                          <span className={`min-w-0 truncate text-[11px] ${active ? "text-white" : "text-text-secondary"}`}>
                            {style.name}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="mt-auto flex flex-col gap-2">
                <Button
                  type="button"
                  variant="primary"
                  state={generating ? "loading" : "idle"}
                  loadingText="正在生成…"
                  disabled={!prompt.trim() || generating || !sessionId}
                  title={!prompt.trim() ? "先输入图片描述" : "开始 AI 生成"}
                  onClick={() => void generate()}
                >
                  生成图片
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  state={suggestionsLoading ? "loading" : "idle"}
                  loadingText="搜索中…"
                  disabled={!prompt.trim() || suggestionsLoading || generating || !sessionId}
                  title="按当前描述搜索相关图片"
                  onClick={() => void loadSuggestions()}
                >
                  <Search size={14} />
                  找相关图
                </Button>
              </div>
            </div>

            <div className="flex min-h-0 flex-col">
              <div className="flex items-center gap-2 border-b border-border px-4 py-2 text-xs font-medium text-text-secondary">
                <span>生成结果</span>
                {generating && (
                  <span className="flex items-center gap-1 text-text-muted">
                    <RefreshCw size={12} className="animate-spin" />
                    正在生成，约需 10-30 秒…
                  </span>
                )}
                {!generating && results.length > 0 && (
                  <span className="text-text-muted">共 {results.length} 张，悬停图片可插入</span>
                )}
              </div>
              {renderImageGrid(results, "输入描述后点击“生成图片”，结果会出现在这里")}

              {(suggestions.length > 0 || suggestionsLoading) && (
                <>
                  <div className="flex items-center gap-2 border-b border-border px-4 py-2 text-xs font-medium text-text-secondary">
                    <span>相关图</span>
                    {suggestionsLoading && (
                      <span className="flex items-center gap-1 text-text-muted">
                        <RefreshCw size={12} className="animate-spin" />
                        搜索中…
                      </span>
                    )}
                  </div>
                  {renderImageGrid(suggestions, "没有找到相关图片")}
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
}
