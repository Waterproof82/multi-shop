# Environment Variables Specification

## Purpose

This specification defines the new environment variables required for Telegram notifications and their documentation.

---

## Requirements

### Requirement: Telegram Bot Token

The system **MUST** require the `TELEGRAM_BOT_TOKEN` environment variable for:
- Authentication with the Telegram API
- Sending notifications to Telegram

#### Scenario: Telegram Bot Token Configuration

- **GIVEN** The `TELEGRAM_BOT_TOKEN` is set in `.env.local`
- **WHEN** The application starts
- **THEN** The system **MUST** use this token to authenticate with Telegram
- **AND** The system **SHALL NOT** allow order notifications to proceed if the token is missing

---

### Requirement: Telegram Chat ID

The system **MUST** require the `TELEGRAM_CHAT_ID` environment variable for:
- Specifying the destination chat for notifications
- Ensuring notifications are sent to the correct group or user

#### Scenario: Telegram Chat ID Configuration

- **GIVEN** The `TELEGRAM_CHAT_ID` is set in `.env.local`
- **WHEN** The application starts
- **THEN** The system **MUST** use this chat ID for sending notifications
- **AND** The system **SHALL NOT** allow order notifications to proceed if the chat ID is missing

---

### Requirement: Upstash Redis URL (Optional)

The system **SHOULD** support the `UPSTASH_REDIS_URL` environment variable for:
- Implementing rate limiting for the `/api/pedidos` endpoint
- Preventing spam or abuse of the order submission feature

#### Scenario: Upstash Redis URL Configuration

- **GIVEN** The `UPSTASH_REDIS_URL` is set in `.env.local`
- **WHEN** The application starts
- **THEN** The system **SHALL** implement rate limiting for order submissions
- **AND** The system **SHALL NOT** block legitimate users if Redis is unavailable

---

### Requirement: Documentation Updates

The system **MUST** update the following documentation files to include the new environment variables:
- `README.md`: High-level overview of new variables and their purpose
- `env.md`: Detailed description of each variable, including examples and usage

#### Scenario: Documentation Updates

- **GIVEN** The new environment variables are added
- **WHEN** The documentation is updated
- **THEN** The system **MUST** include:
  - A description of each variable
  - Examples of how to set them
  - Instructions for rollback if needed

---

### Requirement: Rollback Plan for Environment Variables

The system **MUST** document a rollback plan for removing the new environment variables:
1. Remove `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` from `.env.local`
2. Comment out or remove the variables from the application configuration
3. Update the documentation to reflect the removal

#### Scenario: Rollback Execution

- **GIVEN** The system needs to revert to WhatsApp notifications
- **WHEN** The rollback plan is executed
- **THEN** The system **MUST** remove the Telegram-related variables
- **AND** The system **SHALL** restore the original WhatsApp notification logic

---

## Risks and Mitigations

| Risk                          | Mitigation                                                                 |
|-------------------------------|-----------------------------------------------------------------------------|
| Missing environment variables | Ensure the system fails gracefully and logs warnings if required variables are missing. |
| Documentation is outdated      | Regularly review and update documentation to reflect changes.              |
| Rollback fails                 | Test the rollback plan thoroughly before execution.                        |

---

## Test Scenarios

| Test Case                     | Description                                                                 |
|-------------------------------|-----------------------------------------------------------------------------|
| **Missing Telegram Bot Token** | Verify the system fails gracefully if `TELEGRAM_BOT_TOKEN` is missing.     |
| **Missing Telegram Chat ID**  | Confirm the system fails gracefully if `TELEGRAM_CHAT_ID` is missing.      |
| **Upstash Redis URL Optional** | Test that rate limiting works when Redis is enabled and disabled.         |
| **Documentation Updates**     | Ensure `README.md` and `env.md` include the new variables.               |
| **Rollback Plan**             | Verify the rollback plan removes variables and restores original logic.    |

---

## Notes

- All environment variables **MUST** be documented clearly to avoid confusion.
- The system **SHALL** prioritize security by avoiding exposure of sensitive data in logs or documentation.
- The rollback plan **SHALL** be tested to ensure a smooth transition back to the previous state.