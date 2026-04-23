# Orqforge API Draft

## Resources

### `POST /api/deployments`

Create a deployment from either:

- a Git URL
- an uploaded source archive
- a sample app shortcut used for local validation

Response shape:

- deployment id
- slug
- status
- source metadata
- timestamps

### `GET /api/deployments`

Return the current deployment list with:

- status
- live URL
- built image tag
- created and updated timestamps

### `GET /api/deployments/:id`

Return one deployment and its operational metadata.

### `GET /api/deployments/:id/logs`

Return persisted log backlog in deterministic order.

### `GET /api/deployments/:id/logs/stream`

SSE endpoint that:

1. replays persisted backlog
2. streams live log events
3. emits status changes and terminal completion

## API Principles

- asynchronous deployment creation with immediate persistence
- durable deployment and log state in SQLite
- explicit validation for request payloads
- no polling-based log updates

