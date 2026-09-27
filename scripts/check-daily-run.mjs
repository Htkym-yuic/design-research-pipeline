import fs from "node:fs/promises";

const statePath = "data/daily-run-state.json";
const forceRun = process.env.FORCE_RUN === "true";
const now = new Date(Date.now() + 9 * 60 * 60 * 1000);
const dateJst = now.toISOString().slice(0, 10);
const state = JSON.parse(await fs.readFile(statePath, "utf8").catch(() => "{}"));
const skip = !forceRun && state.lastSuccessfulDateJst === dateJst;

if (process.env.GITHUB_OUTPUT) {
  await fs.appendFile(process.env.GITHUB_OUTPUT, `skip=${skip}\ndate_jst=${dateJst}\n`);
}
console.log(skip ? `${dateJst} は成功済みのためスキップします。` : `${dateJst} の日次処理を実行します。`);
