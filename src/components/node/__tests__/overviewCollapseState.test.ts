import { describe, expect, it } from "vitest";
import { readStoredCollapsed, writeStoredCollapsed } from "@/components/node/OverviewCollapseBar";

function createMemoryStorage(initial: Record<string, string> = {}): Storage {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
    clear: () => map.clear(),
    key: (index: number) => Array.from(map.keys())[index] ?? null,
    get length() {
      return map.size;
    },
  } as Storage;
}

describe("overview collapse persistence", () => {
  it("defaults to collapsed when storage has no record", () => {
    expect(readStoredCollapsed(createMemoryStorage())).toBe(true);
  });

  it("reads expanded state after user expanded once", () => {
    const storage = createMemoryStorage({ "lumina-pro:home-overview:collapsed": "expanded" });
    expect(readStoredCollapsed(storage)).toBe(false);
  });

  it("round-trips collapsed/expanded through storage", () => {
    const storage = createMemoryStorage();
    writeStoredCollapsed(false, storage);
    expect(readStoredCollapsed(storage)).toBe(false);
    writeStoredCollapsed(true, storage);
    expect(readStoredCollapsed(storage)).toBe(true);
  });

  it("falls back to collapsed when storage throws", () => {
    const broken = {
      getItem: () => {
        throw new Error("denied");
      },
    };
    expect(readStoredCollapsed(broken as unknown as Storage)).toBe(true);
    expect(() => writeStoredCollapsed(false, broken as unknown as Storage)).not.toThrow();
  });
});
