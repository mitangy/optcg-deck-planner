// Original One Piece-inspired card backs for the hype captures. Pure vector art (SVG) rendered to PNG with Chromium.
// No characters, no official card art, no official card back or logos: simple bold shapes in the app's navy + gold style.
// Usage (from trailer/capture): node assets/make_card_backs.mjs [outDir]   (default: assets/card-backs)
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const FONTS = resolve(here, "../../video/public/fonts");
const OUT = resolve(process.argv[2] ?? join(here, "card-backs"));
const W = 750, H = 1050;
const CX = 375, CY = 470, R = 268;

/** Shared bones of every back: gradient field, lattice, gold frame, corner ornaments, medallion, title plate. */
const shell = (t, emblem) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${t.bg[0]}"/><stop offset="0.55" stop-color="${t.bg[1]}"/><stop offset="1" stop-color="${t.bg[2]}"/></linearGradient>
  <radialGradient id="glow" cx="50%" cy="46%" r="55%"><stop offset="0" stop-color="${t.glow}" stop-opacity="0.55"/><stop offset="0.6" stop-color="${t.glow}" stop-opacity="0.08"/><stop offset="1" stop-color="${t.glow}" stop-opacity="0"/></radialGradient>
  <radialGradient id="vig" cx="50%" cy="50%" r="75%"><stop offset="0.6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.55"/></radialGradient>
  <linearGradient id="gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${t.gold[0]}"/><stop offset="0.5" stop-color="${t.gold[1]}"/><stop offset="1" stop-color="${t.gold[2]}"/></linearGradient>
  <linearGradient id="goldH" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${t.gold[2]}"/><stop offset="0.5" stop-color="${t.gold[0]}"/><stop offset="1" stop-color="${t.gold[2]}"/></linearGradient>
  <radialGradient id="disc" cx="50%" cy="40%" r="70%"><stop offset="0" stop-color="${t.disc[0]}"/><stop offset="1" stop-color="${t.disc[1]}"/></radialGradient>
  <pattern id="lattice" width="46" height="46" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0 0H46M0 0V46" stroke="${t.gold[1]}" stroke-opacity="0.09" stroke-width="1.4" fill="none"/></pattern>
  <filter id="soft" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="10" stdDeviation="9" flood-color="#000" flood-opacity="0.55"/></filter>
  <filter id="blur6"><feGaussianBlur stdDeviation="6"/></filter>
  <clipPath id="medal"><circle cx="${CX}" cy="${CY}" r="${R - 14}"/></clipPath>
  ${t.defs ?? ""}
</defs>
<rect width="${W}" height="${H}" fill="url(#bg)"/>
<rect width="${W}" height="${H}" fill="url(#lattice)"/>
<rect width="${W}" height="${H}" fill="url(#glow)"/>
${t.field ?? ""}
<rect width="${W}" height="${H}" fill="url(#vig)"/>
<!-- frame -->
<rect x="26" y="26" width="${W - 52}" height="${H - 52}" rx="38" fill="none" stroke="url(#gold)" stroke-width="9"/>
<rect x="50" y="50" width="${W - 100}" height="${H - 100}" rx="24" fill="none" stroke="${t.gold[1]}" stroke-opacity="0.7" stroke-width="2.5"/>
<rect x="58" y="58" width="${W - 116}" height="${H - 116}" rx="19" fill="none" stroke="${t.gold[1]}" stroke-opacity="0.28" stroke-width="1.5"/>
${[[78, 78, 1, 1], [W - 78, 78, -1, 1], [78, H - 78, 1, -1], [W - 78, H - 78, -1, -1]].map(([x, y, sx, sy]) => `
<g transform="translate(${x} ${y}) scale(${sx} ${sy})"><path d="M0 0 L26 0 M0 0 L0 26" stroke="url(#gold)" stroke-width="4" stroke-linecap="round"/><path d="M0 -13 L13 0 L0 13 L-13 0Z" fill="url(#gold)" transform="translate(30 30) scale(0.7)"/><circle cx="0" cy="0" r="5" fill="url(#gold)"/></g>`).join("")}
<!-- medallion -->
<circle cx="${CX}" cy="${CY}" r="${R + 22}" fill="#000" opacity="0.28" filter="url(#blur6)"/>
<circle cx="${CX}" cy="${CY}" r="${R}" fill="url(#disc)"/>
${t.disk ?? ""}
<g clip-path="url(#medal)">${emblem}</g>
<circle cx="${CX}" cy="${CY}" r="${R - 14}" fill="none" stroke="${t.gold[1]}" stroke-opacity="0.55" stroke-width="2"/>
<circle cx="${CX}" cy="${CY}" r="${R}" fill="none" stroke="url(#gold)" stroke-width="9"/>
<circle cx="${CX}" cy="${CY}" r="${R + 14}" fill="none" stroke="${t.gold[1]}" stroke-opacity="0.45" stroke-width="2"/>
${Array.from({ length: 48 }, (_, i) => { const a = (i / 48) * Math.PI * 2, r1 = R + 20, r2 = R + (i % 4 === 0 ? 38 : 29); return `<line x1="${CX + r1 * Math.cos(a)}" y1="${CY + r1 * Math.sin(a)}" x2="${CX + r2 * Math.cos(a)}" y2="${CY + r2 * Math.sin(a)}" stroke="${t.gold[1]}" stroke-opacity="${i % 4 === 0 ? 0.95 : 0.5}" stroke-width="${i % 4 === 0 ? 4 : 2}" stroke-linecap="round"/>`; }).join("")}
<!-- title plate -->
<g transform="translate(${CX} 868)">
  <path d="M-250 0 L-215 -44 H215 L250 0 L215 44 H-215Z" fill="${t.plate}" stroke="url(#gold)" stroke-width="4"/>
  <path d="M-232 0 L-205 -32 H205 L232 0 L205 32 H-205Z" fill="none" stroke="${t.gold[1]}" stroke-opacity="0.4" stroke-width="1.5"/>
  <text x="0" y="14" text-anchor="middle" font-family="Bricolage, sans-serif" font-weight="800" font-size="${t.titleSize ?? 44}" letter-spacing="7" fill="url(#gold)">${t.title}</text>
</g>
<g transform="translate(${CX} 958)" font-family="Chakra Petch, sans-serif" font-weight="700" text-anchor="middle">
  <line x1="-240" y1="-8" x2="-150" y2="-8" stroke="${t.gold[1]}" stroke-opacity="0.6" stroke-width="2"/><line x1="150" y1="-8" x2="240" y2="-8" stroke="${t.gold[1]}" stroke-opacity="0.6" stroke-width="2"/>
  <text x="0" y="0" font-size="22" letter-spacing="9" fill="${t.gold[1]}" fill-opacity="0.9">OPTCG DUEL</text>
</g>
</svg>`;

/* ---------- shared bits ---------- */
const bar = (len, w, id) => `<g><rect x="${-len / 2}" y="${-w / 2}" width="${len}" height="${w}" rx="${w / 2}" fill="url(#${id})" stroke="#2a1a10" stroke-opacity="0.55" stroke-width="3"/>
  ${[-1, 1].flatMap((s) => [-1, 1].map((k) => `<circle cx="${s * (len / 2 - 4)}" cy="${k * (w / 2 + 2)}" r="${w * 0.6}" fill="url(#${id})" stroke="#2a1a10" stroke-opacity="0.55" stroke-width="3"/>`)).join("")}
  <rect x="${-len / 2 + 14}" y="${-w / 2 + 5}" width="${len - 28}" height="${w * 0.22}" rx="${w * 0.11}" fill="#fff" opacity="0.35"/></g>`;

const wave = (y, amp, len, color, op, dx = 0) => {
  let d = `M${-len} ${y}`;
  for (let x = -len; x < W + len; x += 90) d += ` q45 ${-amp} 90 0`;
  d += ` V${H} H${-len}Z`;
  return `<path d="${d}" transform="translate(${dx} 0)" fill="${color}" opacity="${op}"/>`;
};
const wavy = (y, color, op, sw = 5) => { let d = `M60 ${y}`; for (let x = 60; x < 700; x += 70) d += ` q17 -22 35 0 t35 0`; return `<path d="${d}" fill="none" stroke="${color}" stroke-opacity="${op}" stroke-width="${sw}" stroke-linecap="round"/>`; };

const sparkle = (x, y, s, c = "#fff", o = 0.9) => `<path d="M${x} ${y - s} Q${x} ${y} ${x + s} ${y} Q${x} ${y} ${x} ${y + s} Q${x} ${y} ${x - s} ${y} Q${x} ${y} ${x} ${y - s}Z" fill="${c}" opacity="${o}"/>`;

/* ---------- 1. Straw Hat (red): straw hat over crossed bones and waves ---------- */
const strawHat = {
  id: "straw-hat", title: "STRAW HAT",
  bg: ["#2b0a12", "#5c1019", "#1d060c"], glow: "#ff5a3c", gold: ["#ffe29a", "#e6b24a", "#a97722"], disc: ["#8c1f27", "#3a0b13"], plate: "#3a0b13",
  defs: `<linearGradient id="bone" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff6e0"/><stop offset="1" stop-color="#d9c192"/></linearGradient>
  <linearGradient id="straw" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe08a"/><stop offset="0.6" stop-color="#e9b247"/><stop offset="1" stop-color="#b9822a"/></linearGradient>
  <linearGradient id="strawDark" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d79d3a"/><stop offset="1" stop-color="#8e5f1c"/></linearGradient>
  <linearGradient id="band" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e2362f"/><stop offset="1" stop-color="#8d1118"/></linearGradient>`,
    disk: `<g clip-path="url(#medal)"><circle cx="${CX}" cy="${CY - 40}" r="170" fill="#ff7a4a" opacity="0.18"/>
  ${[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((i) => `<path d="M${CX} ${CY + 30} L${CX + 360 * Math.cos((i / 12) * 6.283)} ${CY + 30 + 360 * Math.sin((i / 12) * 6.283)}" stroke="#ffb86b" stroke-opacity="0.08" stroke-width="22"/>`).join("")}</g>`,
  emblem: `
  <g transform="translate(${CX} ${CY + 70})">
    <g transform="rotate(-34)" filter="url(#soft)">${bar(470, 40, "bone")}</g>
    <g transform="rotate(34)" filter="url(#soft)">${bar(470, 40, "bone")}</g>
  </g>
  <g>${wave(CY + 175, 26, 90, "#c0242b", 0.95)}${wave(CY + 205, 24, 90, "#7a0f19", 0.98, -40)}${wave(CY + 240, 22, 90, "#4a0a12", 1, 10)}
  ${wavy(CY + 175, "#ffe29a", 0.8, 4)}${wavy(CY + 205, "#ffd37a", 0.5, 3)}</g>
  <g transform="translate(${CX} ${CY - 18})" filter="url(#soft)">
    <ellipse cx="0" cy="40" rx="196" ry="58" fill="url(#strawDark)"/>
    <path d="M-196 40 C-196 78 -110 108 0 108 C110 108 196 78 196 40 C196 70 110 88 0 88 C-110 88 -196 70 -196 40Z" fill="#6e4512" opacity="0.7"/>
    <ellipse cx="0" cy="34" rx="196" ry="56" fill="url(#straw)"/>
    ${[-150, -110, -70, 70, 110, 150].map((x) => `<path d="M${x} ${34 - 40 * Math.sqrt(1 - (x / 196) ** 2) + 6} Q${x * 1.08} 34 ${x * 1.02} ${34 + 52 * Math.sqrt(1 - (x / 196) ** 2) - 6}" stroke="#a8761f" stroke-opacity="0.55" stroke-width="2.5" fill="none"/>`).join("")}
    <ellipse cx="0" cy="34" rx="196" ry="56" fill="none" stroke="#fff2b8" stroke-opacity="0.55" stroke-width="3"/>
    <path d="M-104 34 C-110 -60 -80 -126 0 -126 C80 -126 110 -60 104 34 C70 54 -70 54 -104 34Z" fill="url(#straw)" stroke="#8e5f1c" stroke-opacity="0.5" stroke-width="3"/>
    <path d="M-104 34 C-70 54 70 54 104 34 L100 4 C66 24 -66 24 -100 4Z" fill="url(#band)"/>
    <path d="M-100 4 C-66 24 66 24 100 4" fill="none" stroke="#ffd37a" stroke-width="4"/>
    <path d="M-104 34 C-70 54 70 54 104 34" fill="none" stroke="#ffd37a" stroke-width="3" stroke-opacity="0.8"/>
    ${[-62, -36, -12, 14, 38, 64].map((x, i) => `<path d="M${x} ${-112 + Math.abs(x) * 0.2} Q${x * 1.15} -50 ${x * 1.08} ${-8 + (i % 2) * 2}" stroke="#a8761f" stroke-opacity="0.45" stroke-width="2.5" fill="none"/>`).join("")}
    <path d="M-58 -108 C-86 -80 -92 -40 -86 -4" fill="none" stroke="#fff6c8" stroke-opacity="0.75" stroke-width="9" stroke-linecap="round"/>
  </g>
  ${sparkle(190, 270, 18, "#ffe9a8")}${sparkle(570, 330, 12, "#ffe9a8", 0.8)}${sparkle(545, 250, 8, "#fff", 0.7)}`,
};

/* ---------- 2. Pirate Hunter (green): three crossed swords ---------- */
const sword = (len, w) => `
<g>
  <path d="M0 0 L${-w / 2} -14 L${-w / 2 + 2} ${-len + 40} Q0 ${-len - 14} ${w / 2 - 2} ${-len + 40} L${w / 2} -14Z" fill="url(#steel)" stroke="#0f2a20" stroke-opacity="0.6" stroke-width="3" stroke-linejoin="round"/>
  <path d="M0 -20 L0 ${-len + 20}" stroke="#7f9a94" stroke-width="3" stroke-opacity="0.8"/>
  <path d="M${-w / 2 + 3} -20 L${-w / 2 + 4} ${-len + 44}" stroke="#fff" stroke-opacity="0.55" stroke-width="3"/>
  <rect x="-46" y="-6" width="92" height="20" rx="10" fill="url(#gold)" stroke="#5b3d0c" stroke-opacity="0.6" stroke-width="3"/>
  <circle cx="-46" cy="4" r="8" fill="url(#gold)"/><circle cx="46" cy="4" r="8" fill="url(#gold)"/>
  <rect x="-12" y="14" width="24" height="66" rx="8" fill="#10281f" stroke="#0a1a14" stroke-width="2"/>
  ${[0, 1, 2, 3, 4].map((i) => `<path d="M-12 ${22 + i * 12} L12 ${31 + i * 12}" stroke="#e2b458" stroke-opacity="0.75" stroke-width="3"/>`).join("")}
  <circle cx="0" cy="92" r="16" fill="url(#gold)" stroke="#5b3d0c" stroke-opacity="0.6" stroke-width="3"/><circle cx="0" cy="92" r="6" fill="#10281f"/>
</g>`;
const pirateHunter = {
  id: "pirate-hunter", title: "PIRATE HUNTER",
  bg: ["#04180f", "#0c3a24", "#03110b"], glow: "#3be08a", gold: ["#ffe9a8", "#e0b457", "#a47a25"], disc: ["#14573a", "#06200f"], plate: "#07251a", titleSize: 38,
  defs: `<linearGradient id="steel" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#eef6f3"/><stop offset="0.5" stop-color="#b6c7c3"/><stop offset="1" stop-color="#6e8680"/></linearGradient>`,
  disk: `<g clip-path="url(#medal)">${Array.from({ length: 16 }, (_, i) => `<path d="M${CX} ${CY} L${CX + 360 * Math.cos((i / 16) * 6.283)} ${CY + 360 * Math.sin((i / 16) * 6.283)}" stroke="#7affc0" stroke-opacity="0.07" stroke-width="16"/>`).join("")}
  <circle cx="${CX}" cy="${CY}" r="150" fill="none" stroke="#7affc0" stroke-opacity="0.22" stroke-width="3"/><circle cx="${CX}" cy="${CY}" r="196" fill="none" stroke="#7affc0" stroke-opacity="0.14" stroke-width="2" stroke-dasharray="3 12" stroke-linecap="round"/></g>`,
  emblem: `
  <g filter="url(#soft)">
    <g transform="translate(${CX - 92} ${CY + 108}) rotate(33)">${sword(310, 40)}</g>
    <g transform="translate(${CX + 92} ${CY + 108}) rotate(-33)">${sword(310, 40)}</g>
    <g transform="translate(${CX} ${CY + 150})">${sword(380, 50)}</g>
  </g>
  ${sparkle(CX + 92, CY - 150, 15, "#d8fff0")}${sparkle(CX - 150, CY - 40, 10, "#d8fff0", 0.75)}${sparkle(CX + 160, CY + 40, 9, "#d8fff0", 0.7)}`,
};

/* ---------- 3. Surgeon of Death (yellow on black): heart with crossed scalpels ---------- */
const scalpel = () => `
<g>
  <path d="M0 -10 L-17 -8 L-17 -150 C-17 -220 -2 -262 0 -272 C14 -250 26 -200 26 -140 L22 -8 Z" fill="url(#steelY)" stroke="#000" stroke-opacity="0.5" stroke-width="3" stroke-linejoin="round"/>
  <path d="M-9 -20 L-9 -200" stroke="#fff" stroke-opacity="0.6" stroke-width="3"/>
  <rect x="-15" y="-12" width="38" height="190" rx="14" fill="#15130a" stroke="#f5c518" stroke-width="3"/>
  ${[0, 1, 2, 3, 4, 5].map((i) => `<path d="M-10 ${10 + i * 24} H18" stroke="#f5c518" stroke-opacity="0.75" stroke-width="3" stroke-linecap="round"/>`).join("")}
</g>`;
const heartPath = "M0 120 C-40 88 -128 40 -128 -34 C-128 -84 -92 -112 -54 -112 C-28 -112 -8 -98 0 -76 C8 -98 28 -112 54 -112 C92 -112 128 -84 128 -34 C128 40 40 88 0 120Z";
const surgeon = {
  id: "surgeon-of-death", title: "SURGEON OF DEATH",
  bg: ["#0b0b0d", "#17150a", "#050505"], glow: "#f5c518", gold: ["#fff0a0", "#f5c518", "#b88a0a"], disc: ["#262310", "#0a0a07"], plate: "#0d0c06", titleSize: 31,
  defs: `<linearGradient id="steelY" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#f6f6f0"/><stop offset="1" stop-color="#9b9a8c"/></linearGradient>
  <linearGradient id="heartY" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe84d"/><stop offset="0.6" stop-color="#f5c518"/><stop offset="1" stop-color="#c78e08"/></linearGradient>
  <pattern id="dots" width="34" height="34" patternUnits="userSpaceOnUse"><circle cx="17" cy="17" r="3.2" fill="#f5c518" fill-opacity="0.12"/></pattern>`,
  disk: `<circle cx="${CX}" cy="${CY}" r="${R - 14}" fill="url(#dots)"/><circle cx="${CX}" cy="${CY}" r="200" fill="none" stroke="#f5c518" stroke-opacity="0.22" stroke-width="3" stroke-dasharray="2 14" stroke-linecap="round"/>`,
  emblem: `
  <g transform="translate(${CX} ${CY + 55})" filter="url(#soft)">
    <g transform="rotate(-56)">${scalpel()}</g>
    <g transform="rotate(56) scale(-1 1)">${scalpel()}</g>
  </g>
  <g transform="translate(${CX} ${CY - 14})" filter="url(#soft)">
    <path d="${heartPath}" transform="scale(1.22)" fill="#0b0b0d"/>
    <path d="${heartPath}" transform="scale(1.14)" fill="url(#heartY)"/>
    <path d="M-104 -40 C-106 -72 -86 -92 -60 -92" fill="none" stroke="#fff6b0" stroke-opacity="0.85" stroke-width="9" stroke-linecap="round" transform="scale(1.26)"/>
    <path d="M-150 14 H-84 L-58 -46 L-22 78 L8 -22 L28 22 H150" fill="none" stroke="#0b0b0d" stroke-width="15" stroke-linecap="round" stroke-linejoin="round"/>
  </g>
  ${sparkle(CX + 175, CY - 150, 14, "#fff7b8")}${sparkle(CX - 190, CY + 60, 10, "#fff7b8", 0.7)}`,
};

/* ---------- 4. Navy (blue/white): anchor and gull ---------- */
const gull = (s) => `<g transform="scale(${s})"><path d="M-120 14 C-92 -34 -40 -44 0 -12 C40 -44 92 -34 120 14 C84 -10 44 -8 0 18 C-44 -8 -84 -10 -120 14Z" fill="#fff" stroke="#0a2a55" stroke-opacity="0.45" stroke-width="3" stroke-linejoin="round"/><path d="M-8 -4 L0 8 L8 -4" fill="none" stroke="#0a2a55" stroke-opacity="0.4" stroke-width="3"/></g>`;
const navy = {
  id: "navy", title: "NAVY",
  bg: ["#06183a", "#0d3a7a", "#04112b"], glow: "#69b4ff", gold: ["#ffffff", "#d7e6f7", "#8aa8cc"], disc: ["#1a5aa8", "#08244d"], plate: "#07224a", titleSize: 50,
  defs: `<linearGradient id="iron" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ffffff"/><stop offset="0.5" stop-color="#d4e3f4"/><stop offset="1" stop-color="#8fb0d6"/></linearGradient>`,
  disk: `<g clip-path="url(#medal)">${Array.from({ length: 24 }, (_, i) => `<path d="M${CX} ${CY} L${CX + 360 * Math.cos((i / 24) * 6.283)} ${CY + 360 * Math.sin((i / 24) * 6.283)}" stroke="#9fd0ff" stroke-opacity="${i % 2 ? 0.05 : 0.1}" stroke-width="14"/>`).join("")}</g>`,
  emblem: `
  <g clip-path="url(#medal)">${wave(CY + 170, 22, 90, "#0b3d82", 0.9)}${wave(CY + 205, 20, 90, "#082c63", 0.95, -30)}${wave(CY + 238, 18, 90, "#051d44", 1, 20)}${wavy(CY + 170, "#ffffff", 0.75, 4)}${wavy(CY + 205, "#bfe0ff", 0.4, 3)}</g>
  <g transform="translate(${CX} ${CY + 40}) scale(0.88)" filter="url(#soft)">
    <path d="M-132 70 C-132 150 -70 190 0 190 C70 190 132 150 132 70" fill="none" stroke="#0a2a55" stroke-width="40" stroke-linecap="round" opacity="0.5"/>
    <path d="M-132 70 C-132 150 -70 190 0 190 C70 190 132 150 132 70" fill="none" stroke="url(#iron)" stroke-width="30" stroke-linecap="round"/>
    <path d="M-132 70 L-168 104 L-104 112Z M132 70 L168 104 L104 112Z" fill="url(#iron)" stroke="#0a2a55" stroke-opacity="0.5" stroke-width="3" stroke-linejoin="round"/>
    <rect x="-17" y="-128" width="34" height="320" rx="14" fill="url(#iron)" stroke="#0a2a55" stroke-opacity="0.5" stroke-width="3"/>
    <rect x="-86" y="-86" width="172" height="30" rx="15" fill="url(#iron)" stroke="#0a2a55" stroke-opacity="0.5" stroke-width="3"/>
    <circle cx="-86" cy="-71" r="17" fill="url(#iron)"/><circle cx="86" cy="-71" r="17" fill="url(#iron)"/>
    <circle cx="0" cy="-160" r="36" fill="none" stroke="#0a2a55" stroke-opacity="0.5" stroke-width="26"/><circle cx="0" cy="-160" r="36" fill="none" stroke="url(#iron)" stroke-width="18"/>
    <path d="M-10 -120 V150" stroke="#fff" stroke-opacity="0.8" stroke-width="4"/>
    <path d="M-22 36 C-70 40 -64 -6 -30 -4 M22 36 C70 40 64 -6 30 -4" fill="none" stroke="#fff" stroke-opacity="0.0"/>
    <path d="M-17 20 C-70 40 -80 -10 -50 -30 C-70 0 -40 20 -17 4Z M17 20 C70 40 80 -10 50 -30 C70 0 40 20 17 4Z" fill="url(#iron)" opacity="0"/>
  </g>
  <g transform="translate(${CX} ${CY - 158})" filter="url(#soft)">${gull(0.85)}</g>
  <g transform="translate(${CX - 165} ${CY - 90}) rotate(-8)" opacity="0.9">${gull(0.34)}</g><g transform="translate(${CX + 160} ${CY - 70}) rotate(8)" opacity="0.8">${gull(0.26)}</g>
  ${sparkle(CX - 190, CY + 60, 11, "#e4f2ff", 0.8)}${sparkle(CX + 190, CY + 20, 14, "#ffffff", 0.9)}`,
};

/* ---------- 5. Emperor (purple): flames and crown ---------- */
const flame = (h, w, id, flip = 1) => `<path transform="scale(${flip} 1)" d="M${-w} 0 C${-w * 1.2} ${-h * 0.3} ${-w * 0.5} ${-h * 0.5} ${-w * 0.1} ${-h * 0.72} C${w * 0.2} ${-h * 0.85} ${w * 0.1} ${-h * 0.95} ${w * 0.55} ${-h} C${w * 0.5} ${-h * 0.8} ${w * 1.4} ${-h * 0.5} ${w} 0Z" fill="url(#${id})" stroke="#1a0833" stroke-opacity="0.55" stroke-width="3" stroke-linejoin="round"/>`;
const emperor = {
  id: "emperor", title: "EMPEROR",
  bg: ["#180828", "#3d1466", "#0d0418"], glow: "#b05cff", gold: ["#fff0b0", "#f0bd52", "#a8741d"], disc: ["#4b1a80", "#14072a"], plate: "#1c0a33", titleSize: 48,
  defs: `<linearGradient id="fl1" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#5a1aa8"/><stop offset="0.55" stop-color="#c04bff"/><stop offset="1" stop-color="#ff8be0"/></linearGradient>
  <linearGradient id="fl2" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#ff5aa0"/><stop offset="0.6" stop-color="#ffb35c"/><stop offset="1" stop-color="#fff0a8"/></linearGradient>
  <linearGradient id="gem" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e9a8ff"/><stop offset="1" stop-color="#6a1fb8"/></linearGradient>`,
  disk: `<g clip-path="url(#medal)">${Array.from({ length: 20 }, (_, i) => `<path d="M${CX} ${CY + 40} L${CX + 360 * Math.cos((i / 20) * 6.283)} ${CY + 40 + 360 * Math.sin((i / 20) * 6.283)}" stroke="#e0a8ff" stroke-opacity="0.07" stroke-width="14"/>`).join("")}</g>`,
  emblem: `
  <g transform="translate(${CX} ${CY + 250})">
    ${[[-215, 250, 52], [-150, 330, 56], [-80, 400, 60], [0, 440, 64], [80, 400, 60], [150, 330, 56], [215, 250, 52]].map(([x, h, w]) => `<g transform="translate(${x} 0)">${flame(h, w, "fl1", x < 0 ? -1 : 1)}</g>`).join("")}
    ${[[-185, 150, 42], [-120, 215, 46], [-50, 250, 48], [50, 250, 48], [120, 215, 46], [185, 150, 42]].map(([x, h, w]) => `<g transform="translate(${x} 0)">${flame(h, w, "fl2", x < 0 ? -1 : 1)}</g>`).join("")}
  </g>
  <ellipse cx="${CX}" cy="${CY + 262}" rx="290" ry="84" fill="#12061f" stroke="url(#gold)" stroke-width="4"/><ellipse cx="${CX}" cy="${CY + 262}" rx="260" ry="68" fill="none" stroke="#f0bd52" stroke-opacity="0.35" stroke-width="2"/>
  <g transform="translate(${CX} ${CY - 6}) scale(0.84)" filter="url(#soft)">
    <path d="M-150 90 L-170 -90 L-96 -20 L-52 -118 L0 -26 L52 -118 L96 -20 L170 -90 L150 90Z" fill="url(#gold)" stroke="#6a4310" stroke-opacity="0.6" stroke-width="4" stroke-linejoin="round"/>
    <path d="M-150 90 L-170 -90 L-96 -20 L-52 -118 L0 -26 L52 -118 L96 -20 L170 -90 L150 90Z" fill="none" stroke="#fff6c8" stroke-opacity="0.5" stroke-width="2" transform="translate(0 6) scale(0.93 0.93)"/>
    ${[[-170, -90], [-52, -118], [52, -118], [170, -90], [0, -26]].map(([x, y], i) => `<circle cx="${x}" cy="${y - (i === 4 ? 0 : 14)}" r="${i === 4 ? 17 : 21}" fill="url(#gold)" stroke="#6a4310" stroke-opacity="0.6" stroke-width="3"/><circle cx="${x}" cy="${y - (i === 4 ? 0 : 14)}" r="${i === 4 ? 7 : 9}" fill="url(#gem)"/>`).join("")}
    <rect x="-156" y="58" width="312" height="62" rx="16" fill="url(#gold)" stroke="#6a4310" stroke-opacity="0.6" stroke-width="4"/>
    <rect x="-144" y="68" width="288" height="42" rx="10" fill="none" stroke="#fff6c8" stroke-opacity="0.55" stroke-width="2"/>
    ${[-100, 0, 100].map((x) => `<path d="M${x} 72 l22 18 l-22 18 l-22 -18Z" fill="url(#gem)" stroke="#2a0b52" stroke-opacity="0.6" stroke-width="3"/>`).join("")}
    ${[-50, 50].map((x) => `<circle cx="${x}" cy="90" r="8" fill="#fff6c8" opacity="0.85"/>`).join("")}
  </g>
  ${sparkle(CX - 175, CY - 140, 15, "#f4d8ff")}${sparkle(CX + 185, CY - 120, 11, "#f4d8ff", 0.8)}${sparkle(CX + 150, CY + 30, 8, "#fff", 0.7)}`,
};

const THEMES = [strawHat, pirateHunter, surgeon, navy, emperor];

const fontCss = `@font-face{font-family:Bricolage;src:url(${pathToFileURL(join(FONTS, "Bricolage-latin.woff2"))});font-weight:700 800}
@font-face{font-family:"Chakra Petch";src:url(${pathToFileURL(join(FONTS, "ChakraPetch-700.woff2"))});font-weight:700}`;

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH || process.env.TRAILER_CHROMIUM || undefined, args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
for (const t of THEMES) {
  const svg = shell(t, t.emblem);
  await page.setContent(`<!doctype html><style>${fontCss}html,body{margin:0;background:transparent}svg{display:block}</style>${svg}`);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(150);
  await page.screenshot({ path: join(OUT, `${t.id}.png`), omitBackground: true, clip: { x: 0, y: 0, width: W, height: H } });
  console.log("wrote", join(OUT, `${t.id}.png`));
}
await browser.close();
