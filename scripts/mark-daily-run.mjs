import fs from "node:fs/promises";

const statePath = "data/daily-run-state.json";
const dateJst = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
const markLp = process.env.MARK_LP === "true";
const markNonLp = process.env.MARK_NON_LP === "true";

const rawState = JSON.parse(await fs.readFile(statePath, "utf8").catch(() => "{}"));
const prevState =
  rawState.lp || rawState.nonLp
    ? rawState
    : rawState.lastSuccessfulDateJst
      ? { nonLp: rawState, lp: {} }
      : { lp: {}, nonLp: {} };

const entry = {
  lastSuccessfulDateJst: dateJst,
  completedAt: new Date().toISOString(),
  runId: process.env.GITHUB_RUN_ID || null
};

const state = {
  lp: markLp ? entry : prevState.lp || {},
  nonLp: markNonLp ? entry : prevState.nonLp || {}
};

await fs.writeFile(statePath, JSON.stringify(state, null, 2) + "\n");
console.log(
  `${dateJst} の成功記録を書き込みました（LP: ${markLp ? "更新" : "維持"} / 非LP: ${
    markNonLp ? "更新" : "維持"
  }）。`
);
