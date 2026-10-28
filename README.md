# grounded-extract

LLM field extraction where **every value must be backed by a verbatim quote** from the source document. If the quote isn't really there, or doesn't support the value, the field is dropped and marked for a human — instead of a confident wrong number landing in your ERP.

Built for business documents: RFQ emails, invoices, shipping notices. Zero dependencies, ~200 lines, works with any OpenAI-compatible model.

```ts
import { extract, openAICompatible } from "grounded-extract";

const llm = openAICompatible({
  baseURL: "https://api.deepseek.com",
  apiKey: process.env.DEEPSEEK_API_KEY!,
  model: "deepseek-chat",
});

const fields = [
  { key: "quantity", description: "quantity requested now" },
  { key: "target_price", description: "buyer's target unit price" },
];

const result = await extract(emailText, fields, llm);
// [
//   { key: "quantity", status: "verified", value: "4500 units", quote: "we'd like 4,500 units of TB-15" },
//   { key: "target_price", status: "missing" },
// ]
```

## How verification works

The model returns `{ value, quote }` per field. A field is `verified` only if all checks pass; otherwise it is `rejected` with a reason:

| Check | Rejects | Reason |
|---|---|---|
| Quote appears in the document (whitespace / curly quotes normalised) | Invented or paraphrased quotes | `quote_not_found` |
| Every multi-digit number in the value appears in the quote (`3,000` = `3000`, `4.2` = `4.20`) | A real quote carrying a wrong quantity, price or code | `number_not_in_quote` |
| Value shares at least one word / number / CJK bigram with the quote | Placeholders like "Not stated" pinned to an unrelated sentence | `value_not_in_quote` |
| Quote is at least 3 characters | Trivially short "evidence" | `quote_too_short` |

The prompt also tells the model to treat the document as data and ignore instructions inside it.

## Evaluation

20 fictional documents (English + Chinese RFQs, invoices, shipping notices), 140 hand-labelled fields. Each document has a trap: last year's quantity next to this year's, a revised quantity, a prompt injection, a booking number that looks like a B/L number, a notice where nothing is known yet. See [`eval/dataset.ts`](eval/dataset.ts).

Two prompts are compared: **strict** (the library default: "leave it empty if not stated") and **guess** ("fill every field, estimate if needed") — the second simulates a careless prompt or a weaker model.

Results with `deepseek-chat`, temperature 0 ([raw outputs](eval/results/)):

| Prompt | Pipeline | Coverage | Wrong answers | Filled a field the document doesn't state |
|---|---|---|---|---|
| strict | model output | 95.5% | 0 / 105 (0.0%) | 0 / 30 |
| strict | + verification | 95.5% | 0 / 105 (0.0%) | 0 / 30 |
| guess | model output | 99.1% | 25 / 134 (18.7%) | 24 / 30 |
| guess | + verification | 99.1% | 4 / 113 (3.5%) | 4 / 30 |

Coverage = correct answers / fields the document actually states.

What this shows, honestly:

- **The prompt does most of the work.** With the strict prompt this model made no errors on this set, so verification had nothing to catch. The set is small; treat it as a regression suite, not a benchmark.
- **Verification is the safety net for when the prompt or model isn't that good.** Under the guess prompt it cut wrong answers from 18.7% to 3.5% and dropped zero correct answers.
- **It cannot catch misreadings with a genuine quote.** The 4 survivors include a booking number reported as a B/L number (`BKG-55120`) and "best price (no figure given)" as a target price. The quote is real and relevant; the interpretation is wrong. That needs a human or a second model, which is why the output keeps the quote next to every value.
- **Strict trades some coverage for safety.** The 5 fields it left empty are relative terms ("14 days net", "next Friday") that the model chose not to treat as stated.

Reproduce:

```bash
EVAL_API_KEY=sk-... node eval/run.ts        # calls the model, caches outputs
node eval/run.ts --score-only               # re-score the cached outputs
EVAL_BASE_URL=https://api.openai.com/v1 EVAL_MODEL=gpt-4o-mini EVAL_API_KEY=... node eval/run.ts
```

## API

- `extract(document, fields, complete, mode?)` → `Promise<FieldResult[]>`
- `buildMessages(document, fields, mode?)` → chat messages, if you call the model yourself
- `verify(modelText, document, fields)` → `FieldResult[]`
- `verifyField(key, value, quote, document)` → `FieldResult`
- `openAICompatible({ baseURL, apiKey, model, timeoutMs? })` → `complete` function

`FieldResult.status` is `verified`, `missing` or `rejected` (with `reason`, `value`, `quote` kept for review).

## Limits

- Values are expected in the document's language. If you translate values, the word-overlap check will reject them; keep translation as a separate step after verification.
- Quote matching is exact after whitespace normalisation, so OCR noise will cause rejections.
- Single-digit numbers are not checked (dates get reformatted).

## Development

Requires Node 22.18+ (runs TypeScript directly).

```bash
npm test
```

MIT licensed.
