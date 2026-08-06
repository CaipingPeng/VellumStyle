// 预览区本地媒体播放（音频流式播放 + 视频直链播放）。
// 独立模块以避免 PublishDialog 发布流程加载整个 Preview 组件。
import {getVideoPlayUrl} from "../../utils/publish.ts";
import {toast} from "../Toast/toast.ts";

let playingVoiceAudio: HTMLAudioElement | null = null;
let playingVoicePlaceholder: HTMLElement | null = null;

function errorMessage(error: unknown): string {
  return typeof error === "string" ? error : (error as Error)?.message || "未知错误";
}

function setVoicePlayState(playEl: HTMLElement, playing: boolean) {
  playEl.classList.toggle("is-playing", playing);
}

function formatVoiceProgress(current: number, total?: number): string {
  const format = (seconds: number) =>
    `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
  return total && Number.isFinite(total) ? `${format(current)} / ${format(total)}` : format(current);
}

export function toggleVoicePlayback(
  placeholder: HTMLElement,
  playEl: HTMLElement,
  durationEl: HTMLElement,
  playerUrl: string,
  idleLabel: string,
) {
  const current = playingVoiceAudio;
  if (current && playingVoicePlaceholder === placeholder) {
    if (!current.paused) {
      current.pause();
      setVoicePlayState(playEl, false);
    } else {
      void current.play();
      setVoicePlayState(playEl, true);
    }
    return;
  }

  current?.pause();
  if (playingVoicePlaceholder && playingVoicePlaceholder !== placeholder) {
    const previousPlay = playingVoicePlaceholder.querySelector<HTMLElement>(".vs-audio-placeholder-play");
    previousPlay && setVoicePlayState(previousPlay, false);
  }

  const audio = new Audio(playerUrl);
  playingVoiceAudio = audio;
  playingVoicePlaceholder = placeholder;
  setVoicePlayState(playEl, true);

  audio.addEventListener("timeupdate", () => {
    durationEl.textContent = formatVoiceProgress(audio.currentTime, audio.duration);
  });
  audio.addEventListener("ended", () => {
    durationEl.textContent = idleLabel;
    setVoicePlayState(playEl, false);
    if (playingVoiceAudio === audio) {
      playingVoiceAudio = null;
      playingVoicePlaceholder = null;
    }
  });
  audio.addEventListener("error", () => {
    durationEl.textContent = idleLabel;
    setVoicePlayState(playEl, false);
    if (playingVoiceAudio === audio) {
      playingVoiceAudio = null;
      playingVoicePlaceholder = null;
    }
    toast.show("音频播放失败，请稍后重试", "error");
  });
  void audio.play().catch(() => {
    durationEl.textContent = idleLabel;
    setVoicePlayState(playEl, false);
    if (playingVoiceAudio === audio) {
      playingVoiceAudio = null;
      playingVoicePlaceholder = null;
    }
    toast.show("音频播放失败，请稍后重试", "error");
  });
}

// 视频占位播放：实时获取带签名的 mp4 直链后，把占位替换为内嵌播放器。
export async function playPreviewVideo(placeholder: HTMLElement, mediaId: string) {
  let src: string;
  try {
    src = await getVideoPlayUrl(mediaId);
  } catch (error) {
    toast.show(`视频加载失败：${errorMessage(error)}`, "error");
    return;
  }
  const video = document.createElement("video");
  video.src = src;
  video.controls = true;
  video.autoplay = true;
  video.className = "vs-video-placeholder-player";
  video.setAttribute("playsinline", "");
  placeholder.replaceChildren(video);
}

// 发布前停止所有本地媒体播放（预览里的视频播放器与全局音频），
// 避免发布流程中后台继续出声。
export function stopLocalMediaPlayback() {
  playingVoiceAudio?.pause();
  playingVoiceAudio = null;
  playingVoicePlaceholder = null;
  for (const video of Array.from(document.querySelectorAll<HTMLVideoElement>(".vs-video-placeholder-player"))) {
    video.pause();
  }
}
