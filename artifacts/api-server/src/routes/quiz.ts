import { Router, type IRouter, type Request } from "express";
import { getAuth } from "@clerk/express";

const router: IRouter = Router();

const questionShape = {
  id: "string",
  topic: "string",
  difficulty: "string",
  prompt: "string",
  options: "string[]",
  answer: "string",
  explanation: "string",
} as const;

type GeneratedQuestion = {
  id: string;
  topic: string;
  difficulty: string;
  prompt: string;
  options: string[];
  answer: string;
  explanation: string;
};

function isGeneratedQuestion(value: unknown): value is GeneratedQuestion {
  if (!value || typeof value !== "object") return false;
  const question = value as Record<string, unknown>;
  return Object.entries(questionShape).every(([key, type]) => {
    if (type === "string[]") return Array.isArray(question[key]) && question[key].every((item) => typeof item === "string");
    return typeof question[key] === type;
  }) && (question.options as string[]).length >= 4 && (question.options as string[]).includes(question.answer as string);
}

function parseGeminiQuestions(text: string): GeneratedQuestion[] | null {
  const json = text.replace(/^```json\s*/i, "").replace(/\s*```$/, "").trim();
  try {
    const parsed: unknown = JSON.parse(json);
    if (!Array.isArray(parsed)) return null;
    const questions = parsed.filter(isGeneratedQuestion).slice(0, 3);
    return questions.length === 3 ? questions : null;
  } catch {
    return null;
  }
}

router.post("/learners/me/quiz", async (req: Request, res): Promise<void> => {
  if (!getAuth(req).userId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(503).json({ error: "Gemini is not configured" });
    return;
  }

  const prompt = `Create exactly three original multiple-choice questions for SIH260101, an AI-enabled learning platform for strengthening capacity building in India's Official Statistical System. Assess government-employee competencies including digital governance, official statistics data quality, citizen service delivery, data privacy and security, policy implementation, public communication, and digital tools. Use realistic statistical-office scenarios and test practical application. Return JSON only as an array. Every item must have: id, topic, difficulty, prompt, options (exactly four strings), answer (one exact option), and explanation.`;

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 1, responseMimeType: "application/json" } }),
    });
    if (!response.ok) {
      res.status(502).json({ error: "Gemini request failed" });
      return;
    }
    const payload = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const text = payload.candidates?.[0]?.content?.parts?.[0]?.text;
    const questions = text ? parseGeminiQuestions(text) : null;
    if (!questions) {
      res.status(502).json({ error: "Gemini returned an invalid quiz" });
      return;
    }
    res.json(questions);
  } catch (error) {
    req.log.error({ error }, "Gemini quiz generation failed");
    res.status(502).json({ error: "Gemini request failed" });
  }
});

export default router;
