export type ShippingSplit = "equal" | "by_cost" | "by_copies";

export const SHIPPING_SPLIT_LABELS: Record<ShippingSplit, string> = {
  equal: "Equal among buyers",
  by_cost: "By card cost",
  by_copies: "By copies",
};
