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
import type { IconName } from "../../../../../components/Icon";
import { ErrorBoundary } from "../../../../../components/ErrorBoundary";

type PlaceContactsRow = Pick<
  Database["public"]["Tables"]["places"]["Row"],
  "created_by" | "kind" | "phone" | "website" | "instagram" | "youtube" | "telegram"
>;

type ContactFormState = {
  phone: string;
  website: string;
  instagram: string;
  youtube: string;
  telegram: string;
};

type LinkedLocationContacts = ContactFormState & {
  id: string;
  title: string;
};

type LinkedLocationContactRow = {
  id: string;
  title: string | null;
  kind: string | null;
  phone: string | null;
  website: string | null;
  instagram: string | null;
  youtube: string | null;
  telegram: string | null;
};

type LinkWithParentContacts = {
  parent: LinkedLocationContactRow | LinkedLocationContactRow[] | null;
};

function cx(...a: Array<string | false | undefined | null>) {
  return a.filter(Boolean).join(" ");
}

const MAX_LEN = 200;

function toContactFormState(
  input: Partial<Record<keyof ContactFormState, string | null | undefined>>,
): ContactFormState {
  return {
    phone: input.phone ?? "",
    website: input.website ?? "",
    instagram: input.instagram ?? "",
    youtube: input.youtube ?? "",
    telegram: input.telegram ?? "",
  };
}

function hasAnyContact(input: ContactFormState): boolean {
  return Boolean(
    input.phone.trim() ||
      input.website.trim() ||
      input.instagram.trim() ||
      input.youtube.trim() ||
      input.telegram.trim(),
  );
}

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
  const [placeKind, setPlaceKind] = useState<"location" | "service" | "experience">("location");
  const [showMoreContacts, setShowMoreContacts] = useState(false);

  const [original, setOriginal] = useState({
    phone: "",
    website: "",
    instagram: "",
    youtube: "",
    telegram: "",
  });
  const [linkedLocations, setLinkedLocations] = useState<LinkedLocationContacts[]>([]);
  const [copiedFromLocation, setCopiedFromLocation] = useState<string | null>(null);

  // Load place contacts
  useEffect(() => {
    if (!placeId || !user || accessLoading) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      const { data: rawData, error: placeError } = await supabase
        .from("places")
        .select("created_by, kind, phone, website, instagram, youtube, telegram")
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

      const init = toContactFormState(data);
      setPlaceKind(data.kind === "service" || data.kind === "experience" ? data.kind : "location");
      setPhone(init.phone);
      setWebsite(init.website);
      setInstagram(init.instagram);
      setYoutube(init.youtube);
      setTelegram(init.telegram);
      setOriginal(init);
      setShowMoreContacts(Boolean(init.youtube || init.telegram));

      if (data.kind === "service" || data.kind === "experience") {
        const { data: rawLinks } = await supabase
          .from("place_links")
          .select(
            `
            parent:places!place_links_parent_place_id_fkey(
              id,
              title,
              kind,
              phone,
              website,
              instagram,
              youtube,
              telegram
            )
          `,
          )
          .eq("child_place_id", placeId)
          .eq("status", "active");

        if (!cancelled) {
          const locations = ((rawLinks ?? []) as LinkWithParentContacts[])
            .map((link) => (Array.isArray(link.parent) ? link.parent[0] ?? null : link.parent))
            .filter((parent): parent is LinkedLocationContactRow => parent?.kind === "location")
            .map((parent) => ({
              id: parent.id,
              title: parent.title?.trim() || "Linked location",
              ...toContactFormState(parent),
            }));

          setLinkedLocations(locations);
        }
      } else {
        setLinkedLocations([]);
      }
      if (!cancelled) setLoading(false);
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
  const isOfferKind = placeKind === "service" || placeKind === "experience";
  const contactCount = [phone, website, instagram, youtube, telegram].filter((value) => value.trim()).length;
  const primaryContactCount = [phone, website, instagram].filter((value) => value.trim()).length;
  const contactRequirementMet = !isOfferKind || contactCount > 0;
  const contactRequirementLabel = isOfferKind
    ? `${Math.min(contactCount, 1)}/1 contact required`
    : `${contactCount}/5 contacts added`;
  const contactIntro = isOfferKind
    ? `Add at least one way clients can reach you. Phone, website, or Instagram is enough to publish this ${placeKind}.`
    : "Add contact details if visitors need them. These fields are optional for locations.";

  function fillContactsFromLocation(location: LinkedLocationContacts) {
    setPhone((current) => location.phone || current);
    setWebsite((current) => location.website || current);
    setInstagram((current) => location.instagram || current);
    setYoutube((current) => location.youtube || current);
    setTelegram((current) => location.telegram || current);
    setCopiedFromLocation(location.title);
  }

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
    router.push(`/places/${placeId}/edit`);
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
        <div className="mb-6 rounded-2xl border border-[#DDE5C2] bg-[#F4F7EA] p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="text-xs font-semibold uppercase tracking-[0.08em] text-[#6F7A5A]">
                Contacts
              </div>
              <h2 className="mt-1 font-fraunces text-lg font-semibold text-[#1F2A1F]">
                {isOfferKind ? "Add at least one contact method" : "Add contact details"}
              </h2>
              <p className="mt-1 text-sm text-[#6F7A5A]">{contactIntro}</p>
            </div>
            <span
              className={cx(
                "inline-flex h-8 shrink-0 items-center justify-center rounded-full px-3 text-xs font-semibold ring-1",
                contactRequirementMet
                  ? "bg-white text-[#3F4A35] ring-[#DDE5C2]"
                  : "bg-white text-[#C96A5B] ring-[#C96A5B]/25",
              )}
            >
              {contactRequirementLabel}
            </span>
          </div>
        </div>

        {linkedLocations.length > 0 && (
          <div className="mb-6 rounded-xl border border-[#ECEEE4] bg-[#FAFAF7] p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-medium text-[#1F2A1F]">
                  Use contacts from linked location
                </div>
                <p className="mt-1 text-xs text-[#6F7A5A]">
                  Fill available phone, website and socials from the location attached to this listing.
                </p>
              </div>
            </div>
            <div className="mt-3 flex flex-col gap-2">
              {linkedLocations.map((location) => {
                const canCopy = hasAnyContact(location);
                return (
                  <button
                    key={location.id}
                    type="button"
                    disabled={!canCopy}
                    onClick={() => fillContactsFromLocation(location)}
                    className={cx(
                      "w-full rounded-xl border px-3 py-2.5 text-left text-sm font-medium transition",
                      canCopy
                        ? "border-[#DADDD0] bg-white text-[#1F2A1F] hover:border-[#8F9E4F] hover:bg-[#F4F6EE]"
                        : "border-[#ECEEE4] bg-white text-[#A8B096] cursor-not-allowed",
                    )}
                  >
                    {canCopy
                      ? `Fill contacts from ${location.title}`
                      : `${location.title} has no contact details yet`}
                  </button>
                );
              })}
            </div>
            {copiedFromLocation && (
              <p className="mt-3 text-xs text-[#6F7A5A]">
                Filled from {copiedFromLocation}. Review the fields and save.
              </p>
            )}
          </div>
        )}

        {error && (
          <div className="mb-4 rounded-xl border border-[#C96A5B]/30 bg-[#C96A5B]/10 p-3 text-sm text-[#C96A5B]">
            {error}
          </div>
        )}

        <div className="space-y-5">
          <ContactField
            label="Phone"
            iconName="phone"
            inputType="tel"
            placeholder="+1 555 123 4567"
            value={phone}
            onChange={setPhone}
            hint={isOfferKind ? "Fastest for bookings and questions." : "Any format. Opens as a phone link."}
          />
          <ContactField
            label="Website"
            iconName="website"
            inputType="url"
            placeholder="example.com"
            value={website}
            onChange={setWebsite}
            hint="https:// is added automatically if missing."
          />
          <ContactField
            label="Instagram"
            iconName="instagram"
            inputType="text"
            placeholder="@yourhandle or instagram.com/yourhandle"
            value={instagram}
            onChange={setInstagram}
            hint={primaryContactCount === 0 && isOfferKind ? "One of these first three fields is usually enough." : undefined}
          />

          {!showMoreContacts ? (
            <button
              type="button"
              onClick={() => setShowMoreContacts(true)}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#ECEEE4] bg-white px-4 text-sm font-medium text-[#1F2A1F] transition hover:border-[#8F9E4F] hover:bg-[#FAFAF7]"
            >
              <Icon name="add" size={16} className="text-[#8F9E4F]" />
              More contact options
            </button>
          ) : (
            <div className="rounded-2xl border border-[#ECEEE4] bg-[#FAFAF7] p-4">
              <div className="mb-4 text-xs font-semibold uppercase tracking-[0.08em] text-[#6F7A5A]">
                Optional channels
              </div>
              <div className="space-y-5">
                <ContactField
                  label="YouTube"
                  iconName="youtube"
                  inputType="text"
                  placeholder="@yourchannel or youtube.com/@yourchannel"
                  value={youtube}
                  onChange={setYoutube}
                />
                <ContactField
                  label="Telegram"
                  iconName="telegram"
                  inputType="text"
                  placeholder="@yourhandle or t.me/yourhandle"
                  value={telegram}
                  onChange={setTelegram}
                />
              </div>
            </div>
          )}
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
  iconName,
  inputType,
  placeholder,
  value,
  onChange,
  hint,
}: {
  label: string;
  iconName: IconName;
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
          <Icon name={iconName} size={18} strokeWidth={1.8} />
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
