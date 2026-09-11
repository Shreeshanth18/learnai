import { createInsertSchema } from "drizzle-zod";
import { jsonb, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { z } from "zod";

export const learnersTable = pgTable(
  "learners",
  {
    id: serial("id").primaryKey(),
    clerkUserId: text("clerk_user_id").notNull(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    role: text("role").notNull().default("Learner"),
    institution: text("institution").notNull().default(""),
    interests: jsonb("interests").$type<string[]>().notNull().default([]),
    preferences: jsonb("preferences").$type<Record<string, boolean>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    clerkUserIdIdx: uniqueIndex("learners_clerk_user_id_idx").on(table.clerkUserId),
  }),
);

export const insertLearnerSchema = createInsertSchema(learnersTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertLearner = z.infer<typeof insertLearnerSchema>;
export type Learner = typeof learnersTable.$inferSelect;