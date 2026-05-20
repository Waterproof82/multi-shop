# Pedido API Specification

## Purpose

This specification defines the modifications to the `/api/pedidos` endpoint to support Telegram notifications and remove WhatsApp-related functionality.

---

## Requirements

### MODIFIED Requirement: Endpoint Input Validation

**Previously**: The endpoint validated data for WhatsApp notifications.

**Updated**: The endpoint **MUST**:
- Validate all input using Zod schemas
- **SHALL NOT** include WhatsApp-specific fields (e.g., `companyPhone`, `detectedPlatform`)
- **MUST** ensure all user-provided data is sanitized before processing

#### Scenario: Valid Order Submission

- **GIVEN** A valid order payload without WhatsApp-related fields
- **WHEN** The endpoint receives the payload
- **THEN** The system **MUST** validate the data using Zod
- **AND** The system **SHALL** proceed to order creation

#### Scenario: Invalid Order Submission

- **GIVEN** An order payload with missing required fields
- **WHEN** The endpoint validates the payload
- **THEN** The system **MUST** return a `400 Bad Request` with validation errors
- **AND** The system **SHALL NOT** process the order

---

### MODIFIED Requirement: Telegram Notification Logic

**Previously**: The endpoint sent WhatsApp notifications.

**Updated**: The endpoint **MUST**:
- Call the `PedidoUseCase` to create the order
- **SHALL** attempt to send a Telegram notification after order creation
- **SHALL NOT** send WhatsApp notifications
- **MUST** handle Telegram API errors gracefully

#### Scenario: Successful Telegram Notification

- **GIVEN** An order is successfully created
- **WHEN** The endpoint calls `sendTelegramNotification`
- **THEN** The system **MUST** send the notification
- **AND** The system **SHALL** return a `200 OK` response

#### Scenario: Telegram Notification Failure

- **GIVEN** The Telegram API returns an error
- **WHEN** The endpoint handles the error
- **THEN** The system **MUST** log the error
- **AND** The system **SHALL** return a `200 OK` response
- **AND** The system **SHALL NOT** expose the error to the client

---

### MODIFIED Requirement: Response Structure

**Previously**: The endpoint returned WhatsApp-specific responses.

**Updated**: The endpoint **MUST** return:
```json
{
  "success": true,
  "numeroPedido": "ORD-12345",
  "pedidoId": "123"
}
```

#### Scenario: Response Handling

- **GIVEN** The endpoint returns a success response
- **WHEN** The frontend processes the response
- **THEN** The system **MUST** display a success message
- **AND** The system **SHALL** clear the cart and close the drawer

---

### MODIFIED Requirement: Rate Limiting (Optional)

**Previously**: No rate limiting was implemented.

**Updated**: The endpoint **SHOULD** implement rate limiting if `UPSTASH_REDIS_URL` is configured:
- **1 request per minute per IP/email**
- **SHALL NOT** block legitimate users if Redis is unavailable

#### Scenario: Rate Limiting Enabled

- **GIVEN** `UPSTASH_REDIS_URL` is set
- **WHEN** A user submits more than 1 order in 60 seconds
- **THEN** The system **SHALL** return a `429 Too Many Requests` response

#### Scenario: Rate Limiting Disabled

- **GIVEN** `UPSTASH_REDIS_URL` is **NOT** set
- **WHEN** A user submits multiple orders
- **THEN** The system **SHALL** process all orders without rate limiting

---

### MODIFIED Requirement: Error Handling

**Previously**: Errors were logged but not consistently handled.

**Updated**: The endpoint **MUST**:
- Log all errors with appropriate severity
- **SHALL NOT** expose sensitive information in logs or responses
- **SHALL** return `500 Internal Server Error` only for critical, permanent failures

#### Scenario: Critical Error Handling

- **GIVEN** A critical error occurs (e.g., database failure)
- **WHEN** The endpoint handles the error
- **THEN** The system **MUST** return a `500 Internal Server Error`
- **AND** The system **SHALL** log the error with severity `ERROR`

---

## Risks and Mitigations

| Risk                          | Mitigation                                                                 |
|-------------------------------|-----------------------------------------------------------------------------|
| Telegram API rate limits      | Implement exponential backoff for retries.                                |
| Rate limiting blocks users    | Make rate limiting optional and log warnings if Redis is unavailable.     |
| Logs expose sensitive data     | Sanitize logs and avoid including PII.                                   |
| Frontend expects WhatsApp links | Update frontend to match new response structure.                       |

---

## Test Scenarios

| Test Case                     | Description                                                                 |
|-------------------------------|-----------------------------------------------------------------------------|
| **Valid Order Submission**    | Verify the endpoint processes valid orders and sends Telegram notifications. |
| **Invalid Order Submission**  | Confirm validation errors are returned without processing the order.       |
| **Telegram Notification Failure** | Ensure the endpoint logs errors and continues processing.               |
| **Rate Limiting Enabled**     | Test that rate limiting works when Redis is enabled.                       |
| **Rate Limiting Disabled**    | Verify the endpoint processes orders without rate limiting.                |
| **Critical Error Handling**   | Confirm the endpoint returns `500` for critical failures.                  |

---

## Rollback Plan

1. **Revert Telegram Logic**: Remove the Telegram notification logic from the endpoint.
2. **Restore WhatsApp Logic**: Re-enable WhatsApp notification logic if needed.
3. **Update Frontend**: Ensure frontend handles the new response structure.
4. **Document Changes**: Update `README.md` and `env.md` to reflect the rollback.

---

## Notes

- The endpoint **SHALL** prioritize order creation over notification delivery.
- All errors from Telegram **SHALL** be logged but **SHALL NOT** affect the order creation process.
- The response structure to the frontend **MUST** remain consistent with existing contracts.