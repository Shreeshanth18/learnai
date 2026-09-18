type GeminiPayload = {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
};

export async function generateGeminiText(prompt: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Gemini is not configured");
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.7 },
    }),
  });
  if (!response.ok) throw new Error(`Gemini request failed with status ${response.status}`);
  const payload = await response.json() as GeminiPayload;
  const text = payload.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (!text) throw new Error("Gemini returned an empty response");
  return text;
}

export async function generateGeminiJson<T>(prompt: string): Promise<T> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Gemini is not configured");
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2, responseMimeType: "application/json" },
    }),
  });
  if (!response.ok) throw new Error(`Gemini request failed with status ${response.status}`);
  const payload = await response.json() as GeminiPayload;
  const text = payload.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (!text) throw new Error("Gemini returned an empty response");
  return JSON.parse(text.replace(/^```json\s*/i, "").replace(/\s*```$/, "")) as T;
}
