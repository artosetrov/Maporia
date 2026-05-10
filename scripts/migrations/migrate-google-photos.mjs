#!/usr/bin/env node
/**
 * Migration script: Download Google Places API photos → Supabase Storage.
 *
 * Prerequisites:
 * - Google Places API must be ENABLED in Google Cloud Console
 * - .env.local must have: SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_URL, GOOGLE_MAPS_API_KEY
 *
 * Usage:
 *   node scripts/migrations/migrate-google-photos.mjs --dry-run          # Preview without changes
 *   node scripts/migrations/migrate-google-photos.mjs --limit=10         # Migrate first 10 photos
 *   node scripts/migrations/migrate-google-photos.mjs                    # Full migration
 *   node scripts/migrations/migrate-google-photos.mjs --concurrency=3    # Slower, gentler on API
 *
 * Estimated cost: ~1900 photos × $0.007 = ~$13.30 (within $200 free monthly credit)
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { randomUUID } from "crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ─── CLI Arguments ───────────────────────────────────────────────
const args = process.argv.slice(2);
const isDryRun = args.includes("--dry-run");
const concurrency = parseInt(
  args.find((a) => a.startsWith("--concurrency="))?.split("=")[1] || "5"
);
const limit = parseInt(
  args.find((a) => a.startsWith("--limit="))?.split("=")[1] || "0"
);
const MAX_WIDTH = 1200; // Higher quality for permanent storage
const DELAY_BETWEEN_BATCHES_MS = 300;
const DOWNLOAD_TIMEOUT_MS = 30_000;

// ─── Load .env.local ─────────────────────────────────────────────
function loadEnv() {
  const envPath = join(__dirname, "..", "..", ".env.local");
  const envContent = readFileSync(envPath, "utf-8");
  const env = {};
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    env[trimmed.slice(0, eqIdx).trim()] = trimmed
      .slice(eqIdx + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
  }
  return env;
}

const env = loadEnv();
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const GOOGLE_API_KEY =
  env.GOOGLE_MAPS_API_KEY || env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}
if (!GOOGLE_API_KEY) {
  console.error("❌ Missing GOOGLE_MAPS_API_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ─── Statistics ──────────────────────────────────────────────────
const stats = {
  total: 0,
  downloaded: 0,
  uploaded: 0,
  dbUpdated: 0,
  reused: 0,
  skipped: 0,
  errors: 0,
  /** @type {{ id: string; error: string }[]} */
  errorDetails: [],
  startTime: Date.now(),
};

// ─── Helpers ─────────────────────────────────────────────────────
const CONTENT_TYPE_TO_EXT = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
};

function getExtFromContentType(ct) {
  return CONTENT_TYPE_TO_EXT[ct?.toLowerCase()?.split(";")[0]?.trim()] || "jpg";
}

/**
 * Rebuild the photo URL with a fresh API key and desired maxWidth.
 * Handles both Google Places API v1 and legacy formats.
 */
function rebuildPhotoUrl(url) {
  if (!url) return null;

  // v1 format: https://places.googleapis.com/v1/places/{id}/photos/{ref}/media?...
  const v1Match = url.match(
    /https:\/\/places\.googleapis\.com\/v1\/(places\/[^/]+\/photos\/[^/]+)\/media/
  );
  if (v1Match) {
    return `https://places.googleapis.com/v1/${v1Match[1]}/media?maxWidthPx=${MAX_WIDTH}&key=${GOOGLE_API_KEY}`;
  }

  // Legacy format: ...photo_reference=REF&key=...
  const legacyMatch = url.match(/photo_reference=([^&]+)/);
  if (legacyMatch) {
    return `https://maps.googleapis.com/maps/api/place/photo?maxwidth=${MAX_WIDTH}&photo_reference=${legacyMatch[1]}&key=${GOOGLE_API_KEY}`;
  }

  return null;
}

/**
 * Download a photo from Google and upload to Supabase Storage.
 * Returns { success, publicUrl?, size?, error? }
 */
async function downloadAndUpload(url) {
  const freshUrl = rebuildPhotoUrl(url);
  if (!freshUrl) {
    return { success: false, error: "Cannot parse Google photo URL" };
  }

  // 1. Download from Google
  let response;
  try {
    response = await fetch(freshUrl, {
      redirect: "follow",
      signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
    });
  } catch (err) {
    return { success: false, error: `Download failed: ${err.message}` };
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    const detail = body.slice(0, 120);
    return {
      success: false,
      error: `HTTP ${response.status}: ${response.statusText}${detail ? ` — ${detail}` : ""}`,
    };
  }

  const contentType = response.headers.get("content-type") || "image/jpeg";
  const ext = getExtFromContentType(contentType);
  const buffer = Buffer.from(await response.arrayBuffer());

  // Sanity check — very small response likely means error HTML
  if (buffer.length < 1000) {
    return {
      success: false,
      error: `Response too small (${buffer.length} bytes), likely an error page`,
    };
  }

  // 2. Upload to Supabase Storage
  const filename = `places/${randomUUID()}.${ext}`;
  const { error: uploadError } = await supabase.storage
    .from("place-photos")
    .upload(filename, buffer, { contentType, upsert: false });

  if (uploadError) {
    return { success: false, error: `Upload: ${uploadError.message}` };
  }

  // 3. Public URL
  const {
    data: { publicUrl },
  } = supabase.storage.from("place-photos").getPublicUrl(filename);

  return { success: true, publicUrl, size: buffer.length };
}

// ─── Pagination helper (Supabase default limit = 1000) ──────────
async function fetchAllRows(table, select, filterFn) {
  const allRows = [];
  const pageSize = 1000;
  let from = 0;

  while (true) {
    let query = supabase
      .from(table)
      .select(select)
      .range(from, from + pageSize - 1);

    query = filterFn(query);

    const { data, error } = await query;
    if (error) throw new Error(`Fetch ${table}: ${error.message}`);
    if (!data || data.length === 0) break;

    allRows.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }

  return allRows;
}

// ─── Progress bar ────────────────────────────────────────────────
function printProgress(current, total, label) {
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;
  const elapsed = (Date.now() - stats.startTime) / 1000;
  const rate = current > 0 ? elapsed / current : 0;
  const remaining = Math.round(rate * (total - current));
  const bar = "█".repeat(Math.round(pct / 4)) + "░".repeat(25 - Math.round(pct / 4));
  process.stdout.write(
    `\r   ${bar} ${pct}% (${current}/${total}) ${label} — ~${remaining}s left   `
  );
}

// ─── Process photos with controlled concurrency ─────────────────
async function processPhotos(rows, updateFn) {
  for (let i = 0; i < rows.length; i += concurrency) {
    const batch = rows.slice(i, i + concurrency);

    await Promise.allSettled(
      batch.map(async (row) => {
        const url = row.url ?? row.cover_url;
        const rowId = row.id;

        if (isDryRun) {
          stats.skipped++;
          return;
        }

        const result = await downloadAndUpload(url);

        if (!result.success) {
          stats.errors++;
          stats.errorDetails.push({ id: rowId, error: result.error });
          return;
        }

        stats.downloaded++;
        stats.uploaded++;

        // Update DB
        const dbError = await updateFn(row, result.publicUrl);
        if (dbError) {
          stats.errors++;
          stats.errorDetails.push({
            id: rowId,
            error: `DB update: ${dbError}`,
          });
          return;
        }

        stats.dbUpdated++;
      })
    );

    printProgress(
      Math.min(i + concurrency, rows.length),
      rows.length,
      `${stats.downloaded} ok / ${stats.errors} err`
    );

    // Rate-limit
    if (i + concurrency < rows.length) {
      await new Promise((r) => setTimeout(r, DELAY_BETWEEN_BATCHES_MS));
    }
  }

  process.stdout.write("\n");
}

// ─── Main ────────────────────────────────────────────────────────
async function main() {
  console.log("\n🔄 Google Photos → Supabase Storage Migration");
  console.log(`   Mode: ${isDryRun ? "🔍 DRY RUN" : "🚀 LIVE"}`);
  console.log(`   Concurrency: ${concurrency}`);
  console.log(`   Max width: ${MAX_WIDTH}px`);
  if (limit > 0) console.log(`   Limit: ${limit}`);
  console.log("");

  // ─── Step 1: place_photos ──────────────────────────────────────
  console.log("━━━ Step 1/2: Migrating place_photos ━━━");

  let photoRows = await fetchAllRows(
    "place_photos",
    "id, place_id, url, sort",
    (q) =>
      q
        .or(
          "url.like.%places.googleapis.com%,url.like.%maps.googleapis.com%"
        )
        .order("sort", { ascending: true })
  );

  if (limit > 0) photoRows = photoRows.slice(0, limit);

  console.log(`   Found ${photoRows.length} Google API photos\n`);
  stats.total += photoRows.length;

  if (photoRows.length > 0) {
    await processPhotos(photoRows, async (row, newUrl) => {
      const { error } = await supabase
        .from("place_photos")
        .update({ url: newUrl })
        .eq("id", row.id);
      return error?.message || null;
    });
  }

  // ─── Step 2: places.cover_url ──────────────────────────────────
  console.log("\n━━━ Step 2/2: Migrating places.cover_url ━━━");

  let coverRows = await fetchAllRows("places", "id, cover_url", (q) =>
    q.or(
      "cover_url.like.%places.googleapis.com%,cover_url.like.%maps.googleapis.com%"
    )
  );

  if (limit > 0) coverRows = coverRows.slice(0, limit);

  console.log(`   Found ${coverRows.length} Google API cover URLs`);
  stats.total += coverRows.length;

  if (coverRows.length > 0) {
    // Try to reuse already-migrated photos from place_photos
    const needsDownload = [];

    for (const row of coverRows) {
      const { data: existing } = await supabase
        .from("place_photos")
        .select("url")
        .eq("place_id", row.id)
        .not("url", "like", "%places.googleapis.com%")
        .not("url", "like", "%maps.googleapis.com%")
        .order("sort", { ascending: true })
        .limit(1);

      if (existing && existing.length > 0) {
        // Reuse first valid photo
        if (!isDryRun) {
          await supabase
            .from("places")
            .update({ cover_url: existing[0].url })
            .eq("id", row.id);
          stats.dbUpdated++;
        }
        stats.reused++;
      } else {
        needsDownload.push(row);
      }
    }

    if (stats.reused > 0) {
      console.log(
        `   ♻️  Reused ${stats.reused} existing photos for cover_url`
      );
    }

    if (needsDownload.length > 0) {
      console.log(
        `   📥 Downloading ${needsDownload.length} cover photos\n`
      );
      await processPhotos(needsDownload, async (row, newUrl) => {
        const { error } = await supabase
          .from("places")
          .update({ cover_url: newUrl })
          .eq("id", row.id);
        return error?.message || null;
      });
    }
  }

  // ─── Summary ───────────────────────────────────────────────────
  const elapsed = ((Date.now() - stats.startTime) / 1000).toFixed(1);

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("📊 Migration Summary:");
  console.log(`   Total processed : ${stats.total}`);
  console.log(`   Downloaded      : ${stats.downloaded}`);
  console.log(`   Uploaded        : ${stats.uploaded}`);
  console.log(`   DB updated      : ${stats.dbUpdated}`);
  console.log(`   Reused covers   : ${stats.reused}`);
  console.log(`   Skipped (dry)   : ${stats.skipped}`);
  console.log(`   Errors          : ${stats.errors}`);
  console.log(`   Time            : ${elapsed}s`);

  if (stats.errorDetails.length > 0) {
    console.log(`\n❌ Errors (first 30):`);
    for (const err of stats.errorDetails.slice(0, 30)) {
      console.log(`   ${err.id.slice(0, 8)}: ${err.error}`);
    }
    if (stats.errorDetails.length > 30) {
      console.log(`   ... and ${stats.errorDetails.length - 30} more`);
    }
  }

  if (isDryRun) {
    console.log("\n🔍 DRY RUN — no changes were made.");
    console.log("   Run without --dry-run to execute migration.");
  }

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
}

main().catch((err) => {
  console.error("💀 Fatal error:", err);
  process.exit(1);
});
