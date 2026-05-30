/**
 * Centralized API error codes
 * All API routes should use these codes instead of hardcoded strings
 */

// Authentication & Authorization errors
export const AUTH_ERRORS = {
  UNAUTHORIZED: { code: 'AUTH_001', message: 'Authentication required' },
  INVALID_TOKEN: { code: 'AUTH_002', message: 'Invalid or expired token' },
  FORBIDDEN: { code: 'AUTH_003', message: 'Access denied' },
  CSRF_REQUIRED: { code: 'AUTH_004', message: 'CSRF token required' },
  CSRF_INVALID: { code: 'AUTH_005', message: 'Invalid CSRF token' },
} as const;

// Validation errors
export const VALIDATION_ERRORS = {
  INVALID_INPUT: { code: 'VAL_001', message: 'Invalid input data' },
  MISSING_FILE: { code: 'VAL_002', message: 'No file provided' },
  FILE_TOO_LARGE: { code: 'VAL_003', message: 'File exceeds maximum size' },
  INVALID_FILE_TYPE: { code: 'VAL_004', message: 'File type not allowed' },
  MISSING_REQUIRED_FIELD: (field: string) => ({ code: 'VAL_005', message: `Missing required field: ${field}` }),
} as const;

// Server errors
export const SERVER_ERRORS = {
  INTERNAL_ERROR: { code: 'SRV_001', message: 'Internal server error' },
  CONFIG_ERROR: { code: 'SRV_002', message: 'Server configuration error' },
  STORAGE_ERROR: { code: 'SRV_003', message: 'Storage configuration error' },
  DATABASE_ERROR: { code: 'SRV_004', message: 'Database error' },
  UPLOAD_ERROR: { code: 'SRV_005', message: 'Error processing upload' },
  FORM_DATA_ERROR: { code: 'SRV_006', message: 'Error reading form data' },
} as const;

// Discount errors
export const DISCOUNT_ERRORS = {
  ALREADY_SUBSCRIBED: { code: 'DSC_001', message: 'Email already has a discount code for this store' },
  CODE_NOT_FOUND: { code: 'DSC_002', message: 'Discount code not found' },
  CODE_EXPIRED: { code: 'DSC_003', message: 'Discount code has expired' },
  CODE_ALREADY_USED: { code: 'DSC_004', message: 'Discount code has already been used' },
  EMAIL_MISMATCH: { code: 'DSC_005', message: 'Email does not match discount code' },
  FEATURE_DISABLED: { code: 'DSC_006', message: 'Welcome discount is not enabled for this store' },
} as const;

// Glovo LaaS
export const GLOVO_ERRORS = {
  GLOVO_QUOTE_FAILED:     { code: 'GLV_001', message: 'No couriers available right now' },
  GLOVO_ORDER_FAILED:     { code: 'GLV_002', message: 'Failed to create Glovo order' },
  GLOVO_NOT_CONFIGURED:   { code: 'GLV_003', message: 'Delivery service is not configured for this store' },
  GLOVO_QUOTE_EXPIRED:    { code: 'GLV_004', message: 'Delivery quote has expired' },
} as const;

// Delivery errors
export const DELIVERY_ERRORS = {
  PAYMENT_REQUIRED:           { code: 'DLV_002', message: 'The order must be paid before being assigned' },
  PAYMENT_NOT_CONFIGURED:     { code: 'DLV_003', message: 'Payment is not configured for this store' },
  DELIVERY_MIN_ORDER_NOT_MET: { code: 'DLV_004', message: 'Order total is below the minimum for home delivery' },
} as const;

// API Error response type
export interface ApiErrorResponse {
  code: string;
  message: string;
}

// Helper to create error response body
export function createErrorResponse(error: { code: string; message: string }): ApiErrorResponse {
  return { code: error.code, message: error.message };
}
