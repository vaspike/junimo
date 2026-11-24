import { describe, expect, it } from "vitest";
import {
  buildBackgroundCache,
  computeBackgroundScrim,
  DEFAULT_BACKGROUND_ALIGNMENT,
  DEFAULT_SURFACE_OPACITY,
  normalizeBackgroundAlignment,
  normalizeBackgroundUrl,
  normalizeSurfaceOpacity,
  parseBackgroundAlignment,
  resolveBackgroundUrl,
  resolveBackgroundVideo,
  SURFACE_SCRIM_THRESHOLD,
} from "@/utils/background";

describe("normalizeBackgroundUrl", () => {
  it("trims and keeps a single url", () => {
    expect(normalizeBackgroundUrl("  https://x/a.webp  ")).toBe("https://x/a.webp");
  });

  it("returns empty for non-strings", () => {
    expect(normalizeBackgroundUrl(undefined)).toBe("");
    expect(normalizeBackgroundUrl(42)).toBe("");
  });

  it("keeps a light|dark pair when they differ", () => {
    expect(normalizeBackgroundUrl("/light.webp | /dark.webp")).toBe("/light.webp|/dark.webp");
  });

  it("collapses identical light/dark to a single url", () => {
    expect(normalizeBackgroundUrl("/same.webp|/same.webp")).toBe("/same.webp");
  });

  it("preserves a dark-only pair", () => {
    expect(normalizeBackgroundUrl("|/dark.webp")).toBe("|/dark.webp");
  });

  it("ignores a third segment", () => {
    expect(normalizeBackgroundUrl("/a|/b|/c")).toBe("/a|/b");
  });

  it("strips characters that could break out of url()", () => {
    expect(normalizeBackgroundUrl('/a.webp")body{x')).toBe("/a.webpbody{x");
    expect(normalizeBackgroundUrl("/a b.webp")).toBe("/ab.webp");
    expect(normalizeBackgroundUrl("/a(b).webp")).toBe("/ab.webp");
  });
});

describe("resolveBackgroundUrl", () => {
  it("returns the single url for both appearances", () => {
    expect(resolveBackgroundUrl("/a.webp", "light")).toBe("/a.webp");
    expect(resolveBackgroundUrl("/a.webp", "dark")).toBe("/a.webp");
  });

  it("selects light vs dark from a pair", () => {
    expect(resolveBackgroundUrl("/light.webp|/dark.webp", "light")).toBe("/light.webp");
    expect(resolveBackgroundUrl("/light.webp|/dark.webp", "dark")).toBe("/dark.webp");
  });

  it("returns empty for a missing side of a pair", () => {
    expect(resolveBackgroundUrl("|/dark.webp", "light")).toBe("");
    expect(resolveBackgroundUrl("|/dark.webp", "dark")).toBe("/dark.webp");
  });

  it("returns empty for empty input", () => {
    expect(resolveBackgroundUrl("", "dark")).toBe("");
  });
});

describe("resolveBackgroundVideo", () => {
  const base = {
    enableBackgroundImage: true,
    backgroundImageInFarm: true,
    backgroundImage: "/light.webp|/dark.webp",
    backgroundVideo: "/light.mp4|/dark.mp4",
    backgroundImageMobile: "",
    backgroundVideoMobile: "",
  };

  it("selects the video for the current appearance and farm scene", () => {
    expect(resolveBackgroundVideo(base, "light")).toBe("/light.mp4");
    expect(resolveBackgroundVideo(base, "dark")).toBe("/dark.mp4");
    expect(resolveBackgroundVideo(base, "farm", "day")).toBe("/light.mp4");
    expect(resolveBackgroundVideo(base, "farm", "dusk")).toBe("/dark.mp4");
  });

  it("selects mobile videos and falls back to desktop videos like images", () => {
    const mobile = {
      ...base,
      backgroundImageMobile: "/light-mobile.webp|/dark-mobile.webp",
      backgroundVideoMobile: "/light-mobile.mp4|/dark-mobile.mp4",
    };
    expect(resolveBackgroundVideo(mobile, "light", null, true)).toBe("/light-mobile.mp4");
    expect(resolveBackgroundVideo(mobile, "dark", null, true)).toBe("/dark-mobile.mp4");
    expect(resolveBackgroundVideo(base, "light", null, true)).toBe("/light.mp4");
    expect(
      resolveBackgroundVideo(
        { ...mobile, backgroundVideoMobile: "|/dark-mobile.mp4" },
        "light",
        null,
        true,
      ),
    ).toBe("/light.mp4");
  });

  it("allows mobile-only media when its own image fallback is configured", () => {
    const mobileOnly = {
      ...base,
      backgroundImage: "",
      backgroundImageMobile: "/mobile.webp",
      backgroundVideoMobile: "/mobile.mp4",
    };
    expect(resolveBackgroundVideo(mobileOnly, "light", null, true)).toBe("/mobile.mp4");
    expect(resolveBackgroundVideo(mobileOnly, "light")).toBe("");
    expect(
      resolveBackgroundVideo(
        { ...mobileOnly, backgroundImageMobile: "" },
        "light",
        null,
        true,
      ),
    ).toBe("");
  });

  it("requires an image fallback for the current appearance", () => {
    const darkImageOnly = { ...base, backgroundImage: "|/dark.webp" };
    expect(resolveBackgroundVideo(darkImageOnly, "light")).toBe("");
    expect(resolveBackgroundVideo(darkImageOnly, "dark")).toBe("/dark.mp4");
    expect(resolveBackgroundVideo({ ...base, backgroundVideo: "" }, "light")).toBe("");
  });

  it("respects the custom-background and farm switches", () => {
    expect(
      resolveBackgroundVideo({ ...base, enableBackgroundImage: false }, "light"),
    ).toBe("");
    expect(
      resolveBackgroundVideo({ ...base, backgroundImageInFarm: false }, "farm", "day"),
    ).toBe("");
  });
});

describe("parseBackgroundAlignment / normalizeBackgroundAlignment", () => {
  it("defaults invalid input to cover,center", () => {
    expect(parseBackgroundAlignment("garbage")).toEqual({ size: "cover", position: "center" });
    expect(parseBackgroundAlignment(undefined)).toEqual({ size: "cover", position: "center" });
    expect(normalizeBackgroundAlignment("nonsense")).toBe(DEFAULT_BACKGROUND_ALIGNMENT);
  });

  it("accepts valid size/position pairs", () => {
    expect(parseBackgroundAlignment("contain,top")).toEqual({ size: "contain", position: "top" });
    expect(normalizeBackgroundAlignment(" AUTO , BOTTOM ")).toBe("auto,bottom");
  });

  it("falls back per-field", () => {
    expect(parseBackgroundAlignment("contain,wat")).toEqual({ size: "contain", position: "center" });
    expect(parseBackgroundAlignment("wat,top")).toEqual({ size: "cover", position: "top" });
  });
});

describe("normalizeSurfaceOpacity", () => {
  it("defaults non-numeric to 100", () => {
    expect(normalizeSurfaceOpacity(undefined)).toBe(DEFAULT_SURFACE_OPACITY);
    expect(normalizeSurfaceOpacity("abc")).toBe(100);
  });

  it("clamps to 0–100 and rounds", () => {
    expect(normalizeSurfaceOpacity(150)).toBe(100);
    expect(normalizeSurfaceOpacity(-20)).toBe(0);
    expect(normalizeSurfaceOpacity(72.6)).toBe(73);
    expect(normalizeSurfaceOpacity("60")).toBe(60);
  });
});

describe("computeBackgroundScrim", () => {
  it("is zero at/above the threshold (zero cost default)", () => {
    expect(computeBackgroundScrim(100)).toBe(0);
    expect(computeBackgroundScrim(SURFACE_SCRIM_THRESHOLD)).toBe(0);
  });

  it("ramps the scrim gently as opacity drops (no blur involved)", () => {
    // 半透明观感只由"纯半透明表面 + 可读性遮罩"构成,刻意没有 backdrop-filter 磨砂
    // (GPU 渲染差异会让双端观感不一致,防回归)。
    const mid = computeBackgroundScrim(50);
    expect(mid).toBeGreaterThan(0);

    const low = computeBackgroundScrim(0);
    expect(low).toBeGreaterThanOrEqual(mid);
    expect(low).toBeLessThanOrEqual(16);
  });
});

describe("buildBackgroundCache", () => {
  const base = {
    enableBackgroundImage: true,
    backgroundImage: "",
    backgroundImageMobile: "",
    backgroundAlignment: DEFAULT_BACKGROUND_ALIGNMENT,
    surfaceOpacity: DEFAULT_SURFACE_OPACITY,
  };

  it("returns null when no image is configured", () => {
    expect(buildBackgroundCache(base)).toBeNull();
  });

  it("returns null when the toggle is off, even with urls configured", () => {
    // 开关关闭 = 与未配置等价:不写变量、不发图片请求;URL 仍保留在设置里。
    expect(
      buildBackgroundCache({
        ...base,
        enableBackgroundImage: false,
        backgroundImage: "/a.webp",
        surfaceOpacity: 50,
      }),
    ).toBeNull();
  });

  it("resolves both appearances and wraps urls in url()", () => {
    const cache = buildBackgroundCache({
      ...base,
      backgroundImage: "/light.webp|/dark.webp",
    });
    expect(cache).not.toBeNull();
    expect(cache?.lightDesktop).toBe('url("/light.webp")');
    expect(cache?.darkDesktop).toBe('url("/dark.webp")');
    // 没设置移动端图时回退到桌面端
    expect(cache?.darkMobile).toBe('url("/dark.webp")');
  });

  it("marks farm applicability, defaulting to true", () => {
    // 默认（含旧调用方不传该字段）= 自定义背景图在 farm 主题下同样生效
    expect(buildBackgroundCache({ ...base, backgroundImage: "/a.webp" })?.farm).toBe(true);
    expect(
      buildBackgroundCache({
        ...base,
        backgroundImage: "/a.webp",
        backgroundImageInFarm: false,
      })?.farm,
    ).toBe(false);
  });

  it("omits the scrim at full opacity but includes it when transparent", () => {
    const solid = buildBackgroundCache({ ...base, backgroundImage: "/a.webp" });
    expect(solid?.scrim).toBe("");
    expect(solid?.alpha).toBe("100");

    const translucent = buildBackgroundCache({
      ...base,
      backgroundImage: "/a.webp",
      surfaceOpacity: 50,
    });
    expect(translucent?.alpha).toBe("50");
    expect(translucent?.scrim).toContain("color-mix");
  });
});
