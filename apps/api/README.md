# Orqforge API

This app will contain the Orqforge control plane:

- deployment creation and lifecycle management
- source materialization for Git URLs and uploaded archives
- Railpack build orchestration
- Docker runtime management
- Caddy route management
- log persistence and SSE streaming

Planned internal boundaries:

- `domain/`
- `application/`
- `infrastructure/`
- `interfaces/http/`
- `interfaces/sse/`

