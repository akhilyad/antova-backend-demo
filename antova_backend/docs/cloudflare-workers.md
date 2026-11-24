# Deploying the workbench to Cloudflare Workers

The workbench (`antova_backend/frontend`) builds into one Cloudflare Worker with
[@opennextjs/cloudflare](https://opennext.js.org/cloudflare). The built-in engine runs inside it;
uploads, page text, jobs and tenders go to a private R2 bucket (`ANTOVA_BUCKET`). The LLM key lives
only in Cloudflare as an encrypted Worker secret, never in the repo or in Vercel.

Config: `wrangler.jsonc` (Worker name, R2 binding, non-secret vars) and `open-next.config.ts`.

## One-time setup

Run from `antova_backend/frontend`.

```
npx wrangler login
npx wrangler r2 bucket create antova-workbench-data
npx wrangler secret put LLM_API_KEY
npx wrangler secret put LLM_MODEL_NAME
npx wrangler secret put REVIEW_TOKEN
```

`secret put` prompts for the value, so it never appears in shell history or in chat. If the provider
is not OpenAI, change `LLM_BASE_URL` under `vars` in `wrangler.jsonc` (or `secret put LLM_BASE_URL`).
Do not set `BACKEND_URL` unless a separate FastAPI engine should handle `/api`.

`REVIEW_TOKEN` is recommended. Without it, anyone with the URL can run ingests on your key; with it,
reviewers enter the token on the Settings page.

## Deploy

```
npm run cf:deploy
```

It prints the URL (`https://antova-workbench.<account>.workers.dev`). Check `<url>/api/health`: it
should say `"engine":"native"`, `"llm":"ok"`, `"storage":"r2"`. Then run the real-model check:

```
node scripts/test-native-e2e.mjs https://antova-workbench.<account>.workers.dev
```

(set the `REVIEW_TOKEN` environment variable for the script if you set the secret).

## Local preview in the Workers runtime

```
node scripts/mock-llm.mjs     # stand-in model, or put real values in .dev.vars
npm run cf:preview            # http://localhost:8787, local R2 under .wrangler/
```

`.dev.vars` holds local secrets (git-ignored), same keys as above.

## Notes

- The free Workers plan allows 10 ms of CPU per request; parsing a 30-page PDF on upload uses more.
  Use Workers Paid ($5/month), whose limit is 30 s by default. Waiting on the model does not count as CPU.
- Uploads go through the Worker; Cloudflare's request body limit is 100 MB on Free/Pro, above the
  engine's own 50 MB cap.
- Build on Windows works for this app, but OpenNext recommends WSL or Linux if a build fails oddly.
- The Vercel deploy still works from the same code if needed; storage there is Blob or ephemeral disk.
