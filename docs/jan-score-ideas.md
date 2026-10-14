# Ideas ported from jan-score

[jan-score](https://github.com/0xVISHWAJEET/jan-score) is a sibling civic-accountability
project — representative-level scores (MP/MLA/Municipal Councillor/Sarpanch), built
independently but tackling much of the same problem space as this one: turning
scattered official data into an accountable, public score citizens can trust.

This is the record of what was actually ported into this codebase, and — just as
importantly — what was deliberately left out or left for a follow-up. See
`docs/SCOPE.md` for the equivalent honesty document about this repo's own scheme/state
tracking (idea #10, below, applied to itself).

## What's fully ported and working

- **A published, deterministic scoring methodology** (idea #1) — `src/scoring/`:
  5 weighted dimensions, source-tier + time-decay weighted evidence aggregation, an
  explicit confidence threshold below which a score is suppressed to NR (Not Rated)
  rather than guessed at. `GET /api/methodology` publishes the exact weights and
  grade table — nothing about the formula is hidden.
- **A human moderator review queue** (idea #2) — `src/routes/review_queue.ts`.
  Every piece of evidence an automated connector or the AI extraction agent produces
  is written with `needsReview = true` and is excluded from scoring
  (`src/scoring/recompute.ts` filters it out explicitly) until a moderator approves it
  via `POST /api/admin/evidence-review/:id/approve`.
- **Right of Reply** (idea #3) — `src/routes/official_responses.ts`. A representative's
  response to a specific piece of evidence is stored and shown alongside it, never
  replacing it.
- **Responsibility Card scope boundaries** (idea #4) — `responsibility_definitions`
  table + `GET /api/representatives/:id` returns the position's actual
  responsibilities, so nothing scores an official on duties outside their office.
- **A citizen-rating layer, kept distinct from the evidence score** (idea #5) —
  `src/routes/citizen_ratings.ts`, with the soft-damping anti-manipulation engine
  (`src/scoring/anti-manipulation.ts`) applied at submission time, not bolted on
  after the fact.
- **Score history + compare** (idea #6) — `overall_scores` is append-only (a new row
  per recompute, never an update), so `GET /api/representatives/:id/score-history`
  and `GET /api/representatives/compare?ids=1,2,3` both read directly off it.
- **An anti-conviction-bias guardrail in the AI extraction step** (idea #7) —
  `src/ingestion/ai-extract.ts`. The system prompt explicitly forbids treating an
  unproven allegation as a finding of guilt, and the schema itself won't accept
  `VERIFIED` without the source text citing a primary document.
- **An immutable audit log + versioned methodology** (idea #8) — every recompute
  writes to the append-only `audit_log` table, and every score row is tagged with
  the `methodology_versions` row that was in effect when it was computed.
- **A uniform interface for adding new data sources** (idea #9) —
  `src/ingestion/types.ts`'s `ConnectorResult` + `src/ingestion/orchestrator.ts`.
  The ported `data-gov-in` connector is the first implementation; adding another
  source is one new file plus one line in `CONNECTORS`.
- **This document itself** (idea #10) — the "what's real, what's simplified, what's
  blocked on you" pattern, applied to the port.

## Simplified by design

- **Citizen identity**: andhbhakt had no user-identity system at all before this —
  only an anonymous Cloudflare-Turnstile session. jan-score's own identity layer is
  Auth.js/NextAuth, which is Next.js-specific and doesn't port to this Express app.
  What's here instead is a small, real email magic-link
  (`src/routes/citizen_ratings.ts`) — a token is issued, hashed, single-use, and
  expires in 15 minutes, and the resulting session cookie is HMAC-signed the same way
  `middlewares/verify-session.ts` already signs the anonymous session. **Email
  delivery itself is not wired up** (this diff has no SMTP/Resend/etc. integration) —
  in development the token is returned directly in the API response (clearly logged
  as dev-only); in production the endpoint fails loudly with a 501 rather than
  silently pretending to send an email. Wiring a real sender is a small, contained
  follow-up once an email provider is chosen.
- **Ingestion connectors**: only `data-gov-in` was ported. jan-score's MyNeta/ADR
  scraper and eCourts connector are deferred — MyNeta scraping is inherently more
  fragile (HTML structure, not a documented API) and eCourts has no public bulk API
  at all (jan-score's own version is a stub for the same reason). The connector
  *interface* (idea #9) is the actual point being demonstrated; adding either of
  those back in later is exactly the one-file-plus-one-line change the interface is
  designed for.
- **Official-identity verification for Right of Reply**: submitting a response is
  gated behind the same admin token as the review queue, not opened to anyone who
  claims to be the official. Verifying a real official's identity needs an
  out-of-band step (verified government email domain, phone callback) this change
  doesn't attempt to invent.

## Explicitly not ported

- jan-score's own seed data (real representative/party/constituency names),
  deploy config (Vercel, its own domain/cron schedule), and its Next.js/Prisma
  scaffolding itself — only the logic moved, not the framework or the content.
- Promises, Projects, Affidavits, and Electoral Bond Funding tracking — real models
  in jan-score, but genuinely additional scope beyond the 10 ideas this document
  tracks; left for a future pass if this direction is kept.
- The 26-letter ABC–XYZ sub-metric framework — cosmetic labeling layer on top of the
  5 dimensions, not load-bearing for any of the 10 ideas.

## If you want to extend ingestion further

Match `ConnectorResult` (`src/ingestion/types.ts`), write one file under
`src/ingestion/connectors/`, and add one line to the `CONNECTORS` array in
`src/ingestion/orchestrator.ts`. The scoring engine, review queue, and UI need no
changes for a new source — see jan-score's own `docs/SCOPE.md` for the same pattern,
which this codebase now also follows.
