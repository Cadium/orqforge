# Orqforge

A lightweight deployment orchestration prototype. Push source, watch a pipeline turn it into a running container behind Caddy, stream the build logs live.

---

## Quick start

```bash
docker compose -f infra/compose/docker-compose.yml up
```

Open [http://localhost:8080](http://localhost:8080).

**First boot takes 2–3 minutes.** The API container installs system packages (`docker.io`, `git`, `curl`), downloads and installs Railpack, and runs `pnpm install` across the workspace. All of this is cached in named Docker volumes — subsequent boots take ~30 seconds.

**Prerequisites**

- Docker Desktop (or Docker Engine + Compose v2)
- Internet access on first boot (pulls base images, installs Railpack)
- No external accounts or paid services required

---

## Running and verifying

### Step 1 — Start the stack

```bash
docker compose -f infra/compose/docker-compose.yml up
```

Wait until you see log lines from all four services. The API is ready when you see:

```
api  | Server listening at http://0.0.0.0:4000
```

### Step 2 — Confirm services are up

| Service | URL | Expected response |
|---|---|---|
| Web dashboard | http://localhost:3000 | Vite dev server HTML |
| API health | http://localhost:4000/api/health | `{"status":"ok"}` |
| Caddy proxy | http://localhost:8080 | Dashboard (proxied) |

```bash
curl http://localhost:8080/api/health
# → {"service":"orqforge-api","status":"ok","timestamp":"..."}
```

### Step 3 — Deploy the sample app

1. Open [http://localhost:8080](http://localhost:8080)
2. Click **Deploy** — the modal opens with the **Sample** tab active and `hello-node` pre-selected
3. Click **Deploy** — a new deployment card appears in the sidebar with an amber pulsing status dot

### Step 4 — Watch the pipeline

The log terminal streams each stage in real time:

```
materializing_source  →  Copied sample app 'hello-node' into workspace
building_image        →  Railpack 0.23.0 / Detected Node / BuildKit progress
starting_container    →  docker run …
configuring_ingress   →  Caddy route written and reloaded
verifying_route       →  HTTP probe succeeded
```

The whole pipeline takes about 60–90 seconds on first run (BuildKit pulls the Railpack builder image). Subsequent deployments reuse the BuildKit layer cache and finish in ~15 seconds.

### Step 5 — Confirm the deployment is running

The status badge in the sidebar and hero header both turn **green** (Running). The hero header shows an **Open app ↗** button.

Click **Open app ↗** — your browser lands on:

```
http://localhost:8080/apps/<slug>/
```

You should see:

```json
{"app":"orqforge-hello-node","status":"ok","message":"Hello from the Orqforge sample app."}
```

### CLI smoke test (no browser)

```bash
# Create a deployment
ID=$(curl -s -X POST http://localhost:8080/api/deployments \
  -H "content-type: application/json" \
  -d '{"sourceKind":"sample","sourceRef":"hello-node"}' \
  | jq -r '.deployment.id')

# Stream logs
curl -N "http://localhost:8080/api/deployments/$ID/logs/stream"

# Once status is running, hit the app
SLUG=$(curl -s "http://localhost:8080/api/deployments/$ID" | jq -r '.deployment.slug')
curl "http://localhost:8080/apps/$SLUG/"
```

---

## What it does

Orqforge accepts a source input, materializes it into a workspace, builds a container image with Railpack (no handwritten Dockerfiles), starts the container via Docker, writes a Caddy route snippet, and verifies the route is reachable. The whole pipeline is visible in the dashboard as it runs, with logs streaming live over SSE.

```
source input  →  workspace  →  Railpack build  →  docker run  →  Caddy route
                                                                        ↓
                                                      http://localhost:8080/apps/<slug>
```

---

## Using the dashboard

**Create a deployment** — choose a source type:

| Type | What it accepts |
|---|---|
| Sample | The bundled `hello-node` app (good for a first test) |
| Git | Any public Git URL; the repo is cloned into a workspace |
| Archive | A `.zip`, `.tar`, `.tgz`, or `.tar.gz` upload |

**Deployment list** — all deployments with live status badges. Click to inspect.

**Selected deployment panel** — stage, image tag, container name, route, source, updated-at.

**Log console** — backlog is replayed on selection, then new events stream over SSE in real time. Auto-scroll tracks the tail; scroll up to pause.

---

## Service ports and routing

| Address | What it is |
|---|---|
| `http://localhost:3000` | Vite dev server (web) — direct, bypasses Caddy |
| `http://localhost:4000` | Fastify API — direct, bypasses Caddy |
| `http://localhost:8080` | Caddy reverse proxy — the main entry point |
| `http://localhost:8080/api/*` | Caddy → API |
| `http://localhost:8080/apps/<slug>/` | Caddy → deployed container |

Deployed apps are proxied at a path prefix, no DNS edits needed:

```
http://localhost:8080/apps/<slug>/
```

The Caddy config hot-reloads snippet files from `infra/caddy/routes/` — one `.caddy` file per deployment, written by the ingress adapter. Caddy also exposes its admin API on port 2019 within the Docker network so the API can trigger live reloads without restarting Caddy.

---

## Repository layout

```
apps/
  api/        Fastify control plane — executor, adapters, SSE, SQLite
  web/        Vite + TanStack Router/Query dashboard
docs/
  architecture.md
  api.md
  decisions/
infra/
  caddy/      Caddyfile + hot-loaded route snippets
  compose/    docker-compose.yml
packages/
  shared/     Shared TypeScript types (Deployment, DeploymentLogEntry, …)
sample-apps/
  hello-node/ Bundled Node app — the default smoke-test target
```

---

## API

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/health` | Health check |
| `POST` | `/api/deployments` | Create deployment |
| `GET` | `/api/deployments` | List all deployments |
| `GET` | `/api/deployments/:id` | Get deployment detail |
| `GET` | `/api/deployments/:id/logs` | Fetch persisted logs |
| `GET` | `/api/deployments/:id/logs/stream` | SSE log stream |
| `POST` | `/api/uploads` | Upload an archive |

Quick smoke path:

```bash
# health
curl http://localhost:8080/api/health

# create a sample deployment
curl -X POST http://localhost:8080/api/deployments \
  -H "content-type: application/json" \
  -d '{"sourceKind":"sample","sourceRef":"hello-node"}'

# stream logs
curl -N http://localhost:8080/api/deployments/<id>/logs/stream
```

---

## Workspace verification

```bash
pnpm install --no-frozen-lockfile
pnpm typecheck
pnpm test
```

All three must be green before running the Compose stack.

---

## Architecture notes

**Adapter-driven pipeline.** Every stage of the pipeline is a typed port with a single concrete adapter:

| Port | Adapter | Swappable with |
|---|---|---|
| `SourceMaterializer` | `DefaultSourceMaterializer` | any VCS or storage backend |
| `ImageBuilder` | `RailpackImageBuilder` | Buildpacks, Kaniko, etc. |
| `ContainerRuntime` | `DockerContainerRuntime` | Nomad, containerd, etc. |
| `IngressManager` | `CaddyIngressManager` | nginx, Traefik, etc. |
| `RouteVerifier` | `HttpRouteVerifier` | DNS check, TCP probe, etc. |

**Persist logs first, stream second.** Every log line is written to SQLite before it's published to the in-memory fan-out. SSE clients receive the full backlog on connect, then tail live events. Refreshing the page never loses history.

**Path-based routing.** Deployed apps are served under `/apps/<slug>` so no `/etc/hosts` edits or wildcard DNS are needed on a reviewer's machine.

**Serialised deployments.** The executor runs one deployment at a time. Correct and debuggable beats fake concurrency for a local orchestrator.

**SQLite by default.** One file, zero dependencies, sufficient for the workload. The database path is configurable via `DATABASE_PATH`.

---

## Deployment statuses

| User-visible status | Internal stages |
|---|---|
| `pending` | `accepted` → `materializing_source` |
| `building` | `building_image` |
| `deploying` | `starting_container` → `configuring_ingress` → `verifying_route` |
| `running` | `completed` |
| `failed` | `failed` |

---

## Debugging the pipeline

If a deployment fails, the dashboard shows the failure reason below the hero header. Cross-reference it with the log terminal, then check in this order:

1. **Railpack binary** — `docker exec <api-container> which railpack`
2. **BuildKit connectivity** — `docker exec <api-container> buildctl --addr tcp://buildkitd:1234 debug workers`
3. **Docker socket** — `docker exec <api-container> docker ps`
4. **Container network** — deployed containers must be on the `orqforge` network to be reachable from Caddy
5. **Caddy route reload** — `docker exec <caddy-container> caddy reload --config /etc/caddy/Caddyfile`
6. **Route verification** — verifier retries up to 12 times with exponential backoff; check the failure reason on the deployment

### mise / glibc compatibility (Alpine Linux)

**Symptom:** build logs contain one of:

```
fork/exec /tmp/railpack/mise/mise-...: no such file or directory
failed to run mise command '...': no such file or directory
```

**Cause:** Railpack downloads a glibc-linked `mise` binary. Alpine Linux uses musl libc and does not include the glibc ELF loader (`/lib/ld-linux-*.so.1`) by default.

**Fix:** The API container now uses `node:22-slim` (Debian Bookworm), which ships with glibc and runs the Railpack-downloaded mise binary without any shim. If you see this error on an older container, recreate it:

```bash
docker compose -f infra/compose/docker-compose.yml up --force-recreate api
```

---

## What I would do with more time

- **Build cache.** Railpack supports layer caching; passing a `--cache-from` flag and a shared cache volume would make rebuilds fast.
- **Zero-downtime redeploys.** Start the new container, verify it, update the Caddy snippet, then stop the old one. The adapter boundaries make this straightforward to add.
- **Rollback.** Image tags are persisted per deployment. Redeploy from a previous tag without rebuilding.
- **Container log tailing.** Stream `docker logs -f` output after the container starts so runtime logs appear alongside build logs.
- **Concurrent deployments.** Replace the fire-and-forget executor with a proper queue; each deployment runs in its own goroutine with a semaphore.
- **Nomad adapter.** The `ContainerRuntime` port makes swapping Docker for Nomad a matter of writing one adapter — the rest of the pipeline doesn't change.

---

## What I would rip out

- The `at-startup install` pattern in the Compose file. It works but it is slow and brittle. The right fix is a purpose-built API image that bakes in `railpack` and `docker-cli` at image build time.
- `pnpm install` inside the container on every boot. A pre-built image with the workspace already compiled eliminates startup lag and makes the reviewer experience much better.

---

## Time spent

Approximately 12–14 hours across design, architecture, implementation, and polish.
