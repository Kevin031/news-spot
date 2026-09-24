import { mount, flushPromises } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import FetchLogsDialog from "./FetchLogsDialog.vue";

const entry = (id, sourceId = "hackernews", status = "success") => ({ id, sourceId, trigger: "scheduled", startedAt: "2026-09-23T01:00:00Z", finishedAt: "2026-09-23T01:00:01Z", status, itemCount: 2, errorCode: null });
const sources = [{ id: "hackernews", name: "Hacker News" }, { id: "v2ex", name: "V2EX" }];

describe("FetchLogsDialog", () => {
  it("打开后读取日志，筛选和分页，关闭时不轮询", async () => {
    const api = { fetchLogs: vi.fn(async ({ cursor }) => cursor ? { items: [entry(1)], nextCursor: null } : { items: [entry(2)], nextCursor: "next", latestSlot: { key: "2026-09-23T09:00", status: "completed", success: 1, failed: 0, total: 1 } }) };
    const wrapper = mount(FetchLogsDialog, { props: { open: false, sources, api } });
    expect(api.fetchLogs).not.toHaveBeenCalled();
    await wrapper.setProps({ open: true });
    await flushPromises();
    expect(wrapper.text()).toContain("Hacker News");
    expect(wrapper.text()).toContain("2026-09-23T09:00");
    await wrapper.find(".fetch-more").trigger("click");
    await flushPromises();
    expect(wrapper.findAll(".fetch-log-entry")).toHaveLength(2);
    await wrapper.findAll("select")[1].setValue("failure");
    await flushPromises();
    expect(api.fetchLogs.mock.lastCall[0].status).toBe("failure");
    await wrapper.get("[aria-label='关闭抓取日志']").trigger("click");
    expect(wrapper.emitted("update:open")[0]).toEqual([false]);
  });

  it("显示空态及加载错误", async () => {
    const api = { fetchLogs: vi.fn().mockResolvedValueOnce({ items: [], nextCursor: null, latestSlot: null }).mockRejectedValueOnce(new Error("请求失败")) };
    const wrapper = mount(FetchLogsDialog, { props: { open: true, sources, api } });
    await wrapper.setProps({ open: false });
    await wrapper.setProps({ open: true });
    await flushPromises();
    expect(wrapper.text()).toContain("暂无符合条件的抓取日志");
    await wrapper.findAll("select")[0].setValue("v2ex");
    await flushPromises();
    expect(wrapper.text()).toContain("请求失败");
  });
});
