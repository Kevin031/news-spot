import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import SourceCard from "./SourceCard.vue";

const source = { id: "hackernews", name: "Hacker News", homeUrl: "https://news.ycombinator.com" };
const item = { id: "1", sourceId: "hackernews", title: "真实热点", url: "https://example.com/1", rank: 1, score: 20 };

describe("SourceCard", () => {
  it.each([
    ["loading", "正在加载"],
    ["fresh", "已保存数据"],
    ["stale", "最近成功快照"],
    ["error", "暂时不可用"],
  ])("呈现 %s 状态", (status, text) => {
    const result = { status, items: status === "fresh" || status === "stale" ? [item] : [], error: status === "error" ? { message: "上游失败" } : null, lastSuccessAt: new Date().toISOString() };
    const wrapper = mount(SourceCard, { props: { source, result } });
    expect(wrapper.text()).toContain(text);
  });

  it("呈现空数据并按关键词过滤", async () => {
    const wrapper = mount(SourceCard, { props: { source, result: { status: "fresh", items: [] } } });
    expect(wrapper.text()).toContain("上游暂时没有内容");
    await wrapper.setProps({ result: { status: "fresh", items: [item] }, query: "不存在" });
    expect(wrapper.text()).toContain("没有匹配的热点");
  });

  it("旧快照显示计划状态和完整更新时间", () => {
    const wrapper = mount(SourceCard, { props: { source, result: { status: "stale", staleReason: "最近计划时段尚未更新", lastSuccessAt: "2026-09-22T01:00:00Z", items: [item] } } });
    expect(wrapper.text()).toContain("最近计划时段尚未更新");
    expect(wrapper.text()).toContain("更新于 2026/09/22");
  });

  it("真实条目链接安全打开原始来源", () => {
    const wrapper = mount(SourceCard, { props: { source, result: { status: "fresh", items: [item] } } });
    const link = wrapper.find(".hot-main-link");
    expect(link.attributes()).toMatchObject({ href: item.url, target: "_blank", rel: "noopener noreferrer" });
  });

  it("AIHOT 条目展示原始信源、摘要性质和署名链接", () => {
    const aihotItem = { ...item, sourceId: "aihot-selected", score: null, summary: "模型发布", originalSourceName: "原始信源", attribution: { name: "AIHOT", url: "https://aihot.news/items/1" } };
    const wrapper = mount(SourceCard, { props: { source: { ...source, id: "aihot-selected" }, result: { status: "fresh", items: [aihotItem] } } });
    expect(wrapper.text()).toContain("AIHOT 摘要：模型发布");
    expect(wrapper.text()).toContain("原始信源");
    expect(wrapper.get(".hot-provenance a").attributes("href")).toBe("https://aihot.news/items/1");
    expect(wrapper.get(".hot-main-link").attributes("href")).toBe(item.url);
  });
});
