import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  formatBytes,
  formatByteRate,
  formatByteRateLabel,
  formatClockTime,
  formatExpireDays,
  formatOfflineDuration,
  formatTrafficRateLabel,
  formatUptimeDays,
  getExpireDaysRemaining,
  firstExplicitTagColor,
  parseTags,
  resolveExpireTimestamp,
  trimFixed,
} from "@/utils/format";

const KB = 1024;
const MB = 1024 * 1024;
const GB = 1024 * 1024 * 1024;

describe("formatBytes", () => {
  it("returns '0 B' for empty / non-positive / non-finite input", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(null)).toBe("0 B");
    expect(formatBytes(undefined)).toBe("0 B");
    expect(formatBytes(-5)).toBe("0 B");
    expect(formatBytes(Number.NaN)).toBe("0 B");
    // 防回归:Infinity 不能输出成 "Infinity PB"
    expect(formatBytes(Number.POSITIVE_INFINITY)).toBe("0 B");
  });

  it("rounds raw bytes with no decimals", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1023)).toBe("1023 B");
  });

  it("scales up and adapts precision by magnitude", () => {
    expect(formatBytes(KB)).toBe("1.00 KB");
    expect(formatBytes(1.5 * KB)).toBe("1.50 KB");
    expect(formatBytes(MB)).toBe("1.00 MB");
    expect(formatBytes(100 * MB)).toBe("100 MB");
    expect(formatBytes(2.5 * GB)).toBe("2.50 GB");
  });
});

describe("formatClockTime", () => {
  it("formats local hour and minute only", () => {
    expect(formatClockTime(new Date(2026, 7, 6, 14, 32).getTime())).toBe("14:32");
    expect(formatClockTime(new Date(2026, 7, 6, 9, 5).getTime())).toBe("09:05");
  });

  it("returns an em dash for missing or non-finite timestamps", () => {
    expect(formatClockTime(null)).toBe("—");
    expect(formatClockTime(undefined)).toBe("—");
    expect(formatClockTime(Number.NaN)).toBe("—");
    expect(formatClockTime(0)).not.toBe("—");
  });
});

describe("formatTrafficRate", () => {
  it("returns a zeroed bps label for non-positive / non-finite input", () => {
    expect(formatTrafficRateLabel(0)).toBe("0 bps");
    expect(formatTrafficRateLabel(null)).toBe("0 bps");
    expect(formatTrafficRateLabel(Number.POSITIVE_INFINITY)).toBe("0 bps");
  });

  it("converts bytes/sec to bit-rate units", () => {
    // 1 MB/s = 8 Mbps
    expect(formatTrafficRateLabel(1_000_000)).toBe("8 Mbps");
    // 125 MB/s = 1 Gbps
    expect(formatTrafficRateLabel(125_000_000)).toBe("1 Gbps");
  });
});

describe("formatByteRate / formatByteRateLabel", () => {
  it("returns a zeroed B/s display for non-positive / non-finite input", () => {
    expect(formatByteRate(0)).toEqual({ value: "0", unit: "B/s" });
    expect(formatByteRate(null)).toEqual({ value: "0", unit: "B/s" });
    expect(formatByteRate(Number.POSITIVE_INFINITY)).toEqual({ value: "0", unit: "B/s" });
  });

  it("uses the byte (1024) ladder suffixed with /s", () => {
    expect(formatByteRate(512)).toEqual({ value: "512", unit: "B/s" });
    expect(formatByteRateLabel(KB)).toBe("1.00 KB/s");
    expect(formatByteRateLabel(MB)).toBe("1.00 MB/s");
    expect(formatByteRateLabel(2.5 * GB)).toBe("2.50 GB/s");
  });
});

describe("finite formatting", () => {
  it("does not expose non-finite values", () => {
    expect(trimFixed(Number.POSITIVE_INFINITY, 1)).toBe("0");
    expect(formatUptimeDays(Number.POSITIVE_INFINITY)).toEqual({ value: "—", unit: "" });
    expect(getExpireDaysRemaining("2026-06-14T12:00:00.000Z", Infinity)).toBeNull();
  });
});

describe("getExpireDaysRemaining / formatExpireDays", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-13T12:00:00.000Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function inDays(days: number, extraHours = 0) {
    const ts = Date.now() + days * 86_400_000 + extraHours * 3_600_000;
    return new Date(ts).toISOString();
  }

  it("returns null for missing / unparseable input", () => {
    expect(getExpireDaysRemaining(null)).toBeNull();
    expect(getExpireDaysRemaining("not-a-date")).toBeNull();
    expect(formatExpireDays(null)).toEqual({ value: "—", unit: "", tone: "none" });
  });

  it("treats Komari 'no expiry' sentinels as no-expiry, not as 已过期", () => {
    // 防回归:Go 零值时间和数字 0 / -1 这些哨兵值以前会被解析成 1 年 / 2000 / 2001 年,
    // 把永不过期的节点显示成"已过期"
    for (const sentinel of ["0001-01-01T00:00:00Z", "0", "-1", ""]) {
      expect(getExpireDaysRemaining(sentinel)).toBeNull();
      expect(formatExpireDays(sentinel)).toEqual({ value: "—", unit: "", tone: "none" });
    }
  });

  it("reads a bare positive number as a unix timestamp (seconds or ms)", () => {
    const secs = Math.floor((Date.now() + 10 * 86_400_000) / 1000);
    expect(getExpireDaysRemaining(String(secs))).toBe(10);
    const ms = Date.now() + 5 * 86_400_000;
    expect(getExpireDaysRemaining(String(ms))).toBe(5);
    // 哨兵值解析为"无时间戳"
    expect(resolveExpireTimestamp("0001-01-01T00:00:00Z")).toBeNull();
    expect(resolveExpireTimestamp(0)).toBeNull();
    expect(resolveExpireTimestamp(-1)).toBeNull();
  });

  it("maps day buckets to tones", () => {
    expect(formatExpireDays(inDays(60))).toEqual({ value: "60", unit: "天", tone: "ok" });
    expect(formatExpireDays(inDays(15))).toEqual({ value: "15", unit: "天", tone: "warn" });
    expect(formatExpireDays(inDays(3))).toEqual({ value: "3", unit: "天", tone: "critical" });
  });

  it("treats >100y as a long-term purchase", () => {
    expect(formatExpireDays(inDays(40_000))).toEqual({ value: "长期", unit: "", tone: "long" });
  });

  it("handles the today / expired boundary", () => {
    // 未来约 1 小时会向下取整成剩余 0 天
    expect(formatExpireDays(inDays(0, 1))).toEqual({ value: "今日", unit: "", tone: "critical" });
    // 已是过去时间
    expect(formatExpireDays(inDays(-2))).toEqual({ value: "已过期", unit: "", tone: "critical" });
  });
});

describe("firstExplicitTagColor", () => {
  it("returns the first tag's explicit color, lowercased", () => {
    expect(firstExplicitTagColor("香港<Blue>; 优质")).toBe("blue");
    expect(firstExplicitTagColor("  BGP<Gold> ")).toBe("gold");
  });

  it("returns '' when the first tag has no explicit color", () => {
    // 推断色（如 violet）不应参与 farm 招牌分色
    expect(firstExplicitTagColor("高带宽")).toBe("");
    expect(firstExplicitTagColor(null)).toBe("");
    expect(firstExplicitTagColor("")).toBe("");
    expect(firstExplicitTagColor(";;")).toBe("");
  });
});

describe("parseTags", () => {
  it("returns [] for empty input", () => {
    expect(parseTags(null)).toEqual([]);
    expect(parseTags("")).toEqual([]);
  });

  it("parses explicit <color> suffixes and lowercases them", () => {
    expect(parseTags("VIP<RED>;Pro<Blue>")).toEqual([
      { label: "VIP", color: "red" },
      { label: "Pro", color: "blue" },
    ]);
  });

  it("infers colors for plain tags by known keywords", () => {
    expect(parseTags("CN2GIA")).toEqual([{ label: "CN2GIA", color: "blue" }]);
    expect(parseTags("4837")).toEqual([{ label: "4837", color: "green" }]);
    expect(parseTags("Random")).toEqual([{ label: "Random", color: "violet" }]);
  });
});

describe("formatOfflineDuration", () => {
  const NOW = Date.parse("2026-06-13T12:00:00.000Z");

  it("reports unknown when no heartbeat timestamp", () => {
    expect(formatOfflineDuration(null, NOW)).toEqual({ value: "未知", unit: "", full: "离线时长未知" });
    expect(formatOfflineDuration(0, NOW)).toEqual({ value: "未知", unit: "", full: "离线时长未知" });
  });

  it("says just-offline for under a minute", () => {
    expect(formatOfflineDuration(NOW - 30_000, NOW)).toEqual({
      value: "刚刚",
      unit: "",
      full: "刚刚离线",
    });
  });

  it("formats minutes, hours and days", () => {
    expect(formatOfflineDuration(NOW - 5 * 60_000, NOW)).toEqual({
      value: "5",
      unit: "分钟",
      full: "离线 5 分钟",
    });
    expect(formatOfflineDuration(NOW - 3 * 3_600_000, NOW)).toEqual({
      value: "3",
      unit: "小时",
      full: "离线 3 小时",
    });
    expect(formatOfflineDuration(NOW - 2 * 86_400_000, NOW)).toEqual({
      value: "2",
      unit: "天",
      full: "离线 2 天",
    });
  });

  it("clamps negative drift to just-offline", () => {
    expect(formatOfflineDuration(NOW + 60_000, NOW).full).toBe("刚刚离线");
  });
});
