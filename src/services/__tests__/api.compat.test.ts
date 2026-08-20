import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { rpcCallMock, MockRpcResponseError } = vi.hoisted(() => ({
  rpcCallMock: vi.fn(),
  MockRpcResponseError: class MockRpcResponseError extends Error {
    constructor(
      message: string,
      public readonly code?: number,
    ) {
      super(message);
    }
  },
}));

vi.mock("@/services/rpc2Client", () => ({
  getRpc2Client: () => ({ call: rpcCallMock }),
  RpcResponseError: MockRpcResponseError,
}));

import { getPingOverview } from "@/services/api";

describe("Komari 1.2.5 metric compatibility", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    rpcCallMock.mockReset();
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it("detects the legacy backend once and goes directly to records", async () => {
    rpcCallMock.mockImplementation((method: string) => {
      if (method === "public:queryMetrics") {
        return Promise.reject(new MockRpcResponseError("Method not found", -32601));
      }
      if (method === "common:getRecords") {
        return Promise.resolve({
          count: 1,
          records: [
            {
              task_id: 7,
              time: "2026-07-15T04:00:00Z",
              value: 35,
              client: "node-a",
            },
          ],
          tasks: [{ id: 7, name: "Legacy Ping", interval: 60, clients: ["node-a"] }],
        });
      }
      return Promise.reject(new Error(`Unexpected RPC method: ${method}`));
    });

    const result = await getPingOverview(1, 7, { entityIds: ["node-a"] });

    expect(result.records).toHaveLength(1);
    expect(rpcCallMock).toHaveBeenCalledWith(
      "common:getRecords",
      expect.objectContaining({ type: "ping", task_id: 7 }),
      expect.anything(),
    );
    const metricCalls = rpcCallMock.mock.calls.filter(
      ([method]) => method === "public:queryMetrics",
    );
    expect(metricCalls).toHaveLength(1);
    expect(metricCalls[0]?.[1]).toEqual({});
    expect(rpcCallMock.mock.calls.some(([method]) => method === "public:getVersion")).toBe(false);
    expect(
      rpcCallMock.mock.calls.some(([method]) => method === "public:getPingMetricStats"),
    ).toBe(false);
    expect(warnSpy).toHaveBeenCalledWith(
      "[Junimo] 检测到旧版后端,Ping 概览已使用兼容 records 接口",
    );
  });
});
