import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";
import yauzl from "yauzl";

const MAX_TEXT_LENGTH = 20000;
const STOP_WORDS = new Set([
  "about", "after", "again", "also", "because", "being", "could", "from", "have", "into", "more", "other", "should", "their", "there", "these", "those", "through", "using", "which", "would", "with", "your",
]);

export type ParsedMaterial = {
  sourceType: "PDF" | "PPT" | "DOCX" | "TXT";
  content: string;
  topic: string;
  keywords: string[];
  concepts: string[];
  objectives: string[];
  summary: string;
};

function normalizeText(value: string) {
  return value.replace(/\u0000/g, " ").replace(/\s+/g, " ").trim().slice(0, MAX_TEXT_LENGTH);
}

function inferType(fileName: string): ParsedMaterial["sourceType"] {
  const extension = fileName.toLowerCase().split(".").pop();
  if (extension === "pdf") return "PDF";
  if (extension === "ppt" || extension === "pptx") return "PPT";
  if (extension === "doc" || extension === "docx") return "DOCX";
  return "TXT";
}

function assertSupportedExtension(fileName: string) {
  const extension = fileName.toLowerCase().split(".").pop();
  if (!extension || !["pdf", "pptx", "docx", "txt"].includes(extension)) {
    throw new Error("Unsupported file type. Upload a PDF, PPTX, DOCX, or TXT file.");
  }
}

function stripXml(value: string) {
  return value.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

function readZipEntry(buffer: Buffer, entryName: string): Promise<string> {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(buffer, { lazyEntries: true }, (error, zipFile) => {
      if (error || !zipFile) {
        reject(error ?? new Error("Could not open presentation archive"));
        return;
      }
      let found = false;
      zipFile.readEntry();
      zipFile.on("entry", (entry) => {
        if (entry.fileName !== entryName) {
          zipFile.readEntry();
          return;
        }
        found = true;
        zipFile.openReadStream(entry, (streamError, stream) => {
          if (streamError || !stream) {
            reject(streamError ?? new Error("Could not read presentation slide"));
            return;
          }
          const chunks: Buffer[] = [];
          stream.on("data", (chunk: Buffer) => chunks.push(chunk));
          stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
          stream.on("error", reject);
        });
      });
      zipFile.on("end", () => {
        if (!found) reject(new Error(`Presentation entry not found: ${entryName}`));
      });
      zipFile.on("error", reject);
    });
  });
}

async function extractPptx(buffer: Buffer) {
  return new Promise<string>((resolve, reject) => {
    yauzl.fromBuffer(buffer, { lazyEntries: true }, (error, zipFile) => {
      if (error || !zipFile) {
        reject(error ?? new Error("Could not open presentation archive"));
        return;
      }
      const slideNames: string[] = [];
      zipFile.readEntry();
      zipFile.on("entry", (entry) => {
        if (/^ppt\/slides\/slide\d+\.xml$/i.test(entry.fileName)) slideNames.push(entry.fileName);
        zipFile.readEntry();
      });
      zipFile.on("end", async () => {
        try {
          const slides = await Promise.all(slideNames.sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).map((name) => readZipEntry(buffer, name)));
          resolve(slides.map(stripXml).join("\n"));
        } catch (entryError) {
          reject(entryError);
        }
      });
      zipFile.on("error", reject);
    });
  });
}

function analyze(content: string, fileName: string, sourceType: ParsedMaterial["sourceType"]): ParsedMaterial {
  const cleanContent = normalizeText(content);
  if (cleanContent.length < 20) throw new Error("The uploaded file did not contain enough readable text.");
  const words = cleanContent.toLowerCase().match(/[a-z][a-z0-9-]{3,}/g) ?? [];
  const frequencies = new Map<string, number>();
  for (const word of words) {
    if (!STOP_WORDS.has(word)) frequencies.set(word, (frequencies.get(word) ?? 0) + 1);
  }
  const keywords = [...frequencies.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([word]) => word);
  const sentences = cleanContent.split(/(?<=[.!?])\s+/).filter((sentence) => sentence.length > 30);
  const title = fileName.replace(/\.[^/.]+$/, "").replace(/[-_]+/g, " ").trim();
  const topic = keywords.slice(0, 3).join(", ") || title || "Learning material";
  const summary = (sentences.slice(0, 2).join(" ") || cleanContent).slice(0, 360);
  const concepts = keywords.slice(0, 5).map((word) => word.replace(/(^|-)([a-z])/g, (_, separator, letter) => `${separator}${letter.toUpperCase()}`));
  const objectives = [
    `Explain the role of ${concepts[0] ?? "the main ideas"}`,
    `Identify evidence related to ${concepts[1] ?? "the topic"}`,
    `Apply the material to a practical decision`,
  ];
  return { sourceType, content: cleanContent, topic, keywords, concepts, objectives, summary };
}

export async function parseMaterial(buffer: Buffer, fileName: string): Promise<ParsedMaterial> {
  assertSupportedExtension(fileName);
  const sourceType = inferType(fileName);
  let content: string;
  if (sourceType === "PDF") {
    const parser = new PDFParse({ data: buffer });
    try {
      content = (await parser.getText()).text;
    } finally {
      await parser.destroy();
    }
  } else if (sourceType === "DOCX") {
    content = (await mammoth.extractRawText({ buffer })).value;
  } else if (sourceType === "PPT") {
    content = await extractPptx(buffer);
  } else {
    content = buffer.toString("utf8");
  }
  return analyze(content, fileName, sourceType);
}
