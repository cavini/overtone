# ADR 0003 — PostgreSQL is the only stateful service

**Date:** 2026-10-07 · **Status:** accepted

## Context
The roadmap needs relational data, full-text search over transcripts, time-series aggregation, a durable job queue for multi-minute transcription, and — for the future AI assistant — vector similarity search. The reflex is one specialised service each: Postgres + Elasticsearch + Redis + Pinecone.

## Decision
Postgres 16 does all five: tables, `tsvector` + GIN for search, `date_trunc` + window functions for trends, `pg-boss` for the queue, `pgvector` for embeddings when we get there.

## Consequences
- One service to run, back up, migrate and reason about. For a solo developer this dominates every per-component benchmark.
- Transactional enqueue: a recording row and its job are committed atomically. No "job exists for a row that doesn't."
- Integration tests run against a real Postgres in Docker — no mocking the layer where half the logic lives.
- We accept ceilings. `pg-boss` is not BullMQ at high throughput; `tsvector` is not Elasticsearch at scale; `pgvector` is not a dedicated vector DB at tens of millions of embeddings. All are far beyond our horizon, and each can be swapped independently behind its port when a real number says so — not before.
