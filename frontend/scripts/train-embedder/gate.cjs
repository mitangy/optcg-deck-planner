/** Decides whether a retrained embedder may be published (#852).
 *
 * Publish only when the held-out user-crop test set is big enough to mean
 * something and the new model is strictly better at top-1 without losing top-5.
 *
 *   node gate.cjs metrics.json [oldLabel newLabel]   -> prints `publish=true|false reason=...`
 */
const MIN_TEST = 25;

function decide(oldM, newM, minTest = MIN_TEST) {
  if (!oldM || !newM) return { publish: false, reason: "missing metrics" };
  if (newM.n < minTest) return { publish: false, reason: `only ${newM.n} test crops (need ${minTest})` };
  if (!(newM.top1 > oldM.top1)) return { publish: false, reason: "top1 did not improve" };
  if (!(newM.top5 >= oldM.top5)) return { publish: false, reason: "top5 regressed" };
  return { publish: true, reason: "top1 improved, top5 held" };
}

module.exports = { decide, MIN_TEST };

if (require.main === module) {
  const [file, oldLabel = "old", newLabel = "new"] = process.argv.slice(2);
  const models = JSON.parse(require("fs").readFileSync(file, "utf8")).models;
  const d = decide(models[oldLabel], models[newLabel]);
  console.log(`publish=${d.publish} reason=${d.reason}`);
}
