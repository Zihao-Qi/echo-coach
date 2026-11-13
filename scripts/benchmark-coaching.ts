import { loadEnvConfig } from "@next/env";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { coachingCases } from "../benchmarks/coaching/cases";
import { findQuestion } from "../src/content/questions/starter-bank";
import { evaluateAttempt } from "../src/application/workflows/evaluate-attempt";
import { GeminiPracticeEvaluator } from "../src/infrastructure/ai/gemini/practice-evaluator";

async function main() {
  loadEnvConfig(process.cwd());
  const modelsArg = process.argv.find((arg) => arg.startsWith("--models="))?.slice(9);
  const models = [...new Set((modelsArg || "").split(",").filter(Boolean))];
  if (!models.length || models.length > 2 || models.some((model) => !/^[a-zA-Z0-9._-]{1,100}$/.test(model))) throw new Error("Supply --models=model-id[,second-model-id] (one or two explicit IDs).");
  const plannedCalls = models.length * coachingCases.length;
  console.log(JSON.stringify({ mode: process.argv.includes("--execute") ? "EXECUTE" : "DRY RUN", models, cases: coachingCases.map((item) => item.id), plannedCalls, thinkingLevel: "low", maxOutputTokensPerCall: 4096, retryAttempts: 1, note: "Human review required. No automatic correctness or cost claims." }, null, 2));
  if (!process.argv.includes("--execute")) { console.log("No API calls made. Use --execute only after approving the current model prices and usage budget."); return; }
  if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not configured. Do not paste it into chat.");
  if (plannedCalls > 10) throw new Error("This benchmark allows at most 10 calls.");
  const rows = [];
  for (const model of models) {
    for (const item of coachingCases) {
      const evaluator = new GeminiPracticeEvaluator(model, process.env.GEMINI_API_KEY);
      const question = findQuestion(item.questionId)!;
      const started = performance.now();
      try {
        const attempt = await evaluateAttempt(question, { questionId: question.id, answer: item.answer }, evaluator);
        rows.push({ model, caseId: item.id, reviewProbes: item.review, latencyMs: Math.round(performance.now() - started), attempt, humanVerdict: "UNREVIEWED" });
      } catch {
        rows.push({ model, caseId: item.id, latencyMs: Math.round(performance.now() - started), error: "Generation or validation failed; no coaching accepted.", usage: evaluator.usage, humanVerdict: "UNREVIEWED" });
      }
    }
  }
  const dir = join(process.cwd(), "benchmark-results");
  await mkdir(dir, { recursive: true });
  const output = join(dir, `coaching-${Date.now()}.json`);
  await writeFile(output, JSON.stringify({ createdAt: new Date().toISOString(), rows }, null, 2), { mode: 0o600 });
  console.log(`Saved ${rows.length} unreviewed results to ${output}. Token counts/latency are measurements; model quality requires reviewing the probes.`);
}
main().catch(() => { console.error("Benchmark could not run. Check explicit model IDs, API key, and provider availability. No secrets are logged."); process.exitCode = 1; });
