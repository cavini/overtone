# ADR 0008 — The browser uploads audio directly to object storage

**Date:** 2026-10-07 · **Status:** accepted

## Context
Audio files are big: an hour of MP3 is 30–60 MB, WAV far more. Routing those bytes through the application server means multipart buffering, request-size limits, memory pressure, and — on serverless hosting — execution timeouts on exactly the slow connections that need patience most.

## Decision
`POST /api/recordings` creates the row and returns a short-lived presigned URL. The browser PUTs the bytes straight to Cloudflare R2 and then calls `POST /api/recordings/:id/complete`. **The application server never touches audio bytes.**

## Consequences
- File size stops being an application concern. The upload limit is a product decision, not a platform constraint.
- Native browser upload progress, and resumable uploads later, with no server work.
- The server stays stateless and cheap, which is what makes serverless hosting viable.
- Validation must happen *after* upload, in `/complete` — we probe the blob for real duration, format and size rather than trusting the client. That is a test case, not an afterthought.
- An orphaned-blob window exists if a client uploads and never confirms. Swept by a scheduled job that deletes unconfirmed blobs older than 24 hours.
- Local development needs a `BlobStore` filesystem adapter so no cloud account is required to run the app. Already required by ADR 0004's testing posture.
