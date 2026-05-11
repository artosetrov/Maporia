"use client";

/**
 * ReviewsSection — самостоятельный блок отзывов для страницы места.
 *
 * Отвечает сам за:
 *  - fetch комментариев + их авторов одним батчом
 *  - расчёт aggregate {avg, count} по уже подгруженным
 *  - submit нового review (звёзды + текст)
 *  - render списка с возможностью удалить свой
 *
 * Используется в OfferPlaceView (service / experience). Legacy /id/[id]
 * для location пока имеет свою inline-логику — её мы трогать не стали.
 */

import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useUserAccessContext } from "../contexts/UserAccessContext";
import { useAuthRedirect } from "../hooks/useAuthRedirect";
import StarRating from "./StarRating";
import ConfirmDialog from "./ConfirmDialog";

type Review = {
  id: string;
  text: string;
  rating: number | null;
  created_at: string;
  user_id: string;
  user_display_name?: string | null;
  user_username?: string | null;
  user_avatar_url?: string | null;
};

type ReviewsSectionProps = {
  placeId: string;
  /** false = создатель отключил комментарии в settings. */
  commentsEnabled?: boolean | null;
};

function timeAgo(iso: string) {
  const d = new Date(iso).getTime();
  const diff = Date.now() - d;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 4) return `${weeks}w ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

function initials(name?: string | null, username?: string | null): string {
  if (name) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase().slice(0, 2);
    return name[0]?.toUpperCase() || "U";
  }
  if (username) return username[0]?.toUpperCase() || "U";
  return "U";
}

export default function ReviewsSection({ placeId, commentsEnabled }: ReviewsSectionProps) {
  const { redirectToAuth } = useAuthRedirect();
  const { user } = useUserAccessContext();
  const userId = user?.id ?? null;
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [draftText, setDraftText] = useState("");
  const [draftRating, setDraftRating] = useState(0);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [reviewToDeleteId, setReviewToDeleteId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: rawComments, error: cErr } = await supabase
        .from("comments")
        .select("id,text,rating,created_at,user_id")
        .eq("place_id", placeId)
        .order("created_at", { ascending: false });
      if (cErr) {
        setError(cErr.message);
        setReviews([]);
        return;
      }
      const list = (rawComments ?? []) as Review[];
      // Подтянуть профили одним IN-запросом
      const userIds = Array.from(new Set(list.map((r) => r.user_id)));
      let profilesMap = new Map<string, { display_name: string | null; username: string | null; avatar_url: string | null }>();
      if (userIds.length > 0) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, display_name, username, avatar_url")
          .in("id", userIds);
        profilesMap = new Map(
          (profs ?? []).map((p: { id: string; display_name: string | null; username: string | null; avatar_url: string | null }) => [
            p.id,
            { display_name: p.display_name, username: p.username, avatar_url: p.avatar_url },
          ])
        );
      }
      setReviews(
        list.map((r) => {
          const p = profilesMap.get(r.user_id);
          return {
            ...r,
            user_display_name: p?.display_name ?? null,
            user_username: p?.username ?? null,
            user_avatar_url: p?.avatar_url ?? null,
          };
        })
      );
    } finally {
      setLoading(false);
    }
  }, [placeId]);

  useEffect(() => {
    void load();
  }, [load]);

  const rated = reviews.filter((r) => typeof r.rating === "number");
  const aggregate = {
    avg: rated.length > 0 ? Math.round((rated.reduce((s, r) => s + (r.rating ?? 0), 0) / rated.length) * 100) / 100 : 0,
    count: rated.length,
  };

  async function submit() {
    setError(null);
    if (!userId) {
      redirectToAuth("reviews_submit_auth_required");
      return;
    }
    if (!draftText.trim() || draftRating === 0) {
      setError("Pick a rating and write a few words.");
      return;
    }
    setSubmitting(true);
    const { data, error: insErr } = await supabase
      .from("comments")
      .insert({
        place_id: placeId,
        user_id: userId,
        text: draftText.trim(),
        rating: draftRating,
      } as never)
      .select("id,text,rating,created_at,user_id")
      .single();
    setSubmitting(false);
    if (insErr) {
      setError(insErr.message || "Failed to post review.");
      return;
    }
    if (data) {
      // Добавим профиль вручную (чтобы не делать ещё один запрос)
      const { data: prof } = await supabase
        .from("profiles")
        .select("display_name, username, avatar_url")
        .eq("id", userId)
        .maybeSingle();
      const next: Review = {
        ...(data as Review),
        user_display_name: (prof as { display_name?: string | null } | null)?.display_name ?? null,
        user_username: (prof as { username?: string | null } | null)?.username ?? null,
        user_avatar_url: (prof as { avatar_url?: string | null } | null)?.avatar_url ?? null,
      };
      setReviews((prev) => [next, ...prev]);
      setDraftText("");
      setDraftRating(0);
    }
  }

  async function remove(id: string) {
    if (!userId) return;
    setDeletingId(id);
    const { error: dErr } = await supabase.from("comments").delete().eq("id", id).eq("user_id", userId);
    setDeletingId(null);
    if (dErr) {
      setError(dErr.message || "Failed to delete review.");
      return;
    }

    setReviewToDeleteId(null);
    setReviews((prev) => prev.filter((r) => r.id !== id));
  }

  // ── Render ────────────────────────────────────────────────────

  return (
    <section className="mb-8">
      <ConfirmDialog
        open={reviewToDeleteId !== null}
        title="Delete review?"
        description="This removes your review from this place. This action cannot be undone."
        confirmLabel="Delete"
        loading={reviewToDeleteId !== null && deletingId === reviewToDeleteId}
        onClose={() => {
          if (!deletingId) setReviewToDeleteId(null);
        }}
        onConfirm={() => {
          if (reviewToDeleteId) void remove(reviewToDeleteId);
        }}
      />
      <div className="flex items-baseline gap-3 mb-3">
        <h2 className="font-fraunces text-xl font-semibold text-[#1F2A1F]">Reviews</h2>
        {aggregate.count > 0 && (
          <div className="flex items-center gap-1.5 text-sm text-[#1F2A1F]">
            <StarRating value={aggregate.avg} size={14} />
            <span className="font-semibold">{aggregate.avg.toFixed(2)}</span>
            <span className="text-[#6F7A5A]">·</span>
            <span className="text-[#6F7A5A]">{aggregate.count}</span>
          </div>
        )}
      </div>

      {commentsEnabled === false ? (
        <div className="text-center py-10 text-[#A8B096] text-sm">Reviews are disabled for this place.</div>
      ) : (
        <>
          {/* Composer */}
          {userId ? (
            <div className="rounded-2xl border border-[#ECEEE4] bg-white p-4 mb-5">
              <div className="mb-3">
                <div className="text-xs uppercase tracking-wide text-[#6F7A5A] mb-1.5">Your rating</div>
                <StarRating value={draftRating} size={26} onChange={setDraftRating} />
              </div>
              <textarea
                value={draftText}
                onChange={(e) => {
                  setDraftText(e.target.value);
                  setError(null);
                }}
                placeholder="Share your experience…"
                rows={3}
                className="w-full bg-transparent text-sm outline-none text-[#1F2A1F] placeholder:text-[#A8B096] resize-none mb-3"
              />
              {error && <div className="text-xs text-[#C96A5B] mb-2">{error}</div>}
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={submit}
                  disabled={submitting || !draftText.trim() || draftRating === 0}
                  className={
                    "h-10 px-5 rounded-xl text-sm font-medium transition " +
                    (submitting || !draftText.trim() || draftRating === 0
                      ? "bg-[#DADDD0] text-[#6F7A5A] cursor-not-allowed"
                      : "bg-[#8F9E4F] text-white hover:bg-[#556036]")
                  }
                >
                  {submitting ? "Posting…" : "Post review"}
                </button>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-[#ECEEE4] bg-[#FAFAF7] p-4 mb-5 text-center">
              <p className="text-sm text-[#3F4A35] mb-2">Sign in to leave a review</p>
              <button
                type="button"
                onClick={() => redirectToAuth("reviews_sign_in")}
                className="h-10 px-5 rounded-xl bg-[#8F9E4F] text-white text-sm font-medium hover:bg-[#556036] transition"
              >
                Sign in
              </button>
            </div>
          )}

          {/* List */}
          {loading ? (
            <div className="text-sm text-[#A8B096]">Loading…</div>
          ) : reviews.length === 0 ? (
            <div className="text-center py-10 text-[#A8B096] text-sm">No reviews yet — be the first.</div>
          ) : (
            <ul className="space-y-4">
              {reviews.map((r) => (
                <li key={r.id} className="rounded-2xl border border-[#ECEEE4] bg-white p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-full bg-[#FAFAF7] border border-[#ECEEE4] overflow-hidden flex items-center justify-center text-xs font-semibold text-[#8F9E4F]">
                      {r.user_avatar_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={r.user_avatar_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <span>{initials(r.user_display_name, r.user_username)}</span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-[#1F2A1F] truncate">
                            {r.user_display_name || r.user_username || "User"}
                          </div>
                          <div className="text-xs text-[#6F7A5A]">{timeAgo(r.created_at)}</div>
                        </div>
                        {r.user_id === userId && (
                          <button
                            type="button"
                            onClick={() => setReviewToDeleteId(r.id)}
                            disabled={deletingId === r.id}
                            className="text-xs text-[#C96A5B] hover:text-[#B85A4B] disabled:opacity-50"
                          >
                            {deletingId === r.id ? "Deleting…" : "Delete"}
                          </button>
                        )}
                      </div>
                      {typeof r.rating === "number" && (
                        <div className="mb-1.5">
                          <StarRating value={r.rating} size={14} />
                        </div>
                      )}
                      <div className="text-sm text-[#1F2A1F] leading-relaxed whitespace-pre-wrap">{r.text}</div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
