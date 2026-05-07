"use client";

/**
 * PlaceContacts — блок контактов на странице карточки.
 *
 * Используется и в OfferPlaceView (service/experience), и в legacy /id/[id]/page.tsx
 * (location). Все 5 полей опциональные. Если ни одно не заполнено — компонент
 * не рендерится вообще (возвращает null), чтобы не плодить пустые секции.
 *
 * UX-нюансы:
 *  - Phone → tel:
 *  - Website → нормализуем в https://… если пользователь ввёл без схемы
 *  - Instagram/YouTube/Telegram → принимаем @username, t.me/handle и полные URL,
 *    нормализуем на лету для href, но в видимом тексте показываем @handle.
 */

type Variant = "card" | "inline";

type PlaceContactsProps = {
  phone?: string | null;
  website?: string | null;
  instagram?: string | null;
  youtube?: string | null;
  telegram?: string | null;
  /** Заголовок над блоком. Передай null/false чтобы скрыть. */
  title?: string | null;
  /** card — обёртка с border/bg; inline — без. */
  variant?: Variant;
  className?: string;
};

export default function PlaceContacts({
  phone,
  website,
  instagram,
  youtube,
  telegram,
  title = "Contact",
  variant = "card",
  className,
}: PlaceContactsProps) {
  const items = buildContactItems({ phone, website, instagram, youtube, telegram });
  if (items.length === 0) return null;

  const wrapperClass =
    variant === "card"
      ? "rounded-2xl border border-[#ECEEE4] bg-white p-5"
      : "";

  return (
    <section className={[wrapperClass, className].filter(Boolean).join(" ")}>
      {title && (
        <h3 className="font-fraunces text-lg font-semibold text-[#1F2A1F] mb-3">{title}</h3>
      )}
      <ul className="space-y-2">
        {items.map((it) => (
          <li key={it.key}>
            <a
              href={it.href}
              target={it.kind === "phone" ? undefined : "_blank"}
              rel={it.kind === "phone" ? undefined : "noopener noreferrer"}
              className="group flex items-center gap-3 rounded-lg px-1 py-1.5 text-sm text-[#1F2A1F] hover:text-[#556036] transition"
            >
              <span
                aria-hidden
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#FAFAF7] text-[#556036] group-hover:bg-[#ECEEE4] transition"
              >
                {it.icon}
              </span>
              <span className="min-w-0 flex-1 truncate">{it.label}</span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ─── Билдинг и нормализация ───────────────────────────────────────────────

type ContactKind = "phone" | "website" | "instagram" | "youtube" | "telegram";

type ContactItem = {
  key: string;
  kind: ContactKind;
  href: string;
  label: string;
  icon: React.ReactNode;
};

function buildContactItems(input: {
  phone?: string | null;
  website?: string | null;
  instagram?: string | null;
  youtube?: string | null;
  telegram?: string | null;
}): ContactItem[] {
  const out: ContactItem[] = [];

  if (input.phone && input.phone.trim()) {
    const raw = input.phone.trim();
    const tel = raw.replace(/[^\d+]/g, "") || raw;
    out.push({
      key: "phone",
      kind: "phone",
      href: `tel:${tel}`,
      label: raw,
      icon: <PhoneIcon />,
    });
  }

  if (input.website && input.website.trim()) {
    const raw = input.website.trim();
    const href = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const label = raw.replace(/^https?:\/\//i, "").replace(/\/$/, "");
    out.push({
      key: "website",
      kind: "website",
      href,
      label,
      icon: <WebsiteIcon />,
    });
  }

  if (input.instagram && input.instagram.trim()) {
    const handle = extractHandle(input.instagram, ["instagram.com", "www.instagram.com"]);
    out.push({
      key: "instagram",
      kind: "instagram",
      href: `https://instagram.com/${handle}`,
      label: `@${handle}`,
      icon: <InstagramIcon />,
    });
  }

  if (input.youtube && input.youtube.trim()) {
    const raw = input.youtube.trim();
    // YouTube — три формы: @handle, channel/UCxxx, полный URL. Сохраняем максимально гибко.
    let href = raw;
    let label = raw;
    if (/^https?:\/\//i.test(raw)) {
      href = raw;
      label = raw.replace(/^https?:\/\//i, "").replace(/\/$/, "");
    } else if (raw.startsWith("@")) {
      href = `https://youtube.com/${raw}`;
      label = raw;
    } else if (raw.startsWith("youtube.com") || raw.startsWith("www.youtube.com") || raw.startsWith("youtu.be")) {
      href = `https://${raw}`;
      label = raw.replace(/\/$/, "");
    } else {
      href = `https://youtube.com/@${raw}`;
      label = `@${raw}`;
    }
    out.push({
      key: "youtube",
      kind: "youtube",
      href,
      label,
      icon: <YouTubeIcon />,
    });
  }

  if (input.telegram && input.telegram.trim()) {
    const handle = extractHandle(input.telegram, ["t.me", "telegram.me", "telegram.org"]);
    out.push({
      key: "telegram",
      kind: "telegram",
      href: `https://t.me/${handle}`,
      label: `@${handle}`,
      icon: <TelegramIcon />,
    });
  }

  return out;
}

/**
 * Из строки ('@x', 'x', 'instagram.com/x', 'https://t.me/x?foo=bar') достать
 * чистый handle. Если не удалось — возвращаем исходную строку без leading '@'.
 */
function extractHandle(raw: string, hosts: string[]): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";

  // Полный URL → берём path после последнего host'а
  const urlMatch = trimmed.match(/^https?:\/\/(?:www\.)?([^/?#]+)\/([^/?#]+)/i);
  if (urlMatch && hosts.includes(urlMatch[1].toLowerCase())) {
    return stripQuery(urlMatch[2]).replace(/^@/, "");
  }
  // Без схемы, но с host — например `instagram.com/handle`
  const hostMatch = trimmed.match(/^(?:www\.)?([^/?#]+)\/([^/?#]+)/i);
  if (hostMatch && hosts.includes(hostMatch[1].toLowerCase())) {
    return stripQuery(hostMatch[2]).replace(/^@/, "");
  }
  // Просто @handle или handle
  return trimmed.replace(/^@/, "");
}

function stripQuery(s: string): string {
  return s.split(/[?#]/)[0];
}

// ─── Иконки ───────────────────────────────────────────────────────────────

function PhoneIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92Z" />
    </svg>
  );
}
function WebsiteIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}
function InstagramIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
    </svg>
  );
}
function YouTubeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.33z" />
      <polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02" />
    </svg>
  );
}
function TelegramIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21.5 4.5L2.5 11.5l6 2 2 7 3-4 5 5 3-17z" />
    </svg>
  );
}
