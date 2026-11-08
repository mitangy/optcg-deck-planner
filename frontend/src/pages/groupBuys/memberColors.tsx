/** Stable palette for group-buy members — fits the cream/teal product chrome. */
const MEMBER_COLORS = [
  "#0f6a6a",
  "#c65911",
  "#2f6b3a",
  "#355c7d",
  "#9b2c2c",
  "#6b5344",
  "#8a5a12",
  "#3d5a80",
];

export function memberColorIndex(userId: number, members: { user_id: number }[]): number {
  const idx = members.findIndex((m) => m.user_id === userId);
  return (idx >= 0 ? idx : userId) % MEMBER_COLORS.length;
}

export function memberColor(userId: number, members: { user_id: number }[]): string {
  return MEMBER_COLORS[memberColorIndex(userId, members)];
}

export function MemberSwatch({
  userId,
  members,
  title,
}: {
  userId: number;
  members: { user_id: number }[];
  title?: string;
}) {
  return (
    <span
      className="group-buy-swatch"
      style={{ background: memberColor(userId, members) }}
      title={title}
      aria-hidden={title ? undefined : true}
    />
  );
}
