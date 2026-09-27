import { describe, it, expect, beforeEach } from 'vitest';
import { initDb, getDb } from '../../db/index.js';
import { isPrivacyMode } from '../../lib/privacy.js';
import { logRequest, persistRequestAttempts } from '../../lib/request-log.js';
import { isCacheEnabled } from '../../services/cache.js';
import { storeIdempotencyResult, lookupIdempotencyReplay } from '../../services/idempotency.js';

describe('privacy mode', () => {
  beforeEach(() => {
    delete process.env.PRIVACY_MODE;
    process.env.ENCRYPTION_KEY = '0'.repeat(64);
    initDb(':memory:');
  });

  it('is off by default', () => {
    expect(isPrivacyMode()).toBe(false);
  });

  it('recognises truthy values', () => {
    for (const v of ['1', 'true', 'yes', 'on', 'TRUE']) {
      process.env.PRIVACY_MODE = v;
      expect(isPrivacyMode()).toBe(true);
    }
    process.env.PRIVACY_MODE = '0';
    expect(isPrivacyMode()).toBe(false);
  });

  it('skips request analytics writes when enabled', () => {
    process.env.PRIVACY_MODE = '1';
    logRequest('openai', 'gpt-4', 1, 'success', 10, 20, 100, null);
    persistRequestAttempts({ records: [{ ordinal: 0, platform: 'openai', modelId: 'gpt-4', keyOrdinal: 1, keyLabel: 'k', outcome: 'ok', startOffsetMs: 0, durationMs: 1, errorSummary: '' }], lastRequestRowId: null } as never);
    const count = (getDb().prepare('SELECT COUNT(*) AS c FROM requests').get() as { c: number }).c;
    expect(count).toBe(0);
  });

  it('still writes request analytics when disabled', () => {
    logRequest('openai', 'gpt-4', 1, 'success', 10, 20, 100, null);
    const count = (getDb().prepare('SELECT COUNT(*) AS c FROM requests').get() as { c: number }).c;
    expect(count).toBe(1);
  });

  it('forces the response cache off when enabled', () => {
    process.env.PRIVACY_MODE = '1';
    expect(isCacheEnabled()).toBe(false);
  });

  it('does not persist idempotent replays when enabled', () => {
    process.env.PRIVACY_MODE = '1';
    storeIdempotencyResult('abc', 'fp', 200, { ok: true });
    expect(lookupIdempotencyReplay('abc', 'fp')).toEqual({ kind: 'miss' });
    const count = (getDb().prepare('SELECT COUNT(*) AS c FROM idempotency_claims').get() as { c: number }).c;
    expect(count).toBe(0);
  });
});
