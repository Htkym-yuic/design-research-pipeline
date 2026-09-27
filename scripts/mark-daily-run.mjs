import fs from "node:fs/promises";

const statePath = "data/daily-run-state.json";
const dateJst = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
const state = {
  lastSuccessfulDateJst: dateJst,
  completedAt: new Date().toISOString(),
  runId: process.env.GITHUB_RUN_ID || null
};
await fs.writeFile(statePath, JSON.stringify(state, null, 2) + "\n");
console.log(`${dateJst} の成功記録を書き込みました。`);
