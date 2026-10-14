// Scoring outputs + the methodology-versioning/audit-log trust layer, ported
// from jan-score. Idea #1 (deterministic, published methodology), idea #6
// (score history + compare — overallScoresTable is an append-only time
// series, never overwritten in place), idea #8 (immutable audit log +
// versioned methodology, so a past score's formula is provably what it was
// at the time it was published).
import { pgTable, serial, text, integer, real, timestamp, jsonb, pgEnum, unique, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { representativesTable } from "./representatives";
import { dimensionEnum } from "./evidence";

export const FLAGS = ["GREEN", "YELLOW", "ORANGE", "RED", "GREY"] as const;
export type Flag = (typeof FLAGS)[number];
export const flagEnum = pgEnum("flag", FLAGS);

// Idea #8 — every score formula ever published, never deleted or edited in
// place. A new version is a new row; old scores keep pointing at the
// version that was in effect when they were computed.
export const methodologyVersionsTable = pgTable("methodology_versions", {
  id: serial("id").primaryKey(),
  version: text("version").notNull().unique(), // e.g. "2026.1"
  effectiveAt: timestamp("effective_at", { withTimezone: true }).defaultNow().notNull(),
  description: text("description").notNull(),
  weights: jsonb("weights").$type<Record<string, number>>().notNull(),
});

// Cached, recomputed dimension score. score = null means NR (Not Rated) —
// idea #1's explicit "don't pretend to know what we don't" state, used when
// evidenceCount/confidence falls below the NR threshold.
export const dimensionScoresTable = pgTable(
  "dimension_scores",
  {
    id: serial("id").primaryKey(),
    representativeId: integer("representative_id").notNull().references(() => representativesTable.id),
    dimension: dimensionEnum("dimension").notNull(),
    score: real("score"),
    confidence: real("confidence").notNull(), // 0-1
    evidenceCount: integer("evidence_count").notNull(),
    citizenScore: real("citizen_score"),
    evidenceScore: real("evidence_score"),
    computedAt: timestamp("computed_at", { withTimezone: true }).defaultNow().notNull(),
    methodologyVersion: text("methodology_version").notNull().references(() => methodologyVersionsTable.version),
  },
  (table) => [
    unique("dimension_scores_rep_dim_version_unique").on(
      table.representativeId,
      table.dimension,
      table.methodologyVersion
    ),
  ]
);

// Idea #6 — one row per (representative, period), never updated after the
// period closes, so score history and the compare view both read directly
// off this table with no separate "history" table needed.
export const overallScoresTable = pgTable(
  "overall_scores",
  {
    id: serial("id").primaryKey(),
    representativeId: integer("representative_id").notNull().references(() => representativesTable.id),
    index: real("index"), // null => NR
    grade: text("grade"), // "A+".."F" or "NR"
    flag: flagEnum("flag").notNull(),
    confidence: real("confidence").notNull(),
    methodologyVersion: text("methodology_version").notNull().references(() => methodologyVersionsTable.version),
    periodLabel: text("period_label").notNull(), // e.g. "2026" — the score-history x-axis
    computedAt: timestamp("computed_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("overall_scores_rep_period_idx").on(table.representativeId, table.periodLabel)]
);

// Idea #8 — append-only. Every write to a scored entity is recorded here in
// addition to whatever table it actually touched; rows are never updated or
// deleted by application code.
export const auditLogTable = pgTable(
  "audit_log",
  {
    id: serial("id").primaryKey(),
    entity: text("entity").notNull(), // e.g. "evidence", "dimension_score"
    entityId: text("entity_id").notNull(),
    action: text("action").notNull(), // "create" | "update" | "approve" | "reject"
    actor: text("actor").notNull(), // "system" | "citizen:<id>" | "moderator:<id>"
    beforeJson: jsonb("before_json"),
    afterJson: jsonb("after_json"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("audit_log_entity_idx").on(table.entity, table.entityId)]
);

export const insertMethodologyVersionSchema = createInsertSchema(methodologyVersionsTable).omit({ id: true });
export type InsertMethodologyVersion = z.infer<typeof insertMethodologyVersionSchema>;
export type MethodologyVersion = typeof methodologyVersionsTable.$inferSelect;

export const insertDimensionScoreSchema = createInsertSchema(dimensionScoresTable).omit({ id: true, computedAt: true });
export type InsertDimensionScore = z.infer<typeof insertDimensionScoreSchema>;
export type DimensionScore = typeof dimensionScoresTable.$inferSelect;

export const insertOverallScoreSchema = createInsertSchema(overallScoresTable).omit({ id: true, computedAt: true });
export type InsertOverallScore = z.infer<typeof insertOverallScoreSchema>;
export type OverallScore = typeof overallScoresTable.$inferSelect;

export const insertAuditLogSchema = createInsertSchema(auditLogTable).omit({ id: true, createdAt: true });
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;
export type AuditLog = typeof auditLogTable.$inferSelect;
