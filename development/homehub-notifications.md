# HomeHub Notifications

This document defines the first custom HomeHub feature on top of the Homarr fork.

## Goal

Use HomeHub as the central daily dashboard while sending important events to Telegram and other channels. Notification handling must be fully configurable from the UI rather than hard-coded.

## Core behavior

Every incoming event is normalized to:

- source
- sender
- title
- message
- severity
- category
- account/reference
- tags
- timestamp
- metadata

Rules are evaluated by priority. Each rule can match all or any conditions and can stop further processing.

Supported matching:

- source
- sender / phone number / sender ID
- title
- message text
- severity
- category
- account
- tags
- equals / contains / starts with / ends with / regex / in list
- case-sensitive or case-insensitive
- negated conditions

Supported actions:

- send to one or more channels
- ignore
- archive without sending
- set severity
- add tag
- set category

## Planned channels

- Telegram
- HomeHub notification center
- email
- generic webhook
- ntfy
- Gotify

Telegram is the first outbound channel.

## Ignore rules

The UI must make noisy notifications easy to suppress without deleting history.

Examples:

- Ignore sender `DialogPromo`
- Ignore phone number `+94...`
- Ignore any message containing `promotion`
- Ignore OTP messages
- Ignore a sender only during selected hours
- Keep ignored notifications visible in history

## Telegram configuration

Settings will include:

- bot token stored as a secret
- chat ID / topic ID
- enabled toggle
- test notification button
- message template
- per-category routing
- minimum severity
- quiet hours
- retry behavior

The UI must never render a saved bot token back in full.

## Notification history

Each event should eventually record:

- original payload
- normalized payload
- received time
- source
- matched rules
- final disposition
- delivery channels
- delivery status
- sent time
- error text
- read/unread
- ignored reason

Ignored events should remain queryable when `keepIgnoredInHistory` is enabled.

## Initial package

`packages/homehub-notification-engine` contains the provider-independent rule engine. UI, persistence, ingestion endpoints, and Telegram delivery will sit around this package.

This separation is deliberate so the same rules can process:

- n8n webhooks
- email-derived bills
- server monitoring
- Docker alerts
- Home Assistant events
- SMS forwarding
- application alerts

without coupling rules to one source or one delivery service.

## Next implementation stages

1. Database schema for channels, rules, notification history, and deliveries.
2. HomeHub Settings UI for Telegram and rule management.
3. Test Telegram message action.
4. Authenticated ingestion API for n8n and other services.
5. Notification Center widget.
6. Scheduled quiet hours and digest mode.
7. Import/export of notification configuration.
