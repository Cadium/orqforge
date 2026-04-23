# ADR 0002: SQLite as the default control plane database

## Status

Accepted

## Context

The assignment requires a clean-machine local setup with zero external accounts or services.

## Decision

Use SQLite as the default and only database for Orqforge.

## Why

- It keeps `docker compose up` simple.
- It is sufficient for single-node deployment metadata and log persistence.
- It reinforces local-first reviewer ergonomics.
- It avoids introducing Postgres complexity that does not materially improve the submission.

## Tradeoffs

- Lower concurrency ceiling than a networked database.
- Requires discipline around write patterns and WAL mode for smooth log ingestion.

