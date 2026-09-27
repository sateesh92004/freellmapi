# Hardening Report — FreeLLMAPI fork (`hardened` branch)

Date: 2026-09-27. Scope: secret scan, dependency audit, privacy hardening, network/supply-chain checks.
Philosophy: minimal, verifiable diffs — no rewrites. Where a fix would need a redesign, it is
recorded below as residual risk instead of being faked.

## Findings → Severity → Fix

| # | Finding | Severity | Fix applied / residual risk |
|---|---------|----------|-----------------------------|
| 1 | Hardcoded secrets scan (all `*.ts/js/json/yml`, excl. node_modules/.git/lockfiles/tests): no real API keys, tokens, or private keys found. Only i18n UI labels ("password"), CLI `{env:...}` placeholders, and the **pinned Ed25519 catalog public key** (expected). | — (clean) | None needed. Report only. |
| 2 | Playground conversation transcripts (`messages_json` — full prompts, system prompts, completions) persisted in SQLite with no off switch. | High | **Fixed.** New `PRIVACY_MODE=1` env flag: `POST/PUT /api/conversations` now return 403; a redacted test suite covers it. Documented in `docs/env/01-variables.md`. |
| 3 | Request analytics wrote per-request rows (model, tokens, latency, client IP, user-agent) to `requests`/`request_attempts` with a 90-day default retention. Metadata only — no bodies — but still profiling data. | Medium | **Fixed.** `PRIVACY_MODE=1` skips `logRequest()` and `persistRequestAttempts()` entirely; default retention cut from **90 → 30 days** (`request-retention.ts`, test updated). Env override (`REQUEST_ANALYTICS_RETENTION_DAYS`) unchanged. |
| 4 | Response cache (opt-in) held completions in an in-memory LRU; idempotency stored full `response_body` blobs in SQLite when clients sent `Idempotency-Key`. | Medium | **Fixed.** Both now honour `PRIVACY_MODE=1` (`isCacheEnabled()` returns false; idempotency store/lookup become no-ops). Idempotency otherwise left as-is — it only stores blobs when the *caller* opts in per request with a TTL sweep. |
| 5 | `lib/error-redaction.ts` (provider error strings sent to clients **and stored** in `requests.error`) only redacted `sk-`, `gsk_`, `AIza`, `freellmapi-` prefixes — Cerebras (`csk-`), NVIDIA (`nvapi-`), HuggingFace (`hf_`), Cloudflare (`cfut_`), Pollinations (`sk_`), GitHub (`ghp_`/`github_pat_`), Vercel (`vck_`), Chutes (`cpk_`), Requesty (`rqsty-sk-`), Aion (`alv2_`) keys with short suffixes could leak verbatim into API error responses and the DB. | High | **Fixed.** Prefix list aligned with the broader `log-redaction.ts` set. Existing error-redaction tests pass. |
| 6 | Non-loopback bind (`HOST=0.0.0.0`) exposed the admin API to the whole network with no boot warning; SECURITY.md calls this "expected behaviour, not a vulnerability". | Medium | **Fixed.** Startup now prints a loud `SECURITY WARNING` banner naming the bound host whenever it isn't loopback (`127.x`, `::1`, `localhost`). Default bind remains loopback-only. |
| 7 | Dev-fallback encryption key in production. | — (already handled) | **Verified pre-existing.** `crypto.ts` refuses to boot with `NODE_ENV=production` without a valid `ENCRYPTION_KEY`; only the auto-generated-file/in-memory fallbacks exist for dev, each with a console warning. |
| 8 | Catalog sync (twice-daily poll of `api.freellmapi.co`) — was signature verification actually enforced? | — (verified enforced) | **Verified.** `catalog-sync.ts` throws (discards response) when the `x-catalog-signature` header is missing or Ed25519 verification against the pinned pubkey fails. Note: `CATALOG_PUBKEY` env can override the trust anchor — an explicit operator choice, documented. Can be disabled with `CATALOG_SYNC_DISABLED=1`. |
| 9 | `routes/update.ts` `execFile` — command injection? | — (verified safe) | Only invocation is `git rev-parse HEAD` with fixed binary + fixed args; no user-controlled input reaches it. |
| 10 | Dependency audit (`npm audit` in server/client/cli). | Low (unverified) | **Blocked by sandbox registry policy** (`POST /-/npm/v1/security/audits/quick → policy_denied`). Residual: run `npm audit` on the operator's network. `npm install` completed with no new deprecation errors beyond upstream's pinned set. No dependencies added or changed by this pass. |
| 11 | Update check (`routes/update.ts`) phones home to GitHub. | Low | **Verified opt-in**: absent/`≠'1'` setting means off, 6-hour cache caps calls at 4/day. Left as-is. |
| 12 | `requests.client_ip` column + `REQUEST_ANALYTICS_LOG_CLIENT` — caller IP stored by default. | Low | Covered by #3 (`PRIVACY_MODE`) and pre-existing `REQUEST_ANALYTICS_LOG_CLIENT=false` toggle. Documented, no code change. |

## Residual risks (not fixable without redesign)

- **Prompts necessarily leave the box.** This is a proxy: every request body is decrypted in memory and sent to the operator's chosen third-party providers with their own retention policies. No code in this repo can change that.
- **A stolen DB + ENCRYPTION_KEY = all provider keys.** AES-256-GCM at rest protects against file theft only if the key file is stored separately and backed up safely. Operators must guard `ENCRYPTION_KEY` / `.encryption-key` and encrypted backups.
- **Single maintainer, large attack surface.** ~200k lines, 34 provider adapters, auto-updating signed catalog feed. The signature enforcement (#8) is real, but supply-chain trust still reduces to one maintainer's signing key.

## Files changed

- `server/src/lib/privacy.ts` (new) — `isPrivacyMode()` gate
- `server/src/lib/request-log.ts` — skip analytics writes in privacy mode
- `server/src/routes/conversations.ts` — 403 transcript writes in privacy mode
- `server/src/services/cache.ts` — cache forced off in privacy mode
- `server/src/services/idempotency.ts` — no response-body persistence in privacy mode
- `server/src/services/request-retention.ts` — default retention 90→30 days
- `server/src/lib/error-redaction.ts` — full provider-key prefix redaction
- `server/src/index.ts` — loud non-loopback bind warning at boot
- `server/src/__tests__/lib/privacy.test.ts` (new) — 6 tests
- `server/src/__tests__/services/request-retention.test.ts` — updated default expectation
- `docs/env/01-variables.md` — `PRIVACY_MODE` documented; retention default corrected

## Tests

- `npx tsc --noEmit` (server): clean
- vitest: privacy (6), request-retention, conversations, cache, idempotency, error-redaction — **77/77 pass**
