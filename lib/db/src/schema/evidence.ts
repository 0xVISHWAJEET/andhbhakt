// Evidence layer + ingestion audit trail, ported from jan-score.
// Idea #1 (published, source-tier + time-decay weighted methodology),
// idea #2 (human review queue gating anything automated), idea #7 (the AI
// extraction step's anti-conviction-bias guardrail lives in the connector
// code that writes rows here — see src/ingestion/ai-extraction.ts).
import { pgTable, serial, text, integer, real, timestamp, boolean, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { representativesTable } from "./representatives";

export const SOURCE_TIERS = [
  "TIER1_PRIMARY_STATUTORY",
  "TIER2_JUDICIAL_AUDIT",
  "TIER3_SECONDARY_VERIFIED",
  "TIER4_CITIZEN_EVIDENCE",
  "TIER5_UNVERIFIED",
] as const;
export type SourceTier = (typeof SOURCE_TIERS)[number];
export const sourceTierEnum = pgEnum("source_tier", SOURCE_TIERS);

export const DIMENSIONS = ["ACCOUNTABILITY", "DELIVERY", "TRANSPARENCY", "INTEGRITY", "CITIZEN_SENTIMENT"] as const;
export type Dimension = (typeof DIMENSIONS)[number];
export const dimensionEnum = pgEnum("dimension", DIMENSIONS);

// Preserves a claim's real status instead of flattening everything into
// "true/false" — this is exactly what the AI extraction guardrail (idea #7)
// is instructed to preserve rather than overwrite.
export const CLAIM_STATUSES = [
  "VERIFIED",
  "PARTIALLY_VERIFIED",
  "UNVERIFIED",
  "DISPUTED",
  "FALSE",
  "ALLEGATION",
  "UNDER_INVESTIGATION",
  "JUDICIAL_FINDING",
] as const;
export type ClaimStatus = (typeof CLAIM_STATUSES)[number];
export const claimStatusEnum = pgEnum("claim_status", CLAIM_STATUSES);

export const INGESTION_STATUSES = ["RUNNING", "SUCCESS", "PARTIAL", "FAILED"] as const;
export type IngestionStatus = (typeof INGESTION_STATUSES)[number];
export const ingestionStatusEnum = pgEnum("ingestion_status", INGESTION_STATUSES);

export const sourcesTable = pgTable("sources", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  url: text("url"),
  tier: sourceTierEnum("tier").notNull(),
  description: text("description"),
});

// One row per connector run — idea #9's uniform connector interface writes
// one of these per invocation, and every Evidence row an automated connector
// produces links back to it for traceability.
export const ingestionRunsTable = pgTable("ingestion_runs", {
  id: serial("id").primaryKey(),
  connector: text("connector").notNull(), // e.g. "data-gov-in", "ai-extraction"
  status: ingestionStatusEnum("status").notNull().default("RUNNING"),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  recordsProcessed: integer("records_processed").notNull().default(0),
  recordsFlagged: integer("records_flagged").notNull().default(0),
  errorLog: text("error_log"),
  triggeredBy: text("triggered_by").notNull(), // "cron" | "admin:<id>"
});

export const evidenceTable = pgTable("evidence", {
  id: serial("id").primaryKey(),
  representativeId: integer("representative_id").notNull().references(() => representativesTable.id),
  dimension: dimensionEnum("dimension").notNull(),
  abcxyzLetter: text("abcxyz_letter"),
  title: text("title").notNull(),
  description: text("description").notNull(),
  rawScore: real("raw_score").notNull(), // 0-100, evidence's own contribution before weighting
  sourceId: integer("source_id").notNull().references(() => sourcesTable.id),
  claimStatus: claimStatusEnum("claim_status").notNull().default("UNVERIFIED"),
  loggedAt: timestamp("logged_at", { withTimezone: true }).defaultNow().notNull(),
  eventDate: timestamp("event_date", { withTimezone: true }),

  // Human-in-the-loop gate (idea #2): AI-discovered evidence defaults to
  // needsReview = true and is excluded from scoring until a moderator
  // approves it on the review queue. Manually-entered evidence defaults to
  // false (a human already typed it in).
  needsReview: boolean("needs_review").notNull().default(false),
  aiExtractionConfidence: real("ai_extraction_confidence"),
  ingestionRunId: integer("ingestion_run_id").references(() => ingestionRunsTable.id),
});

export const insertSourceSchema = createInsertSchema(sourcesTable).omit({ id: true });
export type InsertSource = z.infer<typeof insertSourceSchema>;
export type Source = typeof sourcesTable.$inferSelect;

export const insertIngestionRunSchema = createInsertSchema(ingestionRunsTable).omit({ id: true });
export type InsertIngestionRun = z.infer<typeof insertIngestionRunSchema>;
export type IngestionRun = typeof ingestionRunsTable.$inferSelect;

export const insertEvidenceSchema = createInsertSchema(evidenceTable).omit({ id: true, loggedAt: true });
export type InsertEvidence = z.infer<typeof insertEvidenceSchema>;
export type Evidence = typeof evidenceTable.$inferSelect;
