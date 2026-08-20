import { useCallback, useEffect, useSyncExternalStore } from "react";
import { useThemeSettings } from "@/hooks/useThemeSettings";
import { subscribeMediaQuery } from "@/utils/mediaQuery";
import { isAppearance, type Appearance, type FarmScene } from "@/utils/themeSettings";
import type { ResolvedAppearance } from "@/utils/background";

// farm 场景的昼/夕按本地真实时间划分：6:00–18:00 为昼，其余为夕（含夜晚）。
const FARM_DAY_START_HOUR = 6;
const FARM_DAY_END_HOUR = 18;

export function farmSceneOf(date: Date = new Date()): FarmScene {
  const hour = date.getHours();
  return hour >= FARM_DAY_START_HOUR && hour < FARM_DAY_END_HOUR ? "day" : "dusk";
}

// 真实月份 → 农场四季：3–5 春 / 6–8 夏 / 9–11 秋 / 12–2 冬。只影响场景配色
//（天色 / 草地 / 栅栏 / 野花），卡片与其他外观不变。
export type FarmSeason = "spring" | "summer" | "autumn" | "winter";

export function farmSeasonOf(date: Date = new Date()): FarmSeason {
  const month = date.getMonth();
  if (month >= 2 && month <= 4) return "spring";
  if (month >= 5 && month <= 7) return "summer";
  if (month >= 8 && month <= 10) return "autumn";
  return "winter";
}

/** 距下一个昼/夕边界（6:00 或 18:00）的毫秒数，+1s 余量避免卡在边界前。 */
function msUntilNextFarmBoundary(now: Date = new Date()): number {
  const hour = now.getHours();
  const nextHour =
    hour < FARM_DAY_START_HOUR
      ? FARM_DAY_START_HOUR
      : hour < FARM_DAY_END_HOUR
        ? FARM_DAY_END_HOUR
        : 24 + FARM_DAY_START_HOUR;
  const next = new Date(now);
  next.setHours(nextHour, 0, 1, 0); // setHours(30) 会自动进位到次日 6 点
  return next.getTime() - now.getTime();
}

const APPEARANCE_STORAGE_KEY = "appearance";
const APPEARANCE_DEFAULT_STORAGE_KEY = "appearance_default";
const SYSTEM_DARK_QUERY = "(prefers-color-scheme: dark)";

interface PrefsState {
  appearance: Appearance;
  resolvedAppearance: ResolvedAppearance;
  /** 仅 farm 外观下有值；背景层据此在昼/夕场景间切换背景图。 */
  farmScene: FarmScene | null;
}

const DEFAULTS: PrefsState = {
  appearance: "system",
  resolvedAppearance: "dark",
  farmScene: null,
};

let themeFlipTimer: number | null = null;
let hasExplicitAppearancePreference = false;
let systemAppearanceMediaQuery: MediaQueryList | null = null;

function getSystemAppearanceMediaQuery() {
  if (typeof window === "undefined" || !window.matchMedia) return null;
  systemAppearanceMediaQuery ??= window.matchMedia(SYSTEM_DARK_QUERY);
  return systemAppearanceMediaQuery;
}

function resolveAppearance(a: Appearance): ResolvedAppearance {
  if (a === "system") {
    return getSystemAppearanceMediaQuery()?.matches ? "dark" : "light";
  }
  return a;
}

function parseStoredAppearance(raw: string | null): Appearance | null {
  if (raw == null) {
    return null;
  }

  if (isAppearance(raw)) {
    return raw;
  }

  try {
    const parsed = JSON.parse(raw);
    return isAppearance(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function readStorageItem(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorageItem(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {}
}

function readStoredAppearance() {
  const parsed = parseStoredAppearance(readStorageItem(APPEARANCE_STORAGE_KEY));
  const fallback =
    parseStoredAppearance(readStorageItem(APPEARANCE_DEFAULT_STORAGE_KEY)) ??
    DEFAULTS.appearance;
  return {
    appearance: parsed ?? fallback,
    hasExplicitPreference: parsed != null,
  };
}

function persistAppearance(value: Appearance) {
  // 存成 JSON 字符串，以兼容会解析这个 key 的旧主题包。
  writeStorageItem(APPEARANCE_STORAGE_KEY, JSON.stringify(value));
}

function persistDefaultAppearance(value: Appearance) {
  writeStorageItem(APPEARANCE_DEFAULT_STORAGE_KEY, JSON.stringify(value));
}

const listeners = new Set<() => void>();
let snapshot: PrefsState = { ...DEFAULTS };

function emit() {
  for (const l of listeners) l();
}

function markThemeFlip() {
  const root = document.documentElement;
  root.classList.add("theme-flip");
  if (themeFlipTimer != null) {
    window.clearTimeout(themeFlipTimer);
  }
  themeFlipTimer = window.setTimeout(() => {
    root.classList.remove("theme-flip");
    themeFlipTimer = null;
  }, 140);
}

function applyResolvedAppearance(
  resolvedAppearance: ResolvedAppearance,
  farmScene: FarmScene | null,
) {
  const root = document.documentElement;
  root.dataset.appearance = resolvedAppearance;
  if (farmScene) {
    root.dataset.farmScene = farmScene;
    root.dataset.farmSeason = farmSeasonOf();
  } else {
    delete root.dataset.farmScene;
    delete root.dataset.farmSeason;
  }
  root.style.colorScheme = resolvedAppearance === "dark" ? "dark" : "light";
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (meta) {
    meta.content =
      resolvedAppearance === "dark"
        ? "#000000"
        : resolvedAppearance === "farm"
          ? farmScene === "dusk"
            ? "#2c2450"
            : "#63b4e6"
          : "#F5F5F7";
  }
}

let farmSceneTimer: number | null = null;

/** farm 外观下挂一个到下一个昼/夕边界的定时器，到点重放 commit 以翻转场景。 */
function scheduleFarmSceneTimer() {
  if (farmSceneTimer != null) {
    window.clearTimeout(farmSceneTimer);
    farmSceneTimer = null;
  }
  if (typeof window === "undefined" || snapshot.appearance !== "farm") return;
  farmSceneTimer = window.setTimeout(() => {
    farmSceneTimer = null;
    commit({ appearance: "farm" });
  }, msUntilNextFarmBoundary());
}

function commit(next: Partial<PrefsState>) {
  const merged: PrefsState = { ...snapshot, ...next };
  if (next.appearance) {
    merged.resolvedAppearance = resolveAppearance(merged.appearance);
  }
  merged.farmScene = merged.resolvedAppearance === "farm" ? farmSceneOf() : null;
  const unchanged =
    snapshot.appearance === merged.appearance &&
    snapshot.resolvedAppearance === merged.resolvedAppearance &&
    snapshot.farmScene === merged.farmScene;
  // farm 的昼/夕翻转不改变 appearance/resolvedAppearance，但不能走 unchanged 早退，
  // 否则边界定时器到点后 data-farm-scene 不会更新。
  if (unchanged && merged.appearance !== "farm") {
    return;
  }
  if (!unchanged && snapshot.resolvedAppearance !== merged.resolvedAppearance) {
    markThemeFlip();
  }
  snapshot = merged;
  applyResolvedAppearance(merged.resolvedAppearance, merged.farmScene);
  scheduleFarmSceneTimer();
  emit();
}

function refreshSystemAppearance() {
  if (snapshot.appearance === "system") {
    commit({ appearance: "system" });
  } else if (snapshot.appearance === "farm") {
    // 切回前台时重算昼/夕（跨边界小睡后再回来场景可能已过期）。
    commit({ appearance: "farm" });
  }
}

function handleVisibilityChange() {
  if (!document.hidden) refreshSystemAppearance();
}

let systemListenersAttached = false;
let mediaUnsubscribe: (() => void) | null = null;

function ensureSystemListeners() {
  if (systemListenersAttached || typeof window === "undefined") return;
  systemListenersAttached = true;
  const mediaQuery = getSystemAppearanceMediaQuery();
  if (mediaQuery) {
    mediaUnsubscribe = subscribeMediaQuery(mediaQuery, refreshSystemAppearance);
  }
  window.addEventListener("focus", refreshSystemAppearance);
  document.addEventListener("visibilitychange", handleVisibilityChange);
}

function clearSystemListeners() {
  if (!systemListenersAttached || typeof window === "undefined") return;
  systemListenersAttached = false;
  mediaUnsubscribe?.();
  mediaUnsubscribe = null;
  window.removeEventListener("focus", refreshSystemAppearance);
  document.removeEventListener("visibilitychange", handleVisibilityChange);
}

function initializeAppearance() {
  const stored = readStoredAppearance();
  hasExplicitAppearancePreference = stored.hasExplicitPreference;
  if (stored.hasExplicitPreference) {
    persistAppearance(stored.appearance);
  }
  snapshot = {
    appearance: stored.appearance,
    resolvedAppearance: resolveAppearance(stored.appearance),
    farmScene: null,
  };
  snapshot.farmScene = snapshot.resolvedAppearance === "farm" ? farmSceneOf() : null;
  applyResolvedAppearance(snapshot.resolvedAppearance, snapshot.farmScene);
  scheduleFarmSceneTimer();
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  initializeAppearance();
}

function subscribe(l: () => void) {
  const wasEmpty = listeners.size === 0;
  listeners.add(l);
  if (wasEmpty) ensureSystemListeners();
  return () => {
    listeners.delete(l);
    if (listeners.size === 0) clearSystemListeners();
  };
}

function getSnapshot() {
  return snapshot;
}

export function usePreferences() {
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const themeSettings = useThemeSettings();

  useEffect(() => {
    if (!themeSettings.isReady) return;
    if (hasExplicitAppearancePreference) return;
    const defaultAppearance = themeSettings.defaultAppearance;
    persistDefaultAppearance(defaultAppearance);
    commit({ appearance: defaultAppearance });
  }, [themeSettings.defaultAppearance, themeSettings.isReady]);

  const setAppearance = useCallback((a: Appearance) => {
    hasExplicitAppearancePreference = true;
    persistAppearance(a);
    commit({ appearance: a });
  }, []);

  return {
    appearance: state.appearance,
    resolvedAppearance: state.resolvedAppearance,
    farmScene: state.farmScene,
    setAppearance,
  };
}
