# Orqforge Web

This app will contain the Orqforge one-page deployment dashboard built with:

- Vite
- React
- TanStack Router
- TanStack Query

The UI responsibilities are intentionally narrow:

- create deployments from Git URLs or uploaded archives
- list deployments and statuses
- display image tags and live URLs
- stream deployment logs live over SSE
- replay persisted logs after refresh

