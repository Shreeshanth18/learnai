import { createInsertSchema } from "drizzle-zod";
import { integer, jsonb, pgTable, serial, text, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { z } from "zod";

export const courseProgressTable = pgTable("course_progress", {
  id: serial("id").primaryKey(),
  clerkUserId: text("clerk_user_id").notNull(),
  courseId: text("course_id").notNull(),
  progress: integer("progress").notNull().default(0),
  completed: integer("completed").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  ownerCourse: uniqueIndex("course_progress_owner_course_idx").on(table.clerkUserId, table.courseId),
  ownerIdx: index("course_progress_owner_idx").on(table.clerkUserId),
}));

export const quizAttemptsTable = pgTable("quiz_attempts", {
  id: serial("id").primaryKey(),
  clerkUserId: text("clerk_user_id").notNull(),
  score: integer("score").notNull(),
  total: integer("total").notNull(),
  topic: text("topic").notNull().default("General"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({ ownerIdx: index("quiz_attempts_owner_created_idx").on(table.clerkUserId, table.createdAt) }));

export const tutorMessagesTable = pgTable("tutor_messages", {
  id: serial("id").primaryKey(),
  clerkUserId: text("clerk_user_id").notNull(),
  role: text("role").notNull(),
  text: text("text").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({ ownerIdx: index("tutor_messages_owner_created_idx").on(table.clerkUserId, table.createdAt) }));

export const learningEventsTable = pgTable("learning_events", {
  id: serial("id").primaryKey(),
  clerkUserId: text("clerk_user_id").notNull(),
  type: text("type").notNull(),
  courseId: text("course_id"),
  minutes: integer("minutes").notNull().default(0),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({ ownerCreatedIdx: index("learning_events_owner_created_idx").on(table.clerkUserId, table.createdAt) }));

export const insertCourseProgressSchema = createInsertSchema(courseProgressTable).omit({ id: true, updatedAt: true });
export const insertQuizAttemptSchema = createInsertSchema(quizAttemptsTable).omit({ id: true, createdAt: true });
export const insertTutorMessageSchema = createInsertSchema(tutorMessagesTable).omit({ id: true, createdAt: true });
export const insertLearningEventSchema = createInsertSchema(learningEventsTable).omit({ id: true, createdAt: true });
export type CourseProgress = typeof courseProgressTable.$inferSelect;
export type QuizAttempt = typeof quizAttemptsTable.$inferSelect;
export type TutorMessage = typeof tutorMessagesTable.$inferSelect;
export type LearningEvent = typeof learningEventsTable.$inferSelect;
export type InsertCourseProgress = z.infer<typeof insertCourseProgressSchema>;