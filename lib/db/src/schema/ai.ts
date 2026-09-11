import { createInsertSchema } from "drizzle-zod";
import { integer, jsonb, pgTable, serial, text, timestamp, index } from "drizzle-orm/pg-core";
import { z } from "zod";

export const competencyAssessmentsTable = pgTable(
  "competency_assessments",
  {
    id: serial("id").primaryKey(),
    clerkUserId: text("clerk_user_id").notNull(),
    competency: text("competency").notNull(),
    score: integer("score").notNull().default(0),
    target: integer("target").notNull().default(70),
    gap: integer("gap").notNull().default(0),
    status: text("status").notNull().default("Needs focus"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    ownerCompetencyIdx: index("competency_assessments_owner_competency_idx").on(table.clerkUserId, table.competency),
  }),
);

export const trainingRecommendationsTable = pgTable(
  "training_recommendations",
  {
    id: serial("id").primaryKey(),
    clerkUserId: text("clerk_user_id").notNull(),
    title: text("title").notNull(),
    competency: text("competency").notNull(),
    priority: integer("priority").notNull().default(1),
    rationale: text("rationale").notNull(),
    resourceType: text("resource_type").notNull().default("course"),
    resourceUrl: text("resource_url").notNull().default(""),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    ownerPriorityIdx: index("training_recommendations_owner_priority_idx").on(table.clerkUserId, table.priority),
  }),
);

export const learningMaterialsTable = pgTable(
  "learning_materials",
  {
    id: serial("id").primaryKey(),
    clerkUserId: text("clerk_user_id").notNull(),
    title: text("title").notNull(),
    sourceType: text("source_type").notNull().default("upload"),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    content: text("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    ownerCreatedIdx: index("learning_materials_owner_created_idx").on(table.clerkUserId, table.createdAt),
  }),
);

export const generatedQuestionsTable = pgTable(
  "generated_questions",
  {
    id: serial("id").primaryKey(),
    clerkUserId: text("clerk_user_id").notNull(),
    materialId: integer("material_id").notNull(),
    topic: text("topic").notNull().default("General"),
    difficulty: text("difficulty").notNull().default("Medium"),
    prompt: text("prompt").notNull(),
    options: jsonb("options").$type<string[]>().notNull().default([]),
    answer: text("answer").notNull(),
    explanation: text("explanation").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    ownerMaterialIdx: index("generated_questions_owner_material_idx").on(table.clerkUserId, table.materialId),
  }),
);

export const insertCompetencyAssessmentSchema = createInsertSchema(competencyAssessmentsTable).omit({
  id: true,
  updatedAt: true,
});
export const insertTrainingRecommendationSchema = createInsertSchema(trainingRecommendationsTable).omit({
  id: true,
  createdAt: true,
});
export const insertLearningMaterialSchema = createInsertSchema(learningMaterialsTable).omit({
  id: true,
  createdAt: true,
});
export const insertGeneratedQuestionSchema = createInsertSchema(generatedQuestionsTable).omit({
  id: true,
  createdAt: true,
});

export type CompetencyAssessment = typeof competencyAssessmentsTable.$inferSelect;
export type TrainingRecommendation = typeof trainingRecommendationsTable.$inferSelect;
export type LearningMaterial = typeof learningMaterialsTable.$inferSelect;
export type GeneratedQuestion = typeof generatedQuestionsTable.$inferSelect;

export type InsertCompetencyAssessment = z.infer<typeof insertCompetencyAssessmentSchema>;
export type InsertTrainingRecommendation = z.infer<typeof insertTrainingRecommendationSchema>;
export type InsertLearningMaterial = z.infer<typeof insertLearningMaterialSchema>;
export type InsertGeneratedQuestion = z.infer<typeof insertGeneratedQuestionSchema>;
