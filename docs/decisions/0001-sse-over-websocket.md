# ADR 0001: SSE over WebSocket for log streaming

## Status

Accepted

## Context

Orqforge needs real-time build and deploy logs in the browser, plus durable replay after refresh.

## Decision

Use Server-Sent Events for live log streaming.

## Why

- The traffic pattern is one-way from server to browser.
- SSE is simpler to reason about, debug, and proxy through standard HTTP.
- Browser reconnection behavior is good enough for deployment log tails.
- The API can replay stored logs first, then append live events on the same stream.

## Tradeoffs

- Less flexible than bidirectional WebSockets.
- Requires a separate write path for create/cancel actions, which is acceptable here.

