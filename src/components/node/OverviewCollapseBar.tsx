import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { formatBytes, formatByteRate } from "@/utils/format";
import { speedRateColor } from "@/utils/metricTone";

export interface OverviewCollapseData {
  totalNodes: number;
  onlineNodes: number;
  trafficUp: number;
  trafficDown: number;
  netUp: number;
  netDown: number;
}

// 折叠/展开状态持久化:用户展开过一次后,下次访问保持展开,符合直觉。
const COLLAPSE_STORAGE_KEY = "lumina-pro:home-overview:collapsed";

/** 从存储读取折叠态:localStorage 无记录或不可用时默认折叠。 */
export function readStoredCollapsed(storage: Pick<Storage, "getItem"> = localStorage): boolean {
  try {
    return storage.getItem(COLLAPSE_STORAGE_KEY) !== "expanded";
  } catch {
    return true;
  }
}

/** 持久化折叠态;存储不可用时静默忽略。 */
export function writeStoredCollapsed(
  collapsed: boolean,
  storage: Pick<Storage, "setItem"> = localStorage,
): void {
  try {
    storage.setItem(COLLAPSE_STORAGE_KEY, collapsed ? "collapsed" : "expanded");
  } catch {
    // localStorage 不可用时仅内存态,不影响功能。
  }
}

function formatCompactBytes(value: number): string {
  const [amount, unit = "B"] = formatBytes(value).split(" ");
  return `${amount}${unit[0]}`;
}

/**
 * 顶部总览折叠条:单行精简显示核心数据(在线节点/实时带宽/累计流量),
 * 右侧箭头点击展开/收起完整总览。折叠状态存 localStorage。
 */
export function OverviewCollapseBar({
  data,
  expanded,
  onToggle,
}: {
  data: OverviewCollapseData;
  expanded: boolean;
  onToggle: () => void;
}) {
  const trafficLabel = `↑${formatCompactBytes(data.trafficUp)} ↓${formatCompactBytes(
    data.trafficDown,
  )}`;
  const rate = formatByteRate(data.netUp + data.netDown);
  const onlineLabel = `${data.onlineNodes}/${data.totalNodes}`;

  return (
    <button
      type="button"
      className={`overview-collapse-bar${expanded ? " is-expanded" : ""}`}
      aria-expanded={expanded}
      aria-label={expanded ? "收起顶部总览" : "展开顶部总览"}
      onClick={onToggle}
    >
      <span className="overview-collapse-stat" data-metric="online">
        <span className="overview-collapse-label">在线节点</span>
        <span className="overview-collapse-value">{onlineLabel}</span>
      </span>
      <span className="overview-collapse-stat" data-metric="bandwidth">
        <span className="overview-collapse-label">实时带宽</span>
        <span className="overview-collapse-value" style={{ color: speedRateColor(rate.unit) }}>
          {rate.value}
          <span className="overview-collapse-unit">{rate.unit}</span>
        </span>
      </span>
      <span className="overview-collapse-stat" data-metric="traffic">
        <span className="overview-collapse-label">累计流量</span>
        <span className="overview-collapse-value">{trafficLabel}</span>
      </span>
      <span className="overview-collapse-arrow" aria-hidden>
        <ChevronDown size={16} />
      </span>
    </button>
  );
}

/** 折叠/展开状态 hook:默认折叠,localStorage 记忆用户选择。 */
export function useOverviewCollapsed(enabled: boolean) {
  const [collapsed, setCollapsed] = useState(() => readStoredCollapsed());

  const toggle = () => {
    setCollapsed((prev) => {
      const next = !prev;
      writeStoredCollapsed(next);
      return next;
    });
  };

  // 关闭折叠功能时强制展开(完整总览),避免残留折叠态。
  const effectiveExpanded = !enabled || !collapsed;

  return { collapsed: !effectiveExpanded, expanded: effectiveExpanded, toggle };
}
