import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import { VueDraggable } from "vue-draggable-plus";
import CardSettingsDialog from "./CardSettingsDialog.vue";

const cards = [{ id: "a", name: "甲" }, { id: "b", name: "乙" }];

describe("CardSettingsDialog", () => {
  it("拖拽顺序和开关状态交由父组件保存", async () => {
    const wrapper = mount(CardSettingsDialog, { props: { open: true, cards, hidden: ["b"] } });
    expect(wrapper.findAll(".card-settings-item")).toHaveLength(2);
    expect(wrapper.findAll("[role='switch']").map((switchElement) => switchElement.attributes("aria-checked"))).toEqual(["true", "false"]);
    expect(wrapper.find("[aria-label='上移 甲']").exists()).toBe(false);

    wrapper.getComponent(VueDraggable).vm.$emit("update:modelValue", [cards[1], cards[0]]);
    expect(wrapper.emitted("reorder")[0]).toEqual([["b", "a"]]);

    await wrapper.get("[aria-label='显示 甲']").trigger("click");
    expect(wrapper.emitted("toggle")[0]).toEqual(["a"]);
    await wrapper.get("[aria-label='关闭卡片设置']").trigger("click");
    expect(wrapper.emitted("update:open")[0]).toEqual([false]);
  });
});
