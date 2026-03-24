/**
 * JWT revocation list backed by Upstash Redis.
 * Uses HTTP REST API — compatible with both Node.js and Edge Runtime (middleware).
 *
 * On logout, the token's `jti` is stored in Redis with the token's remaining TTL.
 * On every authenticated request, the proxy checks whether the `jti` is revoked
 * before allowing access.
 */

const REVOCATION_KEY_PREFIX = 'revoked_jti:';

function getRedisConfig(): { url: string; token: string } | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return { url, token };
}

async function redisRequest(
  config: { url: string; token: string },
  command: unknown[],
): Promise<unknown> {
  const res = await fetch(`${config.url}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(command),
  });
  if (!res.ok) throw new Error(`Redis request failed: ${res.status}`);
  const json = await res.json() as { result: unknown };
  return json.result;
}

/**
 * Adds a JTI to the revocation list with the given TTL in seconds.
 * No-op if Redis is not configured.
 */
export async function revokeToken(jti: string, ttlSeconds: number): Promise<void> {
  const config = getRedisConfig();
  if (!config || ttlSeconds <= 0) return;

  const key = `${REVOCATION_KEY_PREFIX}${jti}`;
  // SET key 1 EX ttl
  await redisRequest(config, ['SET', key, '1', 'EX', Math.ceil(ttlSeconds)]);
}

/**
 * Returns true if the given JTI has been revoked.
 * Returns false if Redis is not configured (fail-open — safe for graceful degradation).
 */
export async function isTokenRevoked(jti: string): Promise<boolean> {
  const config = getRedisConfig();
  if (!config) return false;

  const key = `${REVOCATION_KEY_PREFIX}${jti}`;
  const result = await redisRequest(config, ['EXISTS', key]);
  return result === 1;
}
