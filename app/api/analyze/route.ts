import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";
import {
  aggregateAnalyses,
  BULK_CONCURRENCY,
  BULK_MAX_ITEMS,
  buildSingleAnalysisPrompt,
  getGeminiApiKey,
  getGeminiModelIds,
  normalizeAnalysis,
  parseGeminiJson,
  type SentimentAnalysis,
} from "@/lib/sentiment";

function getModel(genAI: GoogleGenerativeAI, modelId: string) {
  return genAI.getGenerativeModel({
    model: modelId,
    generationConfig: {
      responseMimeType: "application/json",
    },
  });
}

function isRetryableGeminiError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /503|429|high demand|try again/i.test(message);
}

async function analyzeOneText(
  genAI: GoogleGenerativeAI,
  text: string
): Promise<SentimentAnalysis> {
  const prompt = buildSingleAnalysisPrompt(text);
  const modelIds = getGeminiModelIds();
  let lastError: unknown;

  for (const modelId of modelIds) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const model = getModel(genAI, modelId);
        const result = await model.generateContent(prompt);
        const responseText = result.response.text();
        const parsed = parseGeminiJson<Partial<SentimentAnalysis>>(responseText);
        return normalizeAnalysis(parsed);
      } catch (error) {
        lastError = error;
        if (isRetryableGeminiError(error) && attempt === 0) {
          await new Promise((r) => setTimeout(r, 1200));
          continue;
        }
        break;
      }
    }
  }

  throw lastError ?? new Error("Gemini analysis failed");
}

async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const i = nextIndex++;
      results[i] = await fn(items[i], i);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker())
  );
  return results;
}

export async function POST(req: Request) {
  try {
    const apiKey = getGeminiApiKey();
    if (!apiKey) {
      return NextResponse.json(
        {
          error:
            "Gemini API key is missing. Set GEMINI_API_KEY or NEXT_PUBLIC_GEMINI_API_KEY in .env.local",
        },
        { status: 500 }
      );
    }

    const body = await req.json();
    const singleText =
      typeof body.text === "string" ? body.text.trim() : "";
    const bulkTexts: string[] = Array.isArray(body.texts)
      ? body.texts
          .map((t: unknown) => (typeof t === "string" ? t.trim() : ""))
          .filter((t: string): t is string => Boolean(t))
      : [];

    if (!singleText && bulkTexts.length === 0) {
      return NextResponse.json(
        { error: "Provide `text` or a non-empty `texts` array" },
        { status: 400 }
      );
    }

    const genAI = new GoogleGenerativeAI(apiKey);

    if (singleText && bulkTexts.length === 0) {
      const data = await analyzeOneText(genAI, singleText);
      return NextResponse.json(data);
    }

    if (bulkTexts.length > BULK_MAX_ITEMS) {
      return NextResponse.json(
        {
          error: `Bulk upload supports at most ${BULK_MAX_ITEMS} rows per request`,
        },
        { status: 400 }
      );
    }

    const perItem = await runWithConcurrency(
      bulkTexts,
      BULK_CONCURRENCY,
      async (text) => analyzeOneText(genAI, text)
    );

    const aggregated = aggregateAnalyses(perItem);
    const payload = {
      ...aggregated,
      itemCount: bulkTexts.length,
      perItem,
    };

    return NextResponse.json(payload);
  } catch (error) {
    console.error("AI Analysis Error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to analyze sentiment";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
