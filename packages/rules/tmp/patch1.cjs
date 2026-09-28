const fs=require("fs");
let g=fs.readFileSync("src/tools/cardText/grammar.ts","utf8");
const rep=(a,b)=>{ if(!g.includes(a)) { console.error("MISSING:",a.slice(0,80)); process.exitCode=1; } g=g.replace(a,b); };
rep(`  if (t === "your leader or 1 of your characters" || t === "your leader or up to 1 of your characters" || t === "1 of your leader or character cards" || t === "your leader or character") return { ref: "choose", selector: { player: "you", zone: "leader_or_character" }, min: 1, max: 1 };`,
`  if (t === "your leader or 1 of your characters" || t === "your leader or up to 1 of your characters" || t === "1 of your leader or character cards" || t === "your leader or character" || t === "this leader or 1 of your characters") return { ref: "choose", selector: { player: "you", zone: "leader_or_character" }, min: 0, max: 1 };`);
rep(`  if (t === "1 of your characters" || t === "up to 1 of your characters") return { ref: "choose", selector: { player: "you", zone: "character" }, min: 1, max: 1 };`,`  if (t === "1 of your characters" || t === "up to 1 of your characters") return { ref: "choose", selector: { player: "you", zone: "character" }, min: 0, max: 1 };`);
rep(`  if (p) { const target = toTarget(p); if (target.ref === "choose") return { ...target, min: 1, max: 1 }; return target; }`,`  if (p) { const target = toTarget(p); if (target.ref === "choose") return { ...target, min: 0, max: 1 }; return target; }`);
rep(`  [/^add up to (\d+) cards? from the top of your opponent's life cards to the owner's hand$/i, (m) => ({ do: "life_to_hand", player: "opponent", count: num(m[1]!), position: "top", min: 0 })],`,`  [/^add up to (\d+) cards? from the top of your opponent's life cards to the owner's hand$/i, (m) => ({ do: "may", then: { do: "life_to_hand", player: "opponent", count: num(m[1]!), position: "top" }, prompt: "add the top card of your opponent's Life to their hand" })],`);
rep(`  [/^add up to (\d+) cards? from the top of your life cards to your hand$/i, (m) => ({ do: "life_to_hand", player: "you", count: num(m[1]!), position: "top", min: 0 })],`,`  [/^add up to (\d+) cards? from the top of your life cards to your hand$/i, (m) => ({ do: "may", then: { do: "life_to_hand", player: "you", count: num(m[1]!), position: "top" }, prompt: "add the top card of your Life to your hand" })],`);
rep(`  const direct = firstMatch(t, COST_RULES, ctx);
  if (direct) return [direct];`,`  const combined = /^rest (\d+) of your DON!! cards? and this (?:character|stage|leader)$/i.exec(t);
  if (combined) return [{ k: "rest_don", count: num(combined[1]!) }, { k: "rest_self" }];
  const direct = firstMatch(t, COST_RULES, ctx);
  if (direct) return [direct];`);
fs.writeFileSync("src/tools/cardText/grammar.ts",g);
let c=fs.readFileSync("src/tools/cardText/compileCard.ts","utf8");
c=c.replace(`  const subject = m[1]!;`,`  const subject = m[1]!.replace(/^(?:one of|any of) /i, "");`);
fs.writeFileSync("src/tools/cardText/compileCard.ts",c);
