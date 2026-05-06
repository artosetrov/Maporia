"use client";

// Was: export const dynamic = "force-dynamic"
// Removed — this page is a static design-system showcase. It has no
// dynamic data, no searchParams, no cookies. force-dynamic was disabling
// the static-prerender of the page shell for no reason.
import { useState } from "react";
import { useRouter } from "next/navigation";
import Icon, { type IconName } from "../components/Icon";
import Wordmark from "../components/Wordmark";
import PlaceCard from "../components/PlaceCard";
import FavoriteIcon from "../components/FavoriteIcon";
// Lazy — heavy modal, only loaded when the user opens the upsell sample.
import nextDynamic from "next/dynamic";
const PremiumUpsellModal = nextDynamic(() => import("../components/PremiumUpsellModal"), { ssr: false });
import { SectionErrorBoundary } from "@/app/components/SectionErrorBoundary";

// ——— Helpers ———

function ColorRow({
  name,
  hex,
  usage,
  notes,
}: {
  name: string;
  hex: string;
  usage: string;
  notes?: string;
}) {
  return (
    <div className="flex items-center gap-4 py-2 border-b border-[#ECEEE4] last:border-0">
      <div
        className="w-10 h-10 rounded-lg border border-[#ECEEE4] flex-shrink-0"
        style={{ backgroundColor: hex }}
      />
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-[#1F2A1F]">{name}</div>
        <div className="text-sm font-mono text-[#6F7A5A]">{hex}</div>
        <div className="text-xs text-[#6F7A5A] mt-0.5">{usage}</div>
        {notes && <div className="text-xs text-[#A8B096] mt-0.5">{notes}</div>}
      </div>
    </div>
  );
}

function TypoRow({ name, className, sample }: { name: string; className: string; sample: string }) {
  return (
    <div className="rounded-xl border border-[#ECEEE4] bg-white p-4">
      <div className="text-xs font-medium text-[#6F7A5A] uppercase tracking-wide mb-2">{name}</div>
      <div className={className}>{sample}</div>
    </div>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24">
      <h2 className="font-fraunces text-2xl font-semibold text-[#1F2A1F] mb-6">{title}</h2>
      {children}
    </section>
  );
}

function SubSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-8">
      <h3 className="text-lg font-semibold text-[#1F2A1F] mb-4">{title}</h3>
      {children}
    </div>
  );
}

// ——— Icon grid (compact) ———

function IconGrid() {
  const icons = [
    "search", "favorite", "profile", "back", "forward", "close", "share", "edit", "delete",
    "settings", "filter", "map", "location", "photo", "add", "check", "heart", "lock", "star",
  ];
  return (
    <div className="rounded-xl border border-[#ECEEE4] bg-white p-6">
      <div className="grid grid-cols-6 sm:grid-cols-9 gap-4">
        {icons.map((name) => (
          <div key={name} className="flex flex-col items-center gap-1">
            <div className="w-10 h-10 rounded-lg border border-[#ECEEE4] bg-[#FAFAF7] flex items-center justify-center">
              <Icon name={name as IconName} size={20} className="text-[#1F2A1F]" />
            </div>
            <span className="text-xs text-[#6F7A5A] font-mono truncate w-full text-center">{name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ——— Main page ———

export default function BrandGuidePage() {
  const router = useRouter();
  const [premiumModalOpen, setPremiumModalOpen] = useState(false);

  return (
    <main className="min-h-screen bg-[#FAFAF7] pb-24">
      {/* Top bar */}
      <div className="sticky top-0 z-30 bg-white border-b border-[#ECEEE4]">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-14">
            <button
              onClick={() => router.back()}
              className="p-2 -ml-2 text-[#1F2A1F] hover:bg-[#FAFAF7] rounded-lg transition"
              aria-label="Back"
            >
              <Icon name="back" size={20} />
            </button>
            <h1 className="font-fraunces text-lg font-semibold text-[#1F2A1F]">Brand Guide</h1>
            <div className="w-9" />
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-16">
        {/* 1. Brand Essence */}
        <Section id="essence" title="1. Brand Essence">
          <div className="rounded-2xl border border-[#ECEEE4] bg-white p-6 space-y-6">
            <SubSection title="Positioning">
              <p className="text-[#1F2A1F]">
                Maporia is a discovery app for <strong>hidden local places</strong> — not tourist traps — with a calm, premium, editorial feel.
              </p>
            </SubSection>
            <SubSection title="Core attributes">
              <ul className="list-disc list-inside text-[#6F7A5A] space-y-1 text-sm">
                <li>Calm, uncluttered</li>
                <li>Hidden / off-the-beaten-path</li>
                <li>Emotional, discovery-led</li>
                <li>Local, place-first</li>
                <li>Premium, quality over quantity</li>
              </ul>
            </SubSection>
            <SubSection title="Audience">
              <ul className="text-sm text-[#6F7A5A] space-y-2">
                <li><strong className="text-[#1F2A1F]">For:</strong> Travelers and locals who want authentic spots, curated lists, and a focused experience.</li>
                <li><strong className="text-[#1F2A1F]">Not for:</strong> Mass tourism, generic “top 10” lists, or noisy ad-driven feeds.</li>
              </ul>
            </SubSection>
          </div>
        </Section>

        {/* 2. Logo System */}
        <Section id="logo" title="2. Logo System">
          <div className="rounded-2xl border border-[#ECEEE4] bg-white p-6 space-y-6">
            <SubSection title="Variants">
              <ul className="text-sm text-[#6F7A5A] space-y-2">
                <li><strong className="text-[#1F2A1F]">Primary:</strong> Logo_maporia1.svg (pin + green #81904C, white mark). Desktop TopBar, auth.</li>
                <li><strong className="text-[#1F2A1F">Wordmark:</strong> Pin + “Maporia” text via <code className="bg-[#FAFAF7] px-1 rounded text-xs">Wordmark</code> — marketing, landing.</li>
                <li><strong className="text-[#1F2A1F">Dark/inverted:</strong> <code className="bg-[#FAFAF7] px-1 rounded text-xs">inverted={true}</code> — white on green.</li>
              </ul>
              <div className="flex flex-wrap items-center gap-6 mt-4">
                <img src="/Logo_maporia1.svg" alt="Maporia" className="h-10 w-auto" />
                <Wordmark href="/" withIcon size="default" />
                <div className="rounded-xl bg-[#8F9E4F] px-4 py-2">
                  <Wordmark href="/" withIcon size="default" inverted />
                </div>
              </div>
            </SubSection>
            <SubSection title="Clear space & minimum size">
              <ul className="text-sm text-[#6F7A5A] space-y-1">
                <li>Clear space: at least <strong className="text-[#1F2A1F]">1×</strong> (width of “M” stroke) on all sides.</li>
                <li>Desktop TopBar: <strong className="text-[#1F2A1F]">h-10</strong> (40px). Mobile: icon-only min <strong className="text-[#1F2A1F]">24px</strong>.</li>
                <li>Full lockup: icon 16/20/24px, text base/lg/xl. Smaller → icon-only.</li>
              </ul>
            </SubSection>
            <SubSection title="Do / Don’t">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-xl border border-[#7FA35C] bg-[#FAFAF7] p-4">
                  <div className="font-semibold text-[#1F2A1F] text-sm mb-2">Do</div>
                  <ul className="text-xs text-[#6F7A5A] space-y-1">Flat, solid colors only; icon-only in tight spaces; icon + wordmark in headers/marketing.</ul>
                </div>
                <div className="rounded-xl border border-[#C96A5B] bg-[#FAFAF7] p-4">
                  <div className="font-semibold text-[#1F2A1F] text-sm mb-2">Don’t</div>
                  <ul className="text-xs text-[#6F7A5A] space-y-1">Stretch/skew; add shadows, strokes, gradients; change proportions; use ® in product UI.</ul>
                </div>
              </div>
            </SubSection>
          </div>
        </Section>

        {/* 3. Color System */}
        <Section id="colors" title="3. Color System">
          <div className="rounded-2xl border border-[#ECEEE4] bg-white p-6 space-y-6">
            <SubSection title="Brand colors">
              <div className="space-y-0">
                <ColorRow name="Olive primary" hex="#8F9E4F" usage="Wordmark, CTAs, links, focus rings." notes="Primary brand; use for key actions." />
                <ColorRow name="Olive dark" hex="#556036" usage="Hover on primary buttons." />
                <ColorRow name="Soft sage" hex="#C9D2A3" usage="Secondary accent, soft highlights." notes="Avoid as primary CTA." />
                <ColorRow name="Warm white" hex="#FAFAF7" usage="Page background." />
              </div>
            </SubSection>
            <SubSection title="UI / functional colors">
              <div className="space-y-0">
                <ColorRow name="Text primary" hex="#1F2A1F" usage="Headings, body copy." notes="WCAG: ensure contrast on warm white." />
                <ColorRow name="Text secondary" hex="#6F7A5A" usage="Captions, meta, secondary text." />
                <ColorRow name="Text muted" hex="#A8B096" usage="Placeholders, disabled text." notes="Do not use for critical copy." />
                <ColorRow name="Border light" hex="#ECEEE4" usage="Cards, dividers, borders." />
                <ColorRow name="Border input" hex="#E5E8DB" usage="Input borders." />
                <ColorRow name="Success" hex="#7FA35C" usage="Success states, confirmations." />
                <ColorRow name="Warning / Premium" hex="#D6B25E" usage="Premium badge, warnings." />
                <ColorRow name="Error" hex="#C96A5B" usage="Errors, destructive actions." />
                <ColorRow name="Disabled" hex="#DADDD0" usage="Disabled buttons, inactive." />
              </div>
            </SubSection>
            <SubSection title="Accessibility">
              <ul className="text-sm text-[#6F7A5A] space-y-1">
                <li>Primary text (#1F2A1F) on warm white: aim for WCAG AA (4.5:1+).</li>
                <li>Olive (#8F9E4F) on white: use for large areas or with sufficient weight; pair with dark text where needed.</li>
                <li>Error/success: pair with sufficient contrast or use as borders/backgrounds with dark text.</li>
              </ul>
            </SubSection>
          </div>
        </Section>

        {/* 4. Typography */}
        <Section id="typography" title="4. Typography">
          <div className="rounded-2xl border border-[#ECEEE4] bg-white p-6 space-y-6">
            <SubSection title="Fonts & fallbacks">
              <ul className="text-sm text-[#6F7A5A] space-y-1">
                <li><strong className="text-[#1F2A1F]">Wordmark:</strong> Manrope Extrabold (800), letter-spacing -0.02em. Fallback: Inter, system-ui, sans-serif.</li>
                <li><strong className="text-[#1F2A1F]">Headings / place titles:</strong> Fraunces. Fallback: Georgia, serif.</li>
                <li><strong className="text-[#1F2A1F]">Body / UI:</strong> Inter. Fallback: -apple-system, BlinkMacSystemFont, Arial, sans-serif.</li>
              </ul>
            </SubSection>
            <SubSection title="Hierarchy">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <TypoRow name="H1" className="font-fraunces text-2xl sm:text-3xl font-semibold text-[#1F2A1F]" sample="Page title" />
                <TypoRow name="H2" className="font-fraunces text-xl sm:text-2xl font-semibold text-[#1F2A1F]" sample="Section title" />
                <TypoRow name="H3" className="font-fraunces text-lg font-semibold text-[#1F2A1F]" sample="Subsection" />
                <TypoRow name="Body" className="text-base text-[#1F2A1F]" sample="Body text, 15px, line-height 1.5" />
                <TypoRow name="Small" className="text-sm text-[#6F7A5A]" sample="Secondary, 13px" />
                <TypoRow name="Caption" className="text-xs text-[#A8B096]" sample="Caption, 12px" />
              </div>
            </SubSection>
            <SubSection title="Usage & guidance">
              <ul className="text-sm text-[#6F7A5A] space-y-1">
                <li><strong className="text-[#1F2A1F]">Marketing / landing:</strong> Fraunces for headlines; Manrope for wordmark only.</li>
                <li><strong className="text-[#1F2A1F]">App UI / modals:</strong> Fraunces for section titles; Inter for body, labels, buttons.</li>
                <li>Line-height: 1.5 body; 1.25–1.3 headings. Max text width for long copy: ~65ch.</li>
              </ul>
            </SubSection>
          </div>
        </Section>

        {/* 5. Iconography */}
        <Section id="iconography" title="5. Iconography">
          <div className="rounded-2xl border border-[#ECEEE4] bg-white p-6 space-y-6">
            <SubSection title="Style & sizes">
              <ul className="text-sm text-[#6F7A5A] space-y-1">
                <li>Stroke: 2px. ViewBox: 0 0 24 24. fill=none, stroke=currentColor.</li>
                <li>Supported sizes: <strong className="text-[#1F2A1F]">16, 20, 24px</strong> (align to 4px grid).</li>
                <li>One icon per semantic meaning; consistent weight.</li>
              </ul>
            </SubSection>
            <SubSection title="Icons vs emoji">
              <ul className="text-sm text-[#6F7A5A] space-y-1">
                <li><strong className="text-[#1F2A1F]">Icons:</strong> Navigation, actions, filters, settings, status (lock, heart, etc.).</li>
                <li><strong className="text-[#1F2A1F]">Emoji:</strong> Category/tag pills, mood labels, light personality (e.g. interest tags). Do not replace core UI icons with emoji.</li>
              </ul>
            </SubSection>
            <IconGrid />
          </div>
        </Section>

        {/* 6. UI Components */}
        <Section id="components" title="6. UI Components">
          <div className="rounded-2xl border border-[#ECEEE4] bg-white p-6 space-y-8">
            <SubSection title="Atoms">
              <ul className="text-sm text-[#6F7A5A] space-y-2 mb-4">
                <li><strong className="text-[#1F2A1F]">Buttons:</strong> Primary (olive, h-11, rounded-xl), secondary (border), danger (error). States: default, hover, active, disabled.</li>
                <li><strong className="text-[#1F2A1F]">Tags/pills:</strong> Default (warm white bg + border), primary (olive), premium (warning gold), error. Rounded-full.</li>
                <li><strong className="text-[#1F2A1F]">Icons:</strong> Use <code className="bg-[#FAFAF7] px-1 rounded text-xs">Icon</code> component; 16/20/24.</li>
              </ul>
              <div className="flex flex-wrap gap-3">
                <button className="h-11 px-5 rounded-xl bg-[#8F9E4F] text-white text-sm font-medium">Primary</button>
                <button className="h-11 px-5 rounded-xl border border-[#ECEEE4] bg-white text-[#1F2A1F] text-sm font-medium">Secondary</button>
                <span className="px-3 py-1 rounded-full bg-[#FAFAF7] border border-[#ECEEE4] text-sm text-[#1F2A1F]">Tag</span>
                <span className="px-2.5 py-1 rounded-full bg-[#D6B25E] text-white text-xs font-semibold">Premium</span>
              </div>
            </SubSection>
            <SubSection title="Form controls: radio & checkbox">
              <p className="text-sm text-[#6F7A5A] mb-4">
                Border <code className="bg-[#FAFAF7] px-1 rounded text-xs">--border-light</code>; checked, hover and focus use <code className="bg-[#FAFAF7] px-1 rounded text-xs">--olive-primary</code>. Styles in <code className="bg-[#FAFAF7] px-1 rounded text-xs">app/globals.css</code> (appearance: none, custom checkmark/radio dot). Disabled: <code className="bg-[#FAFAF7] px-1 rounded text-xs">--disabled-bg</code>.
              </p>
              <div className="flex flex-wrap gap-8">
                <div>
                  <div className="text-xs font-medium text-[#6F7A5A] uppercase tracking-wide mb-3">Checkbox</div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" className="mt-0.5" defaultChecked aria-label="Checked" />
                    <span className="text-sm text-[#1F2A1F]">Checked</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer mt-2">
                    <input type="checkbox" className="mt-0.5" aria-label="Unchecked" />
                    <span className="text-sm text-[#1F2A1F]">Unchecked</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer mt-2 opacity-70">
                    <input type="checkbox" className="mt-0.5" disabled aria-label="Disabled" />
                    <span className="text-sm text-[#6F7A5A]">Disabled</span>
                  </label>
                </div>
                <div>
                  <div className="text-xs font-medium text-[#6F7A5A] uppercase tracking-wide mb-3">Radio</div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="bg-demo" value="a" className="mt-0.5" defaultChecked aria-label="Option A" />
                    <span className="text-sm text-[#1F2A1F]">Option A</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer mt-2">
                    <input type="radio" name="bg-demo" value="b" className="mt-0.5" aria-label="Option B" />
                    <span className="text-sm text-[#1F2A1F]">Option B</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer mt-2 opacity-70">
                    <input type="radio" name="bg-demo-disabled" value="c" className="mt-0.5" disabled aria-label="Disabled" />
                    <span className="text-sm text-[#6F7A5A]">Disabled</span>
                  </label>
                </div>
              </div>
            </SubSection>
            <SubSection title="Molecules">
              <ul className="text-sm text-[#6F7A5A] space-y-1 mb-4">
                <li><strong className="text-[#1F2A1F]">Cards:</strong> rounded-2xl, border border-[#ECEEE4], bg white, shadow-sm; shadow-md on hover where clickable.</li>
                <li><strong className="text-[#1F2A1F]">List items:</strong> Padding p-4/p-5; optional chevron (Icon name="forward").</li>
              </ul>
              <div className="rounded-2xl border border-[#ECEEE4] bg-white p-5 shadow-sm">
                <div className="font-semibold text-[#1F2A1F]">Card title</div>
                <p className="text-sm text-[#6F7A5A] mt-1">Supporting text.</p>
              </div>
            </SubSection>
            <SubSection title="Organisms">
              <ul className="text-sm text-[#6F7A5A] space-y-1 mb-4">
                <li><strong className="text-[#1F2A1F">Place card:</strong> Image, title, city, tags; optional favorite, premium badge, locked overlay. Used: Home, Explore, Map, Saved.</li>
                <li><strong className="text-[#1F2A1F">Search modal:</strong> City, filters, suggested destinations, vibe tags. See Product Patterns.</li>
                <li><strong className="text-[#1F2A1F">Premium upsell modal:</strong> Shown when non-premium user hits premium content. CTA + benefits.</li>
              </ul>
              <div className="flex flex-wrap gap-6">
                <div className="max-w-[200px]">
                  <PlaceCard
                    place={{
                      id: "ex1",
                      title: "Hidden spot",
                      city: "Miami, FL",
                      cover_url: "https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=400&h=300&fit=crop",
                      tags: ["hidden"],
                      created_by: null,
                    }}
                    userAccess={{ role: "guest", hasPremium: false, isAdmin: false }}
                  />
                </div>
                <div className="max-w-[200px]">
                  <PlaceCard
                    place={{
                      id: "ex2",
                      title: "Premium place",
                      city: "Key West, FL",
                      cover_url: "https://images.unsplash.com/photo-1513694203232-719a280e022f?w=400&h=300&fit=crop",
                      tags: ["exclusive"],
                      access_level: "premium",
                      created_by: null,
                    }}
                    userAccess={{ role: "standard", hasPremium: false, isAdmin: false }}
                    userId="u1"
                    hauntedGemIndex={1}
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPremiumModalOpen(true)}
                className="mt-4 h-11 px-5 rounded-xl bg-[#8F9E4F] text-white text-sm font-medium"
              >
                Open Premium Upsell Modal
              </button>
            </SubSection>
          </div>
        </Section>

        <PremiumUpsellModal open={premiumModalOpen} onClose={() => setPremiumModalOpen(false)} />

        {/* 7. Product Patterns */}
        <Section id="patterns" title="7. Product Patterns">
          <div className="rounded-2xl border border-[#ECEEE4] bg-white p-6 space-y-6">
            <SubSection title="Place card logic">
              <ul className="text-sm text-[#6F7A5A] space-y-1">
                <li><strong className="text-[#1F2A1F">Premium:</strong> Badge when place is premium; if user lacks access → locked overlay + upsell on tap.</li>
                <li><strong className="text-[#1F2A1F">Hidden / Haunted Gem:</strong> Optional index for “Haunted Gem #N” label.</li>
                <li><strong className="text-[#1F2A1F">Liked/favorite:</strong> Heart filled when saved; optional remove-from-list on card.</li>
              </ul>
            </SubSection>
            <SubSection title="Search flow">
              <ul className="text-sm text-[#6F7A5A] space-y-1">
                <li>City first (required context), then filters/tags. SearchBar opens SearchModal.</li>
                <li>Flow: city → tags/vibe → results. Suggested destinations + “What’s your vibe?” in modal.</li>
              </ul>
            </SubSection>
            <SubSection title="Premium gating">
              <ul className="text-sm text-[#6F7A5A] space-y-1">
                <li>Locked place cards show overlay; tap → Premium Upsell Modal. No inline paywall in list.</li>
              </ul>
            </SubSection>
            <SubSection title="Empty & loading states">
              <ul className="text-sm text-[#6F7A5A] space-y-1">
                <li>Empty: Short copy + primary CTA where relevant (e.g. “No saved places yet”).</li>
                <li>Loading: Skeleton with same layout (image, title, meta); shimmer or pulse. No spinners for full-page content.</li>
              </ul>
            </SubSection>
          </div>
        </Section>

        {/* 8. Layout & Spacing */}
        <Section id="layout" title="8. Layout & Spacing">
          <div className="rounded-2xl border border-[#ECEEE4] bg-white p-6 space-y-6">
            <SubSection title="Spacing scale">
              <ul className="text-sm text-[#6F7A5A] space-y-1 font-mono">
                <li>4px (1) · 8px (2) · 12px (3) · 16px (4) · 20px (5) · 24px (6). Use Tailwind gap/padding tokens.</li>
              </ul>
              <div className="flex flex-wrap items-center gap-4 mt-2">
                {[4, 8, 12, 16, 24].map((n) => (
                  <div key={n} className="flex items-center gap-2">
                    <div className="rounded bg-[#8F9E4F]" style={{ width: n, height: n }} />
                    <span className="text-xs text-[#6F7A5A]">{n}px</span>
                  </div>
                ))}
              </div>
            </SubSection>
            <SubSection title="Border radius">
              <ul className="text-sm text-[#6F7A5A] space-y-1">
                <li>rounded-lg (8px) · rounded-xl (12px) · rounded-2xl (16px) · rounded-full (pills, avatars).</li>
              </ul>
            </SubSection>
            <SubSection title="Shadows & elevation">
              <ul className="text-sm text-[#6F7A5A] space-y-1">
                <li>All shadows: blur ≥ 20px. shadow-sm (cards), shadow-md (hover), shadow-lg (modals). badge-shadow for badges/counters.</li>
              </ul>
            </SubSection>
            <SubSection title="Mobile-first">
              <ul className="text-sm text-[#6F7A5A] space-y-1">
                <li>Base styles for mobile; lg: for desktop. TopBar behavior: see docs/VISUAL-SCHEMAS.md.</li>
                <li>Touch targets ≥ 44px. Safe areas: pt-safe-top, pb-safe-bottom where fixed bars exist.</li>
              </ul>
            </SubSection>
          </div>
        </Section>

        {/* 9. Developer / Handoff */}
        <Section id="developer" title="9. Developer / Handoff">
          <div className="rounded-2xl border border-[#ECEEE4] bg-white p-6 space-y-6">
            <SubSection title="Design tokens">
              <ul className="text-sm text-[#6F7A5A] space-y-1">
                <li>CSS vars in <code className="bg-[#FAFAF7] px-1 rounded text-xs">app/globals.css</code>: --olive-primary, --warm-white, --text-primary, --text-secondary, --text-muted, --border-light, --success, --error, --disabled-bg, etc.</li>
                <li>Tailwind: use hex or var() for consistency. No hardcoded non-token colors in new UI.</li>
              </ul>
            </SubSection>
            <SubSection title="Naming">
              <ul className="text-sm text-[#6F7A5A] space-y-1">
                <li>Components: PascalCase. Tokens: kebab-case (--olive-primary). Classes: Tailwind + optional BEM for custom.</li>
              </ul>
            </SubSection>
            <SubSection title="Fixed vs flexible">
              <ul className="text-sm text-[#6F7A5A] space-y-1">
                <li><strong className="text-[#1F2A1F">Fixed:</strong> Logo lockup proportions, wordmark font (Manrope 800), primary green #8F9E4F, clear space.</li>
                <li><strong className="text-[#1F2A1F">Flexible:</strong> Section order on this page, copy, number of place card variants; spacing within scale.</li>
              </ul>
            </SubSection>
            <SubSection title="Handoff notes">
              <ul className="text-sm text-[#6F7A5A] space-y-1">
                <li><strong className="text-[#1F2A1F">Frontend:</strong> Wordmark.tsx, Icon component, PlaceCard, PremiumUpsellModal. Use design tokens from globals.css.</li>
                <li><strong className="text-[#1F2A1F">No-code / Glide:</strong> Export logo SVGs from public/; use HEX list from Color System; typography = Fraunces headings, Inter body.</li>
                <li>Canonical doc: <code className="bg-[#FAFAF7] px-1 rounded text-xs">docs/BRAND-GUIDE.md</code>. Layout schemas: <code className="bg-[#FAFAF7] px-1 rounded text-xs">docs/VISUAL-SCHEMAS.md</code>.</li>
              </ul>
            </SubSection>
          </div>
        </Section>
      </div>
    </main>
  );
}
