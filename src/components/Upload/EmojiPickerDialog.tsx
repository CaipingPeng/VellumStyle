import {useCallback, useEffect, useRef, useState} from "react";
import {Check, Search, Smile} from "lucide-react";
import {backendWindowUrl, getEmojiCdnUrl, openWechatBackendHidden, searchRemoticon, showWechatBackend} from "../../utils/publish.ts";
import {toProxyImageUrl} from "../../utils/imageProxy.ts";
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

interface EmojiItem {
  docId: string;
  emojiUrl: string;
  thumbUrl: string;
  // normal 表情转换永久链接时，官方 get_cdn_url 需要响应的 aes_key；gen 表情无此项。
  aesKey?: string;
  // 官方 get_cdn_url 接口参数：gen=1，normal=0。
  emoticonType: number;
}

interface EmojiPage {
  items: EmojiItem[];
  genNextOffset: number;
  genContinue: boolean;
  normalNextOffset: number;
  normalContinue: boolean;
}

const PAGE_SIZE = 40;

function errorMessage(error: unknown): string {
  return typeof error === "string" ? error : (error as Error)?.message || "未知错误";
}

function parseEmojiSearchResponse(source: string): EmojiPage | null {
  let data: {
    vs_error?: string;
    base_resp?: {ret?: number; err_msg?: string};
    gen_emoji_result?: {items?: Array<Record<string, unknown>>; next_offset?: number; continue_flag?: boolean};
    normal_emoji_result?: {items?: Array<Record<string, unknown>>; next_offset?: number; continue_flag?: boolean};
  };
  try {
    data = JSON.parse(source);
  } catch {
    return null;
  }
  if (data?.vs_error) return null;
  if (data?.base_resp && data.base_resp.ret !== undefined && data.base_resp.ret !== 0) {
    return null;
  }
  const toItems = (list: Array<Record<string, unknown>> | undefined, emoticonType: number): EmojiItem[] =>
    (list ?? []).filter((item) => typeof item.emoji_url === "string" && item.emoji_url).map((item) => ({
      docId: String(item.doc_id ?? ""),
      emojiUrl: item.emoji_url as string,
      thumbUrl: (item.thumb_url as string) || (item.emoji_url as string),
      aesKey: typeof item.aes_key === "string" && item.aes_key ? item.aes_key : undefined,
      emoticonType,
    }));
  // gen 与 normal 可能有重复表情（同一 docId），保留先出现的 gen 明文版本。
  const seen = new Set<string>();
  const items = [...toItems(data?.gen_emoji_result?.items, 1), ...toItems(data?.normal_emoji_result?.items, 0)].filter(
    (item) => {
      if (!item.docId || seen.has(item.docId)) return false;
      seen.add(item.docId);
      return true;
    },
  );
  return {
    items,
    genNextOffset: Number(data?.gen_emoji_result?.next_offset ?? 0),
    genContinue: Boolean(data?.gen_emoji_result?.continue_flag),
    normalNextOffset: Number(data?.normal_emoji_result?.next_offset ?? 0),
    normalContinue: Boolean(data?.normal_emoji_result?.continue_flag),
  };
}

// 搜索失败时给出可定位的具体原因，避免只显示笼统的"无结果"。
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

// 官方 get_cdn_url 返回 mmbiz 永久链接；失败返回 null。
function parseCdnUrlResponse(source: string): string | null {
  try {
    const data = JSON.parse(source) as {
      base_resp?: {ret?: number};
      cdn_url?: string;
    };
    if (data?.base_resp && data.base_resp.ret !== 0) return null;
    return typeof data?.cdn_url === "string" && data.cdn_url ? data.cdn_url : null;
  } catch {
    return null;
  }
}

export default function EmojiPickerDialog({open, canInsert, onClose, onPick, onNeedSettings}: Props) {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<EmojiItem[]>([]);
  const [genNextOffset, setGenNextOffset] = useState(0);
  const [genContinue, setGenContinue] = useState(false);
  const [normalNextOffset, setNormalNextOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [inserting, setInserting] = useState(false);
  const sessionRef = useRef(0);

  const applyPage = useCallback((page: EmojiPage) => {
    setItems(page.items);
    setSelectedIds(new Set());
    setGenNextOffset(page.genNextOffset);
    setGenContinue(page.genContinue);
    setNormalNextOffset(page.normalNextOffset);
    setHasMore(page.genContinue || page.normalContinue);
  }, []);

  const runSearch = useCallback(async (keyword: string, session: number) => {
    if (!keyword.trim()) {
      setItems([]);
      setSelectedIds(new Set());
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const response = await searchRemoticon(keyword.trim(), PAGE_SIZE, 0);
      if (session !== sessionRef.current) return;
      const page = parseEmojiSearchResponse(response);
      if (page === null) {
        setItems([]);
        setSelectedIds(new Set());
        toast.show(`表情搜索失败：${parseErrorHint(response)}`, "error", 6000);
      } else {
        applyPage(page);
      }
    } catch (error) {
      if (session !== sessionRef.current) return;
      const message = errorMessage(error);
      if (message.includes("WECHAT_BACKEND_NOT_OPENED")) {
        setItems([]);
        setSelectedIds(new Set());
        await openWechatBackendHidden();
        toast.show("正在等待微信后台就绪…", "info", 3000);
        const startedAt = Date.now();
        let shown = false;
        while (Date.now() - startedAt < 60_000) {
          await new Promise((resolve) => setTimeout(resolve, 1500));
          if (session !== sessionRef.current) return;
          // 先等隐藏窗口导航到微信域（页面基本加载完成），避免未就绪时误判为未登录
          let url: string | null = null;
          try {
            url = await backendWindowUrl();
          } catch {
            // 窗口暂不可读，继续等待
          }
          if (!url?.startsWith("https://mp.weixin.qq.com/")) continue;
          try {
            const retryResponse = await searchRemoticon(keyword.trim(), PAGE_SIZE, 0);
            if (session !== sessionRef.current) return;
            const page = parseEmojiSearchResponse(retryResponse);
            if (page !== null) {
              applyPage(page);
              setLoading(false);
              // 成功：窗口保留（隐藏），后续加载更多/再次搜索直接复用登录态
              return;
            }
          } catch {
            // 页面未就绪，继续等待
          }
          if (!shown) {
            shown = true;
            await showWechatBackend();
          }
        }
        if (session === sessionRef.current) {
          setLoading(false);
          toast.show("等待微信后台登录超时，请登录后重新搜索", "error");
        }
      } else {
        setItems([]);
        setSelectedIds(new Set());
        toast.show(`表情搜索失败：${message}`, "error");
      }
    } finally {
      if (session === sessionRef.current) setLoading(false);
    }
  }, [applyPage]);

  const startSearch = useCallback(() => {
    const keyword = query.trim();
    if (!keyword) return;
    const session = ++sessionRef.current;
    void runSearch(keyword, session);
  }, [query, runSearch]);

  // 打开弹窗时清空旧结果；搜索只由用户按回车触发，不做输入防抖/补全搜索。
  useEffect(() => {
    sessionRef.current += 1;
    setItems([]);
    setSelectedIds(new Set());
    setLoading(false);
  }, [open]);

  const loadMore = async () => {
    if (loadingMore || !hasMore) return;
    const keyword = query.trim();
    if (!keyword) return;
    setLoadingMore(true);
    try {
      const offset = genContinue ? genNextOffset : normalNextOffset;
      const response = await searchRemoticon(keyword, PAGE_SIZE, offset);
      const page = parseEmojiSearchResponse(response);
      if (page === null) {
        toast.show("加载更多失败，请稍后重试", "error");
        return;
      }
      setItems((prev) => {
        const seen = new Set(prev.map((item) => item.docId));
        return [...prev, ...page.items.filter((item) => !seen.has(item.docId))];
      });
      setGenNextOffset(page.genNextOffset);
      setGenContinue(page.genContinue);
      setNormalNextOffset(page.normalNextOffset);
      setHasMore(page.genContinue || page.normalContinue);
    } catch (error) {
      toast.show(`加载更多失败：${errorMessage(error)}`, "error");
    } finally {
      setLoadingMore(false);
    }
  };

  const toggleSelect = (docId: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(docId)) next.delete(docId);
      else next.add(docId);
      return next;
    });
  };

  const selectedItems = items.filter((item) => selectedIds.has(item.docId));

  const insertSelected = async () => {
    if (!canInsert || selectedItems.length === 0 || inserting) return;
    setInserting(true);
    try {
      const markdowns: string[] = [];
      for (const item of selectedItems) {
        const response = await getEmojiCdnUrl(item.emojiUrl, item.thumbUrl, item.aesKey, item.emoticonType);
        const cdnUrl = parseCdnUrlResponse(response);
        if (!cdnUrl) {
          throw new Error(`表情转换失败：${parseErrorHint(response)}`);
        }
        markdowns.push(`![${item.docId}](${cdnUrl})`);
      }
      onPick(markdowns.join(" "));
      toast.show(`已插入 ${markdowns.length} 个表情`, "info");
      onClose();
    } catch (error) {
      const message = errorMessage(error);
      if (message.includes("NOT_CONFIGURED")) {
        onNeedSettings?.();
      } else {
        toast.show(`表情插入失败：${message}`, "error");
      }
    } finally {
      setInserting(false);
    }
  };

  return (
    <Dialog
      open={open}
      title={
        <span className="flex items-center gap-1.5">
          <Smile size={16} />
          表情
        </span>
      }
      onClose={onClose}
      closeDisabled={inserting}
      width="min(90vw,720px)"
      contentPadding={false}
      footer={
        <div className="flex w-full items-center justify-between gap-3">
          <span className="text-xs font-normal text-text-muted">
            {selectedItems.length > 0 ? `已选择 ${selectedItems.length} 个` : "点击表情可多选"}
          </span>
          <div className="flex items-center gap-2">
            {hasMore && items.length > 0 && (
              <Button
                type="button"
                variant="secondary"
                state={loadingMore ? "loading" : "idle"}
                loadingText="加载中…"
                disabled={loading || loadingMore || inserting}
                onClick={() => void loadMore()}
              >
                加载更多
              </Button>
            )}
            <Button
              type="button"
              variant="primary"
              state={inserting ? "loading" : "idle"}
              loadingText="正在上传…"
              disabled={!canInsert || selectedItems.length === 0 || inserting}
              title={!canInsert ? "请先打开一篇文章" : "将所选表情转换为永久链接后插入"}
              onClick={() => void insertSelected()}
            >
              插入所选
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex h-[clamp(360px,calc(86vh-120px),560px)] min-h-0 flex-col">
        <div className="flex h-[46px] flex-none items-center gap-2 border-b border-border bg-bg-secondary px-4">
          <Search size={14} className="flex-none text-text-muted" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                startSearch();
              }
            }}
            placeholder="输入关键词后按回车搜索，如：不嘻嘻"
            spellCheck={false}
            className="box-border h-8 min-w-0 flex-1 rounded-md border border-border bg-bg px-3 text-sm text-text outline-none transition-colors duration-fast placeholder:text-text-muted focus:border-[color:var(--ring)] focus:ring-2 focus:ring-[color:var(--ring)]"
          />
        </div>

        {loading ? (
          <div className="grid min-h-0 flex-1 auto-rows-max grid-cols-4 gap-3 overflow-hidden p-4 sm:grid-cols-5 lg:grid-cols-6">
            {Array.from({length: 18}).map((_, index) => (
              <div key={index} className="aspect-square animate-pulse rounded-lg bg-bg-tertiary" />
            ))}
          </div>
        ) : items.length > 0 ? (
          <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-4 [scrollbar-gutter:stable] [scrollbar-width:thin]">
            <div className="grid auto-rows-max grid-cols-4 content-start gap-3 sm:grid-cols-5 lg:grid-cols-6">
              {items.map((item, index) => {
                const selected = selectedIds.has(item.docId);
                return (
                  <button
                    key={item.docId || index}
                    type="button"
                    disabled={Boolean(inserting)}
                    aria-pressed={selected}
                    aria-label={`${selected ? "取消选择" : "选择"}第 ${index + 1} 个表情`}
                    onClick={() => toggleSelect(item.docId)}
                    className={`relative grid aspect-square cursor-pointer place-items-center overflow-hidden rounded-lg border bg-bg-secondary p-0 outline-none transition-[border-color,background-color,transform] duration-slow ease-bounce focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] disabled:cursor-default disabled:opacity-60 ${
                      selected ? "border-accent/70" : "border-[color:var(--card-border)] hover:-translate-y-1 hover:bg-bg"
                    }`}
                  >
                    <img
                      src={toProxyImageUrl(item.thumbUrl)}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className="block h-full w-full object-contain p-1"
                    />
                    {selected && (
                      <span aria-hidden="true" className="absolute right-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-full border-2 border-white bg-accent text-white">
                        <Check size={12} strokeWidth={3} />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="m-4 flex min-h-0 flex-1 flex-col items-center justify-center rounded-md bg-bg-secondary px-6 text-center text-sm text-text-secondary">
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-accent-subtle text-accent"><Smile size={22} /></span>
            <div className="mt-3 font-medium text-text">
              {query.trim() ? "没有找到相关表情" : "输入关键词后按回车搜索表情"}
            </div>
            <div className="mt-1 max-w-xs text-xs leading-5">
              表情来自微信表情搜索，插入时自动转换为永久图片链接。
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
}
