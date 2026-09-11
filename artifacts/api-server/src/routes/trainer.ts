import { Router, type IRouter, type Request } from "express";
import { clerkClient, getAuth } from "@clerk/express";
import { desc, eq, sql } from "drizzle-orm";
import { db, courseProgressTable, learnersTable, quizAttemptsTable } from "@workspace/db";

const router: IRouter = Router();

async function isTrainer(req: Request): Promise<boolean> {
  const userId = getAuth(req).userId;
  if (!userId) return false;
  const user = await clerkClient.users.getUser(userId);
  const email = user.primaryEmailAddress?.emailAddress;
  const allowed = (process.env.TRAINER_EMAILS ?? "").split(",").map((value) => value.trim().toLowerCase()).filter(Boolean);
  return Boolean(email && allowed.includes(email.toLowerCase()));
}

router.get("/trainer/dashboard", async (req, res): Promise<void> => {
  if (!getAuth(req).userId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  if (!(await isTrainer(req))) {
    res.status(403).json({ error: "Trainer access required" });
    return;
  }

  const [learners, attempts, progress] = await Promise.all([
    db.select().from(learnersTable),
    db.select().from(quizAttemptsTable).orderBy(desc(quizAttemptsTable.createdAt)),
    db.select().from(courseProgressTable),
  ]);
  const activeLearnerIds = new Set(progress.filter((row: (typeof progress)[number]) => row.progress > 0).map((row: (typeof progress)[number]) => row.clerkUserId));
  const averageScore = attempts.length ? Math.round(attempts.reduce((sum: number, attempt: (typeof attempts)[number]) => sum + (attempt.score / attempt.total) * 100, 0) / attempts.length) : 0;
  const completedCourses = progress.filter((row) => row.completed >= 1).length;
  const topGap = attempts.length ? [...new Set(attempts.map((attempt: (typeof attempts)[number]) => attempt.topic))][0] : "No quiz data yet";

  res.json({
    learners: learners.length,
    activeThisWeek: activeLearnerIds.size,
    avgCompetency: averageScore,
    coursesCompleted: completedCourses,
    topGap,
    topGapScore: averageScore,
    updatedAt: new Date().toISOString(),
    cohorts: [{ name: "All learners", learners: learners.length, score: averageScore, movement: 0 }],
  });
});

export default router;
