import { describe, expect, it } from "vitest";
import {
  buildNodeIdentitySet,
  nodeMatchesIdentitySet,
} from "@/utils/nodeIdentity";
import {
  FARM_SIGN_COLORS,
  normalizeFarmSignColors,
  resolveFarmSignColorId,
} from "@/utils/farmSign";
import type { NodeInfo } from "@/types/komari";

const node = { uuid: "u-1", name: "Tokyo Edge" } as NodeInfo;

describe("normalizeFarmSignColors", () => {
  it("keeps known color ids with non-empty identity lists", () => {
    // 大小写变体都保留（与 normalizeNodeIdentityList 一致）；匹配时才是大小写不敏感
    expect(
      normalizeFarmSignColors({
        green: ["Tokyo Edge", "tokyo edge", "  "],
        blue: ["SG"],
      }),
    ).toEqual({ green: ["Tokyo Edge", "tokyo edge"], blue: ["SG"] });
  });

  it("drops unknown color ids, empty lists and non-object input", () => {
    expect(
      normalizeFarmSignColors({
        green: [],
        purple: ["x"],
        red: "not-an-array",
      }),
    ).toEqual({});
    expect(normalizeFarmSignColors(null)).toEqual({});
    expect(normalizeFarmSignColors(["green"])).toEqual({});
    expect(normalizeFarmSignColors("green")).toEqual({});
  });
});

describe("resolveFarmSignColorId", () => {
  it("matches node by name case-insensitively", () => {
    expect(resolveFarmSignColorId(node, { green: ["tokyo edge"] })).toBe("green");
    expect(resolveFarmSignColorId(node, { blue: ["u-1"] })).toBe("blue");
  });

  it("returns null when unconfigured (default wood is a CSS fallback)", () => {
    expect(resolveFarmSignColorId(node, {})).toBeNull();
    expect(resolveFarmSignColorId(node, { green: ["other"] })).toBeNull();
  });

  it("first declared color wins when a node is assigned to multiple", () => {
    const first = FARM_SIGN_COLORS[0].id;
    const second = FARM_SIGN_COLORS[1].id;
    expect(resolveFarmSignColorId(node, { [first]: ["Tokyo Edge"], [second]: ["u-1"] })).toBe(
      first,
    );
  });
});

// 保证卡片组件用的身份匹配规则与隐藏节点一致（防回归：字段集不要悄悄分叉）。
describe("farm sign color identity matching", () => {
  it("shares the same identity fields as hidden nodes", () => {
    const set = buildNodeIdentitySet(["alias-x"]);
    const aliased = { uuid: "u-9", name: "n", alias: "Alias-X" } as unknown as NodeInfo;
    expect(nodeMatchesIdentitySet(aliased, set)).toBe(true);
  });
});
