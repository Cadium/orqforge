# Orqforge

Orqforge is a lightweight deployment orchestration prototype inspired by modern PaaS systems. It packages source acquisition, image builds, container runtime, ingress, and deployment visibility into a single local-first control plane.

## Current Status

Orqforge currently includes:

- a TypeScript control plane API
- SQLite-backed deployment and log persistence
- SSE log streaming with backlog replay
- source materialization for sample apps, Git URLs, and uploaded archives
- a Railpack-shaped build adapter
- a Docker runtime adapter
- a Caddy ingress adapter with dynamic route snippets
- a Vite + TanStack one-page dashboard

The main remaining work is final end-to-end hardening, submission polish, and Brimble feedback packaging.

## Prerequisites

- Docker and Docker Compose
- internet access during the first `docker compose up`

The first startup needs internet access because:

- the API container installs `docker-cli` and `railpack`
- the workspace installs `pnpm` dependencies
- Compose pulls its base images

No external accounts or paid services are required.

## Repository Structure

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

## Local Verification

### 1. Install and verify the workspace

```bash
pnpm install --no-frozen-lockfile
pnpm typecheck
pnpm test
```

### 2. Start the full Orqforge stack

```bash
docker compose -f infra/compose/docker-compose.yml up
```

This is intended to start:

- `api` for the control plane
- `web` for the Vite dashboard
- `caddy` as the single ingress point on [http://localhost:8080](http://localhost:8080)
- `buildkitd` for Railpack-backed image builds

### 3. Open the dashboard

Open [http://localhost:8080](http://localhost:8080) and create a deployment from:

- the bundled `hello-node` sample app
- a Git URL
- an uploaded `.zip`, `.tar`, `.tgz`, or `.tar.gz` archive

### 4. Manual API smoke path

Health check:

```bash
curl http://localhost:8080/api/health
```

Create the sample deployment directly:

```bash
curl -X POST http://localhost:8080/api/deployments \
  -H "content-type: application/json" \
  -d '{"sourceKind":"sample","sourceRef":"hello-node"}'
```

List deployments:

```bash
curl http://localhost:8080/api/deployments
```

Fetch persisted logs:

```bash
curl http://localhost:8080/api/deployments/<deployment-id>/logs
```

Stream live logs:

```bash
curl -N http://localhost:8080/api/deployments/<deployment-id>/logs/stream
```

### Expected end-to-end flow

On a machine with Docker available, Orqforge should:

1. accept a source input
2. materialize a workspace
3. build an image with Railpack
4. start a Docker container
5. write a Caddy route snippet
6. verify the route
7. expose the app under `http://localhost:8080/apps/<deployment-slug>`

## Principles

- No handwritten Dockerfiles for app builds
- SQLite by default
- Caddy as the single ingress point
- Docker as the local runtime
- SSE for live log streaming unless implementation evidence forces a change
- Clean architecture boundaries between domain, application, and infrastructure

## Notes and Tradeoffs

- Orqforge uses path-based routing for deployed apps to avoid local DNS or `/etc/hosts` edits.
- Logs are persisted first and streamed second so refreshes do not lose deployment history.
- The backend is intentionally adapter-driven so Docker, Railpack, Caddy, and source handling remain replaceable.
- The current Compose stack favors clarity over startup speed because the API container installs a few system dependencies on first boot.

## Submission Notes

The final submission package will also include:

- architecture overview
- API walkthrough
- test strategy
- tradeoffs and future improvements
- Brimble deployment feedback
