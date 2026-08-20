import type { Appearance } from "@/utils/themeSettings";

export type ResolvedAppearance = Exclude<Appearance, "system">;

export const DEFAULT_BACKGROUND_ALIGNMENT = "cover,center";
export const DEFAULT_SURFACE_OPACITY = 100;

// 低于此不透明度时才叠加背景可读性遮罩。
export const SURFACE_SCRIM_THRESHOLD = 95;

const BACKGROUND_SIZE_VALUES = ["cover", "contain", "auto"] as const;
const BACKGROUND_POSITION_VALUES = ["top", "center", "bottom"] as const;

export type BackgroundSize = (typeof BACKGROUND_SIZE_VALUES)[number];
export type BackgroundPosition = (typeof BACKGROUND_POSITION_VALUES)[number];

const MAX_URL_LENGTH = 2048;

// 移除可能逃出 CSS url("…") 上下文的字符；空格需由 URL 自身编码。
const UNSAFE_URL_CHARS = new RegExp("[\\x00-\\x1f\\x7f\"'`()<>\\\\\\s]", "g");

function sanitizeUrlPart(part: string): string {
  return part.replace(UNSAFE_URL_CHARS, "").slice(0, MAX_URL_LENGTH);
}

/** 规范化 `lightUrl|darkUrl`，清理两段 URL 并折叠相同值。 */
export function normalizeBackgroundUrl(value: unknown): string {
  if (typeof value !== "string") return "";
  const parts = value.split("|").map((part) => sanitizeUrlPart(part.trim()));
  const light = parts[0] ?? "";
  const dark = parts[1] ?? "";
  if (dark && dark !== light) return `${light}|${dark}`;
  return light;
}

/** 从规范化的单 URL 或 `light|dark` 对中选择当前外观。 */
export function resolveBackgroundUrl(
  raw: string,
  appearance: ResolvedAppearance,
): string {
  if (!raw) return "";
  const parts = raw.split("|").map((part) => part.trim());
  if (parts.length >= 2) {
    return (appearance === "dark" ? parts[1] : parts[0]) ?? "";
  }
  return parts[0] ?? "";
}

export function parseBackgroundAlignment(value: unknown): {
  size: BackgroundSize;
  position: BackgroundPosition;
} {
  const fallback = { size: "cover" as BackgroundSize, position: "center" as BackgroundPosition };
  if (typeof value !== "string") return fallback;
  const [rawSize, rawPosition] = value.split(",").map((part) => part.trim().toLowerCase());
  const size = (BACKGROUND_SIZE_VALUES as readonly string[]).includes(rawSize)
    ? (rawSize as BackgroundSize)
    : fallback.size;
  const position = (BACKGROUND_POSITION_VALUES as readonly string[]).includes(rawPosition)
    ? (rawPosition as BackgroundPosition)
    : fallback.position;
  return { size, position };
}

export function normalizeBackgroundAlignment(value: unknown): string {
  const { size, position } = parseBackgroundAlignment(value);
  return `${size},${position}`;
}

export function normalizeSurfaceOpacity(value: unknown): number {
  const num =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseFloat(value)
        : Number.NaN;
  if (!Number.isFinite(num)) return DEFAULT_SURFACE_OPACITY;
  return Math.min(100, Math.max(0, Math.round(num)));
}

/** 由卡片不透明度推导 0–16% 的背景遮罩；高于阈值时不绘制。 */
export function computeBackgroundScrim(opacity: unknown): number {
  const resolved = normalizeSurfaceOpacity(opacity);
  if (resolved >= SURFACE_SCRIM_THRESHOLD) return 0;
  const t = (SURFACE_SCRIM_THRESHOLD - resolved) / SURFACE_SCRIM_THRESHOLD; // 取值 0–1
  return Math.round(t * 16);
}

// Legacy key retained so existing users keep their saved background after the rename.
const BACKGROUND_CACHE_KEY = "komaritheme:bg";

interface BackgroundSettingsInput {
  enableBackgroundImage: boolean;
  /** 缺省视为 true：自定义背景图在 farm 主题下也生效。 */
  backgroundImageInFarm?: boolean;
  backgroundImage: string;
  backgroundImageMobile: string;
  backgroundAlignment: string;
  surfaceOpacity: number;
}

/** 可直接写入 CSS 的首帧背景缓存。 */
interface BackgroundCache {
  v: 1;
  size: string;
  position: string;
  alpha: string;
  scrim: string;
  /** false = farm（像素农场）主题下不应用此背景图，让位给程序化场景。旧缓存无此字段，按 true 处理。 */
  farm: boolean;
  lightDesktop: string;
  lightMobile: string;
  darkDesktop: string;
  darkMobile: string;
}

function toCssUrl(url: string): string {
  return url ? `url("${url}")` : "none";
}

export function buildBackgroundCache(settings: BackgroundSettingsInput): BackgroundCache | null {
  // 关闭时只停用背景，保留设置中的 URL 供下次启用。
  if (!settings.enableBackgroundImage) return null;
  const lightDesktop = resolveBackgroundUrl(settings.backgroundImage, "light");
  const darkDesktop = resolveBackgroundUrl(settings.backgroundImage, "dark");
  const lightMobile = resolveBackgroundUrl(settings.backgroundImageMobile, "light") || lightDesktop;
  const darkMobile = resolveBackgroundUrl(settings.backgroundImageMobile, "dark") || darkDesktop;
  if (!lightDesktop && !darkDesktop && !lightMobile && !darkMobile) return null;

  const { size, position } = parseBackgroundAlignment(settings.backgroundAlignment);
  const scrimPct = computeBackgroundScrim(settings.surfaceOpacity);
  return {
    v: 1,
    size,
    position,
    alpha: String(normalizeSurfaceOpacity(settings.surfaceOpacity)),
    farm: settings.backgroundImageInFarm !== false,
    scrim:
      scrimPct > 0
        ? `color-mix(in srgb, var(--bg-0) ${scrimPct}%, transparent)`
        : "",
    lightDesktop: toCssUrl(lightDesktop),
    lightMobile: toCssUrl(lightMobile),
    darkDesktop: toCssUrl(darkDesktop),
    darkMobile: toCssUrl(darkMobile),
  };
}

const BACKGROUND_VAR_NAMES = [
  "--bg-image-desktop",
  "--bg-image-mobile",
  "--bg-size",
  "--bg-position",
  "--surface-alpha",
  "--bg-scrim",
] as const;

/** 将缓存写入 `<html>`，与 index.html 的首帧逻辑保持一致。 */
export function applyBackgroundCache(
  cache: BackgroundCache | null,
  appearance: ResolvedAppearance,
  farmScene?: "day" | "dusk" | null,
): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  // farm 主题且站长关闭了「背景图在农场主题中生效」时，等同无缓存：
  // 移除变量，让 farm.css 的程序化场景接管 body::before。
  if (!cache || (appearance === "farm" && cache.farm === false)) {
    for (const name of BACKGROUND_VAR_NAMES) root.style.removeProperty(name);
    delete root.dataset.bgImage;
    return;
  }
  // farm 的「浅色|深色」双图映射到昼/夕场景：昼用浅色图，夕用深色图。
  const dark =
    appearance === "dark" || (appearance === "farm" && farmScene === "dusk");
  const desktop = dark ? cache.darkDesktop : cache.lightDesktop;
  const mobile = (dark ? cache.darkMobile : cache.lightMobile) || desktop;
  root.style.setProperty("--bg-image-desktop", desktop);
  root.style.setProperty("--bg-image-mobile", mobile);
  root.style.setProperty("--bg-size", cache.size);
  root.style.setProperty("--bg-position", cache.position);
  root.style.setProperty("--surface-alpha", cache.alpha);
  if (cache.scrim) root.style.setProperty("--bg-scrim", cache.scrim);
  else root.style.removeProperty("--bg-scrim");
  // farm 主题用这个属性关掉程序化场景（自定义背景图优先），见 farm.css。
  root.dataset.bgImage = "1";
}

export function persistBackgroundCache(cache: BackgroundCache | null): void {
  if (typeof localStorage === "undefined") return;
  try {
    if (cache) localStorage.setItem(BACKGROUND_CACHE_KEY, JSON.stringify(cache));
    else localStorage.removeItem(BACKGROUND_CACHE_KEY);
  } catch {
    // 大不了下次首屏背景没缓存而已,非致命。
  }
}
