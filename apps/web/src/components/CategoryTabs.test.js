import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import CategoryTabs from "./CategoryTabs.vue";

describe("CategoryTabs", () => {
  it("显示分类计数并切换", async () => {
    const wrapper = mount(CategoryTabs, { props: { modelValue: "all", categories: [{ id: "all", name: "全部" }, { id: "tech", name: "科技" }, { id: "finance", name: "财经" }], counts: { all: 15, tech: 8, finance: 1 } } });
    expect(wrapper.text()).toContain("科技 8");
    expect(wrapper.text()).toContain("财经 1");
    await wrapper.findAll("button")[1].trigger("click");
    expect(wrapper.emitted("update:modelValue")[0]).toEqual(["tech"]);
  });
});
