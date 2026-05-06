"use client";

/**
 * /add — выбор типа создаваемой карточки.
 *
 * Раньше эта страница автоматически создавала пустой `place` и редиректила
 * в редактор. Теперь у нас три типа: Locations / Services / Experiences,
 * поэтому сначала нужно спросить пользователя, ЧТО он создаёт.
 *
 * Поведение:
 *  - Без `?kind=` — показываем экран выбора с тремя карточками.
 *  - С `?kind=location|service|experience` — мгновенно создаём пустую запись
 *    нужного типа (фоллбэк для прямых ссылок и для UX «уже выбрал»).
 *  - `returnTo` пробрасывается в редактор, чтобы Cancel вернул туда же.
 */

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "../../lib/supabase";
import type { Database, PlaceKind } from "../../types/supabase";
import type { PostgrestError } from "@supabase/supabase-js";
import { useUserAccessContext } from "../../contexts/UserAccessContext";
import { useAuthRedirect } from "../../hooks/useAuthRedirect";
import { canUserAddPlace } from "../../lib/access";
import Icon from "../../components/Icon";

type PlacesRow = Database["public"]["Tables"]["places"]["Row"];
type PlaceIdResult = { data: Pick<PlacesRow, "id"> | null; error: PostgrestError | null };

type KindOption = {
  kind: PlaceKind;
  emoji: string;
  title: string;
  subtitle: string;
  examples: string;
};

const KIND_OPTIONS: KindOption[] = [
  {
    kind: "location",
    emoji: "📍",
    title: "Локация",
    subtitle: "Место на карте — кафе, видовая, парк, спот.",
    examples: "Бар на крыше, секретный пляж, кофейня",
  },
  {
    kind: "service",
    emoji: "🛠",
    title: "Услуга",
    subtitle: "То, что кто-то делает: с ценой и режимом работы.",
    examples: "Массаж, фотограф, инструктор по сёрфу",
  },
  {
    kind: "experience",
    emoji: "✨",
    title: "Экспириенс",
    subtitle: "Впечатление с расписанием и длительностью (как Airbnb).",
    examples: "Гастро-тур, мастер-класс, экскурсия",
  },
];

function isValidKind(value: string | null): value is PlaceKind {
  return value === "location" || value === "service" || value === "experience";
}

export default function AddPlacePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { replaceToAuth } = useAuthRedirect();
  const { loading: accessLoading, user, access } = useUserAccessContext();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const returnTo = useMemo(() => searchParams.get("returnTo") || "/profile", [searchParams]);
  const presetKindParam = searchParams.get("kind");
  const presetKind: PlaceKind | null = isValidKind(presetKindParam) ? presetKindParam : null;

  const canAdd = canUserAddPlace(access);

  // Гейт по авторизации (как раньше)
  useEffect(() => {
    if (accessLoading) return;
    if (!user) {
      replaceToAuth();
    }
  }, [accessLoading, user, replaceToAuth]);

  // Если пользователь пришёл с ?kind=… — создаём сразу.
  useEffect(() => {
    if (accessLoading || !user || !canAdd || !presetKind || creating) return;
    void createAndRedirect(presetKind);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessLoading, user, canAdd, presetKind]);

  async function createAndRedirect(kind: PlaceKind) {
    if (!user) return;
    setError(null);
    setCreating(true);

    try {
      const payload = {
        kind, // <-- тип карточки
        title: "",
        description: null,
        city: null,
        address: null,
        lat: null,
        lng: null,
        categories: null,
        link: null,
        access_level: "public",
        is_hidden: true, // черновик до заполнения обязательных полей
        created_by: user.id,
      };

      const result = (await supabase
        .from("places")
        // @ts-expect-error - Supabase infers Insert as never; payload matches Database['public']['Tables']['places']['Insert']
        .insert(payload)
        .select("id")
        .single()) as PlaceIdResult;

      const placeData = result.data;
      const createError = result.error;

      if (createError) {
        console.error("Error creating place:", createError);
        const errorMessage =
          createError.message ||
          createError.code ||
          createError.details ||
          createError.hint ||
          "Failed to create place. Check console for details.";
        setError(errorMessage);
        setCreating(false);
        return;
      }

      if (!placeData?.id) {
        setError("Failed to create place. No ID returned. Check RLS policies.");
        setCreating(false);
        return;
      }

      const editUrl = `/places/${placeData.id}/edit?returnTo=${encodeURIComponent(returnTo)}`;
      // window.location.href сохранил из старой версии — гарантирует чистый mount редактора.
      window.location.href = editUrl;
    } catch (err) {
      console.error("Exception creating place:", err);
      setError(err instanceof Error ? err.message : "Failed to create place");
      setCreating(false);
    }
  }

  // Создание идёт — показываем спиннер
  if (creating) {
    return (
      <main className="min-h-screen bg-[#FAFAF7] flex items-center justify-center">
        <div className="text-center">
          <div className="text-sm text-[#6F7A5A] mb-2">Creating…</div>
          {error && <div className="text-sm text-[#C96A5B] mt-2">{error}</div>}
        </div>
      </main>
    );
  }

  // Пока грузится access
  if (accessLoading) {
    return (
      <main className="min-h-screen bg-[#FAFAF7] flex items-center justify-center">
        <div className="text-sm text-[#6F7A5A]">Loading…</div>
      </main>
    );
  }

  // Premium-гейт
  if (!canAdd) {
    return (
      <main className="min-h-screen bg-[#FAFAF7] flex items-center justify-center">
        <div className="max-w-md mx-auto px-6 text-center">
          <div className="text-lg font-semibold text-[#1F2A1F] mb-2">Premium Required</div>
          <div className="text-sm text-[#6F7A5A] mb-4">
            Only Premium users can create places. Please upgrade to Premium to add new entries.
          </div>
          <button
            onClick={() => router.push("/")}
            className="px-4 py-2 bg-[#1F2A1F] text-white rounded-lg hover:bg-[#2A3A2A] transition-colors"
          >
            Go Home
          </button>
        </div>
      </main>
    );
  }

  // Главный экран — три карточки
  return (
    <main className="min-h-screen bg-[#FAFAF7]">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        <div className="mb-6 sm:mb-10">
          <h1 className="font-fraunces text-2xl sm:text-3xl font-semibold text-[#1F2A1F] mb-2">
            Что вы добавляете?
          </h1>
          <p className="text-sm text-[#6F7A5A]">
            Выберите тип карточки. Дальше вы заполните детали — фото, название, описание.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:gap-4">
          {KIND_OPTIONS.map((opt) => (
            <button
              key={opt.kind}
              type="button"
              onClick={() => createAndRedirect(opt.kind)}
              className="group relative w-full text-left rounded-2xl border border-[#ECEEE4] bg-white p-5 sm:p-6 shadow-sm hover:shadow-md hover:border-[#8F9E4F] transition focus:outline-none focus:ring-2 focus:ring-[#8F9E4F] focus:ring-offset-2"
              aria-label={`Create ${opt.title}`}
            >
              <div className="flex items-start gap-4">
                <div
                  aria-hidden
                  className="flex h-12 w-12 sm:h-14 sm:w-14 shrink-0 items-center justify-center rounded-xl bg-[#FAFAF7] text-2xl sm:text-3xl"
                >
                  {opt.emoji}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-fraunces font-semibold text-[#1F2A1F] text-lg mb-1">
                    {opt.title}
                  </div>
                  <div className="text-sm text-[#3F4A35] mb-2">{opt.subtitle}</div>
                  <div className="text-xs text-[#6F7A5A]">
                    Например: {opt.examples}
                  </div>
                </div>
                <Icon
                  name="forward"
                  size={20}
                  className="mt-1 text-[#A8B096] group-hover:text-[#8F9E4F] transition"
                />
              </div>
            </button>
          ))}
        </div>

        {error && (
          <div className="mt-4 rounded-xl border border-[#C96A5B]/30 bg-[#C96A5B]/5 p-3 text-sm text-[#C96A5B]">
            {error}
          </div>
        )}

        <div className="mt-6 text-center">
          <button
            type="button"
            onClick={() => router.push(returnTo)}
            className="text-sm text-[#6F7A5A] underline hover:text-[#1F2A1F] transition"
          >
            Cancel
          </button>
        </div>
      </div>
    </main>
  );
}
