import fs from "node:fs/promises";

const statePath = "data/daily-run-state.json";
const forceRun = process.env.FORCE_RUN === "true";
const now = new Date(Date.now() + 9 * 60 * 60 * 1000);
const dateJst = now.toISOString().slice(0, 10);

const rawState = JSON.parse(await fs.readFile(statePath, "utf8").catch(() => "{}"));
// 旧形式（lp/非lp共有の単一フラグ）からの移行。
// 旧フラグは非LP単体のテスト実行（run_lp=false）でも立ってしまい、
// 同日中の本来のLP実行まで連帯でスキップさせてしまっていたため、
// 移行時はその日の成功を非LP側の記録として引き継ぎ、LP側は未成功として扱う。
const state =
  rawState.lp || rawState.nonLp
    ? rawState
    : rawState.lastSuccessfulDateJst
      ? { nonLp: rawState, lp: {} }
      : { lp: {}, nonLp: {} };

const skipLp = !forceRun && state.lp?.lastSuccessfulDateJst === dateJst;
const skipNonLp = !forceRun && state.nonLp?.lastSuccessfulDateJst === dateJst;

if (process.env.GITHUB_OUTPUT) {
  await fs.appendFile(
    process.env.GITHUB_OUTPUT,
    `skip_lp=${skipLp}\nskip_non_lp=${skipNonLp}\ndate_jst=${dateJst}\n`
  );
}
console.log(
  `[LP] ${dateJst} は${skipLp ? "成功済みのためスキップします" : "実行対象です"}。 / ` +
    `[非LP] ${skipNonLp ? "成功済みのためスキップします" : "実行対象です"}。`
);
