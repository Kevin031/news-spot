export const CARD_PREFERENCES_KEY = "news-spot-card-preferences";
export const STEAM_CARD_ID = "steam-deals";

export function readCardPreferences(storage = localStorage) {
  try {
    const value = JSON.parse(storage.getItem(CARD_PREFERENCES_KEY) || "null");
    if (!value || typeof value !== "object") return { order: [], hidden: [] };
    return {
      order: Array.isArray(value.order) ? [...new Set(value.order.filter((id) => typeof id === "string"))] : [],
      hidden: Array.isArray(value.hidden) ? [...new Set(value.hidden.filter((id) => typeof id === "string"))] : [],
    };
  } catch {
    return { order: [], hidden: [] };
  }
}

export function arrangeCards(cards, order) {
  const positions = new Map(order.map((id, index) => [id, index]));
  return cards.map((card, index) => ({ card, index }))
    .sort((left, right) => (positions.get(left.card.id) ?? Infinity) - (positions.get(right.card.id) ?? Infinity) || left.index - right.index)
    .map(({ card }) => card);
}

export function moveCard(order, id, targetId) {
  if (id === targetId || !order.includes(id) || !order.includes(targetId)) return order;
  const next = order.filter((value) => value !== id);
  next.splice(next.indexOf(targetId), 0, id);
  return next;
}
