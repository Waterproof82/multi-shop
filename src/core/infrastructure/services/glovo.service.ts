/**
 * Glovo On Demand Rider API (Delivery Hero) client.
 * Uses JWT Bearer Assertion (RS256) for authentication via the DH STS.
 *
 * Staging STS:  https://sts-st.deliveryhero.io/oauth2/token
 * Prod STS:     https://sts.deliveryhero.io/oauth2/token
 * Staging API:  https://api-infra-euw.stg.ondemandrider.net
 * Prod API:     https://ondemand-api-glovoapp.deliveryhero.io
 */

import { createSign, randomUUID } from 'node:crypto';

// ─── URLs ─────────────────────────────────────────────────────────────────────

const STAGE_STS = 'https://sts-st.deliveryhero.io/oauth2/token';
const PROD_STS  = 'https://sts.deliveryhero.io/oauth2/token';
const STAGE_API = 'https://api-infra-euw.stg.ondemandrider.net';
const PROD_API  = 'https://ondemand-api-glovoapp.deliveryhero.io';

function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

function getStsUrl(): string {
  return isProduction() ? PROD_STS : STAGE_STS;
}

function getApiBaseUrl(countryCode: string): string {
  const base = isProduction() ? PROD_API : STAGE_API;
  return `${base}/${countryCode}/api/v1`;
}

// ─── Public types ─────────────────────────────────────────────────────────────

export interface GlovoCredentials {
  clientId: string;
  keyId: string;
  privateKey: string;  // RSA PEM
  vendorId: string;    // client_vendor_id for this outlet
  countryCode: string; // e.g. 'es'
}

export interface GlovoFeeEstimate {
  estimatedDeliveryFee: number; // in euros (e.g. 5.50)
}

export interface GlovoOrderResult {
  orderId: string;
  status: string;
  deliveryFee: number; // confirmed fee in euros
}

// ─── JWT assertion ────────────────────────────────────────────────────────────

function buildClientAssertion(clientId: string, keyId: string, privateKeyPem: string): string {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: keyId })).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(JSON.stringify({
    iss: clientId,
    sub: clientId,
    jti: randomUUID(),
    exp: now + 300, // 5 min — short-lived assertion
    aud: 'https://sts.deliveryhero.io',
  })).toString('base64url');
  const signingInput = `${header}.${payload}`;
  const sign = createSign('RSA-SHA256');
  sign.update(signingInput);
  sign.end();
  const signature = sign.sign(privateKeyPem, 'base64url');
  return `${signingInput}.${signature}`;
}

// ─── Token cache ──────────────────────────────────────────────────────────────

const tokenCache = new Map<string, { token: string; expiresAt: number }>();

async function getAccessToken(credentials: GlovoCredentials, empresaId: string): Promise<string> {
  const cached = tokenCache.get(empresaId);
  if (cached && Date.now() < cached.expiresAt - 30_000) return cached.token;

  const assertion = buildClientAssertion(credentials.clientId, credentials.keyId, credentials.privateKey);
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: credentials.clientId,
    client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
    client_assertion: assertion,
  });

  const response = await fetch(getStsUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!response.ok) throw new Error(`Glovo auth failed: ${response.status}`);
  const data = await response.json() as { access_token: string; expires_in: number };
  tokenCache.set(empresaId, {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  });
  return data.access_token;
}

// ─── Rate limiter (120 req/min per empresa) ───────────────────────────────────

const rateLimiter = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(empresaId: string): void {
  const now = Date.now();
  const bucket = rateLimiter.get(empresaId) ?? { count: 0, resetAt: now + 60_000 };
  if (now > bucket.resetAt) { bucket.count = 0; bucket.resetAt = now + 60_000; }
  if (bucket.count >= 118) throw new Error('GLOVO_RATE_LIMIT'); // safety margin
  bucket.count++;
  rateLimiter.set(empresaId, bucket);
}

// ─── Mock mode ────────────────────────────────────────────────────────────────

function isMockMode(): boolean {
  return process.env.GLOVO_MOCK_MODE === 'true';
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * POST /orders/fee — estimate delivery fee for a recipient location.
 */
export async function estimateDeliveryFee(
  credentials: GlovoCredentials,
  empresaId: string,
  recipient: { latitude: number; longitude: number; address: string }
): Promise<GlovoFeeEstimate> {
  if (isMockMode()) {
    await new Promise((r) => setTimeout(r, 800)); // simulate network latency
    return { estimatedDeliveryFee: 3.5 };
  }
  checkRateLimit(empresaId);
  const token = await getAccessToken(credentials, empresaId);

  const response = await fetch(`${getApiBaseUrl(credentials.countryCode)}/orders/fee`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      sender: { client_vendor_id: credentials.vendorId },
      recipient: {
        name: 'Customer',
        phone_number: '+34000000000',
        location: {
          address: recipient.address,
          latitude: recipient.latitude,
          longitude: recipient.longitude,
        },
      },
      payment_method: 'PAID',
      amount: 0,
    }),
  });

  if (!response.ok) throw new Error(`Glovo fee estimate failed: ${response.status}`);
  const data = await response.json() as { estimated_delivery_fee: number };
  return { estimatedDeliveryFee: data.estimated_delivery_fee };
}

/**
 * POST /orders — create a delivery order.
 */
export async function createGlovoOrder(
  credentials: GlovoCredentials,
  empresaId: string,
  params: {
    clientOrderId: string;
    recipientName: string;
    recipientPhone: string;
    recipientAddress: string;
    recipientLatitude: number;
    recipientLongitude: number;
    paymentMethod: 'PAID' | 'CASH_ON_DELIVERY';
    amount: number;      // order total in euros
    description: string; // order summary
  }
): Promise<GlovoOrderResult> {
  if (isMockMode()) {
    await new Promise((r) => setTimeout(r, 600));
    return { orderId: `mock_${params.clientOrderId}`, status: 'ACCEPTED', deliveryFee: 3.5 };
  }
  checkRateLimit(empresaId);
  const token = await getAccessToken(credentials, empresaId);

  const response = await fetch(`${getApiBaseUrl(credentials.countryCode)}/orders`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      client_order_id: params.clientOrderId,
      sender: { client_vendor_id: credentials.vendorId },
      recipient: {
        name: params.recipientName,
        phone_number: params.recipientPhone,
        location: {
          address: params.recipientAddress,
          latitude: params.recipientLatitude,
          longitude: params.recipientLongitude,
        },
      },
      payment_method: params.paymentMethod,
      amount: params.amount,
      description: params.description,
    }),
  });

  if (!response.ok) throw new Error(`Glovo order creation failed: ${response.status}`);
  const data = await response.json() as { order_id: string; status: string; delivery_fee: number };
  return {
    orderId: data.order_id,
    status: data.status,
    deliveryFee: data.delivery_fee,
  };
}
