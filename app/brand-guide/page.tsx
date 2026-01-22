"use client";

export const dynamic = "force-dynamic";

import { useRouter } from "next/navigation";
import Icon from "../components/Icon";
import PlaceCard from "../components/PlaceCard";
import PremiumBadge from "../components/PremiumBadge";
import FavoriteIcon from "../components/FavoriteIcon";

function ColorSwatch({ name, color, hex, description }: { name: string; color: string; hex: string; description?: string }) {
  return (
    <div className="rounded-xl border border-[#ECEEE4] bg-white p-4">
      <div className="flex items-center gap-4 mb-3">
        <div className="w-16 h-16 rounded-lg border-2 border-[#ECEEE4]" style={{ backgroundColor: hex }} />
        <div className="flex-1">
          <div className="font-semibold text-[#1F2A1F] mb-1">{name}</div>
          <div className="text-sm text-[#6F7A5A] font-mono">{hex}</div>
          {description && <div className="text-xs text-[#A8B096] mt-1">{description}</div>}
        </div>
      </div>
    </div>
  );
}

function TypographySample({ name, className, sample }: { name: string; className: string; sample: string }) {
  return (
    <div className="rounded-xl border border-[#ECEEE4] bg-white p-4">
      <div className="text-xs font-medium text-[#6F7A5A] mb-2 uppercase tracking-wide">{name}</div>
      <div className={className}>{sample}</div>
    </div>
  );
}

function ButtonSample({ label, className, description }: { label: string; className: string; description?: string }) {
  return (
    <div className="rounded-xl border border-[#ECEEE4] bg-white p-4">
      <button className={className}>{label}</button>
      {description && <div className="text-xs text-[#6F7A5A] mt-2">{description}</div>}
    </div>
  );
}

function IconGrid() {
  const icons: Array<{ name: string; description: string }> = [
    { name: "search", description: "Search" },
    { name: "favorite", description: "Favorite/Bookmark" },
    { name: "profile", description: "Profile/User" },
    { name: "back", description: "Back/Previous" },
    { name: "forward", description: "Forward/Next" },
    { name: "close", description: "Close" },
    { name: "share", description: "Share" },
    { name: "edit", description: "Edit" },
    { name: "delete", description: "Delete" },
    { name: "settings", description: "Settings" },
    { name: "filter", description: "Filter" },
    { name: "map", description: "Map" },
    { name: "location", description: "Location" },
    { name: "photo", description: "Photo" },
    { name: "add", description: "Add" },
    { name: "remove", description: "Remove" },
    { name: "check", description: "Check" },
    { name: "heart", description: "Heart/Like" },
    { name: "comment", description: "Comment" },
    { name: "calendar", description: "Calendar" },
    { name: "clock", description: "Clock/Time" },
    { name: "link", description: "Link" },
    { name: "external-link", description: "External Link" },
    { name: "eye", description: "Eye/View" },
    { name: "eye-off", description: "Eye Off/Hide" },
    { name: "lock", description: "Lock" },
    { name: "unlock", description: "Unlock" },
    { name: "star", description: "Star" },
    { name: "grid", description: "Grid" },
    { name: "list", description: "List" },
    { name: "zoom-in", description: "Zoom In" },
    { name: "zoom-out", description: "Zoom Out" },
    { name: "my-location", description: "My Location" },
    { name: "logout", description: "Logout" },
    { name: "bookmark", description: "Bookmark" },
    { name: "package", description: "Package" },
    { name: "maximize", description: "Maximize" },
    { name: "minimize", description: "Minimize" },
    { name: "briefcase", description: "Briefcase" },
    { name: "calendar-days", description: "Calendar Days" },
  ];

  return (
    <div className="rounded-xl border border-[#ECEEE4] bg-white p-6">
      <h3 className="text-xl font-semibold font-fraunces text-[#1F2A1F] mb-4">Icon System</h3>
      <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-4">
        {icons.map((icon) => (
          <div key={icon.name} className="flex flex-col items-center gap-2">
            <div className="w-12 h-12 rounded-lg border border-[#ECEEE4] bg-[#FAFAF7] flex items-center justify-center">
              <Icon name={icon.name as any} size={20} className="text-[#1F2A1F]" />
            </div>
            <div className="text-xs text-center text-[#6F7A5A] font-mono">{icon.name}</div>
          </div>
        ))}
      </div>
      <div className="mt-6 p-4 bg-[#FAFAF7] rounded-lg">
        <div className="text-sm text-[#1F2A1F] mb-2 font-semibold">Icon Rules:</div>
        <ul className="text-xs text-[#6F7A5A] space-y-1 list-disc list-inside">
          <li>One icon per semantic meaning</li>
          <li>Consistent sizing: 16px, 20px, 24px</li>
          <li>Consistent stroke: 2px</li>
          <li>All icons use viewBox="0 0 24 24"</li>
          <li>Icons use fill="none" stroke="currentColor"</li>
        </ul>
      </div>
    </div>
  );
}

export default function BrandGuidePage() {
  const router = useRouter();

  return (
    <main className="min-h-screen bg-[#FAFAF7] pb-24">
      {/* Top App Bar */}
      <div className="sticky top-0 z-30 bg-white border-b border-[#ECEEE4]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-16">
            <button
              onClick={() => router.back()}
              className="p-2 -ml-2 text-[#1F2A1F] hover:bg-[#FAFAF7] rounded-lg transition"
              aria-label="Back"
            >
              <Icon name="back" size={20} />
            </button>
            <h1 className="text-lg font-semibold font-fraunces text-[#1F2A1F]">Brand Guide</h1>
            <div className="w-9" />
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <div className="space-y-8">
          {/* Introduction */}
          <div className="rounded-2xl border border-[#ECEEE4] bg-white p-6 shadow-sm">
            <h1 className="text-3xl font-semibold font-fraunces text-[#1F2A1F] mb-4">Maporia Brand System</h1>
            <p className="text-base text-[#6F7A5A] leading-relaxed">
              Complete design system and brand guidelines for Maporia. This guide includes all colors, typography, 
              UI components, icons, and styling rules used throughout the application.
            </p>
          </div>

          {/* Colors Section */}
          <section>
            <h2 className="text-2xl font-semibold font-fraunces text-[#1F2A1F] mb-6">Colors</h2>
            
            <div className="space-y-4 mb-6">
              <h3 className="text-lg font-semibold text-[#1F2A1F]">Primary Colors</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <ColorSwatch name="Olive Green" color="bg-[#8F9E4F]" hex="#8F9E4F" description="Primary brand color" />
                <ColorSwatch name="Soft Sage" color="bg-[#C9D2A3]" hex="#C9D2A3" description="Secondary accent" />
                <ColorSwatch name="Warm White" color="bg-[#FAFAF7]" hex="#FAFAF7" description="Background color" />
              </div>
            </div>

            <div className="space-y-4 mb-6">
              <h3 className="text-lg font-semibold text-[#1F2A1F]">Text Colors</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <ColorSwatch name="Primary Text" color="bg-[#1F2A1F]" hex="#1F2A1F" description="Main text color" />
                <ColorSwatch name="Secondary Text" color="bg-[#6F7A5A]" hex="#6F7A5A" description="Secondary text" />
                <ColorSwatch name="Muted Text" color="bg-[#A8B096]" hex="#A8B096" description="Muted/disabled text" />
              </div>
            </div>

            <div className="space-y-4 mb-6">
              <h3 className="text-lg font-semibold text-[#1F2A1F]">State Colors</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <ColorSwatch name="Success" color="bg-[#7FA35C]" hex="#7FA35C" description="Success states" />
                <ColorSwatch name="Warning / Premium" color="bg-[#D6B25E]" hex="#D6B25E" description="Warning states & Premium badge" />
                <ColorSwatch name="Error" color="bg-[#C96A5B]" hex="#C96A5B" description="Error states" />
                <ColorSwatch name="Disabled" color="bg-[#DADDD0]" hex="#DADDD0" description="Disabled states" />
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-[#1F2A1F]">Borders & Backgrounds</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <ColorSwatch name="Border Light" color="bg-[#ECEEE4]" hex="#ECEEE4" description="Light borders" />
                <ColorSwatch name="Border Input" color="bg-[#E5E8DB]" hex="#E5E8DB" description="Input borders" />
                <ColorSwatch name="Card Background" color="bg-white" hex="#FFFFFF" description="Card backgrounds" />
              </div>
            </div>
          </section>

          {/* Typography Section */}
          <section>
            <h2 className="text-2xl font-semibold font-fraunces text-[#1F2A1F] mb-6">Typography</h2>
            
            <div className="space-y-4 mb-6">
              <h3 className="text-lg font-semibold text-[#1F2A1F]">Headings (Fraunces)</h3>
              <div className="space-y-4">
                <TypographySample 
                  name="H1" 
                  className="text-3xl font-semibold font-fraunces text-[#1F2A1F]" 
                  sample="Heading 1 - Main Page Titles" 
                />
                <TypographySample 
                  name="H2" 
                  className="text-2xl font-semibold font-fraunces text-[#1F2A1F]" 
                  sample="Heading 2 - Section Titles" 
                />
                <TypographySample 
                  name="H3" 
                  className="text-xl font-semibold font-fraunces text-[#1F2A1F]" 
                  sample="Heading 3 - Subsection Titles" 
                />
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-[#1F2A1F]">Body Text (Inter)</h3>
              <div className="space-y-4">
                <TypographySample 
                  name="Body" 
                  className="text-base text-[#1F2A1F]" 
                  sample="Body text - Regular content. Inter font family, 15px, line-height 1.5." 
                />
                <TypographySample 
                  name="Small" 
                  className="text-sm text-[#6F7A5A]" 
                  sample="Small text - Secondary information, 13px." 
                />
                <TypographySample 
                  name="Caption" 
                  className="text-xs text-[#A8B096]" 
                  sample="Caption text - Muted information, 12px." 
                />
              </div>
            </div>
          </section>

          {/* Buttons Section */}
          <section>
            <h2 className="text-2xl font-semibold font-fraunces text-[#1F2A1F] mb-6">Buttons</h2>
            
            <div className="space-y-4 mb-6">
              <h3 className="text-lg font-semibold text-[#1F2A1F]">Primary Buttons</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <ButtonSample 
                  label="Primary Button" 
                  className="w-full h-11 rounded-xl bg-[#8F9E4F] text-white px-5 text-sm font-medium hover:bg-[#7A8A42] transition"
                  description="Standard height: h-11, padding: px-5"
                />
                <ButtonSample 
                  label="Primary (Hover)" 
                  className="w-full h-11 rounded-xl bg-[#7A8A42] text-white px-5 text-sm font-medium transition"
                  description="Hover state: #7A8A42"
                />
              </div>
            </div>

            <div className="space-y-4 mb-6">
              <h3 className="text-lg font-semibold text-[#1F2A1F]">Secondary Buttons</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <ButtonSample 
                  label="Secondary Button" 
                  className="w-full h-11 rounded-xl border border-[#ECEEE4] bg-white text-[#1F2A1F] px-5 text-sm font-medium hover:bg-[#FAFAF7] transition"
                  description="Bordered style"
                />
                <ButtonSample 
                  label="Text Button" 
                  className="w-full h-11 rounded-xl text-[#1F2A1F] px-5 text-sm font-medium hover:bg-[#FAFAF7] transition"
                  description="Text-only style"
                />
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-[#1F2A1F]">Danger Buttons</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <ButtonSample 
                  label="Delete Button" 
                  className="w-full h-11 rounded-xl border border-[#C96A5B] bg-[#C96A5B] text-white px-5 text-sm font-medium hover:bg-[#B85A4B] transition"
                  description="Error/danger actions"
                />
              </div>
            </div>
          </section>

          {/* Cards Section */}
          <section>
            <h2 className="text-2xl font-semibold font-fraunces text-[#1F2A1F] mb-6">Cards</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="rounded-2xl border border-[#ECEEE4] bg-white p-5 shadow-sm">
                <h3 className="font-semibold text-[#1F2A1F] mb-2">Standard Card</h3>
                <p className="text-sm text-[#6F7A5A]">
                  Standard card with border, white background, and shadow-sm.
                </p>
              </div>
              
              <div className="rounded-2xl border border-[#ECEEE4] bg-white p-5 shadow-md">
                <h3 className="font-semibold text-[#1F2A1F] mb-2">Card with Hover</h3>
                <p className="text-sm text-[#6F7A5A]">
                  Card with shadow-md on hover. All shadows use blur 20px minimum.
                </p>
              </div>
            </div>
          </section>

          {/* Shadows Section */}
          <section>
            <h2 className="text-2xl font-semibold font-fraunces text-[#1F2A1F] mb-6">Shadows</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="rounded-xl border border-[#ECEEE4] bg-white p-4 shadow-sm">
                <div className="text-sm font-semibold text-[#1F2A1F] mb-1">shadow-sm</div>
                <div className="text-xs text-[#6F7A5A]">Blur: 20px</div>
              </div>
              <div className="rounded-xl border border-[#ECEEE4] bg-white p-4 shadow-md">
                <div className="text-sm font-semibold text-[#1F2A1F] mb-1">shadow-md</div>
                <div className="text-xs text-[#6F7A5A]">Blur: 20px</div>
              </div>
              <div className="rounded-xl border border-[#ECEEE4] bg-white p-4 shadow-lg">
                <div className="text-sm font-semibold text-[#1F2A1F] mb-1">shadow-lg</div>
                <div className="text-xs text-[#6F7A5A]">Blur: 20px</div>
              </div>
              <div className="rounded-xl border border-[#ECEEE4] bg-white p-4 badge-shadow">
                <div className="text-sm font-semibold text-[#1F2A1F] mb-1">badge-shadow</div>
                <div className="text-xs text-[#6F7A5A]">Custom badge shadow</div>
              </div>
            </div>
          </section>

          {/* Icons Section */}
          <section>
            <IconGrid />
          </section>

          {/* Spacing & Layout Section */}
          <section>
            <h2 className="text-2xl font-semibold font-fraunces text-[#1F2A1F] mb-6">Spacing & Layout</h2>
            
            <div className="rounded-xl border border-[#ECEEE4] bg-white p-6">
              <h3 className="text-lg font-semibold text-[#1F2A1F] mb-4">Standard Spacing</h3>
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <div className="w-4 h-4 rounded bg-[#8F9E4F]" />
                  <div className="text-sm text-[#6F7A5A]">4px (gap-1)</div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="w-8 h-4 rounded bg-[#8F9E4F]" />
                  <div className="text-sm text-[#6F7A5A]">8px (gap-2)</div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="w-12 h-4 rounded bg-[#8F9E4F]" />
                  <div className="text-sm text-[#6F7A5A]">12px (gap-3)</div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="w-16 h-4 rounded bg-[#8F9E4F]" />
                  <div className="text-sm text-[#6F7A5A]">16px (gap-4)</div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="w-20 h-4 rounded bg-[#8F9E4F]" />
                  <div className="text-sm text-[#6F7A5A]">20px (gap-5)</div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="w-24 h-4 rounded bg-[#8F9E4F]" />
                  <div className="text-sm text-[#6F7A5A]">24px (gap-6)</div>
                </div>
              </div>
            </div>

            <div className="mt-6 rounded-xl border border-[#ECEEE4] bg-white p-6">
              <h3 className="text-lg font-semibold text-[#1F2A1F] mb-4">Border Radius</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-4 bg-[#FAFAF7] rounded-lg border border-[#ECEEE4]">
                  <div className="text-sm font-semibold text-[#1F2A1F] mb-1">rounded-lg</div>
                  <div className="text-xs text-[#6F7A5A]">8px</div>
                </div>
                <div className="p-4 bg-[#FAFAF7] rounded-xl border border-[#ECEEE4]">
                  <div className="text-sm font-semibold text-[#1F2A1F] mb-1">rounded-xl</div>
                  <div className="text-xs text-[#6F7A5A]">12px</div>
                </div>
                <div className="p-4 bg-[#FAFAF7] rounded-2xl border border-[#ECEEE4]">
                  <div className="text-sm font-semibold text-[#1F2A1F] mb-1">rounded-2xl</div>
                  <div className="text-xs text-[#6F7A5A]">16px</div>
                </div>
                <div className="p-4 bg-[#FAFAF7] rounded-full border border-[#ECEEE4]">
                  <div className="text-sm font-semibold text-[#1F2A1F] mb-1">rounded-full</div>
                  <div className="text-xs text-[#6F7A5A]">Full circle</div>
                </div>
              </div>
            </div>
          </section>

          {/* Component Examples Section */}
          <section>
            <h2 className="text-2xl font-semibold font-fraunces text-[#1F2A1F] mb-6">Component Examples</h2>
            
            <div className="space-y-6">
              {/* Input Field */}
              <div className="rounded-xl border border-[#ECEEE4] bg-white p-6">
                <h3 className="text-lg font-semibold text-[#1F2A1F] mb-4">Input Field</h3>
                <input
                  type="text"
                  placeholder="Enter text..."
                  className="w-full h-11 rounded-xl border border-[#E5E8DB] bg-white px-4 text-sm text-[#1F2A1F] placeholder:text-[#A8B096] focus:outline-none focus:ring-2 focus:ring-[#8F9E4F] focus:border-transparent"
                />
              </div>

              {/* Badge/Pill */}
              <div className="rounded-xl border border-[#ECEEE4] bg-white p-6">
                <h3 className="text-lg font-semibold text-[#1F2A1F] mb-4">Badges/Pills</h3>
                <div className="flex flex-wrap gap-2">
                  <span className="px-3 py-1 rounded-full bg-[#FAFAF7] border border-[#ECEEE4] text-sm text-[#1F2A1F]">
                    Default Badge
                  </span>
                  <span className="px-3 py-1 rounded-full bg-[#8F9E4F] text-white text-sm">
                    Primary Badge
                  </span>
                  <span className="px-2.5 py-1 rounded-full bg-[#D6B25E] text-white text-xs font-semibold flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                    </svg>
                    Premium
                  </span>
                  <span className="px-3 py-1 rounded-full bg-[#C96A5B] text-white text-sm">
                    Error Badge
                  </span>
                </div>
              </div>

              {/* Alert/Message */}
              <div className="rounded-xl border border-[#C96A5B]/30 bg-[#C96A5B]/10 p-4">
                <div className="text-sm text-[#C96A5B]">
                  <strong>Error message:</strong> This is an example error message with brand error colors.
                </div>
              </div>

              <div className="rounded-xl border border-[#7FA35C]/30 bg-[#7FA35C]/10 p-4">
                <div className="text-sm text-[#7FA35C]">
                  <strong>Success message:</strong> This is an example success message with brand success colors.
                </div>
              </div>
            </div>
          </section>

          {/* Place Cards Section */}
          <section>
            <h2 className="text-2xl font-semibold font-fraunces text-[#1F2A1F] mb-6">Place Cards</h2>
            
            <div className="space-y-8">
              {/* Standard Place Card */}
              <div className="rounded-xl border border-[#ECEEE4] bg-white p-6">
                <h3 className="text-lg font-semibold text-[#1F2A1F] mb-2">Standard Place Card</h3>
                <p className="text-sm text-[#6F7A5A] mb-4">Used in: Home page (carousel), Explore page (grid), Map page (list)</p>
                <div className="max-w-[200px]">
                  <PlaceCard
                    place={{
                      id: "example-1",
                      title: "The New River Castle",
                      city: "Fort Lauderdale, FL",
                      cover_url: "https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=400&h=300&fit=crop",
                      tags: ["hidden", "unique"],
                      created_by: null,
                    }}
                    userAccess={{ role: "guest", hasPremium: false, isAdmin: false }}
                  />
                </div>
              </div>

              {/* Place Card with Favorite Button */}
              <div className="rounded-xl border border-[#ECEEE4] bg-white p-6">
                <h3 className="text-lg font-semibold text-[#1F2A1F] mb-2">Place Card with Favorite Button</h3>
                <p className="text-sm text-[#6F7A5A] mb-4">Used in: Home page, Explore page, Map page (with favorite toggle)</p>
                <div className="max-w-[200px]">
                  <PlaceCard
                    place={{
                      id: "example-2",
                      title: "Coastal Hideaway",
                      city: "Miami, FL",
                      cover_url: "https://images.unsplash.com/photo-1513694203232-719a280e022f?w=400&h=300&fit=crop",
                      tags: ["beach", "sunset"],
                      created_by: null,
                    }}
                    userAccess={{ role: "standard", hasPremium: false, isAdmin: false }}
                    userId="user-123"
                    isFavorite={false}
                    favoriteButton={
                      <button
                        className="h-8 w-8 rounded-full bg-white border border-[#ECEEE4] hover:bg-[#FAFAF7] hover:border-[#8F9E4F] flex items-center justify-center transition-colors"
                        title="Add to favorites"
                      >
                        <FavoriteIcon isActive={false} size={16} />
                      </button>
                    }
                  />
                </div>
              </div>

              {/* Place Card with Premium Badge */}
              <div className="rounded-xl border border-[#ECEEE4] bg-white p-6">
                <h3 className="text-lg font-semibold text-[#1F2A1F] mb-2">Place Card with Premium Badge</h3>
                <p className="text-sm text-[#6F7A5A] mb-4">Used in: All pages (when place is premium)</p>
                <div className="max-w-[200px]">
                  <PlaceCard
                    place={{
                      id: "example-3",
                      title: "Secret Garden",
                      city: "Key West, FL",
                      cover_url: "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=400&h=300&fit=crop",
                      tags: ["exclusive"],
                      access_level: "premium",
                      created_by: null,
                    }}
                    userAccess={{ role: "premium", hasPremium: true, isAdmin: false }}
                    userId="user-123"
                    isFavorite={true}
                    favoriteButton={
                      <button
                        className="h-8 w-8 rounded-full bg-[#FAFAF7] border border-[#8F9E4F] flex items-center justify-center transition-colors"
                        title="Remove from favorites"
                      >
                        <FavoriteIcon isActive={true} size={16} />
                      </button>
                    }
                  />
                </div>
              </div>

              {/* Locked Place Card (Premium, no access) */}
              <div className="rounded-xl border border-[#ECEEE4] bg-white p-6">
                <h3 className="text-lg font-semibold text-[#1F2A1F] mb-2">Locked Place Card (Premium, No Access)</h3>
                <p className="text-sm text-[#6F7A5A] mb-4">Used in: All pages (when place is premium and user doesn't have access)</p>
                <div className="max-w-[200px]">
                  <PlaceCard
                    place={{
                      id: "example-4",
                      title: "Haunted Gem #1",
                      city: "Miami, FL",
                      cover_url: "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400&h=300&fit=crop",
                      access_level: "premium",
                      created_by: null,
                    }}
                    userAccess={{ role: "standard", hasPremium: false, isAdmin: false }}
                    userId="user-123"
                    hauntedGemIndex={1}
                  />
                </div>
              </div>

              {/* Place Card with Remove Favorite Button */}
              <div className="rounded-xl border border-[#ECEEE4] bg-white p-6">
                <h3 className="text-lg font-semibold text-[#1F2A1F] mb-2">Place Card with Remove Favorite Button</h3>
                <p className="text-sm text-[#6F7A5A] mb-4">Used in: Saved page, Profile page (Trips section)</p>
                <div className="max-w-[200px]">
                  <PlaceCard
                    place={{
                      id: "example-5",
                      title: "Urban Oasis",
                      city: "Tampa, FL",
                      cover_url: "https://images.unsplash.com/photo-1494522358652-f8ccf4b6c8d4?w=400&h=300&fit=crop",
                      tags: ["city", "park"],
                      created_by: null,
                    }}
                    userAccess={{ role: "standard", hasPremium: false, isAdmin: false }}
                    userId="user-123"
                    onRemoveFavorite={(placeId, e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                  />
                </div>
              </div>

              {/* Square Place Card (Home Carousel) */}
              <div className="rounded-xl border border-[#ECEEE4] bg-white p-6">
                <h3 className="text-lg font-semibold text-[#1F2A1F] mb-2">Square Place Card (1:1 Aspect Ratio)</h3>
                <p className="text-sm text-[#6F7A5A] mb-4">Used in: Home page carousel sections</p>
                <div className="max-w-[200px]">
                  <div className="[&_.place-card-image]:!pb-[100%]">
                    <PlaceCard
                      place={{
                        id: "example-6",
                        title: "Beach Paradise",
                        city: "Naples, FL",
                        cover_url: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=400&h=400&fit=crop",
                        tags: ["beach", "tropical"],
                        created_by: null,
                      }}
                      userAccess={{ role: "standard", hasPremium: false, isAdmin: false }}
                      userId="user-123"
                      isFavorite={false}
                      favoriteButton={
                        <button
                          className="h-8 w-8 rounded-full bg-white border border-[#ECEEE4] hover:bg-[#FAFAF7] hover:border-[#8F9E4F] flex items-center justify-center transition-colors"
                          title="Add to favorites"
                        >
                          <FavoriteIcon isActive={false} size={16} />
                        </button>
                      }
                    />
                  </div>
                </div>
              </div>

              {/* Place Card Specifications */}
              <div className="rounded-xl border border-[#ECEEE4] bg-white p-6">
                <h3 className="text-lg font-semibold text-[#1F2A1F] mb-4">Place Card Specifications</h3>
                <div className="space-y-3 text-sm text-[#6F7A5A]">
                  <div>
                    <strong className="text-[#1F2A1F]">Image Aspect Ratio:</strong> 4:3 (default) or 1:1 (home carousel)
                  </div>
                  <div>
                    <strong className="text-[#1F2A1F]">Border Radius:</strong> rounded-2xl (16px)
                  </div>
                  <div>
                    <strong className="text-[#1F2A1F]">Title Font:</strong> Fraunces, semibold, base size
                  </div>
                  <div>
                    <strong className="text-[#1F2A1F]">City Font:</strong> Inter, regular, sm size, text-[#6F7A5A]
                  </div>
                  <div>
                    <strong className="text-[#1F2A1F]">Tags:</strong> Inter, xs size, rounded-full, max 3 visible
                  </div>
                  <div>
                    <strong className="text-[#1F2A1F]">Premium Badge:</strong> Top-left corner, #D6B25E background
                  </div>
                  <div>
                    <strong className="text-[#1F2A1F]">Favorite Button:</strong> Top-right corner, visible on hover (or always if favorited)
                  </div>
                  <div>
                    <strong className="text-[#1F2A1F]">Photo Navigation:</strong> Arrows and dots appear on hover when multiple photos
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Responsive Design Section */}
          <section>
            <h2 className="text-2xl font-semibold font-fraunces text-[#1F2A1F] mb-6">Responsive Design & Breakpoints</h2>
            
            <div className="space-y-6">
              {/* Breakpoints Overview */}
              <div className="rounded-xl border border-[#ECEEE4] bg-white p-6">
                <h3 className="text-lg font-semibold text-[#1F2A1F] mb-4">Breakpoints</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[#ECEEE4]">
                        <th className="text-left py-2 px-3 font-semibold text-[#1F2A1F]">Breakpoint</th>
                        <th className="text-left py-2 px-3 font-semibold text-[#1F2A1F]">Width</th>
                        <th className="text-left py-2 px-3 font-semibold text-[#1F2A1F]">Device</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b border-[#ECEEE4]">
                        <td className="py-2 px-3 text-[#6F7A5A] font-mono">Mobile</td>
                        <td className="py-2 px-3 text-[#6F7A5A]">&lt; 600px</td>
                        <td className="py-2 px-3 text-[#6F7A5A]">Mobile phones</td>
                      </tr>
                      <tr className="border-b border-[#ECEEE4]">
                        <td className="py-2 px-3 text-[#6F7A5A] font-mono">Tablet</td>
                        <td className="py-2 px-3 text-[#6F7A5A]">600px - 899px</td>
                        <td className="py-2 px-3 text-[#6F7A5A]">Tablets, small laptops</td>
                      </tr>
                      <tr className="border-b border-[#ECEEE4]">
                        <td className="py-2 px-3 text-[#6F7A5A] font-mono">Tablet Large</td>
                        <td className="py-2 px-3 text-[#6F7A5A]">900px - 1119px</td>
                        <td className="py-2 px-3 text-[#6F7A5A]">Large tablets</td>
                      </tr>
                      <tr className="border-b border-[#ECEEE4]">
                        <td className="py-2 px-3 text-[#6F7A5A] font-mono">Desktop</td>
                        <td className="py-2 px-3 text-[#6F7A5A]">1120px - 1439px</td>
                        <td className="py-2 px-3 text-[#6F7A5A]">Desktop screens</td>
                      </tr>
                      <tr className="border-b border-[#ECEEE4]">
                        <td className="py-2 px-3 text-[#6F7A5A] font-mono">Desktop XL</td>
                        <td className="py-2 px-3 text-[#6F7A5A]">1440px - 1919px</td>
                        <td className="py-2 px-3 text-[#6F7A5A]">Large desktop screens</td>
                      </tr>
                      <tr>
                        <td className="py-2 px-3 text-[#6F7A5A] font-mono">Very Large</td>
                        <td className="py-2 px-3 text-[#6F7A5A]">≥ 1920px</td>
                        <td className="py-2 px-3 text-[#6F7A5A]">Very large monitors</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Typography Responsive */}
              <div className="rounded-xl border border-[#ECEEE4] bg-white p-6">
                <h3 className="text-lg font-semibold text-[#1F2A1F] mb-4">Typography - Responsive Sizes</h3>
                <div className="space-y-3 text-sm text-[#6F7A5A]">
                  <div>
                    <strong className="text-[#1F2A1F]">H1:</strong> 30px (mobile) → 32px (≥600px)
                  </div>
                  <div>
                    <strong className="text-[#1F2A1F]">H2:</strong> 22px (mobile) → 24px (≥600px)
                  </div>
                  <div>
                    <strong className="text-[#1F2A1F]">Body:</strong> 15px (all sizes)
                  </div>
                  <div>
                    <strong className="text-[#1F2A1F]">Small:</strong> 13px (all sizes)
                  </div>
                  <div>
                    <strong className="text-[#1F2A1F]">Caption:</strong> 12px (all sizes)
                  </div>
                </div>
              </div>

              {/* Place Cards Grid - Responsive */}
              <div className="rounded-xl border border-[#ECEEE4] bg-white p-6">
                <h3 className="text-lg font-semibold text-[#1F2A1F] mb-4">Place Cards Grid - Responsive Behavior</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[#ECEEE4]">
                        <th className="text-left py-2 px-3 font-semibold text-[#1F2A1F]">Breakpoint</th>
                        <th className="text-left py-2 px-3 font-semibold text-[#1F2A1F]">Columns</th>
                        <th className="text-left py-2 px-3 font-semibold text-[#1F2A1F]">Card Width</th>
                        <th className="text-left py-2 px-3 font-semibold text-[#1F2A1F]">Gap</th>
                        <th className="text-left py-2 px-3 font-semibold text-[#1F2A1F]">Used In</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b border-[#ECEEE4]">
                        <td className="py-2 px-3 text-[#6F7A5A] font-mono">&lt; 600px</td>
                        <td className="py-2 px-3 text-[#6F7A5A]">1</td>
                        <td className="py-2 px-3 text-[#6F7A5A]">100% (full width)</td>
                        <td className="py-2 px-3 text-[#6F7A5A]">16px</td>
                        <td className="py-2 px-3 text-[#6F7A5A]">All pages</td>
                      </tr>
                      <tr className="border-b border-[#ECEEE4]">
                        <td className="py-2 px-3 text-[#6F7A5A] font-mono">600-899px</td>
                        <td className="py-2 px-3 text-[#6F7A5A]">1</td>
                        <td className="py-2 px-3 text-[#6F7A5A]">100% (max 680px, centered)</td>
                        <td className="py-2 px-3 text-[#6F7A5A]">16px</td>
                        <td className="py-2 px-3 text-[#6F7A5A]">Map, Explore</td>
                      </tr>
                      <tr className="border-b border-[#ECEEE4]">
                        <td className="py-2 px-3 text-[#6F7A5A] font-mono">900-1119px</td>
                        <td className="py-2 px-3 text-[#6F7A5A]">2</td>
                        <td className="py-2 px-3 text-[#6F7A5A]">300-420px</td>
                        <td className="py-2 px-3 text-[#6F7A5A]">18-20px</td>
                        <td className="py-2 px-3 text-[#6F7A5A]">Map, Explore</td>
                      </tr>
                      <tr className="border-b border-[#ECEEE4]">
                        <td className="py-2 px-3 text-[#6F7A5A] font-mono">1120-1439px</td>
                        <td className="py-2 px-3 text-[#6F7A5A]">2</td>
                        <td className="py-2 px-3 text-[#6F7A5A]">320-420px</td>
                        <td className="py-2 px-3 text-[#6F7A5A]">22-24px</td>
                        <td className="py-2 px-3 text-[#6F7A5A]">Map (62.5% list, 37.5% map)</td>
                      </tr>
                      <tr className="border-b border-[#ECEEE4]">
                        <td className="py-2 px-3 text-[#6F7A5A] font-mono">1440-1919px</td>
                        <td className="py-2 px-3 text-[#6F7A5A]">3</td>
                        <td className="py-2 px-3 text-[#6F7A5A]">320-420px</td>
                        <td className="py-2 px-3 text-[#6F7A5A]">24px (row: 28px)</td>
                        <td className="py-2 px-3 text-[#6F7A5A]">Map (60% list, 40% map)</td>
                      </tr>
                      <tr>
                        <td className="py-2 px-3 text-[#6F7A5A] font-mono">≥ 1920px</td>
                        <td className="py-2 px-3 text-[#6F7A5A]">3</td>
                        <td className="py-2 px-3 text-[#6F7A5A]">320-420px</td>
                        <td className="py-2 px-3 text-[#6F7A5A]">24px (row: 28px)</td>
                        <td className="py-2 px-3 text-[#6F7A5A]">Map (list: max 1152px, map: flex-1)</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Home Page Carousel - Responsive */}
              <div className="rounded-xl border border-[#ECEEE4] bg-white p-6">
                <h3 className="text-lg font-semibold text-[#1F2A1F] mb-4">Home Page Carousel - Responsive Card Sizes</h3>
                <div className="space-y-3 text-sm text-[#6F7A5A]">
                  <div>
                    <strong className="text-[#1F2A1F]">&lt; 390px:</strong> 2.2 cards visible, dynamic width
                  </div>
                  <div>
                    <strong className="text-[#1F2A1F]">390-599px:</strong> 2.2 cards visible, dynamic width
                  </div>
                  <div>
                    <strong className="text-[#1F2A1F]">600-899px:</strong> Fixed 270px width
                  </div>
                  <div>
                    <strong className="text-[#1F2A1F]">900-1119px:</strong> Fixed 200px width, 7 cards visible
                  </div>
                  <div>
                    <strong className="text-[#1F2A1F]">1120-1439px:</strong> Fixed 220px width, 7 cards visible
                  </div>
                  <div>
                    <strong className="text-[#1F2A1F]">1440-1919px:</strong> Fixed 185px width, 7 cards visible
                  </div>
                  <div>
                    <strong className="text-[#1F2A1F]">≥ 1920px:</strong> Fixed 220px width, 7 cards visible
                  </div>
                </div>
              </div>

              {/* Navigation - Responsive */}
              <div className="rounded-xl border border-[#ECEEE4] bg-white p-6">
                <h3 className="text-lg font-semibold text-[#1F2A1F] mb-4">Navigation - Responsive Behavior</h3>
                <div className="space-y-4">
                  <div>
                    <div className="font-semibold text-[#1F2A1F] mb-2">TopBar</div>
                    <ul className="text-sm text-[#6F7A5A] space-y-1 list-disc list-inside">
                      <li><strong>&lt; 600px:</strong> Mobile search bar, hamburger menu</li>
                      <li><strong>≥ 600px:</strong> Desktop search bar, full navigation</li>
                      <li><strong>≥ 900px:</strong> Additional filters visible</li>
                      <li><strong>≥ 1120px:</strong> Full search bar centered</li>
                    </ul>
                  </div>
                  <div>
                    <div className="font-semibold text-[#1F2A1F] mb-2">BottomNav</div>
                    <ul className="text-sm text-[#6F7A5A] space-y-1 list-disc list-inside">
                      <li><strong>&lt; 1024px (lg):</strong> Visible, fixed bottom</li>
                      <li><strong>≥ 1024px:</strong> Hidden</li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Map Page - Responsive */}
              <div className="rounded-xl border border-[#ECEEE4] bg-white p-6">
                <h3 className="text-lg font-semibold text-[#1F2A1F] mb-4">Map Page - Responsive Layout</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[#ECEEE4]">
                        <th className="text-left py-2 px-3 font-semibold text-[#1F2A1F]">Breakpoint</th>
                        <th className="text-left py-2 px-3 font-semibold text-[#1F2A1F]">List/Map Ratio</th>
                        <th className="text-left py-2 px-3 font-semibold text-[#1F2A1F]">Map Mode</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b border-[#ECEEE4]">
                        <td className="py-2 px-3 text-[#6F7A5A] font-mono">&lt; 600px</td>
                        <td className="py-2 px-3 text-[#6F7A5A]">100% / 0%</td>
                        <td className="py-2 px-3 text-[#6F7A5A]">Floating button → Bottom sheet (50vh map)</td>
                      </tr>
                      <tr className="border-b border-[#ECEEE4]">
                        <td className="py-2 px-3 text-[#6F7A5A] font-mono">600-899px</td>
                        <td className="py-2 px-3 text-[#6F7A5A]">100% / 0%</td>
                        <td className="py-2 px-3 text-[#6F7A5A]">Hidden (button "Map")</td>
                      </tr>
                      <tr className="border-b border-[#ECEEE4]">
                        <td className="py-2 px-3 text-[#6F7A5A] font-mono">900-1119px</td>
                        <td className="py-2 px-3 text-[#6F7A5A]">100% / 0%</td>
                        <td className="py-2 px-3 text-[#6F7A5A]">Hidden (button "Show map")</td>
                      </tr>
                      <tr className="border-b border-[#ECEEE4]">
                        <td className="py-2 px-3 text-[#6F7A5A] font-mono">1120-1439px</td>
                        <td className="py-2 px-3 text-[#6F7A5A]">62.5% / 37.5%</td>
                        <td className="py-2 px-3 text-[#6F7A5A]">Sticky right (top: 80px)</td>
                      </tr>
                      <tr>
                        <td className="py-2 px-3 text-[#6F7A5A] font-mono">≥ 1440px</td>
                        <td className="py-2 px-3 text-[#6F7A5A]">60% / 40%</td>
                        <td className="py-2 px-3 text-[#6F7A5A]">Sticky right (top: 80px, border-radius: 16px)</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Place Detail Page - Responsive */}
              <div className="rounded-xl border border-[#ECEEE4] bg-white p-6">
                <h3 className="text-lg font-semibold text-[#1F2A1F] mb-4">Place Detail Page - Responsive Layout</h3>
                <div className="space-y-4">
                  <div>
                    <div className="font-semibold text-[#1F2A1F] mb-2">Gallery</div>
                    <ul className="text-sm text-[#6F7A5A] space-y-1 list-disc list-inside">
                      <li><strong>&lt; 600px:</strong> Mobile carousel (full-bleed, 56vh height)</li>
                      <li><strong>600-899px:</strong> Simplified mosaic or hero + scroll</li>
                      <li><strong>≥ 900px:</strong> 2-column mosaic (hero 60-66% + 4 tiles 34-40%)</li>
                    </ul>
                  </div>
                  <div>
                    <div className="font-semibold text-[#1F2A1F] mb-2">Content Layout</div>
                    <ul className="text-sm text-[#6F7A5A] space-y-1 list-disc list-inside">
                      <li><strong>&lt; 1120px:</strong> 1 column (content + booking below)</li>
                      <li><strong>1120-1439px:</strong> 2 columns (64% content, 36% booking sticky right)</li>
                      <li><strong>≥ 1440px:</strong> 2 columns (60% content, 40% booking sticky right)</li>
                    </ul>
                  </div>
                  <div>
                    <div className="font-semibold text-[#1F2A1F] mb-2">Container</div>
                    <ul className="text-sm text-[#6F7A5A] space-y-1 list-disc list-inside">
                      <li><strong>&lt; 600px:</strong> Full width, no padding (full-bleed)</li>
                      <li><strong>600-899px:</strong> Full width, 20px padding</li>
                      <li><strong>900-1119px:</strong> Full width, 24px padding</li>
                      <li><strong>1120-1439px:</strong> Max-width 1120px, 24px padding</li>
                      <li><strong>≥ 1440px:</strong> Max-width 1280px, 24px padding</li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Spacing - Responsive */}
              <div className="rounded-xl border border-[#ECEEE4] bg-white p-6">
                <h3 className="text-lg font-semibold text-[#1F2A1F] mb-4">Spacing - Responsive Padding</h3>
                <div className="space-y-3 text-sm text-[#6F7A5A]">
                  <div>
                    <strong className="text-[#1F2A1F]">Page Padding:</strong>
                  </div>
                  <ul className="list-disc list-inside space-y-1 ml-4">
                    <li><strong>&lt; 600px:</strong> 16px</li>
                    <li><strong>600-899px:</strong> 20px</li>
                    <li><strong>≥ 900px:</strong> 24px</li>
                    <li><strong>≥ 1920px:</strong> 32px</li>
                  </ul>
                  <div className="mt-4">
                    <strong className="text-[#1F2A1F]">Container Max Width:</strong>
                  </div>
                  <ul className="list-disc list-inside space-y-1 ml-4">
                    <li><strong>&lt; 1120px:</strong> 100% (full width)</li>
                    <li><strong>1120-1439px:</strong> 1120px</li>
                    <li><strong>1440-1919px:</strong> 1920px</li>
                    <li><strong>≥ 1920px:</strong> No max-width (stretches)</li>
                  </ul>
                </div>
              </div>

              {/* Buttons - Responsive */}
              <div className="rounded-xl border border-[#ECEEE4] bg-white p-6">
                <h3 className="text-lg font-semibold text-[#1F2A1F] mb-4">Buttons - Responsive Behavior</h3>
                <div className="space-y-3 text-sm text-[#6F7A5A]">
                  <div>
                    <strong className="text-[#1F2A1F]">Standard Button Height:</strong> h-11 (44px) - consistent across all breakpoints
                  </div>
                  <div>
                    <strong className="text-[#1F2A1F]">Padding:</strong> px-5 (20px) - consistent across all breakpoints
                  </div>
                  <div>
                    <strong className="text-[#1F2A1F]">Icon Buttons:</strong> Size adapts (16px, 20px, 24px) but proportions remain consistent
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
