import {useCallback, useEffect, useRef, useState, type CSSProperties} from "react";
import {createPortal} from "react-dom";
import {AnimatePresence, motion} from "framer-motion";
import {ChevronDown, ImagePlus, X} from "lucide-react";
import {
  aiImageAppendRelatedSearch,
  aiImageGetBizRecentImgList,
  aiImageGetExample,
  aiImageGetPic,
  aiImageGetSession,
  aiImageGetStyle,
  aiImageInsertPic,
  aiImageRelatedSearch,
  aiImageStartCreation,
} from "../../utils/publish.ts";
import {waitBackendCommand} from "../../utils/wechatBackend.ts";
import {MOTION_DURATION_FAST, MOTION_SPRING_POP} from "../../utils/motion.ts";
import {formatHtmlImage} from "../../markdown/imageMarkdown.ts";
import {toast} from "../Toast/toast.ts";

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
  sessionId: string;
  prompt: string;
  tmpUrl: string;
  scale: string;
  status: number;
  sessionPrompt: string[];
  isSuggestion?: boolean;
}

interface ChatTurn {
  id: string;
  userMessage: string;
  referenceUrls: string[];
  images: AiImage[];
  sessionPrompt: string[];
  sessionId: string;
  relatedImages: AiImage[];
  relatedTaskId: string;
  relatedExpanded: boolean;
}

interface HistorySession {
  sessionId: string;
  label: string;
  images: AiImage[];
}

type Phase = "loading" | "ready" | "error";

const GEN_POLL_INTERVAL_MS = 5000;
const GEN_TIMEOUT_MS = 3 * 60 * 1000;
const GEN_UPDATE_INTERVAL_MS = 500;

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

function imageFromRecord(item: Record<string, unknown>): AiImage {
  const sessionPrompt = Array.isArray(item.session_prompt)
    ? (item.session_prompt as unknown[]).map((value) => String(value)).filter(Boolean)
    : [];
  return {
    id: String(item.id ?? ""),
    taskId: String(item.task_id ?? ""),
    sessionId: String(item.session_id ?? ""),
    prompt: String(item.prompt ?? item.revised_prompt ?? ""),
    tmpUrl: typeof item.tmp_url === "string" ? (item.tmp_url as string) : "",
    scale: String(item.scale ?? ""),
    status: Number(item.status ?? 0),
    sessionPrompt,
  };
}

function parseHistoryResponse(source: string): HistorySession[] | null {
  if (!isOk(source)) return null;
  try {
    const data = JSON.parse(source) as {
      session_list?: {session_info?: Array<Record<string, unknown>>};
    };
    const sessions = data?.session_list?.session_info ?? [];
    return sessions
      .map((session) => {
        const sessionId = String(session.session_id ?? "");
        const list = (session.ai_image_info_list as {list?: Array<Record<string, unknown>>} | undefined)
          ?.list;
        const images: AiImage[] = [];
        for (const group of list ?? []) {
          const groupImages = (group.image as Array<Record<string, unknown>> | undefined) ?? [];
          for (const item of groupImages) {
            images.push(imageFromRecord(item));
          }
        }
        const label = images.find((image) => image.prompt)?.prompt || "未命名对话";
        return {sessionId, label, images};
      })
      .filter((session) => session.sessionId);
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
        images.push(imageFromRecord(item));
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
        sessionId: String(item.session_id ?? ""),
        prompt: String(item.prompt ?? ""),
        tmpUrl: (item.tmp_url as string) || (item.search_url as string),
        scale: String(item.scale ?? ""),
        status: 3,
        sessionPrompt: [],
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

// 官方图片瓦片比例：按 scale 值映射到固定尺寸（r1-1 / r4-3 / r3-4 / r16-9 / r235-1）。
function imageTileSize(scale: string): {width: number; height: number} {
  switch (scale) {
    case "1024x436":
    case "1680x720":
      return {width: 406, height: 173};
    case "1024x576":
      return {width: 406, height: 229};
    case "768x1024":
      return {width: 175, height: 235};
    case "1024x768":
      return {width: 294, height: 220};
    case "1024x1024":
    default:
      return {width: 220, height: 220};
  }
}

function HistoryIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M11.999 4.5C15.7771 4.5 18.9019 7.29412 19.4219 10.9287H18.2061C17.6973 7.95975 15.1128 5.7002 11.999 5.7002C8.5202 5.70045 5.7002 8.52069 5.7002 12C5.7002 15.4793 8.5202 18.2996 11.999 18.2998L12 18.2988V19.499L11.999 19.5C7.85738 19.4997 4.5 16.142 4.5 12C4.5 7.85802 7.85738 4.50025 11.999 4.5ZM19.5 19.5H15.2148V18.3008H19.5V19.5ZM19.5 17.0586H15.2148V15.8584H19.5V17.0586ZM19.5 14.6172H15.2148V13.417H19.5V14.6172ZM12.6426 11.4668L14.168 12.9922L13.2598 13.9014L11.3574 11.999V7.65625H12.6426V11.4668Z" />
    </svg>
  );
}

function NewConversationIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M18.3 15.2998H20.7004V16.5H18.3V18.8496H17.0999V16.5H14.7004V15.2998H17.0999V12.8496H18.3V15.2998ZM16.3 5.5C17.4046 5.5 18.3 6.39543 18.3 7.5V11H17.0999V7.5C17.0999 7.05817 16.7419 6.7002 16.3 6.7002H6.30005C5.85822 6.7002 5.50024 7.05817 5.50024 7.5V14.5C5.50024 14.9418 5.85822 15.2998 6.30005 15.2998H8.20044V16.6025L9.50317 15.2998H12.5002V16.5H10.0002L7.85376 18.6465C7.53879 18.9614 7.0003 18.7384 7.00024 18.293V16.5H6.30005C5.19548 16.5 4.30005 15.6046 4.30005 14.5V7.5C4.30005 6.39543 5.19548 5.5 6.30005 5.5H16.3Z" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg width="36" height="36" viewBox="0 0 36 36" fill="none" aria-hidden="true">
      <path
        d="M33 18C33 26.2843 26.2843 33 18 33C9.71573 33 3 26.2843 3 18C3 9.71573 9.71573 3 18 3C26.2843 3 33 9.71573 33 18ZM19.0146 10.6611C18.423 10.0696 17.4637 10.0695 16.8721 10.6611L11.1484 16.3848L13.2695 18.5059L16.5 15L16.5 25.6504L19.5 25.6504L19.5 15.1133L22.6172 18.5049L24.7383 16.3838L19.0146 10.6611Z"
        fill="currentColor"
      />
    </svg>
  );
}

export default function AiImageDialog({open, canInsert, onClose, onPick, onNeedSettings}: Props) {
  const [sessionId, setSessionId] = useState("");
  const [scales, setScales] = useState<ScaleOption[]>([]);
  const [styles, setStyles] = useState<StyleOption[]>([]);
  const [examples, setExamples] = useState<string[]>([]);
  const [history, setHistory] = useState<HistorySession[]>([]);
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [prompt, setPrompt] = useState("");
  const [selectedScaleName, setSelectedScaleName] = useState("");
  const [selectedStyle, setSelectedStyle] = useState("");
  const [reference, setReference] = useState<AiImage | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [generating, setGenerating] = useState(false);
  const [genProgress, setGenProgress] = useState(0);
  const [insertingId, setInsertingId] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<AiImage | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [ratioOpen, setRatioOpen] = useState(false);
  const [styleOpen, setStyleOpen] = useState(false);
  const [headerScrolled, setHeaderScrolled] = useState(false);
  const [retryToken, setRetryToken] = useState(0);
  const sessionRef = useRef(0);
  const chatRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const focusInput = useCallback(() => {
    textareaRef.current?.focus();
  }, []);

  const closeAllSelectors = useCallback(() => {
    setHistoryOpen(false);
    setRatioOpen(false);
    setStyleOpen(false);
  }, []);

  // 点击外部收起历史/比例/风格下拉
  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest("[data-ai-selector]")) closeAllSelectors();
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [closeAllSelectors, open]);

  // 打开对话框：拉历史会话（后台窗口就绪）→ 创建会话 → 拉风格/示例
  useEffect(() => {
    if (!open) return;
    const session = ++sessionRef.current;
    setSessionId("");
    setScales([]);
    setStyles([]);
    setExamples([]);
    setHistory([]);
    setTurns([]);
    setPrompt("");
    setSelectedScaleName("");
    setSelectedStyle("");
    setReference(null);
    setPhase("loading");
    setGenerating(false);
    setInsertingId(null);
    setLightbox(null);
    closeAllSelectors();

    void (async () => {
      try {
        const historySource = await waitBackendCommand(
          () => aiImageGetBizRecentImgList(10),
          (text) => parseHistoryResponse(text) !== null,
        );
        if (session !== sessionRef.current) return;
        const historySessions = parseHistoryResponse(historySource) ?? [];
        setHistory(historySessions);

        const sessionSource = await aiImageGetSession();
        if (session !== sessionRef.current) return;
        const id = parseSessionResponse(sessionSource);
        if (!id) {
          setPhase("error");
          toast.show(`创建 AI 会话失败：${parseErrorHint(sessionSource)}`, "error", 6000);
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
        if (style.scales.length > 0) {
          setSelectedScaleName(style.scales[0].name);
        }
        const examples = parseExampleResponse(exampleSource);
        if (examples) setExamples(examples);
        setPhase("ready");
        focusInput();
      } catch (error) {
        if (session !== sessionRef.current) return;
        setPhase("error");
        toast.show(`AI 配图初始化失败：${errorMessage(error)}`, "error");
      }
    })();

    return () => {
      sessionRef.current += 1;
    };
  }, [closeAllSelectors, focusInput, open, retryToken]);

  const selectedScaleValue =
    scales.find((scale) => scale.name === selectedScaleName)?.value || "";

  // 聊天区滚动到底部
  useEffect(() => {
    const chat = chatRef.current;
    if (chat) chat.scrollTop = chat.scrollHeight;
  }, [turns, phase]);

  // 生成中模拟进度环
  useEffect(() => {
    if (!generating) return;
    setGenProgress(0);
    const timer = window.setInterval(() => {
      setGenProgress((progress) => Math.min(95, progress + Math.ceil(Math.random() * 10)));
    }, GEN_UPDATE_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [generating]);

  const switchToHistory = useCallback((item: HistorySession) => {
    const session = sessionRef.current;
    setHistoryOpen(false);
    setSessionId(item.sessionId);
    setReference(null);
    setPrompt("");
    if (session !== sessionRef.current) return;
    const first = item.images[0];
    setTurns([
      {
        id: `history-${item.sessionId}`,
        userMessage: item.label,
        referenceUrls: first?.tmpUrl ? [first.tmpUrl] : [],
        images: item.images,
        sessionPrompt: item.images.find((image) => image.sessionPrompt.length)?.sessionPrompt ?? [],
        sessionId: item.sessionId,
        relatedImages: [],
        relatedTaskId: "",
        relatedExpanded: false,
      },
    ]);
  }, []);

  const startNewConversation = useCallback(async () => {
    const session = sessionRef.current;
    setHistoryOpen(false);
    setReference(null);
    setPrompt("");
    setTurns([]);
    try {
      const source = await aiImageGetSession();
      if (session !== sessionRef.current) return;
      const id = parseSessionResponse(source);
      if (!id) throw new Error(parseErrorHint(source));
      setSessionId(id);
      focusInput();
    } catch (error) {
      const message = errorMessage(error);
      if (message.includes("NOT_CONFIGURED")) {
        onNeedSettings?.();
      } else {
        toast.show(`新建对话失败：${message}`, "error");
      }
    }
  }, [focusInput, onNeedSettings]);

  const startAdjust = useCallback(
    (image: AiImage) => {
      if (!image.id) return;
      setReference(image);
      setPrompt("");
      if (selectedScaleName === "2.35:1") {
        const fallback = scales.find((scale) => scale.name === "16:9");
        if (fallback) setSelectedScaleName(fallback.name);
      }
      focusInput();
    },
    [focusInput, scales, selectedScaleName],
  );

  const sendFromTag = useCallback(
    async (tag: string, image: AiImage | undefined) => {
      if (generating) return;
      const session = sessionRef.current;
      setGenerating(true);
      setGenProgress(0);
      const turnId = `grp_${Date.now()}`;
      const referenceUrls = image?.tmpUrl ? [image.tmpUrl] : [];
      const scaleValue =
        selectedScaleValue || scales.find((scale) => scale.name === "16:9")?.value || "1024x576";
      const ratioName = selectedScaleName || "1:1";
      setTurns((current) => [
        ...current,
        {
          id: turnId,
          userMessage: tag,
          referenceUrls,
          images: [{
            id: "",
            taskId: "",
            sessionId,
            prompt: tag,
            tmpUrl: "",
            scale: "",
            status: 1,
            sessionPrompt: [],
          }],
          sessionPrompt: [],
          sessionId,
          relatedImages: [],
          relatedTaskId: "",
          relatedExpanded: false,
        },
      ]);
      // 与官方一致：发起生成的同时并行拉取相关图，挂到同一组上
      void (async () => {
        try {
          const relatedSource = await aiImageRelatedSearch(sessionId, tag, ratioName, 10, 0);
          if (session !== sessionRef.current) return;
          const related = parseRelatedSearchResponse(relatedSource);
          if (!related) return;
          setTurns((current) =>
            current.map((turn) =>
              turn.id === turnId
                ? {...turn, relatedImages: related.images, relatedTaskId: related.taskId}
                : turn,
            ),
          );
        } catch {
          // 相关图失败不影响生成主流程
        }
      })();
      try {
        const basePayload: Record<string, unknown> = {
          session_id: sessionId,
          prompt: tag,
          scale: scaleValue,
        };
        const txt2img: Record<string, unknown> = {...basePayload, gen_type: 5};
        let response: string;
        if (image?.id) {
          // 调整：优先图生图（gen_type 6 + 参考图 id），失败回退纯文本生成
          response = await aiImageStartCreation(
            JSON.stringify({...basePayload, gen_type: 6, refer_pic_ids: [image.id]}),
          );
          if (parseStartResponse(response) === null) {
            response = await aiImageStartCreation(JSON.stringify(txt2img));
          }
        } else {
          response = await aiImageStartCreation(JSON.stringify(txt2img));
        }
        if (session !== sessionRef.current) return;
        const start = parseStartResponse(response);
        if (!start) throw new Error(parseErrorHint(response));
        if (start.sensitive) {
          toast.show("输入的内容可能包含敏感词汇，请修改后重新开始创作", "error");
          setTurns((current) => current.filter((turn) => turn.id !== turnId));
          return;
        }
        if (!start.taskId) throw new Error("生成任务未返回任务号，请稍后重试");
        const taskId = start.taskId;
        const deadline = Date.now() + GEN_TIMEOUT_MS;
        for (;;) {
          await delay(GEN_POLL_INTERVAL_MS);
          if (session !== sessionRef.current) return;
          if (Date.now() > deadline) {
            toast.show("生成超时，请稍后重试", "error");
            setTurns((current) =>
              current.map((turn) =>
                turn.id === turnId
                  ? {...turn, images: turn.images.map((item) => ({...item, status: 4}))}
                  : turn,
              ),
            );
            return;
          }
          const picResponse = await aiImageGetPic(taskId, sessionId);
          if (session !== sessionRef.current) return;
          const images = parseGetPicResponse(picResponse);
          if (!images || images.length === 0) continue;
          const done = images.some((item) => item.status === 3 || item.status === 4);
          if (!done) continue;
          setTurns((current) =>
            current.map((turn) =>
              turn.id === turnId
                ? {
                    ...turn,
                    images,
                    sessionPrompt: images.find((item) => item.sessionPrompt.length)?.sessionPrompt ?? [],
                  }
                : turn,
            ),
          );
          if (!images.some((item) => item.status === 3)) {
            toast.show("生成失败，请调整提示词后重试", "error");
          }
          return;
        }
      } catch (error) {
        if (session !== sessionRef.current) return;
        setTurns((current) => current.filter((turn) => turn.id !== turnId));
        const message = errorMessage(error);
        if (message.includes("NOT_CONFIGURED")) {
          onNeedSettings?.();
        } else {
          toast.show(`生成失败：${message}`, "error");
        }
      } finally {
        if (session === sessionRef.current) setGenerating(false);
      }
    },
    [generating, onNeedSettings, scales, selectedScaleName, selectedScaleValue, sessionId],
  );

  const adjustWithTag = useCallback(
    (tag: string, turn: ChatTurn) => {
      const image = turn.images.find((item) => item.status === 3 && item.id);
      if (image) {
        setReference(image);
        if (selectedScaleName === "2.35:1") {
          const fallback = scales.find((scale) => scale.name === "16:9");
          if (fallback) setSelectedScaleName(fallback.name);
        }
      }
      setPrompt(tag);
      void sendFromTag(tag, image);
    },
    [scales, selectedScaleName, sendFromTag],
  );

  const send = useCallback(async () => {
    const query = prompt.trim();
    if (!query || generating) return;
    const refImage = reference;
    setReference(null);
    setPrompt("");
    if (refImage) {
      await sendFromTag(query, refImage);
      return;
    }
    const session = sessionRef.current;
    setGenerating(true);
    setGenProgress(0);
    const turnId = `grp_${Date.now()}`;
    const ratioName = selectedScaleName || "1:1";
    setTurns((current) => [
      ...current,
      {
        id: turnId,
        userMessage: query,
        referenceUrls: [],
        images: [{
          id: "",
          taskId: "",
          sessionId,
          prompt: query,
          tmpUrl: "",
          scale: "",
          status: 1,
          sessionPrompt: [],
        }],
        sessionPrompt: [],
        sessionId,
        relatedImages: [],
        relatedTaskId: "",
        relatedExpanded: false,
      },
    ]);
    // 与官方一致：发起生成的同时并行拉取相关图，挂到同一组上
    void (async () => {
      try {
        const relatedSource = await aiImageRelatedSearch(sessionId, query, ratioName, 10, 0);
        if (session !== sessionRef.current) return;
        const related = parseRelatedSearchResponse(relatedSource);
        if (!related) return;
        setTurns((current) =>
          current.map((turn) =>
            turn.id === turnId
              ? {...turn, relatedImages: related.images, relatedTaskId: related.taskId}
              : turn,
          ),
        );
      } catch {
        // 相关图失败不影响生成主流程
      }
    })();
    try {
      const payload: Record<string, unknown> = {
        session_id: sessionId,
        prompt: query,
        scale: selectedScaleValue,
        gen_type: 5,
      };
      if (selectedStyle) payload.style = selectedStyle;
      const response = await aiImageStartCreation(JSON.stringify(payload));
      if (session !== sessionRef.current) return;
      const start = parseStartResponse(response);
      if (!start) throw new Error(parseErrorHint(response));
      if (start.sensitive) {
        toast.show("输入的内容可能包含敏感词汇，请修改后重新开始创作", "error");
        setTurns((current) => current.filter((turn) => turn.id !== turnId));
        return;
      }
      if (!start.taskId) throw new Error("生成任务未返回任务号，请稍后重试");
      const taskId = start.taskId;
      const deadline = Date.now() + GEN_TIMEOUT_MS;
      for (;;) {
        await delay(GEN_POLL_INTERVAL_MS);
        if (session !== sessionRef.current) return;
        if (Date.now() > deadline) {
          toast.show("生成超时，请稍后重试", "error");
          setTurns((current) =>
            current.map((turn) =>
              turn.id === turnId
                ? {...turn, images: turn.images.map((item) => ({...item, status: 4}))}
                : turn,
            ),
          );
          return;
        }
        const picResponse = await aiImageGetPic(taskId, sessionId);
        if (session !== sessionRef.current) return;
        const images = parseGetPicResponse(picResponse);
        if (!images || images.length === 0) continue;
        const done = images.some((item) => item.status === 3 || item.status === 4);
        if (!done) continue;
        setTurns((current) =>
          current.map((turn) =>
            turn.id === turnId
              ? {
                  ...turn,
                  images,
                  sessionPrompt: images.find((item) => item.sessionPrompt.length)?.sessionPrompt ?? [],
                }
              : turn,
          ),
        );
        if (!images.some((item) => item.status === 3)) {
          toast.show("生成失败，请调整提示词后重试", "error");
        }
        return;
      }
    } catch (error) {
      if (session !== sessionRef.current) return;
      setTurns((current) => current.filter((turn) => turn.id !== turnId));
      const message = errorMessage(error);
      if (message.includes("NOT_CONFIGURED")) {
        onNeedSettings?.();
      } else {
        toast.show(`生成失败：${message}`, "error");
      }
    } finally {
      if (session === sessionRef.current) setGenerating(false);
    }
  }, [
    generating,
    onNeedSettings,
    prompt,
    reference,
    selectedScaleName,
    selectedScaleValue,
    selectedStyle,
    sessionId,
    sendFromTag,
  ]);

  const insertImage = useCallback(
    async (image: AiImage, turn: ChatTurn) => {
      if (!canInsert || insertingId) return;
      const session = sessionRef.current;
      setInsertingId(image.id || image.tmpUrl);
      try {
        const response = await aiImageInsertPic(
          JSON.stringify({
            pic_id: image.id,
            task_id: image.taskId || "",
            session_id: image.sessionId || turn.sessionId || sessionId,
          }),
        );
        if (session !== sessionRef.current) return;
        const inserted = parseInsertResponse(response);
        if (!inserted?.cdnUrl) throw new Error(parseErrorHint(response));
        onPick(formatHtmlImage({src: inserted.cdnUrl, alt: "AI配图"}));
        toast.show("已插入 AI 配图（永久素材链接）", "info");
        onClose();
      } catch (error) {
        if (session !== sessionRef.current) return;
        const message = errorMessage(error);
        if (message.includes("NOT_CONFIGURED")) {
          onNeedSettings?.();
        } else {
          toast.show(`应用失败：${message}`, "error");
        }
      } finally {
        if (session === sessionRef.current) setInsertingId(null);
      }
    },
    [canInsert, insertingId, onClose, onNeedSettings, onPick, sessionId],
  );

  const toggleRelated = useCallback((turnId: string) => {
    setTurns((current) =>
      current.map((turn) =>
        turn.id === turnId ? {...turn, relatedExpanded: !turn.relatedExpanded} : turn,
      ),
    );
  }, []);

  // 相关图插入：先注册到会话（append_related_search）再转永久素材，与官方一致
  const insertRelated = useCallback(
    async (image: AiImage, turn: ChatTurn) => {
      if (!canInsert || insertingId) return;
      const session = sessionRef.current;
      const key = `related-${image.tmpUrl}`;
      setInsertingId(key);
      try {
        const appendResponse = await aiImageAppendRelatedSearch(
          JSON.stringify({
            session_id: image.sessionId || turn.sessionId || sessionId,
            task_id: image.taskId || turn.relatedTaskId || "",
            img_url: image.tmpUrl,
          }),
        );
        if (session !== sessionRef.current) return;
        const appendedId = parseAppendResponse(appendResponse);
        if (!appendedId) throw new Error(parseErrorHint(appendResponse));
        const insertResponse = await aiImageInsertPic(
          JSON.stringify({
            pic_id: appendedId,
            task_id: image.taskId || turn.relatedTaskId || "",
            session_id: image.sessionId || turn.sessionId || sessionId,
          }),
        );
        if (session !== sessionRef.current) return;
        const inserted = parseInsertResponse(insertResponse);
        if (!inserted?.cdnUrl) throw new Error(parseErrorHint(insertResponse));
        onPick(formatHtmlImage({src: inserted.cdnUrl, alt: "AI配图"}));
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
    [canInsert, insertingId, onClose, onNeedSettings, onPick, sessionId],
  );

  const turnTips = (turn: ChatTurn): string => {
    if (turn.images.some((image) => image.status === 1)) return "图片生成中...";
    if (turn.images.length > 0 && turn.images.every((image) => image.status === 4)) {
      return "生成失败，请调整提示词后重试";
    }
    const scale = turn.images.find((image) => image.scale)?.scale || selectedScaleValue || "1024x1024";
    return `已为你生成图片， ${scale}`;
  };

  const renderImageTile = (image: AiImage, turn: ChatTurn) => {
    const {width, height} = imageTileSize(image.scale);
    const sizeStyle: CSSProperties = {width, height};
    const inserting = insertingId === (image.id || image.tmpUrl);
    if (image.status === 3 && image.tmpUrl) {
      return (
        <div
          className="group relative flex items-center justify-center overflow-hidden rounded-lg bg-bg-secondary"
          style={sizeStyle}
        >
          <button
            type="button"
            className="h-full w-full cursor-pointer border-0 p-0"
            title="查看大图"
            onClick={() => setLightbox(image)}
          >
            <img
              src={image.tmpUrl}
              alt={image.prompt || "AI 配图"}
              loading="lazy"
              decoding="async"
              className="h-full w-full rounded-lg object-cover"
            />
          </button>
          <div className="absolute right-3 top-3 z-10 flex gap-3 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
            <button
              type="button"
              className="relative flex h-9 cursor-pointer items-center justify-center whitespace-nowrap rounded-full border-0 bg-bg px-4 text-sm leading-[1.4] text-text transition-opacity duration-200 hover:bg-bg-tertiary"
              onClick={() => startAdjust(image)}
            >
              调整
            </button>
            <button
              type="button"
              disabled={!canInsert || Boolean(insertingId)}
              title={!canInsert ? "请先打开一篇文章" : "插入到正文"}
              className={`relative flex h-9 cursor-pointer items-center justify-center whitespace-nowrap rounded-full border-0 bg-bg px-4 text-sm leading-[1.4] text-text transition-opacity duration-200 hover:bg-bg-tertiary disabled:cursor-default disabled:opacity-60 ${
                inserting ? "pointer-events-none opacity-70" : ""
              }`}
              onClick={() => void insertImage(image, turn)}
            >
              {inserting ? "应用中…" : "应用"}
            </button>
          </div>
          <div className="pointer-events-none absolute bottom-2 right-2 inline-flex items-center leading-[17px]">
            <span className="mr-0.5 text-sm text-white/50">AI</span>
            <span className="text-xs text-white/50">图片</span>
          </div>
        </div>
      );
    }
    if (image.status === 4) {
      return (
        <div
          className="flex items-center justify-center rounded-lg bg-bg-secondary text-sm text-text-secondary"
          style={sizeStyle}
        >
          生成失败
        </div>
      );
    }
    return (
      <div
        className="flex flex-col items-center justify-center gap-1 rounded-lg bg-bg-secondary text-text-secondary"
        style={sizeStyle}
      >
        <div
          className="relative h-7 w-7 rounded-full"
          style={{
            background: `conic-gradient(var(--accent) 0%, var(--accent) ${genProgress}%, var(--bg-secondary) ${genProgress}%, var(--bg-secondary) 100%)`,
          }}
        >
          <div className="absolute inset-[2px] rounded-full bg-bg-secondary" />
        </div>
        <span className="text-sm leading-[19.6px]">{genProgress}%</span>
      </div>
    );
  };

  const renderTurn = (turn: ChatTurn) => (
    <div key={turn.id} className="mb-6 last:mb-0">
      <div className="mb-3 ml-auto flex w-fit flex-col items-end gap-3">
        {turn.referenceUrls.length > 0 && (
          <div className="flex flex-wrap justify-end gap-2">
            {turn.referenceUrls.map((url) => (
              <img key={url} src={url} alt="" className="h-[120px] w-[120px] rounded-lg object-cover" />
            ))}
          </div>
        )}
        <div className="whitespace-pre-wrap rounded-lg bg-bg-secondary px-3 py-3 text-sm leading-[1.4] text-text">
          {turn.userMessage}
        </div>
      </div>
      <div>
        <p className="text-sm leading-[1.4] text-text">{turnTips(turn)}</p>
        <div className="flex flex-wrap gap-3 pt-1">
          {turn.images.map((image, index) => (
            <div key={image.id || `${turn.id}-${index}`} className="contents">
              {renderImageTile(image, turn)}
            </div>
          ))}
        </div>
        {turn.sessionPrompt.length > 0 && !turn.images.some((image) => image.status === 1) && (
          <div className="mt-3 flex flex-col gap-2">
            {turn.sessionPrompt.map((tag) => (
              <button
                key={tag}
                type="button"
                className="inline-block self-start rounded-lg border border-border bg-bg px-3 py-1.5 text-sm leading-[1.4] text-text transition-colors duration-200 hover:border-transparent hover:bg-bg-tertiary"
                onClick={() => adjustWithTag(tag, turn)}
              >
                {tag}
              </button>
            ))}
          </div>
        )}
        {turn.relatedImages.length > 0 && (
          <div className="mt-4">
            <button
              type="button"
              className="flex cursor-pointer items-center gap-1 border-0 bg-transparent p-0 text-sm text-text-secondary transition-colors duration-200 hover:text-text"
              onClick={() => toggleRelated(turn.id)}
            >
              相关图
              <ChevronDown
                size={14}
                className={`transition-transform duration-200 ${turn.relatedExpanded ? "rotate-180" : ""}`}
              />
            </button>
            {turn.relatedExpanded && (
              <div className="mt-2 grid grid-cols-4 gap-2">
                {turn.relatedImages.map((image, index) => {
                  const key = image.tmpUrl || `${turn.id}-related-${index}`;
                  const inserting = insertingId === `related-${image.tmpUrl}`;
                  return (
                    <button
                      key={key}
                      type="button"
                      disabled={!canInsert || Boolean(insertingId)}
                      title={!canInsert ? "请先打开一篇文章" : "插入这张相关图"}
                      className="group relative aspect-square cursor-pointer overflow-hidden rounded-md border-0 bg-bg-secondary p-0 disabled:cursor-default disabled:opacity-60"
                      onClick={() => void insertRelated(image, turn)}
                    >
                      <img
                        src={image.tmpUrl}
                        alt={image.prompt || "相关图"}
                        loading="lazy"
                        decoding="async"
                        className="h-full w-full object-cover"
                      />
                      <span className="absolute inset-0 flex items-center justify-center bg-black/40 text-xs text-white opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                        {inserting ? "插入中…" : "插入"}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );

  const sendDisabled = !prompt.trim() || generating;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[2000] flex items-center justify-center"
          style={{background: "rgba(20,20,30,0.4)"}}
          initial={{opacity: 0}}
          animate={{opacity: 1}}
          exit={{opacity: 0}}
          transition={{duration: MOTION_DURATION_FAST}}
          onClick={onClose}
        >
          <motion.div
            className="flex flex-col overflow-hidden rounded-lg bg-bg shadow-md"
            style={{
              width: 900,
              maxWidth: "94vw",
              height: "min(893px, calc(100vh - 80px))",
              maxHeight: "calc(100vh - 80px)",
            }}
            initial={{opacity: 0, scale: 0.96, y: 8}}
            animate={{opacity: 1, scale: 1, y: 0}}
            exit={{opacity: 0, scale: 0.96, y: 8}}
            transition={MOTION_SPRING_POP}
            onClick={(event) => event.stopPropagation()}
          >
            <div
              data-ai-selector
              className={`flex h-16 flex-none items-center justify-between border-b px-8 transition-colors duration-200 ${
                headerScrolled ? "border-border" : "border-transparent"
              }`}
            >
              <div className="relative flex items-center">
                <span className="pr-2 text-base font-medium leading-6 text-text">AI配图</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    title="历史对话"
                    className={`flex h-6 w-6 cursor-pointer items-center justify-center rounded border-0 p-0 transition-colors duration-200 hover:bg-bg-tertiary ${
                      historyOpen ? "text-accent" : "text-text"
                    }`}
                    onClick={() => {
                      setHistoryOpen((value) => !value);
                      setRatioOpen(false);
                      setStyleOpen(false);
                    }}
                  >
                    <HistoryIcon />
                  </button>
                  <button
                    type="button"
                    title="新建对话"
                    className="flex h-6 w-6 cursor-pointer items-center justify-center rounded border-0 p-0 text-text transition-colors duration-200 hover:bg-bg-tertiary"
                    onClick={() => void startNewConversation()}
                  >
                    <NewConversationIcon />
                  </button>
                </div>
                {historyOpen && (
                  <div className="absolute left-0 top-[calc(100%+8px)] z-50 flex max-h-[400px] w-60 max-w-[360px] flex-col overflow-hidden rounded-lg bg-bg py-2 shadow-md">
                    <div className="px-4 py-2 text-xs leading-[1.4] text-text-muted">历史对话</div>
                    <div className="max-h-[360px] flex-1 overflow-y-auto">
                      {history.length === 0 && (
                        <div className="px-4 py-5 text-center text-[13px] text-text-muted">暂无历史对话</div>
                      )}
                      {history.map((item) => {
                        const active = item.sessionId === sessionId;
                        return (
                          <button
                            key={item.sessionId}
                            type="button"
                            className={`flex w-full cursor-pointer items-center border-0 px-4 py-2.5 text-left text-sm leading-[1.4] transition-colors duration-200 ${
                              active
                                ? "bg-accent-subtle text-accent hover:bg-accent-subtle"
                                : "text-text hover:bg-bg-tertiary"
                            }`}
                            onClick={() => switchToHistory(item)}
                          >
                            <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap">
                              {item.label}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
              <button
                type="button"
                title="关闭"
                className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-sm border-0 p-0 text-text-secondary transition-colors duration-200 hover:bg-bg-tertiary hover:text-text"
                onClick={onClose}
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex min-h-0 flex-1 flex-col px-8 pb-8">
              <div
                ref={chatRef}
                data-ai-selector
                className="min-h-0 flex-1 overflow-y-auto"
                style={{paddingTop: 24}}
                onScroll={(event) => setHeaderScrolled(event.currentTarget.scrollTop > 4)}
              >
                {phase === "loading" && (
                  <div className="flex h-full w-full items-center justify-center">
                    <div className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-accent" />
                  </div>
                )}
                {phase === "error" && (
                  <div className="flex h-full w-full flex-col items-center justify-center gap-3">
                    <ImagePlus size={32} className="text-text-muted" />
                    <div className="text-sm text-text-secondary">AI 配图初始化失败</div>
                    <button
                      type="button"
                      className="h-8 cursor-pointer rounded-sm border border-border bg-bg-secondary px-3 text-[13px] font-medium text-text transition-colors duration-200 hover:bg-bg-tertiary"
                      onClick={() => setRetryToken((token) => token + 1)}
                    >
                      重试
                    </button>
                  </div>
                )}
                {phase === "ready" && turns.length === 0 && (
                  <div style={{margin: "24px 0 0"}}>
                    <div className="mb-4 text-xl font-medium leading-7 text-text">
                      欢迎使用 AI配图，试试这样对我说
                    </div>
                    <div className="flex flex-col items-start gap-3">
                      {examples.map((example) => (
                        <button
                          key={example}
                          type="button"
                          className="inline-block cursor-pointer rounded-md border-0 bg-bg-secondary px-3.5 py-2 text-sm leading-[1.4] text-text select-none transition-colors duration-200 hover:bg-bg-tertiary"
                          onClick={() => {
                            setPrompt(example);
                            focusInput();
                          }}
                        >
                          {example}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {phase === "ready" && turns.length > 0 && (
                  <div>{turns.map(renderTurn)}</div>
                )}
              </div>

              <div className="mt-4 flex flex-col gap-4 rounded-lg border border-border p-4">
                <div className="relative rounded-lg border border-border bg-bg-secondary px-3 py-2 transition-colors duration-200 focus-within:border-accent focus-within:ring-2 focus-within:ring-[color:var(--ring)]">
                  {reference && (
                    <div className="mb-3 flex items-start gap-2">
                      {reference.tmpUrl && (
                        <img
                          src={reference.tmpUrl}
                          alt=""
                          className="block h-[100px] w-[100px] rounded bg-bg-tertiary object-cover"
                        />
                      )}
                      <button
                        type="button"
                        title="取消参考图"
                        className="mt-0.5 flex h-4 w-4 cursor-pointer items-center justify-center border-0 p-0 text-text-secondary transition-colors duration-150 hover:text-text"
                        onClick={() => setReference(null)}
                      >
                        <X size={12} />
                      </button>
                    </div>
                  )}
                  <textarea
                    ref={textareaRef}
                    id="ai-image-prompt"
                    name="ai-image-prompt"
                    rows={3}
                    value={prompt}
                    placeholder={reference ? "告诉我你想怎么改" : "请描述你想要创作的内容"}
                    className="w-full resize-none border-0 bg-transparent p-0 text-sm leading-[1.4] text-text outline-none placeholder:text-text-muted"
                    style={{caretColor: "var(--accent)"}}
                    onChange={(event) => setPrompt(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        void send();
                      }
                    }}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div data-ai-selector className="flex gap-3">
                    <div className="relative select-none">
                      <button
                        type="button"
                        className={`inline-flex cursor-pointer items-center rounded-[18px] border-0 px-4 py-2 text-sm leading-[1.4] transition-colors duration-200 ${
                          ratioOpen
                            ? "bg-accent-subtle font-medium text-accent"
                            : "bg-bg-secondary text-text hover:bg-bg-tertiary"
                        }`}
                        onClick={() => {
                          setRatioOpen((value) => !value);
                          setStyleOpen(false);
                          setHistoryOpen(false);
                        }}
                      >
                        {selectedScaleName || "比例"}
                        <ChevronDown size={12} className="ml-1" />
                      </button>
                      {ratioOpen && (
                        <div className="absolute bottom-[calc(100%+6px)] left-0 z-10 min-w-[100px] overflow-hidden rounded-md bg-bg py-1.5 shadow-md">
                          {scales.map((scale) => {
                            const active = scale.name === selectedScaleName;
                            return (
                              <button
                                key={scale.name}
                                type="button"
                                className={`block w-full cursor-pointer whitespace-nowrap border-0 px-4 py-2 text-left text-sm transition-colors duration-200 hover:bg-bg-tertiary ${
                                  active ? "text-accent" : "text-text"
                                }`}
                                onClick={() => {
                                  setSelectedScaleName(scale.name);
                                  setRatioOpen(false);
                                }}
                              >
                                {scale.name}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                    <div className="relative select-none">
                      <button
                        type="button"
                        className={`inline-flex cursor-pointer items-center rounded-[18px] border-0 px-4 py-2 text-sm leading-[1.4] transition-colors duration-200 ${
                          styleOpen
                            ? "bg-accent-subtle font-medium text-accent"
                            : "bg-bg-secondary text-text hover:bg-bg-tertiary"
                        }`}
                        onClick={() => {
                          setStyleOpen((value) => !value);
                          setRatioOpen(false);
                          setHistoryOpen(false);
                        }}
                      >
                        {selectedStyle
                          ? styles.find((style) => style.value === selectedStyle)?.name || "风格"
                          : "风格"}
                        <ChevronDown size={12} className="ml-1" />
                      </button>
                      {styleOpen && (
                        <div className="absolute bottom-[calc(100%+6px)] left-0 z-10 flex h-[240px] w-32 flex-col overflow-hidden rounded-md bg-bg py-1.5 shadow-md">
                          <button
                            type="button"
                            className={`block w-full cursor-pointer border-0 px-4 py-2 text-left text-sm transition-colors duration-200 hover:bg-bg-tertiary ${
                              !selectedStyle ? "text-accent" : "text-text"
                            }`}
                            onClick={() => {
                              setSelectedStyle("");
                              setStyleOpen(false);
                            }}
                          >
                            不限
                          </button>
                          {styles.map((style) => {
                            const active = style.value === selectedStyle;
                            return (
                              <button
                                key={style.value}
                                type="button"
                                className={`block w-full cursor-pointer border-0 px-4 py-2 text-left text-sm transition-colors duration-200 hover:bg-bg-tertiary ${
                                  active ? "text-accent" : "text-text"
                                }`}
                                onClick={() => {
                                  setSelectedStyle(active ? "" : style.value);
                                  setStyleOpen(false);
                                }}
                              >
                                {style.name}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    title="生成图片"
                    className={`flex h-9 w-9 cursor-pointer items-center justify-center border-none bg-transparent p-0 transition-opacity duration-200 hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-100 ${
                      sendDisabled ? "text-text-muted" : "text-accent"
                    }`}
                    disabled={sendDisabled}
                    onClick={() => void send()}
                  >
                    <SendIcon />
                  </button>
                </div>
              </div>

              <div className="mx-auto mt-4 w-fit text-xs text-text-muted">
                已阅读并同意遵守
                <a
                  href="https://mp.weixin.qq.com/cgi-bin/announce?action=getannouncement&key=11724642113HBz0R&version=1&lang=zh_CN&platform=2"
                  target="_blank"
                  rel="noreferrer"
                  className="mx-0.5 text-accent hover:text-accent"
                >
                  《微信公众平台AI配图功能使用条款》
                </a>
                及
                <a
                  href="https://mp.weixin.qq.com/webapp/privacy_page"
                  target="_blank"
                  rel="noreferrer"
                  className="mx-0.5 text-accent hover:text-accent"
                >
                  《微信公众平台个人信息保护指引》
                </a>
                。
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}

      {lightbox && (
        <motion.div
          className="fixed inset-0 z-[3000] flex items-center justify-center"
          style={{background: "rgba(0,0,0,0.6)"}}
          initial={{opacity: 0}}
          animate={{opacity: 1}}
          exit={{opacity: 0}}
          transition={{duration: MOTION_DURATION_FAST}}
          onClick={() => setLightbox(null)}
        >
          <motion.div
            className="relative flex max-h-[86vh] max-w-[90vw] flex-col"
            initial={{opacity: 0, scale: 0.97}}
            animate={{opacity: 1, scale: 1}}
            exit={{opacity: 0, scale: 0.97}}
            transition={MOTION_SPRING_POP}
            onClick={(event) => event.stopPropagation()}
          >
            <img
              src={lightbox.tmpUrl}
              alt={lightbox.prompt || "AI 配图"}
              className="max-h-[calc(86vh-72px)] max-w-[90vw] rounded-lg object-contain"
            />
            <div className="pointer-events-none absolute bottom-4 right-4 inline-flex items-center leading-[18px]">
              <span className="mr-0.5 text-sm text-white/55">AI</span>
              <span className="text-xs text-white/55">图片</span>
            </div>
            <div className="mt-3 flex items-center justify-center gap-4">
              <button
                type="button"
                className="h-9 w-24 cursor-pointer rounded-full border-0 bg-bg text-sm text-text transition-opacity duration-200 hover:bg-bg-tertiary"
                onClick={() => {
                  startAdjust(lightbox);
                  setLightbox(null);
                }}
              >
                调整
              </button>
              <button
                type="button"
                disabled={!canInsert}
                title={!canInsert ? "请先打开一篇文章" : "插入到正文"}
                className="h-9 w-24 cursor-pointer rounded-full border-0 bg-bg text-sm text-text transition-opacity duration-200 hover:bg-bg-tertiary disabled:cursor-default disabled:opacity-60"
                onClick={() => {
                  const turn = turns.find((item) =>
                    item.images.some((image) => image.id === lightbox.id),
                  );
                  if (turn) void insertImage(lightbox, turn);
                }}
              >
                应用
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
