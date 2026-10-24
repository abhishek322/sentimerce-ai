export type SentimentLabel = "Positive" | "Negative" | "Neutral";

export type PieSlice = {
  name: SentimentLabel;
  value: number;
  color: string;
};

export type EmotionScore = {
  name: string;
  score: number;
};

export type SentimentAnalysis = {
  sentiment: SentimentLabel;
  confidence: number;
  pieData: PieSlice[];
  emotions: EmotionScore[];
  summary: string;
};

export type BulkSentimentAnalysis = SentimentAnalysis & {
  itemCount: number;
  perItem?: SentimentAnalysis[];
};

const PIE_COLORS: Record<SentimentLabel, string> = {
  Positive: "#22c55e",
  Neutral: "#94a3b8",
  Negative: "#ef4444",
};

const EMOTION_NAMES = ["Joy", "Anger", "Surprise", "Sadness"] as const;

export function getGeminiApiKey(): string | undefined {
  return (
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_GEMINI_API_KEY ||
    process.env.NEXT_PUBLIC_GEMINI_API_KEY
  );
}

export function getGeminiModelIds(): string[] {
  const configured = process.env.GEMINI_MODEL?.trim();
  if (configured) return [configured];
  return ["gemini-3.8-flash", "gemini-3.5-flash-lite"];
}

export function buildSingleAnalysisPrompt(text: string): string {
  return `
Analyze the sentiment of the following social media text:
"""
${text}
"""

Return strictly valid JSON with these keys:
1. "sentiment": "Positive" | "Negative" | "Neutral"
2. "confidence": number from 0 to 100
3. "pieData": array of exactly 3 objects for Positive, Neutral, Negative with keys name, value (percentages summing to 100), color ("#22c55e", "#94a3b8", "#ef4444")
4. "emotions": array of exactly 4 objects: Joy, Anger, Surprise, Sadness — each with name and score (0-100)
5. "summary": brief 2-sentence explanation

Return only the JSON object, no markdown.
`.trim();
}

export function parseGeminiJson<T>(raw: string): T {
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  return JSON.parse(cleaned) as T;
}

function clampScore(n: unknown): number {
  const num = typeof n === "number" ? n : Number(n);
  if (Number.isNaN(num)) return 0;
  return Math.min(100, Math.max(0, Math.round(num)));
}

function normalizeSentiment(value: unknown): SentimentLabel {
  const s = String(value ?? "").toLowerCase();
  if (s.includes("neg")) return "Negative";
  if (s.includes("pos")) return "Positive";
  return "Neutral";
}

export function normalizeAnalysis(raw: Partial<SentimentAnalysis>): SentimentAnalysis {
  const sentiment = normalizeSentiment(raw.sentiment);
  const pieFromAi = Array.isArray(raw.pieData) ? raw.pieData : [];
  const pieData: PieSlice[] = (["Positive", "Neutral", "Negative"] as const).map(
    (name) => {
      const found = pieFromAi.find(
        (p) => String(p?.name).toLowerCase() === name.toLowerCase()
      );
      return {
        name,
        value: clampScore(found?.value ?? (name === sentiment ? 70 : 15)),
        color: PIE_COLORS[name],
      };
    }
  );

  const emotionRaw = Array.isArray(raw.emotions) ? raw.emotions : [];
  const emotions: EmotionScore[] = EMOTION_NAMES.map((name) => {
    const found = emotionRaw.find(
      (e) => String(e?.name).toLowerCase() === name.toLowerCase()
    );
    return { name, score: clampScore(found?.score) };
  });

  return {
    sentiment,
    confidence: clampScore(raw.confidence ?? 75),
    pieData,
    emotions,
    summary:
      typeof raw.summary === "string" && raw.summary.trim()
        ? raw.summary.trim()
        : `Overall sentiment is ${sentiment.toLowerCase()} with ${clampScore(raw.confidence ?? 75)}% confidence.`,
  };
}

export function aggregateAnalyses(items: SentimentAnalysis[]): SentimentAnalysis {
  if (items.length === 1) return items[0];

  const counts: Record<SentimentLabel, number> = {
    Positive: 0,
    Negative: 0,
    Neutral: 0,
  };
  let confidenceSum = 0;
  const emotionSums: Record<string, number> = Object.fromEntries(
    EMOTION_NAMES.map((n) => [n, 0])
  );

  for (const item of items) {
    counts[item.sentiment]++;
    confidenceSum += item.confidence;
    for (const e of item.emotions) {
      if (emotionSums[e.name] !== undefined) {
        emotionSums[e.name] += e.score;
      }
    }
  }

  const total = items.length;
  const pieData: PieSlice[] = (["Positive", "Neutral", "Negative"] as const).map(
    (name) => ({
      name,
      value: Math.round((counts[name] / total) * 100),
      color: PIE_COLORS[name],
    })
  );

  const emotions: EmotionScore[] = EMOTION_NAMES.map((name) => ({
    name,
    score: Math.round(emotionSums[name] / total),
  }));

  const sentiment = (Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ??
    "Neutral") as SentimentLabel;

  const summary = `Analyzed ${total} entries: ${counts.Positive} positive, ${counts.Neutral} neutral, and ${counts.Negative} negative. Dominant overall sentiment is ${sentiment.toLowerCase()}.`;

  return {
    sentiment,
    confidence: Math.round(confidenceSum / total),
    pieData,
    emotions,
    summary,
  };
}

export const BULK_MAX_ITEMS = 50;
export const BULK_CONCURRENCY = 4;
