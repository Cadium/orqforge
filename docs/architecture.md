# Orqforge Architecture

## Goal

Orqforge is a small local-first deployment control plane that accepts source, builds an image with Railpack, runs the resulting container with Docker, and exposes it behind Caddy. The system prioritizes correctness, inspectability, and reviewer ergonomics over breadth.

## High-Level Components

- `apps/web`: single-page deployment UI
- `apps/api`: TypeScript control plane and orchestrator
- `infra/caddy`: reverse proxy and deployment ingress
- `SQLite`: persistence for deployments, events, and logs
- `Docker`: build and runtime substrate
- `sample-apps/hello-node`: end-to-end validation target

## Architecture Shape

Orqforge is intentionally split into:

- `domain`: deployment entities, lifecycle rules, log ordering
- `application`: use cases and orchestration services
- `infrastructure`: Docker, Railpack, SQLite, filesystem, Caddy adapters
- `interfaces`: HTTP and SSE delivery

HTTP handlers should not directly shell out, mutate Caddy config, or write deployment logs. Those behaviors belong to infrastructure adapters invoked through application services.

## Deployment Lifecycle

User-facing statuses:

- `pending`
- `building`
- `deploying`
- `running`
- `failed`

Internal execution stages:

- `accepted`
- `materializing_source`
- `building_image`
- `starting_container`
- `configuring_ingress`
- `verifying_route`
- `completed`
- `failed`

This split keeps the UI simple while preserving richer operational diagnostics.

## Logs

The core rule is: persist logs first, stream second.

- build and deploy output is appended to SQLite as ordered log records
- SSE replays persisted backlog first
- SSE then tails live log events
- users can refresh the page without losing deploy history

## Routing

Orqforge will start with path-based routing through Caddy to avoid reviewer laptop DNS setup. The planned shape is:

- `/` for the frontend
- `/api/*` for the API
- `/apps/{deploymentSlug}` for deployed applications

If early spikes show path-prefix incompatibility with the sample app or Railpack output, host-based local routing can be reconsidered.

## Concurrency

The first implementation will serialize deployments by default. This reduces runtime collisions across:

- SQLite log writes
- Docker build and run operations
- Caddy route updates
- temporary workspace management

This is a deliberate tradeoff in favor of determinism and reviewer confidence.

