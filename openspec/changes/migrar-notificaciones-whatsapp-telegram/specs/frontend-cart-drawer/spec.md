# Frontend Cart Drawer Specification

## Purpose

This specification defines the modifications to the `CartDrawer` component and order submission flow to remove WhatsApp-related functionality and display Telegram-based success feedback.

---

## Requirements

### MODIFIED Requirement: Remove WhatsApp UI Elements

**Previously**: The `CartDrawer` included WhatsApp links and buttons.

**Updated**: The `CartDrawer` **MUST**:
- **SHALL NOT** display any WhatsApp-related links (e.g., `wa.me`, `companyPhone`)
- **SHALL NOT** include copy/clipboard functionality for WhatsApp
- **MUST** remove all references to `detectedPlatform`

#### Scenario: WhatsApp UI Elements Removed

- **GIVEN** The `CartDrawer` is rendered
- **WHEN** The component loads
- **THEN** The system **MUST NOT** display any WhatsApp-related UI
- **AND** The system **SHALL** remove all WhatsApp buttons and links

---

### MODIFIED Requirement: Success Message Display

**Previously**: The `CartDrawer` showed WhatsApp confirmation messages.

**Updated**: The `CartDrawer` **MUST** display a minimal success message after order submission:
- Title: `¡Pedido Recibido!` or `¡Marchando a la cocina!`
- Order number (e.g., `ORD-12345`)
- A `Cerrar` button to clear the cart and close the drawer

#### Scenario: Success Message Display

- **GIVEN** An order is successfully submitted
- **WHEN** The frontend receives a `200 OK` response
- **THEN** The system **MUST** display the success message
- **AND** The system **SHALL** show the order number
- **AND** The system **SHALL** include a `Cerrar` button

---

### MODIFIED Requirement: Error Handling

**Previously**: The `CartDrawer` handled WhatsApp-specific errors.

**Updated**: The `CartDrawer` **MUST**:
- Handle errors from the `/api/pedidos` endpoint
- **SHALL** display user-friendly error messages
- **SHALL NOT** expose technical details to the user

#### Scenario: Error Handling

- **GIVEN** The `/api/pedidos` endpoint returns a `500` error
- **WHEN** The frontend processes the error
- **THEN** The system **MUST** display a generic error message
- **AND** The system **SHALL NOT** show the error details

---

### MODIFIED Requirement: Cart Clearing Logic

**Previously**: The `CartDrawer` cleared the cart after WhatsApp confirmation.

**Updated**: The `CartDrawer` **MUST**:
- Clear the cart after successful order submission
- Close the drawer after the `Cerrar` button is clicked
- **SHALL NOT** rely on WhatsApp confirmation for cart clearing

#### Scenario: Cart Clearing

- **GIVEN** An order is successfully submitted
- **WHEN** The success message is displayed
- **THEN** The system **MUST** clear the cart
- **AND** The system **SHALL** close the drawer when the `Cerrar` button is clicked

---

### MODIFIED Requirement: State Management

**Previously**: The `CartDrawer` managed WhatsApp-related state.

**Updated**: The `CartDrawer` **MUST**:
- Remove all WhatsApp-related state variables
- **SHALL** manage only the success message state
- **SHALL** reset the state after the `Cerrar` button is clicked

#### Scenario: State Reset

- **GIVEN** The `Cerrar` button is clicked
- **WHEN** The state is reset
- **THEN** The system **MUST** clear the success message
- **AND** The system **SHALL** reset the cart state

---

## Risks and Mitigations

| Risk                          | Mitigation                                                                 |
|-------------------------------|-----------------------------------------------------------------------------|
| Frontend expects WhatsApp links | Update all UI components to remove WhatsApp references.                |
| Error messages are unclear     | Use clear, user-friendly error messages.                                  |
| State management issues        | Ensure state is properly reset after order submission.                     |

---

## Test Scenarios

| Test Case                     | Description                                                                 |
|-------------------------------|-----------------------------------------------------------------------------|
| **WhatsApp UI Elements Removed** | Verify no WhatsApp links or buttons are displayed.                        |
| **Success Message Display**   | Confirm the success message and order number are shown.                    |
| **Error Handling**            | Test that errors are displayed without exposing technical details.         |
| **Cart Clearing**             | Ensure the cart is cleared after successful order submission.              |
| **State Reset**               | Verify the state is reset after clicking the `Cerrar` button.               |
| **Frontend API Error Handling** | Test that frontend handles API errors gracefully.                         |

---

## Rollback Plan

1. **Restore WhatsApp UI Elements**: Re-add WhatsApp links and buttons to the `CartDrawer`.
2. **Update Success Message**: Restore WhatsApp confirmation messages.
3. **Update Error Handling**: Revert error handling to include WhatsApp-specific logic.
4. **Document Changes**: Update frontend documentation to reflect the rollback.

---

## Notes

- The `CartDrawer` **SHALL** focus on displaying success feedback and clearing the cart.
- All UI elements related to WhatsApp **MUST** be removed to ensure consistency.
- Error messages **SHALL** be user-friendly and avoid exposing technical details.