# ADR 0003: Path-based routing via Caddy

## Status

Accepted with early validation

## Context

Orqforge must expose deployed applications behind Caddy on a reviewer laptop with minimal friction.

## Decision

Start with path-based routing:

- `/` for the frontend
- `/api/*` for the API
- `/apps/{deploymentSlug}` for deployed apps

## Why

- No `/etc/hosts` edits required
- No local wildcard DNS assumptions
- Easier reviewer experience on a clean machine

## Risks

- Some apps behave poorly behind a path prefix.
- Asset loading and absolute URLs can break if the deployed app assumes root hosting.

## Mitigation

- Validate the approach early with the sample app.
- Revisit host-based routing only if implementation evidence demands it.

