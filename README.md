# Orqforge

Orqforge is a lightweight deployment orchestration prototype inspired by modern PaaS systems. It packages source acquisition, image builds, container runtime, ingress, and deployment visibility into a single local-first control plane.

This repository is being built as a take-home submission with a strong bias toward:

- a single `docker compose up` startup path
- local-only dependencies with no paid services
- durable deployment logs with live SSE streaming
- maintainable structure over demo-only shortcuts

## Repository Status

The repository is currently in the architecture and scaffolding phase. The next commits will add the backend control plane, deployment pipeline, ingress wiring, frontend, and end-to-end tests in small Conventional Commits.

## Planned Structure

```text
apps/
  api/        Orqforge control plane API and deployment orchestrator
  web/        Vite + TanStack one-page frontend
docs/
  architecture.md
  api.md
  decisions/
infra/
  caddy/
  compose/
packages/
  shared/     Shared types and contracts
sample-apps/
  hello-node/ Sample application deployed through Orqforge
```

## Principles

- No handwritten Dockerfiles for app builds
- SQLite by default
- Caddy as the single ingress point
- Docker as the local runtime
- SSE for live log streaming unless implementation evidence forces a change
- Clean architecture boundaries between domain, application, and infrastructure

## Submission Notes

The final README will include:

- setup and startup instructions
- architecture overview
- API walkthrough
- test strategy
- tradeoffs and future improvements
- Brimble deployment feedback

