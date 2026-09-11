import { Router, type IRouter, type Request } from "express";
import { getAuth } from "@clerk/express";
import { eq } from "drizzle-orm";
import {
  EnsureLearnerBody,
  EnsureLearnerResponse,
  UpdateLearnerBody,
  UpdateLearnerResponse,
} from "@workspace/api-zod";
import { db, learnersTable } from "@workspace/db";

const router: IRouter = Router();

function getAuthenticatedUserId(req: Request): string | null {
  return getAuth(req).userId ?? null;
}

router.post("/learners/me", async (req, res): Promise<void> => {
  const clerkUserId = getAuthenticatedUserId(req);
  if (!clerkUserId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const parsed = EnsureLearnerBody.safeParse(req.body);
  if (!parsed.success) {
    req.log.warn({ errors: parsed.error.message }, "Invalid learner registration");
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [learner] = await db
    .insert(learnersTable)
    .values({
      clerkUserId,
      name: parsed.data.name,
      email: parsed.data.email,
      role: parsed.data.role ?? "Learner",
      institution: parsed.data.institution ?? "",
      interests: parsed.data.interests ?? [],
    })
    .onConflictDoUpdate({
      target: learnersTable.clerkUserId,
      set: {
        name: parsed.data.name,
        email: parsed.data.email,
        role: parsed.data.role ?? "Learner",
        institution: parsed.data.institution ?? "",
        interests: parsed.data.interests ?? [],
        preferences: parsed.data.preferences ?? {},
        updatedAt: new Date(),
      },
    })
    .returning();

  res.status(201).json(EnsureLearnerResponse.parse(learner));
});

router.patch("/learners/me", async (req, res): Promise<void> => {
  const clerkUserId = getAuthenticatedUserId(req);
  if (!clerkUserId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const parsed = UpdateLearnerBody.safeParse(req.body);
  if (!parsed.success) {
    req.log.warn({ errors: parsed.error.message }, "Invalid learner profile update");
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [learner] = await db
    .update(learnersTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(learnersTable.clerkUserId, clerkUserId))
    .returning();

  if (!learner) {
    res.status(404).json({ error: "Learner record not found" });
    return;
  }

  res.json(UpdateLearnerResponse.parse(learner));
});

export default router;