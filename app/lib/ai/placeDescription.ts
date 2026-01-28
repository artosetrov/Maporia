export type GooglePlaceAiContext = {
  name?: string | null;
  types?: string[] | null;
  formatted_address?: string | null;
  rating?: number | null;
  user_ratings_total?: number | null;
  editorial_summary?: string | null;
  reviews?: string[] | null; // up to 3
};

export class OpenAiApiError extends Error {
  status: number;
  openAiType?: string;
  openAiCode?: string;
  raw?: string;

  constructor(args: {
    status: number;
    message: string;
    openAiType?: string;
    openAiCode?: string;
    raw?: string;
  }) {
    super(args.message);
    this.name = "OpenAiApiError";
    this.status = args.status;
    this.openAiType = args.openAiType;
    this.openAiCode = args.openAiCode;
    this.raw = args.raw;
  }
}

function stripUrls(input: string): string {
  return input.replace(/https?:\/\/\S+|www\.\S+/gi, "").replace(/\s{2,}/g, " ").trim();
}

function stripEmojis(input: string): string {
  // Basic emoji strip (covers most emoji blocks)
  return input.replace(
    /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu,
    ""
  );
}

function clampToSentences(text: string, min: number, max: number): string {
  const cleaned = text.trim();
  const parts = cleaned
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  if (parts.length === 0) return cleaned;
  const sliced = parts.slice(0, Math.max(min, Math.min(max, parts.length)));
  return sliced.join(" ").trim();
}

export function buildAiPrompt(ctx: GooglePlaceAiContext): { system: string; user: string } {
  const name = ctx.name?.trim() || "this place";
  const types = (ctx.types || []).filter(Boolean).slice(0, 6).join(", ");
  const addr = ctx.formatted_address?.trim() || "";
  const rating =
    typeof ctx.rating === "number" && !Number.isNaN(ctx.rating) ? ctx.rating.toFixed(1) : "";
  const ratingsTotal =
    typeof ctx.user_ratings_total === "number" && !Number.isNaN(ctx.user_ratings_total)
      ? String(ctx.user_ratings_total)
      : "";
  const editorial = ctx.editorial_summary?.trim() || "";
  const reviews = (ctx.reviews || []).filter(Boolean).slice(0, 3);

  const facts: string[] = [];
  if (addr) facts.push(`Address: ${addr}`);
  if (types) facts.push(`Types: ${types}`);
  if (rating) facts.push(`Rating: ${rating}${ratingsTotal ? ` (${ratingsTotal} ratings)` : ""}`);
  if (editorial) facts.push(`Editorial summary: ${editorial}`);
  if (reviews.length) {
    facts.push(
      `Review snippets:\n${reviews
        .map((r, i) => `- ${stripUrls(stripEmojis(r)).slice(0, 240)}`)
        .join("\n")}`
    );
  }

  const system = [
    "You are a local with great taste writing place descriptions for a map app.",
    "Write in natural, warm, grounded language.",
    "No emojis. No marketing tone. No tourist clichés.",
    "Do not repeat obvious facts like the full address.",
    "Do not use lists or bullet points.",
    "3–5 sentences. Vibe & atmosphere first.",
    "No links or URLs.",
  ].join(" ");

  const user = [
    "Write a short atmospheric description of this place as a local would recommend it.",
    "Focus on vibe, emotions, and why it feels special.",
    "Avoid tourist language, lists, and facts repetition.",
    "",
    `Place name: ${name}`,
    facts.length ? `\nGoogle data:\n${facts.join("\n")}` : "",
  ]
    .join("\n")
    .trim();

  return { system, user };
}

export async function callOpenAiForDescription(args: {
  openAiApiKey: string;
  model: string;
  prompt: { system: string; user: string };
  timeoutMs?: number;
}): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), args.timeoutMs ?? 25000);

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${args.openAiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: args.model,
        temperature: 0.8,
        messages: [
          { role: "system", content: args.prompt.system },
          { role: "user", content: args.prompt.user },
        ],
      }),
      signal: controller.signal,
    });

    const text = await res.text();
    if (!res.ok) {
      // Try to parse OpenAI error shape: { error: { message, type, code, ... } }
      let parsed: any = null;
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = null;
      }

      const errObj = parsed?.error;
      const errMessage: string =
        (typeof errObj?.message === "string" && errObj.message.trim()) ||
        `OpenAI request failed (${res.status})`;
      const errType: string | undefined = typeof errObj?.type === "string" ? errObj.type : undefined;
      const errCode: string | undefined = typeof errObj?.code === "string" ? errObj.code : undefined;

      throw new OpenAiApiError({
        status: res.status,
        message: errMessage,
        openAiType: errType,
        openAiCode: errCode,
        raw: text.slice(0, 2000),
      });
    }

    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error("OpenAI returned invalid JSON");
    }

    const content: string | undefined = data?.choices?.[0]?.message?.content;
    if (!content || typeof content !== "string") {
      throw new Error("OpenAI returned empty content");
    }

    // post-process: enforce rules (no links/emojis, 3–5 sentences)
    const cleaned = stripUrls(stripEmojis(content)).replace(/\s{2,}/g, " ").trim();
    const clamped = clampToSentences(cleaned, 3, 5);
    return clamped;
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchGooglePlaceAiContext(args: {
  googleApiKey: string;
  googlePlaceId: string;
}): Promise<GooglePlaceAiContext> {
  const placeId = args.googlePlaceId.replace(/^places\//, "");

  const fieldMask = [
    "id",
    "displayName",
    "types",
    "formattedAddress",
    "rating",
    "userRatingCount",
    "editorialSummary",
    "reviews",
  ].join(",");

  const res = await fetch(`https://places.googleapis.com/v1/places/${placeId}`, {
    headers: {
      "X-Goog-Api-Key": args.googleApiKey,
      "X-Goog-FieldMask": fieldMask,
    },
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Google Places error ${res.status}: ${text.slice(0, 300)}`);
  }

  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("Google Places returned invalid JSON");
  }

  const name = data?.displayName?.text || data?.displayName || null;
  const types: string[] | null = Array.isArray(data?.types) ? data.types : null;
  const formatted_address = data?.formattedAddress || null;
  const rating = typeof data?.rating === "number" ? data.rating : data?.rating ? Number(data.rating) : null;
  const user_ratings_total =
    typeof data?.userRatingCount === "number"
      ? data.userRatingCount
      : data?.userRatingCount
        ? Number(data.userRatingCount)
        : null;

  const editorial_summary = data?.editorialSummary?.text || data?.editorialSummary || null;

  const reviewsRaw: any[] = Array.isArray(data?.reviews) ? data.reviews : [];
  const reviews = reviewsRaw
    .map((r) => r?.text?.text || r?.text || r?.originalText?.text || "")
    .filter((s: string) => typeof s === "string" && s.trim().length > 0)
    .slice(0, 3);

  return {
    name,
    types,
    formatted_address,
    rating: Number.isFinite(rating as any) ? (rating as number) : null,
    user_ratings_total: Number.isFinite(user_ratings_total as any) ? (user_ratings_total as number) : null,
    editorial_summary: editorial_summary ? String(editorial_summary) : null,
    reviews,
  };
}

