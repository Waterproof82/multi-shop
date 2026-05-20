# Telegram Notifications Specification

## Purpose

This specification defines the requirements for sending order notifications via Telegram, replacing the previous WhatsApp integration. The system MUST ensure secure, sanitized, and reliable message delivery to Telegram.

---

## Requirements

### Requirement: Telegram Notification Integration

The system **MUST** send order notifications to Telegram using a secure API endpoint. The notification **SHALL** include:
- Order number and ID
- Customer details (sanitized)
- Order items and total
- Delivery address (sanitized)

The message **SHALL** be formatted in **Markdown** for proper rendering in Telegram.

#### Scenario: Successful Telegram Notification

- **GIVEN** A valid order is created via the `/api/pedidos` endpoint
- **WHEN** The order is successfully saved in Supabase
- **THEN** A POST request is sent to `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage` with:
  - `chat_id`: `TELEGRAM_CHAT_ID`
  - `text`: Sanitized Markdown message
  - `parse_mode`: `Markdown`
- **AND** The response from Telegram **MAY** be logged but **SHALL NOT** affect order processing

#### Scenario: Telegram API Failure

- **GIVEN** A valid order is created
- **WHEN** The Telegram API returns a non-200 status
- **THEN** The system **MUST** log the error
- **AND** The system **SHALL** continue processing the order
- **AND** The system **SHALL NOT** return an error to the client

#### Scenario: Sanitization Failure

- **GIVEN** An order with special characters or Markdown syntax in customer details
- **WHEN** The sanitization function is called
- **THEN** The system **MUST** sanitize the input to prevent injection
- **AND** The system **SHALL** replace invalid characters with safe alternatives

---

### Requirement: Rate Limiting (Optional)

The system **SHOULD** implement rate limiting for the `/api/pedidos` endpoint if `UPSTASH_REDIS_URL` is configured. The rate limit **SHALL** be:
- **1 request per minute per IP/email**
- **SHALL NOT** block legitimate users if Redis is unavailable

#### Scenario: Rate Limiting Enabled

- **GIVEN** `UPSTASH_REDIS_URL` is set
- **WHEN** A user submits more than 1 order in 60 seconds
- **THEN** The system **SHALL** reject the excess requests
- **AND** The system **SHALL** return a `429 Too Many Requests` response

#### Scenario: Rate Limiting Disabled

- **GIVEN** `UPSTASH_REDIS_URL` is **NOT** set
- **WHEN** A user submits multiple orders
- **THEN** The system **SHALL** process all orders without rate limiting

---

### Requirement: Error Handling and Logging

The system **MUST**:
- Log all Telegram API errors with details (e.g., HTTP status, response body)
- **SHALL NOT** expose sensitive information in logs
- **SHALL** return a `200 OK` response to the client regardless of Telegram's success

#### Scenario: Critical Telegram Error

- **GIVEN** Telegram API returns a `500 Internal Server Error`
- **WHEN** The system logs the error
- **THEN** The system **MUST** continue processing the order
- **AND** The system **SHALL** log the error with a severity level of `ERROR`

---

### Requirement: Frontend Feedback

The frontend **MUST** display a minimal success message after order submission, including:
- Title: `¡Pedido Recibido!` or `¡Marchando a la cocina!`
- Order number
- A `Cerrar` button to clear the cart and close the drawer

The system **SHALL NOT** display any WhatsApp-related links or buttons.

#### Scenario: Successful Order Submission

- **GIVEN** An order is successfully submitted
- **WHEN** The frontend receives a `200 OK` response
- **THEN** The system **MUST** show a success message with the order number
- **AND** The system **SHALL** clear the cart and close the drawer

#### Scenario: Frontend Error Handling

- **GIVEN** The `/api/pedidos` endpoint returns a `500` error
- **WHEN** The frontend handles the error
- **THEN** The system **SHALL** display a user-friendly error message
- **AND** The system **SHALL NOT** expose technical details to the user

---

### Requirement: Environment Variables

The system **MUST** require the following environment variables:
- `TELEGRAM_BOT_TOKEN`: Telegram bot token for API access
- `TELEGRAM_CHAT_ID`: Chat ID where notifications are sent
- **(Optional)** `UPSTASH_REDIS_URL`: Redis URL for rate limiting

#### Scenario: Missing Environment Variables

- **GIVEN** `TELEGRAM_BOT_TOKEN` or `TELEGRAM_CHAT_ID` is missing
- **WHEN** The system starts
- **THEN** The system **MUST** fail gracefully and log a warning
- **AND** The system **SHALL NOT** allow order notifications to proceed

---

### Requirement: Sanitization of User Input

All user-provided data (e.g., names, addresses, comments) **MUST** be sanitized before being included in Telegram messages. The sanitization **SHALL**:
- Remove or escape Markdown syntax
- Replace special characters with safe alternatives
- **SHALL NOT** allow HTML or script injection

#### Scenario: Sanitization of Special Characters

- **GIVEN** A customer name contains `*bold*` or `_italic_`
- **WHEN** The sanitization function processes the input
- **THEN** The system **MUST** escape or replace these characters
- **AND** The system **SHALL** ensure the final message is safe for Markdown rendering

---

## Risks and Mitigations

| Risk                          | Mitigation                                                                 |
|-------------------------------|-----------------------------------------------------------------------------|
| Telegram API rate limits     | Implement exponential backoff for retries                                 |
| Sanitization bypass           | Use a dedicated sanitization library (e.g., `sanitize-html`)               |
| Redis dependency failure      | Make rate limiting optional and log warnings if Redis is unavailable      |
| Log exposure                  | Avoid logging sensitive data (e.g., emails, phone numbers)                |

---

## Test Scenarios

| Test Case                     | Description                                                                 |
|-------------------------------|-----------------------------------------------------------------------------|
| **Happy Path**               | Verify Telegram notification is sent successfully for a valid order.      |
| **Telegram API Failure**     | Ensure the system logs errors and continues processing the order.         |
| **Sanitization Edge Cases**   | Test with special characters, Markdown syntax, and HTML tags.              |
| **Rate Limiting**             | Verify rate limiting works when Redis is enabled and disabled.             |
| **Frontend Feedback**         | Confirm the success message and cart clearing functionality.               |
| **Missing Environment Vars** | Ensure the system fails gracefully if required variables are missing.     |

---

## Dependencies

- **Telegram API**: Bot token and chat ID must be configured.
- **Upstash Redis**: Optional for rate limiting.
- **Zod**: For input validation.
- **Result<T, AppError>**: For consistent error handling.

---

## Rollback Plan

1. **Revert Telegram Logic**: Remove the Telegram notification logic from the `PedidoUseCase`.
2. **Remove Environment Variables**: Comment out or remove `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` from `.env`.
3. **Update Frontend**: Restore WhatsApp-related UI elements if needed.
4. **Document Changes**: Update `README.md` and `env.md` to reflect the rollback.

---

## Notes

- All messages sent to Telegram **MUST** be sanitized to prevent injection attacks.
- The system **SHALL** prioritize order processing over notification delivery.
- Logs **SHALL** be auditable and secure, with no exposure of sensitive data.