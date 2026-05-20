# Pedido Use Case Specification

## Purpose

This specification defines the modifications to the `PedidoUseCase` to include Telegram notification logic while maintaining existing functionality for order creation.

---

## Requirements

### MODIFIED Requirement: Order Creation and Notification Flow

**Previously**: The `PedidoUseCase` created orders in Supabase and sent WhatsApp notifications.

**Updated**: The `PedidoUseCase` **MUST**:
- Create the order in Supabase as before
- **SHALL** call a new `sendTelegramNotification` function after order creation
- **SHALL NOT** send WhatsApp notifications
- **MUST** handle errors from `sendTelegramNotification` without affecting order creation

#### Scenario: Successful Order Creation with Telegram Notification

- **GIVEN** A valid order payload is received
- **WHEN** The `PedidoUseCase` executes
- **THEN** The order is saved in Supabase
- **AND** A Telegram notification is sent
- **AND** The system returns `{ success: true, numeroPedido, pedidoId }`

#### Scenario: Telegram Notification Failure

- **GIVEN** A valid order payload is received
- **WHEN** The `sendTelegramNotification` function fails
- **THEN** The system **MUST** log the error
- **AND** The order is still saved in Supabase
- **AND** The system returns `{ success: true, numeroPedido, pedidoId }`

---

### MODIFIED Requirement: Error Handling in Use Case

**Previously**: The `PedidoUseCase` returned WhatsApp-specific errors.

**Updated**: The `PedidoUseCase` **MUST**:
- Use `Result<T, AppError>` for all operations
- **SHALL NOT** expose Telegram-specific errors to the client
- **SHALL** log all errors (including Telegram failures) with appropriate severity

#### Scenario: Invalid Order Data

- **GIVEN** Invalid order data (e.g., missing required fields)
- **WHEN** The `PedidoUseCase` validates the input
- **THEN** The system **MUST** return a `400 Bad Request` with validation errors
- **AND** The order is **NOT** created

---

### MODIFIED Requirement: Frontend Response Consistency

**Previously**: The frontend expected WhatsApp-related responses.

**Updated**: The frontend **MUST** receive the same response structure regardless of notification success:
```json
{
  "success": true,
  "numeroPedido": "ORD-12345",
  "pedidoId": "123"
}
```

#### Scenario: Frontend Response Handling

- **GIVEN** The `/api/pedidos` endpoint returns a success response
- **WHEN** The frontend processes the response
- **THEN** The system **MUST** display a success message with the order number
- **AND** The system **SHALL** clear the cart and close the drawer

---

### MODIFIED Requirement: Logging and Auditability

**Previously**: Logs included WhatsApp-related details.

**Updated**: Logs **MUST** include:
- Order creation details
- Telegram notification attempts and failures
- **SHALL NOT** include sensitive data (e.g., customer emails, phone numbers)

#### Scenario: Audit Log for Failed Telegram Notification

- **GIVEN** A Telegram notification fails
- **WHEN** The system logs the error
- **THEN** The log **MUST** include:
  - Order ID
  - Error type (e.g., `TelegramAPIError`)
  - Timestamp
  - **SHALL NOT** include the bot token or chat ID

---

## Risks and Mitigations

| Risk                          | Mitigation                                                                 |
|-------------------------------|-----------------------------------------------------------------------------|
| Notification failure affects order creation | Isolate notification logic from order creation flow.                     |
| Logs expose sensitive data     | Sanitize logs and avoid including PII.                                   |
| Frontend expects WhatsApp links | Update frontend to match new response structure.                       |

---

## Test Scenarios

| Test Case                     | Description                                                                 |
|-------------------------------|-----------------------------------------------------------------------------|
| **Order Creation with Telegram Notification** | Verify order is saved and notification is sent.                          |
| **Telegram Notification Failure** | Ensure order is saved even if notification fails.                        |
| **Invalid Order Data**        | Confirm validation errors are returned without creating the order.       |
| **Frontend Response Handling** | Test that frontend displays success message and clears cart.               |
| **Logging for Failed Notifications** | Verify logs include error details without exposing sensitive data.        |

---

## Rollback Plan

1. **Revert Telegram Logic**: Remove the `sendTelegramNotification` call from the `PedidoUseCase`.
2. **Restore WhatsApp Logic**: Re-enable WhatsApp notification logic if needed.
3. **Update Frontend**: Ensure frontend handles the new response structure.
4. **Document Changes**: Update `README.md` and `env.md` to reflect the rollback.

---

## Notes

- The `PedidoUseCase` **SHALL** remain decoupled from Telegram-specific logic for easier maintenance.
- All errors from Telegram **SHALL** be logged but **SHALL NOT** affect the order creation process.
- The response structure to the frontend **MUST** remain consistent with existing contracts.