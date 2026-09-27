/**
 * Privacy mode gate.
 *
 * When PRIVACY_MODE=1 the server stores metadata-free minimal state:
 *  - request analytics (`requests`, `request_attempts`, hourly aggregates) are
 *    not written at all,
 *  - playground conversation persistence is disabled (POST/PUT return 403).
 *
 * Provider API keys are still needed to serve traffic (they are encrypted at
 * rest with ENCRYPTION_KEY), but nothing about the operator's prompts,
 * completions, or request history touches SQLite. In normal mode the
 * requests table records metadata (model, tokens, latency, client IP);
 * privacy mode skips those writes too.
 */

const TRUTHY = new Set(['1', 'true', 'yes', 'on']);

/** True when the operator opted into zero-retention privacy mode. */
export function isPrivacyMode(): boolean {
  const raw = process.env.PRIVACY_MODE;
  return raw != null && TRUTHY.has(raw.trim().toLowerCase());
}
