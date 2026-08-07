import {useState} from "react";
import {ArrowLeft, Clapperboard, Search} from "lucide-react";
import {getVideoFeedList, getVideoMediaList, searchVideoAccount} from "../../utils/publish.ts";
import {waitBackendCommand} from "../../utils/wechatBackend.ts";
import {toProxyImageUrl} from "../../utils/imageProxy.ts";
import {toast} from "../Toast/toast.ts";
import Button from "../ui/Button.tsx";
import Dialog from "../ui/Dialog.tsx";

interface VideoAccount {
  username: string;
  nickname: string;
  headUrl: string;
  authIconUrl: string;
  authProfession: string;
  signature: string;
}

interface VideoFeed {
  exportId: string;
  nonceId: string;
  nickname: string;
  username: string;
  desc: string;
  coverUrl: string;
  shareCoverUrl: string;
  width: number;
  height: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onPick: (markup: string) => void;
  onNeedSettings?: () => void;
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function parseVideoAccounts(source: string): VideoAccount[] | null {
  let data: {
    vs_error?: string;
    base_resp?: {ret?: number; err_msg?: string};
    acct_list?: Array<Record<string, unknown>>;
  };
  try {
    data = JSON.parse(source);
  } catch {
    return null;
  }
  if (data?.vs_error) return null;
  if (data?.base_resp && data.base_resp.ret !== undefined && data.base_resp.ret !== 0) return null;
  const list = data?.acct_list;
  if (!Array.isArray(list)) return null;
  return list
    .filter((entry) => typeof entry.username === "string" && entry.username)
    .map((entry) => {
      const authInfo = entry.auth_info as Record<string, unknown> | undefined;
      return {
        username: entry.username as string,
        nickname: typeof entry.nickname === "string" ? entry.nickname : "未知视频号",
        headUrl: typeof entry.head_url === "string" ? entry.head_url : "",
        authIconUrl: typeof authInfo?.auth_icon_url === "string" ? authInfo.auth_icon_url : "",
        authProfession: typeof authInfo?.auth_profession === "string" ? authInfo.auth_profession : "",
        signature: typeof entry.signature === "string" ? entry.signature : "",
      };
    });
}

function parseVideoFeeds(source: string): {items: VideoFeed[]; continueFlag: boolean; lastBuff: string} | null {
  let data: {
    vs_error?: string;
    base_resp?: {ret?: number; err_msg?: string};
    list?: Array<Record<string, unknown>>;
    continue_flag?: boolean;
    last_buff?: string;
  };
  try {
    data = JSON.parse(source);
  } catch {
    return null;
  }
  if (data?.vs_error) return null;
  if (data?.base_resp && data.base_resp.ret !== undefined && data.base_resp.ret !== 0) return null;
  const list = data?.list;
  if (!Array.isArray(list)) return null;
  const items: VideoFeed[] = [];
  for (const entry of list) {
    const exportId = typeof entry.export_id === "string" ? entry.export_id : "";
    if (!exportId) continue;
    const media = (Array.isArray(entry.media) ? entry.media[0] : undefined) as
      | Record<string, unknown>
      | undefined;
    items.push({
      exportId,
      nonceId: typeof entry.nonce_id === "string" ? entry.nonce_id : "",
      nickname: typeof entry.nickname === "string" ? entry.nickname : "",
      username: typeof entry.username === "string" ? entry.username : "",
      desc: typeof entry.desc === "string" ? entry.desc : "",
      coverUrl: typeof media?.cover_url === "string" ? media.cover_url : "",
      shareCoverUrl: typeof media?.share_cover_url === "string" ? media.share_cover_url : "",
      width: typeof media?.width === "number" ? media.width : 1920,
      height: typeof media?.height === "number" ? media.height : 1080,
    });
  }
  return {
    items,
    continueFlag: Boolean(data?.continue_flag),
    lastBuff: typeof data?.last_buff === "string" ? data.last_buff : "",
  };
}

function parseVideoMedia(source: string): {shareCoverUrl: string} | null {
  let data: {
    vs_error?: string;
    base_resp?: {ret?: number; err_msg?: string};
    list?: Array<Record<string, unknown>>;
  };
  try {
    data = JSON.parse(source);
  } catch {
    return null;
  }
  if (data?.vs_error) return null;
  if (data?.base_resp && data.base_resp.ret !== undefined && data.base_resp.ret !== 0) return null;
  const first = data?.list?.[0];
  const media = (Array.isArray(first?.media) ? first.media[0] : undefined) as
    | Record<string, unknown>
    | undefined;
  return {
    shareCoverUrl: typeof media?.share_cover_url === "string" ? media.share_cover_url : "",
  };
}

// 按官方编辑器插入的 mp-common-videosnap 组件生成标签，发布后微信渲染为视频号卡片。
// 官方草稿结构（实测）：section 类为 channels_iframe_wrp custom_select_card_wrp
// （竖版加 wxw_wechannel_card_not_horizontal）+ nodeleaf；不带内联 style 与 data-tool，
// 否则微信识别不到官方卡片节点会再包一层。裸组件会被 markdown 渲染器包进 <p>，
// 导致 text-align:left 下卡片不居中，因此必须输出 section 块。
function buildVideosnapMarkup(
  video: VideoFeed,
  headUrl: string,
  authIconUrl: string,
  mediaUrl: string,
): string {
  const attr = (name: string, value: string) => ` ${name}="${escapeHtmlAttribute(value)}"`;
  const isVertical = video.height > video.width;
  // 官方草稿里 data-height 用的是卡片显示比例（竖版 3:4，横版 16:9），
  // 不是视频原生比例；草稿箱卡片封面按此比例裁剪。
  const displayHeight = isVertical
    ? Math.round((video.width * 4) / 3)
    : Math.round((video.width * 9) / 16);
  return (
    `<section class="channels_iframe_wrp custom_select_card_wrp${
      isVertical ? " wxw_wechannel_card_not_horizontal" : ""
    }" nodeleaf="">` +
    `<mp-common-videosnap class="js_uneditable custom_select_card channels_iframe videosnap_video_iframe"` +
    attr("data-pluginname", "mpvideosnap") +
    attr("data-url", mediaUrl || video.shareCoverUrl || video.coverUrl) +
    attr("data-headimgurl", headUrl) +
    attr("data-username", video.username) +
    attr("data-nickname", video.nickname) +
    attr("data-desc", video.desc) +
    attr("data-nonceid", video.nonceId) +
    attr("data-authiconurl", authIconUrl) +
    attr("data-width", String(video.width)) +
    attr("data-height", String(displayHeight)) +
    attr("data-type", "video") +
    attr("data-id", video.exportId) +
    ' draggable="true"></mp-common-videosnap>' +
    '<br class="ProseMirror-trailingBreak">' +
    "</section>"
  );
}

function errorMessage(error: unknown): string {
  return typeof error === "string" ? error : (error as Error)?.message || "未知错误";
}

export default function VideoChannelDialog({open, onClose, onPick, onNeedSettings}: Props) {
  const [query, setQuery] = useState("");
  const [accounts, setAccounts] = useState<VideoAccount[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<VideoAccount | null>(null);
  const [feeds, setFeeds] = useState<VideoFeed[]>([]);
  const [searching, setSearching] = useState(false);
  const [loadingFeeds, setLoadingFeeds] = useState(false);
  const [insertingId, setInsertingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const searchAccounts = async () => {
    const keyword = query.trim();
    if (!keyword || searching || loadingFeeds || insertingId) return;
    setSearching(true);
    setError(null);
    try {
      const response = await waitBackendCommand(
        () => searchVideoAccount(keyword, ""),
        (text) => parseVideoAccounts(text) !== null,
      );
      const found = parseVideoAccounts(response) ?? [];
      setAccounts(found);
      if (found.length === 0) setError("没有找到相关视频号，换个关键词试试");
    } catch (error) {
      const message = errorMessage(error);
      if (message.includes("NOT_CONFIGURED")) {
        onNeedSettings?.();
      }
      setError(message);
    } finally {
      setSearching(false);
    }
  };

  const openAccount = async (account: VideoAccount) => {
    if (loadingFeeds || insertingId) return;
    setSelectedAccount(account);
    setLoadingFeeds(true);
    setError(null);
    try {
      const response = await waitBackendCommand(
        () => getVideoFeedList(account.username, ""),
        (text) => parseVideoFeeds(text) !== null,
      );
      const parsed = parseVideoFeeds(response);
      setFeeds(parsed?.items ?? []);
      if (!parsed || parsed.items.length === 0) setError("该视频号暂无视频内容");
    } catch (error) {
      const message = errorMessage(error);
      if (message.includes("NOT_CONFIGURED")) {
        onNeedSettings?.();
      }
      setError(message);
      setSelectedAccount(null);
    } finally {
      setLoadingFeeds(false);
    }
  };

  const insertVideo = async (video: VideoFeed) => {
    if (insertingId) return;
    setInsertingId(video.exportId);
    setError(null);
    try {
      const response = await waitBackendCommand(
        () => getVideoMediaList(video.exportId),
        (text) => parseVideoMedia(text) !== null,
      );
      const media = parseVideoMedia(response);
      const account = selectedAccount;
      if (!account) throw new Error("视频号信息丢失，请重新进入");
      // 前后加空行让 section 作为独立块级元素：若直接插入会被 markdown 包进 <p>，
      // 微信后端清洗嵌套结构时会剥掉 section 的居中样式导致发布后不居中。
      onPick(`\n\n${buildVideosnapMarkup(video, account.headUrl, account.authIconUrl, media?.shareCoverUrl ?? "")}\n\n`);
      toast.show(`已插入视频号视频：${video.nickname || "视频号"}`, "info");
      onClose();
    } catch (error) {
      const message = errorMessage(error);
      if (message.includes("NOT_CONFIGURED")) {
        onNeedSettings?.();
      }
      setError(message);
    } finally {
      setInsertingId(null);
    }
  };

  const goBack = () => {
    setSelectedAccount(null);
    setFeeds([]);
    setError(null);
  };

  const close = () => {
    if (insertingId) return;
    goBack();
    onClose();
  };

  return (
    <Dialog
      open={open}
      title={
        <span className="flex items-center gap-1.5">
          <Clapperboard size={16} />
          {selectedAccount ? `插入 ${selectedAccount.nickname} 的视频号内容` : "插入视频号内容"}
        </span>
      }
      onClose={close}
      closeDisabled={Boolean(insertingId)}
      width="min(90vw,760px)"
      contentPadding={false}
      footer={
        <div className="flex w-full items-center justify-between gap-3">
          <span className="text-xs font-normal text-text-muted">
            {selectedAccount
              ? feeds.length > 0
                ? `${feeds.length} 条视频 · 点击即可插入`
                : "加载中…"
              : accounts.length > 0
                ? `搜索到 ${accounts.length} 个视频号 · 点击进入查看视频`
                : "输入视频号名称搜索，可添加该账号的视频"}
          </span>
          {selectedAccount && (
            <Button type="button" variant="secondary" disabled={Boolean(insertingId)} onClick={goBack}>
              上一步
            </Button>
          )}
        </div>
      }
    >
      <div className="flex h-[clamp(360px,calc(86vh-120px),560px)] min-h-0 flex-col">
        <div className="flex h-[46px] flex-none items-center gap-3 border-b border-border bg-bg-secondary px-4">
          {selectedAccount ? (
            <>
              <IconBack onClick={goBack} />
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-text">
                {selectedAccount.nickname}
              </span>
            </>
          ) : (
            <>
              <div className="min-w-0 flex-1">
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void searchAccounts();
                    }
                  }}
                  placeholder="输入视频号搜索，如：中国军号"
                  spellCheck={false}
                  className="box-border h-8 w-full rounded-md border border-[color:var(--ring)] bg-bg px-3 text-sm text-text outline-none transition-colors duration-fast placeholder:text-text-muted focus:border-[color:var(--ring)] focus:ring-2 focus:ring-[color:var(--ring)]"
                />
              </div>
              <Button
                type="button"
                variant="secondary"
                state={searching ? "loading" : "idle"}
                loadingText="搜索中…"
                disabled={!query.trim() || searching || Boolean(insertingId)}
                onClick={() => void searchAccounts()}
              >
                <Search size={15} />
                搜索
              </Button>
            </>
          )}
        </div>

        {selectedAccount ? (
          loadingFeeds ? (
            <div className="grid min-h-0 flex-1 auto-rows-max grid-cols-3 gap-3 overflow-hidden p-4 lg:grid-cols-4">
              {Array.from({length: 9}).map((_, index) => (
                <div key={index} className="aspect-video animate-pulse rounded-lg bg-bg-tertiary" />
              ))}
            </div>
          ) : feeds.length > 0 ? (
            <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-4 [scrollbar-gutter:stable] [scrollbar-width:thin]">
              <div className="grid auto-rows-max grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {feeds.map((video) => {
                  const inserting = insertingId === video.exportId;
                  const coverUrl = video.coverUrl ? toProxyImageUrl(video.coverUrl) : "";
                  return (
                    <button
                      key={video.exportId}
                      type="button"
                      disabled={Boolean(insertingId)}
                      onClick={() => void insertVideo(video)}
                      className="group relative flex min-w-0 cursor-pointer flex-col overflow-hidden border-0 bg-bg-secondary p-0 text-left disabled:cursor-default"
                    >
                      {/* 封面：固定 9:16 容器，封面 cover 完全填满 */}
                      <span aria-hidden="true" className="relative block w-full overflow-hidden bg-bg-tertiary pb-[177.78%]">
                        {coverUrl && (
                          <>
                            {/* 模糊填充层：封面铺满容器并模糊，填充短边空隙 */}
                            <span
                              className="absolute inset-0 scale-110 bg-cover bg-center blur-[20px]"
                              style={{backgroundImage: `url("${coverUrl}")`}}
                            />
                            {/* 完整封面层：以长边为准完整显示、居中 */}
                            <span
                              className="absolute inset-0 bg-contain bg-center bg-no-repeat"
                              style={{backgroundImage: `url("${coverUrl}")`}}
                            />
                          </>
                        )}
                        {/* 播放按钮（官方 weui-play-btn_primary） */}
                        {inserting ? (
                          <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full bg-black/60 px-2.5 py-1 text-xs text-white">
                            插入中…
                          </span>
                        ) : (
                          <span className="absolute left-1/2 top-1/2 grid h-12 w-12 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-black/25">
                            <PlayTriangle />
                          </span>
                        )}
                        {/* 左下角信息组（紧凑左对齐，覆盖在封面上）：视频号 logo + 昵称 + 认证图标 */}
                        <span className="absolute bottom-0 left-0 flex max-w-full min-w-0 items-center px-2 pb-2">
                          <span aria-hidden="true" className="vs-videosnap-logo" />
                          <span className="min-w-0 truncate text-xs font-medium text-white">
                            {video.nickname}
                          </span>
                          {selectedAccount?.authIconUrl && (
                            <span
                              aria-hidden="true"
                              className="ml-1 block h-3.5 w-3.5 flex-none bg-cover bg-center"
                              style={{backgroundImage: `url("${toProxyImageUrl(selectedAccount.authIconUrl)}")`}}
                            />
                          )}
                        </span>
                      </span>
                      {/* 描述：单行省略 */}
                      <span className="min-w-0 px-2 py-2">
                        <span className="block truncate text-sm leading-[1.6] text-text">{video.desc}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <EmptyState error={error} />
          )
        ) : searching ? (
          <div className="grid min-h-0 flex-1 auto-rows-max grid-cols-2 gap-3 overflow-hidden p-4 lg:grid-cols-3">
            {Array.from({length: 9}).map((_, index) => (
              <div key={index} className="h-16 animate-pulse rounded-lg bg-bg-tertiary" />
            ))}
          </div>
        ) : accounts.length > 0 ? (
          <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-4 [scrollbar-gutter:stable] [scrollbar-width:thin]">
            <div className="grid auto-rows-max grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {accounts.map((account) => (
                <button
                  key={account.username}
                  type="button"
                  disabled={Boolean(insertingId)}
                  onClick={() => void openAccount(account)}
                  className="group flex min-w-0 cursor-pointer items-center gap-3 border-0 bg-bg-secondary p-3 text-left disabled:cursor-default"
                >
                  <span
                    aria-hidden="true"
                    className="block h-12 w-12 flex-none overflow-hidden rounded-full bg-bg-tertiary bg-cover bg-center"
                    style={account.headUrl ? {backgroundImage: `url("${toProxyImageUrl(account.headUrl)}")`} : undefined}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1">
                      <span className="truncate text-sm font-medium text-text">{account.nickname}</span>
                      {account.authIconUrl && (
                        <span
                          aria-hidden="true"
                          className="block h-3.5 w-3.5 flex-none bg-cover bg-center"
                          style={{backgroundImage: `url("${toProxyImageUrl(account.authIconUrl)}")`}}
                        />
                      )}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-text-secondary">
                      {account.authProfession || account.signature || "视频号"}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <EmptyState error={error} />
        )}
      </div>
    </Dialog>
  );
}

function IconBack({onClick}: {onClick: () => void}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="返回搜索"
      aria-label="返回搜索"
      className="grid h-8 w-8 flex-none place-items-center rounded-md border border-border bg-bg text-text-secondary transition-colors duration-fast hover:bg-bg-tertiary hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]"
    >
      <ArrowLeft size={17} />
    </button>
  );
}

function PlayTriangle() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M8 5.5v13a1 1 0 0 0 1.5.87l11-6.5a1 1 0 0 0 0-1.74l-11-6.5A1 1 0 0 0 8 5.5z" fill="#fff" />
    </svg>
  );
}

function EmptyState({error}: {error: string | null}) {
  return (
    <div className="m-4 flex min-h-0 flex-1 flex-col items-center justify-center rounded-md bg-bg-secondary px-6 text-center text-sm text-text-secondary">
      <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-accent-subtle text-accent">
        <Clapperboard size={22} />
      </span>
      <div className="mt-3 font-medium text-text">
        {error ?? "搜索视频号并插入其视频"}
      </div>
      <div className="mt-1 max-w-xs text-xs leading-5">
        {error ? "请检查微信后台登录状态后重试" : "发布后以微信官方视频号卡片展示，读者可直接播放"}
      </div>
    </div>
  );
}
