import { timingSafeEqual } from 'crypto';
import type { NextRequest } from 'next/server';

/**
 * Verifies the `Authorization: Bearer <CRON_SECRET>` header using a constant-time
 * comparison. A plain `!==` string comparison leaks timing information proportional
 * to the number of matching leading bytes, which is avoidable here at zero cost.
 */
export function verifyCronSecret(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  const authHeader = req.headers.get('authorization');
  if (!secret || !authHeader) return false;

  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(authHeader);
  if (expected.length !== actual.length) return false;

  return timingSafeEqual(expected, actual);
}
