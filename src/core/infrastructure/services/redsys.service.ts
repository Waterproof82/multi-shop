import { createCipheriv, createHmac, timingSafeEqual } from 'node:crypto';

export interface RedsysCredentials {
  merchantCode: string;
  terminal: string;
  secretKey: string; // Base64-encoded from empresa row
}

export interface RedsysFormData {
  DS_MERCHANT_PARAMETERS: string; // Base64(JSON)
  DS_SIGNATURE: string; // HMAC-SHA256 base64
  DS_SIGNATURE_VERSION: 'HMAC_SHA256_V1';
}

/**
 * Derives the per-order HMAC key via 3DES-CBC with zero IV.
 * Redsys spec mandates zero IV — this is not a design choice.
 */
function deriveOrderKey(secretKeyBase64: string, order: string): Buffer {
  const key = Buffer.from(secretKeyBase64, 'base64');
  const iv = Buffer.alloc(8, 0); // zero IV — Redsys spec
  const cipher = createCipheriv('des-ede3-cbc', key, iv);
  cipher.setAutoPadding(false); // zero padding, not PKCS7 — Redsys spec
  // Pad order to 3DES block boundary (8 bytes) with null bytes
  const orderBytes = Buffer.from(order, 'utf8');
  const paddedLength = Math.ceil(orderBytes.length / 8) * 8;
  const padded = Buffer.alloc(paddedLength, 0);
  orderBytes.copy(padded);
  return Buffer.concat([
    cipher.update(padded),
    cipher.final(),
  ]);
}

/**
 * Generates the HMAC-SHA256 signature over the Base64-encoded parameters.
 */
function signParameters(orderKey: Buffer, paramsBase64: string): string {
  return createHmac('sha256', orderKey)
    .update(paramsBase64)
    .digest('base64');
}

/**
 * Builds Redsys redirect form data for a payment.
 * Called by initiateRedsysPaymentUseCase.
 */
export function buildRedsysFormData(
  credentials: RedsysCredentials,
  params: {
    order: string;
    amountCents: number;
    currency: '978';
    transactionType: '0';
    urlOk: string;
    urlKo: string;
    merchantName: string;
    webhookUrl: string;
  }
): RedsysFormData {
  const merchantParams = {
    DS_MERCHANT_MERCHANTCODE: credentials.merchantCode,
    DS_MERCHANT_TERMINAL: credentials.terminal,
    DS_MERCHANT_ORDER: params.order,
    DS_MERCHANT_AMOUNT: String(params.amountCents),
    DS_MERCHANT_CURRENCY: params.currency,
    DS_MERCHANT_TRANSACTIONTYPE: params.transactionType,
    DS_MERCHANT_MERCHANTURL: params.webhookUrl,
    DS_MERCHANT_URLOK: params.urlOk,
    DS_MERCHANT_URLKO: params.urlKo,
    DS_MERCHANT_MERCHANTNAME: params.merchantName,
  };

  const paramsBase64 = Buffer.from(JSON.stringify(merchantParams)).toString(
    'base64'
  );
  const orderKey = deriveOrderKey(credentials.secretKey, params.order);
  const signature = signParameters(orderKey, paramsBase64);

  return {
    DS_MERCHANT_PARAMETERS: paramsBase64,
    DS_SIGNATURE: signature,
    DS_SIGNATURE_VERSION: 'HMAC_SHA256_V1',
  };
}

/**
 * Verifies a Redsys webhook notification signature.
 * Uses timingSafeEqual for constant-time comparison.
 * Returns true if valid.
 */
export function verifyRedsysWebhook(
  secretKeyBase64: string,
  dsParameters: string, // raw Base64 from webhook body
  dsSignature: string, // raw signature from webhook body
  dsOrder: string // extracted from decoded dsParameters
): boolean {
  try {
    const orderKey = deriveOrderKey(secretKeyBase64, dsOrder);
    const expected = signParameters(orderKey, dsParameters);

    const a = Buffer.from(expected, 'base64');
    const b = Buffer.from(dsSignature, 'base64');

    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/**
 * Generates a Redsys-compatible payment order reference.
 * DS_MERCHANT_ORDER must start with at least 4 numeric digits — Redsys spec.
 * Max 12 alphanumeric chars total.
 */
export function generatePaymentOrderRef(numeroPedido: number | null | undefined): string {
  const safeNum = Number.isFinite(numeroPedido as number) ? (numeroPedido as number) : 1;
  const prefix = String(safeNum).padStart(4, '0').slice(0, 4);
  const suffix = Date.now().toString(36).toUpperCase().slice(-8);
  return `${prefix}${suffix}`.slice(0, 12);
}
