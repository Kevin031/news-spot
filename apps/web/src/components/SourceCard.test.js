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

  it("中文来源显示公开图标，错误状态只显示一个重试按钮", () => {
    const wrapper = mount(SourceCard, { props: { source: { ...source, id: "ithome", name: "IT之家" }, result: { status: "error", items: [], error: { message: "上游失败" } } } });
    expect(wrapper.get(".source-mark img").attributes("src")).toBe("/source-icons/ithome.png");
    expect(wrapper.findAll("button")).toHaveLength(1);
    expect(wrapper.get("button").text()).toBe("重新连接");
  });

  it("未收录来源及图标加载失败时显示原有缩写", async () => {
    const result = { status: "fresh", items: [] };
    const unknown = mount(SourceCard, { props: { source: { ...source, id: "other", name: "其他来源" }, result } });
    expect(unknown.get(".source-mark").text()).toBe("其他");
    const known = mount(SourceCard, { props: { source: { ...source, id: "ithome", name: "IT之家" }, result } });
    await known.get(".source-mark img").trigger("error");
    expect(known.get(".source-mark").text()).toBe("IT");
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

  it("豆瓣卡片展示海报和右侧评分，海报失败时显示占位", async () => {
    const doubanItem = { ...item, sourceId: "douban-movies", posterUrl: "https://img9.doubanio.com/poster.jpg", rating: 8.7, score: null, summary: null };
    const wrapper = mount(SourceCard, { props: { source: { ...source, id: "douban-movies", name: "豆瓣热门电影" }, result: { status: "fresh", items: [doubanItem] } } });
    expect(wrapper.get(".douban-poster img").attributes("src")).toBe(doubanItem.posterUrl);
    expect(wrapper.get(".douban-rating").text()).toBe("8.7");
    expect(wrapper.get(".douban-rating").attributes("aria-label")).toBe("豆瓣评分 8.7");
    expect(wrapper.get(".douban-title").attributes("href")).toBe(item.url);
    await wrapper.get(".douban-poster img").trigger("error");
    expect(wrapper.get(".douban-poster-placeholder").text()).toBe("暂无海报");
  });

  it("未评分电视剧保留右侧评分位置", () => {
    const doubanItem = { ...item, sourceId: "douban-tv", posterUrl: null, rating: null, score: null, summary: "更新至14集" };
    const wrapper = mount(SourceCard, { props: { source: { ...source, id: "douban-tv", name: "豆瓣热门电视剧" }, result: { status: "fresh", items: [doubanItem] } } });
    expect(wrapper.get(".douban-rating").text()).toBe("暂无评分");
    expect(wrapper.get(".douban-detail small").text()).toBe("更新至14集");
  });
});
