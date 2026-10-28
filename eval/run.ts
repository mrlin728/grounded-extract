// Runs the dataset through a model twice (strict and "guess" prompts), caches
// raw outputs, then scores trusting the model directly vs. after verification.
//
//   EVAL_API_KEY=... node eval/run.ts            # call the model, then score
//   node eval/run.ts --score-only                # re-score cached outputs
//
// Defaults to DeepSeek; set EVAL_BASE_URL / EVAL_MODEL for any
// OpenAI-compatible endpoint.

import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import {
  buildMessages,
  openAICompatible,
  parseOutput,
  verify,
  type PromptMode,
} from "../src/index.ts";
import { cases, type Case } from "./dataset.ts";

const baseURL = process.env.EVAL_BASE_URL ?? "https://api.deepseek.com";
const model = process.env.EVAL_MODEL ?? "deepseek-chat";
const scoreOnly = process.argv.includes("--score-only");
const dir = new URL("./results/", import.meta.url);
mkdirSync(dir, { recursive: true });

const clean = (s: string) => s.toLowerCase().replace(/,/g, "");
// Each gold token may list alternatives separated by "|".
export const matches = (value: string, gold: string[]) =>
  gold.every((t) => t.split("|").some((alt) => clean(value).includes(clean(alt))));

async function outputs(mode: PromptMode): Promise<Record<string, string>> {
  const file = new URL(`${model}.${mode}.json`, dir);
  if (scoreOnly || existsSync(file))
    return JSON.parse(readFileSync(file, "utf8"));
  const apiKey = process.env.EVAL_API_KEY;
  if (!apiKey) throw new Error("EVAL_API_KEY is not set");
  const complete = openAICompatible({ baseURL, apiKey, model });
  const out: Record<string, string> = {};
  // Small batches keep us under provider rate limits.
  for (let i = 0; i < cases.length; i += 4)
    await Promise.all(
      cases.slice(i, i + 4).map(async (c) => {
        out[c.id] = await complete(buildMessages(c.document, c.fields, mode));
      }),
    );
  writeFileSync(file, JSON.stringify(out, null, 2));
  return out;
}

type Tally = { answered: number; correct: number; wrong: number; absentFilled: number };
const blank = (): Tally => ({ answered: 0, correct: 0, wrong: 0, absentFilled: 0 });

function score(out: Record<string, string>) {
  const raw = blank();
  const ver = blank();
  let present = 0;
  let absent = 0;
  let falseRejects = 0;
  const errors: string[] = [];
  for (const c of cases as Case[]) {
    const text = out[c.id] ?? "";
    const rawFields = parseOutput(text, c.fields);
    const verified = verify(text, c.document, c.fields);
    for (const [i, { key }] of c.fields.entries()) {
      const gold = c.gold[key];
      gold ? present++ : absent++;
      const tally = (t: Tally, value: string) => {
        if (!value.trim()) return false;
        t.answered++;
        const ok = gold !== null && matches(value, gold);
        ok ? t.correct++ : t.wrong++;
        if (gold === null) t.absentFilled++;
        return ok;
      };
      const rawOk = tally(raw, rawFields[key].value);
      const v = verified[i];
      const vOk = tally(ver, v.status === "verified" ? v.value : "");
      if (rawOk && !vOk) falseRejects++;
      if (v.status === "verified" && !vOk)
        errors.push(`${c.id}.${key}: "${v.value}" passed verification but is wrong`);
    }
  }
  return { raw, ver, present, absent, falseRejects, errors };
}

const pct = (a: number, b: number) => (b ? `${((100 * a) / b).toFixed(1)}%` : "–");
const lines = [
  `## ${model} — ${cases.length} documents, ${cases.reduce((n, c) => n + c.fields.length, 0)} fields`,
  "",
  "| Prompt | Pipeline | Coverage | Wrong answers | Filled a field the document doesn't state |",
  "|---|---|---|---|---|",
];
const notes: string[] = [];
for (const mode of ["strict", "guess"] as const) {
  const s = score(await outputs(mode));
  for (const [name, t] of [["model output", s.raw], ["+ verification", s.ver]] as const)
    lines.push(
      `| ${mode} | ${name} | ${pct(t.correct, s.present)} | ${t.wrong} / ${t.answered} (${pct(t.wrong, t.answered)}) | ${t.absentFilled} / ${s.absent} |`,
    );
  notes.push(`- ${mode}: verification dropped ${s.falseRejects} correct answer(s)`);
  for (const e of s.errors) notes.push(`  - ${e}`);
}
lines.push("", "Coverage = correct answers / fields the document states.", ...notes);
const report = lines.join("\n");
writeFileSync(new URL(`${model}.md`, dir), report + "\n");
console.log(report);
