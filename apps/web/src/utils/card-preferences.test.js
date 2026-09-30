import { describe, expect, it } from "vitest";
import { arrangeCards, CARD_PREFERENCES_KEY, moveCard, readCardPreferences } from "./card-preferences.js";

describe("card preferences", () => {
  it("恢复已存的顺序和隐藏项，忽略损坏的数据", () => {
    const storage = { getItem: () => JSON.stringify({ order: ["a", "b", "a", 3], hidden: ["b", "b", null] }) };
    expect(readCardPreferences(storage)).toEqual({ order: ["a", "b"], hidden: ["b"] });
    expect(readCardPreferences({ getItem: () => "{" })).toEqual({ order: [], hidden: [] });
    expect(CARD_PREFERENCES_KEY).toBe("news-spot-card-preferences");
  });

  it("保持用户顺序，并把新卡片追加在末尾", () => {
    const cards = [{ id: "new" }, { id: "steam-deals" }, { id: "a" }];
    expect(arrangeCards(cards, ["a", "steam-deals", "removed"]).map((card) => card.id)).toEqual(["a", "steam-deals", "new"]);
    expect(moveCard(["a", "steam-deals", "new"], "new", "a")).toEqual(["new", "a", "steam-deals"]);
  });
});
