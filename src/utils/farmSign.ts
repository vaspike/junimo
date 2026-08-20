import type { NodeInfo } from "@/types/komari";
import { buildNodeIdentitySet, nodeMatchesIdentitySet } from "@/utils/nodeIdentity";

// 农场主题的内置招牌漆色。色值与 src/styles/farm.css 的 data-accent 规则保持一致
//（CSS 无法引用 TS，两处手工同步）。main 必须足够深以托住米白招牌文字。
export const FARM_SIGN_COLORS = [
  { id: "green", label: "草绿", main: "#6f9f43", dark: "#4d7030" },
  { id: "blue", label: "湖蓝", main: "#5b8fc2", dark: "#3e6491" },
  { id: "red", label: "谷仓红", main: "#b8553f", dark: "#86392b" },
  { id: "orange", label: "枫橙", main: "#cf7f36", dark: "#98591f" },
  { id: "honey", label: "蜜黄", main: "#c99a35", dark: "#93702a" },
  { id: "pink", label: "莓粉", main: "#c97a97", dark: "#96556e" },
  { id: "violet", label: "李紫", main: "#8668b4", dark: "#5e4783" },
] as const;

export type FarmSignColorId = (typeof FARM_SIGN_COLORS)[number]["id"];
export type FarmSignColor = (typeof FARM_SIGN_COLORS)[number];

const FARM_SIGN_COLOR_IDS = new Set<string>(FARM_SIGN_COLORS.map((c) => c.id));

// 主题设置里的存储形态：颜色 id → 节点身份列表（名称 / UUID，每行一个，与隐藏节点同款规则）。
export type FarmSignColorMap = Partial<Record<FarmSignColorId, string[]>>;

/** 归一化服务端下发的原始配置：只保留已知颜色 id，身份列表去空去重。 */
export function normalizeFarmSignColors(raw: unknown): FarmSignColorMap {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const result: FarmSignColorMap = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!FARM_SIGN_COLOR_IDS.has(key)) continue;
    const list = Array.isArray(value)
      ? Array.from(
          new Set(
            value
              .map((item) =>
                typeof item === "string" || typeof item === "number"
                  ? String(item).trim()
                  : "",
              )
              .filter(Boolean),
          ),
        )
      : [];
    if (list.length > 0) result[key as FarmSignColorId] = list;
  }
  return result;
}

/**
 * 解析单个节点的招牌颜色。一个节点被配进多个颜色时，按 FARM_SIGN_COLORS
 * 声明顺序取先命中的那个。未配置返回 null——默认木棕色由 CSS 兜底。
 */
export function resolveFarmSignColorId(
  node: NodeInfo,
  farmSignColors: FarmSignColorMap,
): FarmSignColorId | null {
  for (const { id } of FARM_SIGN_COLORS) {
    const list = farmSignColors[id];
    if (list?.length && nodeMatchesIdentitySet(node, buildNodeIdentitySet(list))) {
      return id;
    }
  }
  return null;
}
