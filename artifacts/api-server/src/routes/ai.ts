import { Router, type IRouter, type Request, type RequestHandler } from "express";
import { getAuth } from "@clerk/express";
import { desc, eq } from "drizzle-orm";
import multer from "multer";
import { z } from "zod";
import {
  db,
  competencyAssessmentsTable,
  generatedQuestionsTable,
  learningMaterialsTable,
  quizAttemptsTable,
  trainingRecommendationsTable,
  learningEventsTable,
} from "@workspace/db";
import { parseMaterial } from "../lib/material-parser";
import { generateGeminiJson } from "../lib/gemini";

const router: IRouter = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
});

const uploadSingle: RequestHandler = (req, res, next) => {
  upload.single("file")(req, res, (error) => {
    if (!error) {
      next();
      return;
    }
    if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
      res.status(413).json({ error: "The file is too large. Upload a file smaller than 10 MB." });
      return;
    }
    if (error instanceof multer.MulterError) {
      res.status(400).json({ error: `Upload failed: ${error.message}` });
      return;
    }
    res.status(400).json({ error: "Could not read the uploaded file." });
  });
};

const competencyCatalog = [
  "Digital governance",
  "Official statistics and data quality",
  "Data privacy and security",
  "Policy implementation",
  "Public communication",
  "Digital tools for service delivery",
] as const;

const materialInputSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  topic: z.string().min(1).max(100).optional(),
  content: z.string().min(20).max(20000),
});

const questionGenerationSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  topic: z.string().min(1).max(100).optional(),
  content: z.string().min(20).max(20000),
  count: z.number().int().min(1).max(6).default(3),
});

const materialAssistSchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string().min(20).max(20000),
  prompt: z.string().min(1).max(1000),
});

function authUserId(req: Request): string | null {
  return getAuth(req).userId ?? null;
}

function getCompetencyStatus(score: number) {
  if (score >= 75) return "Strong";
  if (score >= 50) return "Building";
  return "Needs focus";
}

async function buildGapAnalysis(clerkUserId: string) {
  const attempts = await db.select().from(quizAttemptsTable).where(eq(quizAttemptsTable.clerkUserId, clerkUserId));
  return competencyCatalog.map((competency) => {
    const sameTopic = competency.toLowerCase();
    const topicAttempts = attempts.filter((attempt) => attempt.topic.toLowerCase().includes(sameTopic.split(" ")[0]));
    const score = topicAttempts.length
      ? Math.round(topicAttempts.reduce((sum, attempt) => sum + (attempt.score / attempt.total) * 100, 0) / topicAttempts.length)
      : 0;
    const target = 75;
    const gap = Math.max(0, target - score);

    return {
      clerkUserId,
      competency,
      score,
      target,
      gap,
      status: getCompetencyStatus(score),
      focus: gap > 0 ? `${competency} needs reinforcement` : `${competency} is on track`,
      source: sameTopic.includes("evaluation") ? "quiz + assessment data" : "learning-pattern signal",
    };
  });
}

function escapeSentence(sentence: string) {
  return sentence.replace(/\s+/g, " ").trim();
}

function buildQuestionBank(content: string, topic = "Learning content", count = 3) {
  const sentences = content
    .split(/[.!?]+/)
    .map(escapeSentence)
    .filter((sentence) => sentence.length > 30)
    .slice(0, 12);

  const vocabulary = Array.from(
    new Set(
      content
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((word) => word.length > 4)
        .slice(0, 12),
    ),
  );

  const fallbackAnswer = vocabulary[0] ?? "evidence-based learning";

  return Array.from({ length: Math.max(1, Math.min(count, sentences.length || 3)) }, (_, index) => {
    const baseSentence = sentences[index] ?? sentences[0] ?? "This content emphasizes practical learning and evidence-based improvement.";
    const tokens = baseSentence.split(/\s+/).filter(Boolean);
    const answer = tokens.slice(0, 6).join(" ") || fallbackAnswer;
    const distractors = vocabulary.filter((word) => word !== answer && word.length > 4).slice(0, 3);
    const choices = [answer, ...distractors, "continuous improvement"].slice(0, 4);

    return {
      topic,
      difficulty: index === 0 ? "Foundation" : index === 1 ? "Intermediate" : "Advanced",
      prompt: `Which statement best reflects the main idea in the provided material?`,
      options: choices,
      answer: choices[0],
      explanation: `The material emphasizes the concept that ${baseSentence.slice(0, 140)}. This is the strongest learning signal from the content.`,
    };
  });
}

function buildGroundedAnswer(content: string, prompt: string) {
  const sentences = content.split(/(?<=[.!?])\s+/).filter((sentence) => sentence.length > 20);
  const promptWords = new Set(prompt.toLowerCase().match(/[a-z][a-z0-9-]{3,}/g) ?? []);
  const relevant = sentences
    .map((sentence) => ({ sentence, score: [...new Set(sentence.toLowerCase().match(/[a-z][a-z0-9-]{3,}/g) ?? [])].filter((word) => promptWords.has(word)).length }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(({ sentence }) => sentence);
  const evidence = (relevant.length ? relevant : sentences.slice(0, 2)).join(" ");
  return `Based on ${"the uploaded material"}, the strongest evidence for your question is: ${evidence} This answer is grounded in the extracted document text; verify important decisions against the original source.`;
}

type MaterialQuestion = {
  topic: string;
  difficulty: string;
  prompt: string;
  options: string[];
  answer: string;
  explanation: string;
};

function validMaterialQuestions(value: unknown): value is MaterialQuestion[] {
  return Array.isArray(value) && value.length > 0 && value.every((item) => {
    if (!item || typeof item !== "object") return false;
    const question = item as Record<string, unknown>;
    return typeof question.topic === "string" && typeof question.difficulty === "string" && typeof question.prompt === "string" && typeof question.answer === "string" && typeof question.explanation === "string" && Array.isArray(question.options) && question.options.length === 4 && question.options.every((option) => typeof option === "string") && question.options.includes(question.answer);
  });
}

async function generateMaterialQuestions(content: string, topic: string, count: number) {
  const generated = await generateGeminiJson<unknown>(`Create exactly ${count} original multiple-choice questions for SIH260101 from this domain-specific learning material. The target domain is capacity building in India's Official Statistical System. Assess practical competencies for statistical officers: official statistics and data quality, digital governance, citizen service delivery, data privacy and security, policy implementation, public communication, and digital tools. Questions must test application in realistic statistical-office scenarios, not memorization. Return only a JSON array. Each item must contain topic, difficulty, prompt, options with exactly four strings, answer matching one option exactly, and explanation. Topic: ${topic}. Material: ${content}`);
  if (!validMaterialQuestions(generated)) throw new Error("Gemini returned invalid material questions");
  return generated.slice(0, count);
}

router.get("/learners/me/competency-gap", async (req, res): Promise<void> => {
  const clerkUserId = authUserId(req);
  if (!clerkUserId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const saved = await db
    .select()
    .from(competencyAssessmentsTable)
    .where(eq(competencyAssessmentsTable.clerkUserId, clerkUserId))
    .orderBy(desc(competencyAssessmentsTable.updatedAt))
    .limit(competencyCatalog.length);

  if (saved.length > 0) {
    res.json(saved.map((row: (typeof saved)[number]) => ({
      id: row.id,
      competency: row.competency,
      score: row.score,
      target: row.target,
      gap: row.gap,
      status: row.status,
      updatedAt: row.updatedAt,
    })));
    return;
  }

  const generated = await buildGapAnalysis(clerkUserId);

  const inserted = await Promise.all(
    generated.map((item) =>
      db
        .insert(competencyAssessmentsTable)
        .values({
          clerkUserId: item.clerkUserId,
          competency: item.competency,
          score: item.score,
          target: item.target,
          gap: item.gap,
          status: item.status,
        })
        .returning(),
    ),
  );

  const flattened = inserted.flat();
  res.json(
    flattened.map((row: (typeof flattened)[number]) => ({
      id: row.id,
      competency: row.competency,
      score: row.score,
      target: row.target,
      gap: row.gap,
      status: row.status,
      updatedAt: row.updatedAt,
    })),
  );
});

router.get("/learners/me/recommendations", async (req, res): Promise<void> => {
  const clerkUserId = authUserId(req);
  if (!clerkUserId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const existing = await db
    .select()
    .from(trainingRecommendationsTable)
    .where(eq(trainingRecommendationsTable.clerkUserId, clerkUserId))
    .orderBy(desc(trainingRecommendationsTable.createdAt))
    .limit(10);

  if (existing.length > 0) {
    res.json(existing);
    return;
  }

  const gaps = (await buildGapAnalysis(clerkUserId))
    .filter((item) => item.gap > 0)
    .sort((a, b) => b.gap - a.gap)
    .slice(0, 3);

  const recommendations = await Promise.all(
    gaps.map((item, index) =>
      db
        .insert(trainingRecommendationsTable)
        .values({
          clerkUserId,
          title: `${item.competency} reinforcement track`,
          competency: item.competency,
          priority: index + 1,
          rationale: `The learner shows the strongest gap in ${item.competency}. This targeted intervention supports iGOT Karmayogi capacity building and measurable improvement in public-service delivery.`,
          resourceType: "micro-course",
          resourceUrl: "https://igotkarmayogi.gov.in/learning",
          metadata: { source: "ai-enabled-learning-plan", focus: item.competency, igotCategory: "Capacity Building", igotResourceId: `learnai-${item.competency.toLowerCase().replace(/[^a-z0-9]+/g, "-")}` },
        })
        .returning(),
    ),
  );

  res.json(recommendations.flat());
});

router.post("/learners/me/materials", async (req, res): Promise<void> => {
  const clerkUserId = authUserId(req);
  if (!clerkUserId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const parsed = materialInputSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [material] = await db
    .insert(learningMaterialsTable)
    .values({
      clerkUserId,
      title: parsed.data.title ?? "Uploaded learning note",
      sourceType: "upload",
      tags: parsed.data.topic ? [parsed.data.topic] : ["learning-material"],
      content: parsed.data.content,
    })
    .returning();

  await db.insert(learningEventsTable).values({ clerkUserId, type: "material_upload", minutes: 5, metadata: { materialId: material.id } });

  res.status(201).json(material);
});

router.post("/learners/me/materials/upload", uploadSingle, async (req, res): Promise<void> => {
  const clerkUserId = authUserId(req);
  if (!clerkUserId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  if (!req.file) {
    res.status(400).json({ error: "A PDF, PPT, DOCX, or TXT file is required" });
    return;
  }

  try {
    const parsed = await parseMaterial(req.file.buffer, req.file.originalname);
    const [material] = await db
      .insert(learningMaterialsTable)
      .values({
        clerkUserId,
        title: req.file.originalname.replace(/\.[^/.]+$/, ""),
        sourceType: parsed.sourceType,
        tags: [parsed.topic, ...parsed.keywords].slice(0, 9),
        content: parsed.content,
      })
      .returning();
    await db.insert(learningEventsTable).values({ clerkUserId, type: "material_upload", minutes: 5, metadata: { materialId: material.id, sourceType: parsed.sourceType } });
    res.status(201).json({
      material,
      extraction: {
        fileName: req.file.originalname,
        fileSize: req.file.size,
        ...parsed,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not process the uploaded file";
    res.status(422).json({ error: message });
  }
});

router.post("/learners/me/materials/generate-questions", async (req, res): Promise<void> => {
  const clerkUserId = authUserId(req);
  if (!clerkUserId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const parsed = questionGenerationSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [material] = await db
    .insert(learningMaterialsTable)
    .values({
      clerkUserId,
      title: parsed.data.title ?? "Generated learning material",
      sourceType: "generated",
      tags: parsed.data.topic ? [parsed.data.topic] : ["generated"],
      content: parsed.data.content,
    })
    .returning();

  const generatedQuestions = await generateMaterialQuestions(parsed.data.content, parsed.data.topic ?? "Learning content", parsed.data.count)
    .catch(() => buildQuestionBank(parsed.data.content, parsed.data.topic ?? "Learning content", parsed.data.count));
  const questions = generatedQuestions
    .map((question, index) => ({
      clerkUserId,
      materialId: material.id,
      topic: parsed.data.topic ?? `Topic ${index + 1}`,
      difficulty: question.difficulty,
      prompt: question.prompt,
      options: question.options,
      answer: question.answer,
      explanation: question.explanation,
    }));

  const inserted = await db.insert(generatedQuestionsTable).values(questions).returning();

  await db.insert(learningEventsTable).values({ clerkUserId, type: "material_quiz", minutes: 10, metadata: { materialId: material.id, questionCount: inserted.length } });

  res.status(201).json(inserted);
});

router.post("/learners/me/materials/assist", async (req, res): Promise<void> => {
  const clerkUserId = authUserId(req);
  if (!clerkUserId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  const parsed = materialAssistSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const answer = await generateGeminiJson<{ answer: string }>(`Answer the learner's question using only the supplied material. Be concise, cite the relevant idea in plain language, and say when the material does not contain enough evidence. Return JSON with one string field named answer. Question: ${parsed.data.prompt}. Material: ${parsed.data.content}`);
    const responseAnswer = typeof answer.answer === "string" && answer.answer.trim().length > 0
      ? answer.answer.trim()
      : buildGroundedAnswer(parsed.data.content, parsed.data.prompt);
    res.json({ title: parsed.data.title, answer: responseAnswer, source: "uploaded-material" });
  } catch {
    res.json({ title: parsed.data.title, answer: buildGroundedAnswer(parsed.data.content, parsed.data.prompt), source: "uploaded-material" });
  }
});

export default router;
