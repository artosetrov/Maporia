"use client";

/**
 * /places/[id]/edit/contacts — редактор контактов карточки.
 *
 * 5 опциональных полей: phone, website, instagram, youtube, telegram.
 * Видны для всех kinds (location | service | experience).
 * Никакой валидации формата на CHECK не наложено — нормализуем при сохранении
 * и при отображении на странице карточки.
 */

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../../../lib/supabase";
import type { Database } from "../../../../../types/supabase";
import { useUserAccessContext } from "../../../../../contexts/UserAccessContext";
import { isUserAdmin } from "../../../../../lib/access";
import Icon from "../../../../../components/Icon";
import { ErrorBoundary } from "../../../../../components/ErrorBoundary";

type PlaceContactsRow = Pick<
  Database["public"]["Tables"]["places"]["Row"],
  "created_by" | "phone" | "website" | "instagram" | "youtube" | "telegram"
>;

function cx(...a: Array<string | false | undefined | null>) {
  return a.filter(Boolean).join(" ");
}

const MAX_LEN = 200;

/** Нормализуем перед сохранением: trim + auto-https для website. */
function normalizeContacts(input: {
  phone: string;
  website: string;
  instagram: string;
  youtube: string;
  telegram: string;
}) {
  const phone = input.phone.trim() || null;

  let website = input.website.trim();
  if (website && !/^https?:\/\//i.test(website)) {
    website = `https://${website}`;
  }
  const websiteOut = website || null;

  // Соцсети сохраняем как ввёл пользователь — display layer уже умеет
  // и @username, и t.me/<handle>, и полные URL. Так гибче и не теряет ввод.
  const instagram = input.instagram.trim() || null;
  const youtube = input.youtube.trim() || null;
  const telegram = input.telegram.trim() || null;

  return { phone, website: websiteOut, instagram, youtube, telegram };
}

type PageProps = { params: Promise<{ id: string }> };

export default function ContactsEditorPage(props: PageProps) {
  return (
    <ErrorBoundary>
      <ContactsEditorPageContent {...props} />
    </ErrorBoundary>
  );
}

function ContactsEditorPageContent(props: PageProps) {
  const router = useRouter();
  const { id: placeId } = use(props.params);

  const { loading: accessLoading, user, access } = useUserAccessContext();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [phone, setPhone] = useState("");
  const [website, setWebsite] = useState("");
  const [instagram, setInstagram] = useState("");
  const [youtube, setYoutube] = useState("");
  const [telegram, setTelegram] = useState("");

  const [original, setOriginal] = useState({
    phone: "",
    website: "",
    instagram: "",
    youtube: "",
    telegram: "",
  });

  // Load place contacts
  useEffect(() => {
    if (!placeId || !user || accessLoading) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      const { data: rawData, error: placeError } = await supabase
        .from("places")
        .select("created_by, phone, website, instagram, youtube, telegram")
        .eq("id", placeId)
        .single();

      const data = rawData as PlaceContactsRow | null;
      if (placeError || !data) {
        if (!cancelled) router.push(`/places/${placeId}/edit`);
        return;
      }

      const currentIsAdmin = isUserAdmin(access);
      const isOwner = data.created_by === user.id;
      if (!isOwner && !currentIsAdmin) {
        if (!cancelled) router.push(`/id/${placeId}`);
        return;
      }

      if (cancelled) return;

      const init = {
        phone: data.phone ?? "",
        website: data.website ?? "",
        instagram: data.instagram ?? "",
        youtube: data.youtube ?? "",
        telegram: data.telegram ?? "",
      };
      setPhone(init.phone);
      setWebsite(init.website);
      setInstagram(init.instagram);
      setYoutube(init.youtube);
      setTelegram(init.telegram);
      setOriginal(init);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [placeId, user, router, access, accessLoading]);

  const hasChanges =
    phone.trim() !== original.phone.trim() ||
    website.trim() !== original.website.trim() ||
    instagram.trim() !== original.instagram.trim() ||
    youtube.trim() !== original.youtube.trim() ||
    telegram.trim() !== original.telegram.trim();

  // Никаких обязательных полей. Лимит длины — единственная защита.
  const tooLong =
    phone.length > MAX_LEN ||
    website.length > MAX_LEN ||
    instagram.length > MAX_LEN ||
    youtube.length > MAX_LEN ||
    telegram.length > MAX_LEN;

  const canSave = hasChanges && !tooLong && !saving;

  async function handleSave() {
    if (!canSave || !user || !placeId) return;

    setSaving(true);
    setError(null);

    const payload = normalizeContacts({ phone, website, instagram, youtube, telegram });

    const currentIsAdmin = isUserAdmin(access);
    const updateQuery = supabase
      .from("places")
      // @ts-expect-error Supabase generated types infer update payload as never
      .update(payload)
      .eq("id", placeId);

    if (!currentIsAdmin) {
      updateQuery.eq("created_by", user.id);
    }

    const { error: updateError } = await updateQuery.select();

    setSaving(false);

    if (updateError) {
      console.error("Contacts update error:", updateError);
      setError(updateError.message || "Failed to save contacts");
      return;
    }

    if (navigator.vibrate) navigator.vibrate(10);
    window.location.href = `/places/${placeId}/edit`;
  }

  function handleCancel() {
    router.push(`/places/${placeId}/edit`);
  }

  if (accessLoading || loading) {
    return (
      <main className="min-h-screen bg-[#FAFAF7]">
        <div className="max-w-2xl mx-auto px-6 py-8 space-y-6">
          <div className="h-8 w-48 bg-[#ECEEE4] rounded animate-pulse" />
          <div className="bg-white rounded-2xl p-6 border border-[#ECEEE4] space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <div className="h-4 w-24 bg-[#ECEEE4] rounded animate-pulse" />
                <div className="h-10 w-full bg-[#ECEEE4] rounded animate-pulse" />
              </div>
            ))}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-white flex flex-col">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-white border-b border-[#ECEEE4]">
        <div className="max-w-2xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-16">
            <button
              onClick={handleCancel}
              className="p-2 -ml-2 text-[#1F2A1F] hover:bg-[#FAFAF7] rounded-lg transition"
              aria-label="Close"
            >
              <Icon name="close" size={20} />
            </button>
            <h1
              className="font-semibold font-fraunces text-[#1F2A1F]"
              style={{ fontSize: "24px" }}
            >
              Contacts
            </h1>
            <div className="w-9" />
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 max-w-2xl mx-auto w-full px-4 sm:px-6 py-8">
        <p className="text-sm text-[#6F7A5A] mb-6">
          Add ways for visitors to reach you. All fields are optional — leave empty what you
          don&apos;t want to share.
        </p>

        {error && (
          <div className="mb-4 rounded-xl border border-[#C96A5B]/30 bg-[#C96A5B]/10 p-3 text-sm text-[#C96A5B]">
            {error}
          </div>
        )}

        <div className="space-y-5">
          <ContactField
            label="Phone"
            iconLeft={<PhoneIcon />}
            inputType="tel"
            placeholder="+1 555 123 4567"
            value={phone}
            onChange={setPhone}
            hint="Any format. Will be opened as tel: on click."
          />
          <ContactField
            label="Website"
            iconLeft={<WebsiteIcon />}
            inputType="url"
            placeholder="example.com"
            value={website}
            onChange={setWebsite}
            hint="https:// is added automatically if missing."
          />
          <ContactField
            label="Instagram"
            iconLeft={<InstagramIcon />}
            inputType="text"
            placeholder="@yourhandle or instagram.com/yourhandle"
            value={instagram}
            onChange={setInstagram}
          />
          <ContactField
            label="YouTube"
            iconLeft={<YouTubeIcon />}
            inputType="text"
            placeholder="@yourchannel or youtube.com/@yourchannel"
            value={youtube}
            onChange={setYoutube}
          />
          <ContactField
            label="Telegram"
            iconLeft={<TelegramIcon />}
            inputType="text"
            placeholder="@yourhandle or t.me/yourhandle"
            value={telegram}
            onChange={setTelegram}
          />
        </div>

        {tooLong && (
          <div className="mt-4 rounded-xl border border-[#C96A5B]/30 bg-[#C96A5B]/10 p-3 text-sm text-[#C96A5B]">
            One of the fields exceeds {MAX_LEN} characters. Shorten it before saving.
          </div>
        )}
      </div>

      {/* Sticky Footer */}
      <div className="sticky bottom-0 bg-white border-t border-[#ECEEE4]">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex gap-3">
            <button
              onClick={handleCancel}
              className="flex-1 rounded-xl border border-[#ECEEE4] bg-white px-4 py-3 text-sm font-medium text-[#1F2A1F] hover:bg-[#FAFAF7] transition"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!canSave}
              className={cx(
                "flex-1 rounded-xl px-4 py-3 text-sm font-medium transition",
                canSave
                  ? "bg-[#8F9E4F] text-white hover:bg-[#556036]"
                  : "bg-[#DADDD0] text-[#6F7A5A] cursor-not-allowed"
              )}
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}

// ─── ContactField ─────────────────────────────────────────────────────────

function ContactField({
  label,
  iconLeft,
  inputType,
  placeholder,
  value,
  onChange,
  hint,
}: {
  label: string;
  iconLeft: React.ReactNode;
  inputType: "text" | "tel" | "url";
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-[#1F2A1F] mb-2">{label}</label>
      <div className="relative">
        <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-[#6F7A5A]">
          {iconLeft}
        </div>
        <input
          type={inputType}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          maxLength={MAX_LEN}
          className="w-full rounded-xl border border-[#ECEEE4] bg-[#FAFAF7] pl-10 pr-4 py-3 text-sm text-[#1F2A1F] placeholder:text-[#A8B096] outline-none transition focus:bg-white focus:border-[#8F9E4F]"
        />
      </div>
      {hint && <p className="mt-1.5 text-xs text-[#6F7A5A]">{hint}</p>}
    </div>
  );
}

// ─── Простые SVG-иконки соцсетей ──────────────────────────────────────────
// Локальные иконки, чтобы не тащить новый пакет ради 5 значков.

function PhoneIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92Z" />
    </svg>
  );
}

function WebsiteIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}

function InstagramIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
    </svg>
  );
}

function YouTubeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.33z" />
      <polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02" />
    </svg>
  );
}

function TelegramIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21.5 4.5L2.5 11.5l6 2 2 7 3-4 5 5 3-17z" />
    </svg>
  );
}
