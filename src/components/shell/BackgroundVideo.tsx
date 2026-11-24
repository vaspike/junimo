import { Pause, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { parseBackgroundAlignment } from "@/utils/background";

const PAUSED_STORAGE_KEY = "komaritheme:bg-video-paused";
const OBJECT_POSITIONS = {
  top: "center top",
  center: "center",
  bottom: "center bottom",
} as const;

function readPausedPreference(): boolean {
  try {
    return localStorage.getItem(PAUSED_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

/** 静态图片之上的渐进增强层；加载、解码或自动播放失败时始终保留原图片。 */
export function BackgroundVideo({ src, alignment }: { src: string; alignment: string }) {
  const reduceMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const videoRef = useRef<HTMLVideoElement>(null);
  const [paused, setPaused] = useState(readPausedPreference);
  const [playing, setPlaying] = useState(false);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (reduceMotion || paused || autoplayBlocked || failed) return;
    const video = videoRef.current;
    if (!video) return;
    let active = true;

    const attemptPlay = () => {
      if (document.hidden) return;
      video.play().catch((error: unknown) => {
        // React StrictMode 或后台切换可能让 pause() 中断尚未完成的 play()。
        const errorName = error instanceof DOMException ? error.name : "";
        if (!active || errorName === "AbortError") return;
        if (errorName === "NotAllowedError") {
          // 保留 video 和播放按钮，允许用户通过一次明确点击恢复。
          setPlaying(false);
          setAutoplayBlocked(true);
        } else {
          setFailed(true);
        }
      });
    };
    const handleVisibilityChange = () => {
      if (document.hidden) video.pause();
      else attemptPlay();
    };

    attemptPlay();
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      active = false;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      video.pause();
    };
  }, [autoplayBlocked, failed, paused, reduceMotion, src]);

  if (reduceMotion || failed || typeof document === "undefined") return null;

  const { size, position } = parseBackgroundAlignment(alignment);
  const needsPlayAction = paused || autoplayBlocked;
  const label = needsPlayAction ? "播放背景视频" : "暂停背景视频";
  return createPortal(
    <>
      {!paused && (
        <video
          ref={videoRef}
          className="background-video"
          data-playing={playing ? "true" : "false"}
          src={src}
          style={{
            objectFit: size === "auto" ? "none" : size,
            objectPosition: OBJECT_POSITIONS[position],
          }}
          muted
          loop
          playsInline
          preload="auto"
          aria-hidden="true"
          tabIndex={-1}
          disablePictureInPicture
          onPlaying={() => {
            setPlaying(true);
            setAutoplayBlocked(false);
          }}
          onPause={() => setPlaying(false)}
          onError={() => setFailed(true)}
        />
      )}
      <button
        type="button"
        className="control-button background-video-toggle"
        aria-label={label}
        title={label}
        onClick={() => {
          if (autoplayBlocked && !paused) {
            const video = videoRef.current;
            if (!video) return;
            // 必须在点击处理器内直接调用，部分浏览器不会把用户激活保留到 effect。
            video
              .play()
              .then(() => setAutoplayBlocked(false))
              .catch((error: unknown) => {
                const errorName = error instanceof DOMException ? error.name : "";
                if (errorName === "AbortError" || errorName === "NotAllowedError") return;
                setFailed(true);
              });
            return;
          }
          const next = !paused;
          setPaused(next);
          if (next) setPlaying(false);
          try {
            localStorage.setItem(PAUSED_STORAGE_KEY, next ? "1" : "0");
          } catch {
            // 偏好无法持久化时仍保留本次访问的暂停状态。
          }
        }}
      >
        {needsPlayAction ? <Play size={16} /> : <Pause size={16} />}
      </button>
    </>,
    document.body,
  );
}
