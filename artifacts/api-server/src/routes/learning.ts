import { Router, type IRouter, type Request } from "express";
import { getAuth } from "@clerk/express";
import { and, desc, eq, sql } from "drizzle-orm";
import {
  GetLearnerDashboardResponse, SaveCourseProgressBody, SaveCourseProgressResponse,
  RecordQuizAttemptBody, RecordQuizAttemptResponse, GetTutorMessagesResponse,
  SendTutorMessageBody, SendTutorMessageResponse,
} from "@workspace/api-zod";
import { db, learnersTable, courseProgressTable, quizAttemptsTable, tutorMessagesTable, learningEventsTable } from "@workspace/db";

const router: IRouter = Router();
const userId = (req: Request) => getAuth(req).userId ?? null;
function auth(req: Request, res: any) { const id = userId(req); if (!id) { res.status(401).json({ error: "Authentication required" }); return null; } return id; }

function tutorReply(text: string) {
  const lower = text.toLowerCase();
  if (lower.includes("gap")) return "Your next useful step is to connect one competency to observable evidence. Pick a recent decision and name the signal that would change your mind.";
  if (lower.includes("practice")) return "Try a ten-minute practice: write one outcome, then list one behavior that would show transfer. Keep vanity counts separate from learning evidence.";
  return "Start with the decision you want to make, then work backward to the smallest piece of evidence that could change your mind.";
}

function pointsForEvent(event: { type: string; metadata: Record<string, unknown> }) {
  if (event.type === "course_completed") return 100;
  if (event.type === "quiz_attempt") return 50 + (Number(event.metadata.score) >= Number(event.metadata.total) ? 25 : 0);
  if (event.type === "material_upload") return 120;
  if (event.type === "material_quiz") return 50;
  if (event.type === "tutor_message") return 5;
  return 10;
}

function badgesFor(points: number, events: Array<{ type: string }>) {
  return [
    { id: "first-step", name: "First step", earned: events.some((event) => event.type === "quiz_attempt"), detail: "Completed your first quiz" },
    { id: "material-maker", name: "Material maker", earned: events.some((event) => event.type === "material_upload"), detail: "Uploaded learning material" },
    { id: "skill-builder", name: "Skill builder", earned: points >= 500, detail: "Earned 500 learning points" },
    { id: "steady-practice", name: "Steady practice", earned: new Set(events.map((event) => event.type)).size >= 3, detail: "Used three learning activities" },
  ];
}

router.get("/learners/me/dashboard", async (req, res): Promise<void> => {
  const clerkUserId = auth(req, res); if (!clerkUserId) return;
  const [profile] = await db.select().from(learnersTable).where(eq(learnersTable.clerkUserId, clerkUserId)).limit(1);
  if (!profile) { res.status(404).json({ error: "Learner record not found" }); return; }
  const [progress, attempts, events, messageCount] = await Promise.all([
    db.select().from(courseProgressTable).where(eq(courseProgressTable.clerkUserId, clerkUserId)),
    db.select().from(quizAttemptsTable).where(eq(quizAttemptsTable.clerkUserId, clerkUserId)).orderBy(desc(quizAttemptsTable.createdAt)).limit(50),
    db.select().from(learningEventsTable).where(eq(learningEventsTable.clerkUserId, clerkUserId)).orderBy(desc(learningEventsTable.createdAt)).limit(500),
    db.select({ count: sql<number>`count(*)` }).from(tutorMessagesTable).where(and(eq(tutorMessagesTable.clerkUserId, clerkUserId), eq(tutorMessagesTable.role, "user"))),
  ]);
  const byDay = new Map<string, { day: string; minutes: number; events: number }>();
  for (const event of events) { const day = event.createdAt.toISOString().slice(0, 10); const current = byDay.get(day) ?? { day, minutes: 0, events: 0 }; current.minutes += event.minutes; current.events += 1; byDay.set(day, current); }
  const totalMinutes = events.reduce((sum: number, event: (typeof events)[number]) => sum + event.minutes, 0);
  const competencyCatalog = [
    ["digital-governance", "Digital governance", "Governance"],
    ["official-statistics", "Official statistics and data quality", "Statistical practice"],
    ["data-privacy", "Data privacy and security", "Responsible digital practice"],
    ["policy-implementation", "Policy implementation", "Governance"],
    ["public-communication", "Public communication", "Citizen engagement"],
    ["digital-tools", "Digital tools for service delivery", "Technology"],
  ] as const;
  const averageScore = attempts.length ? Math.round(attempts.reduce((sum: number, attempt: (typeof attempts)[number]) => sum + (attempt.score / attempt.total) * 100, 0) / attempts.length) : 0;
  const competency = competencyCatalog.map(([id, name, category]) => {
    const topicAttempts = attempts.filter((attempt: (typeof attempts)[number]) => attempt.topic.toLowerCase().includes(name.toLowerCase().split(" ")[0]));
    const score = topicAttempts.length ? Math.round(topicAttempts.reduce((sum: number, attempt: (typeof attempts)[number]) => sum + (attempt.score / attempt.total) * 100, 0) / topicAttempts.length) : averageScore;
    return { id, name, category, score, trend: topicAttempts.length > 1 ? score - Math.round((topicAttempts[topicAttempts.length - 1].score / topicAttempts[topicAttempts.length - 1].total) * 100) : 0, status: score >= 70 ? "Strong" : score > 0 ? "Building" : "Needs focus" };
  });
  const days = [...byDay.keys()].sort();
  let streak = 0; const cursor = new Date(); cursor.setUTCHours(0, 0, 0, 0);
  while (byDay.has(cursor.toISOString().slice(0, 10))) { streak += 1; cursor.setUTCDate(cursor.getUTCDate() - 1); }
  const badges = [
    { id: "first-step", name: "First step", earned: attempts.length > 0, detail: "Completed your first quiz" },
    { id: "curious-mind", name: "Curious mind", earned: Number(messageCount[0]?.count ?? 0) >= 5, detail: "Asked the tutor 5 questions" },
    { id: "steady-practice", name: "Steady practice", earned: byDay.size >= 7, detail: "Learned on 7 different days" },
  ];
  const payload = { profile, courseProgress: progress, quizHistory: attempts, activity: [...byDay.values()].slice(-7), stats: { totalMinutes, streak, activeDays: byDay.size, quizCount: attempts.length, tutorQuestions: Number(messageCount[0]?.count ?? 0) }, competency, badges };
  res.json(GetLearnerDashboardResponse.parse(payload));
});

router.get("/learners/me/gamification", async (req, res): Promise<void> => {
  const clerkUserId = auth(req, res); if (!clerkUserId) return;
  const [learners, events] = await Promise.all([
    db.select().from(learnersTable),
    db.select().from(learningEventsTable),
  ]);
  const pointsByUser = new Map<string, number>();
  for (const event of events) pointsByUser.set(event.clerkUserId, (pointsByUser.get(event.clerkUserId) ?? 0) + pointsForEvent(event));
  const currentEvents = events.filter((event) => event.clerkUserId === clerkUserId);
  const leaderboard = learners
    .map((learner) => ({ learner: learner.name, points: pointsByUser.get(learner.clerkUserId) ?? 0 }))
    .sort((a, b) => b.points - a.points)
    .slice(0, 10)
    .map((entry, index) => ({ rank: index + 1, ...entry, isCurrentUser: entry.learner === learners.find((learner) => learner.clerkUserId === clerkUserId)?.name }));
  const points = pointsByUser.get(clerkUserId) ?? 0;
  res.json({ points, badges: badgesFor(points, currentEvents), leaderboard });
});

router.get("/learners/me/certificates", async (req, res): Promise<void> => {
  const clerkUserId = auth(req, res); if (!clerkUserId) return;
  const [profile] = await db.select().from(learnersTable).where(eq(learnersTable.clerkUserId, clerkUserId)).limit(1);
  const completed = await db.select().from(courseProgressTable).where(and(eq(courseProgressTable.clerkUserId, clerkUserId), eq(courseProgressTable.completed, 1)));
  res.json({
    learner: profile?.name ?? "Learner",
    certificates: completed.map((course) => ({
      id: `CERT-${course.id}`,
      courseId: course.courseId,
      issuedAt: course.updatedAt,
      status: "issued",
    })),
  });
});

router.delete("/learners/me/course-progress", async (req, res): Promise<void> => {
  const clerkUserId = auth(req, res); if (!clerkUserId) return;
  const courseId = typeof req.query.courseId === "string" ? req.query.courseId : null;
  const progressFilter = courseId ? and(eq(courseProgressTable.clerkUserId, clerkUserId), eq(courseProgressTable.courseId, courseId)) : eq(courseProgressTable.clerkUserId, clerkUserId);
  await db.delete(courseProgressTable).where(progressFilter);
  const eventFilter = courseId ? and(eq(learningEventsTable.clerkUserId, clerkUserId), eq(learningEventsTable.courseId, courseId)) : eq(learningEventsTable.clerkUserId, clerkUserId);
  await db.delete(learningEventsTable).where(eventFilter);
  res.status(204).send();
});

router.post("/learners/me/course-progress", async (req, res): Promise<void> => {
  const clerkUserId = auth(req, res); if (!clerkUserId) return;
  const parsed = SaveCourseProgressBody.safeParse(req.body); if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const progress = Math.max(0, Math.min(100, parsed.data.progress));
  const [row] = await db.insert(courseProgressTable).values({ clerkUserId, courseId: parsed.data.courseId, progress, completed: progress >= 100 ? 1 : 0 }).onConflictDoUpdate({ target: [courseProgressTable.clerkUserId, courseProgressTable.courseId], set: { progress, completed: progress >= 100 ? 1 : 0, updatedAt: new Date() } }).returning();
  await db.insert(learningEventsTable).values({ clerkUserId, type: progress >= 100 ? "course_completed" : "course_progress", courseId: parsed.data.courseId, minutes: 5 });
  res.json(SaveCourseProgressResponse.parse(row));
});

router.post("/learners/me/quiz-attempts", async (req, res): Promise<void> => {
  const clerkUserId = auth(req, res); if (!clerkUserId) return;
  const parsed = RecordQuizAttemptBody.safeParse(req.body); if (!parsed.success || parsed.data.score > parsed.data.total) { res.status(400).json({ error: "Invalid quiz attempt" }); return; }
  const [row] = await db.insert(quizAttemptsTable).values({ clerkUserId, score: parsed.data.score, total: parsed.data.total, topic: parsed.data.topic ?? "General" }).returning();
  await db.insert(learningEventsTable).values({ clerkUserId, type: "quiz_attempt", minutes: 10, metadata: { score: parsed.data.score, total: parsed.data.total } });
  res.status(201).json(RecordQuizAttemptResponse.parse(row));
});

router.get("/learners/me/tutor-messages", async (req, res): Promise<void> => {
  const clerkUserId = auth(req, res); if (!clerkUserId) return;
  const rows = await db.select().from(tutorMessagesTable).where(eq(tutorMessagesTable.clerkUserId, clerkUserId)).orderBy(tutorMessagesTable.createdAt);
  res.json(GetTutorMessagesResponse.parse(rows));
});

router.post("/learners/me/tutor-messages", async (req, res): Promise<void> => {
  const clerkUserId = auth(req, res); if (!clerkUserId) return;
  const parsed = SendTutorMessageBody.safeParse(req.body); if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [question] = await db.insert(tutorMessagesTable).values({ clerkUserId, role: "user", text: parsed.data.text }).returning();
  const [answer] = await db.insert(tutorMessagesTable).values({ clerkUserId, role: "tutor", text: tutorReply(parsed.data.text) }).returning();
  await db.insert(learningEventsTable).values({ clerkUserId, type: "tutor_message", minutes: 5 });
  res.status(201).json(SendTutorMessageResponse.parse([question, answer]));
});

export default router;