"use client";

export const dynamic = "force-dynamic";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Icon from "../components/Icon";
import PlaceCard from "../components/PlaceCard";
import PremiumBadge from "../components/PremiumBadge";
import FavoriteIcon from "../components/FavoriteIcon";
import PremiumUpsellModal from "../components/PremiumUpsellModal";

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

function PremiumUpsellModalEditor() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  
  // Default values
  const [modalContent, setModalContent] = useState({
    title: "Unlock Maporia Premium",
    titleHighlight: "Maporia",
    subtitle: "Get full access to our hidden local gems — no crowds, no tourist traps. Just authentic experiences.",
    benefit1Title: "Premium-only places",
    benefit1Desc: "Exclusive access to local secrets and hidden spots.",
    benefit2Title: "Curated Collections",
    benefit2Desc: "Secret Spots, Romantic Sunsets, Hidden Cafés & more.",
    benefit3Title: "Custom Routes",
    benefit3Desc: "Save favorites and build your personal itinerary.",
    socialProof: "Discover places you'd never find on Google.",
    price: "$20",
    pricePeriod: "/ year",
    priceSubtext: "Less than $2 a month",
    priceRightTitle: "Full Access",
    priceRightDesc: "All premium places + collections",
    primaryButtonText: "Coming Soon",
    primaryButtonLink: "",
    secondaryButtonText: "Not now, thanks",
    footerText: "Cancel anytime. Premium features will unlock instantly when available.",
    footerLinkText: "Terms of Service apply.",
    footerLinkUrl: "#",
  });

  return (
    <div className="space-y-6">
      {/* Preview Section */}
      <div className="rounded-xl border border-[#ECEEE4] bg-white p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-[#1F2A1F] mb-2">Premium Upsell Modal</h3>
            <p className="text-sm text-[#6F7A5A]">Used when non-premium users try to access premium content</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setIsEditing(!isEditing)}
              className="px-4 py-2 rounded-xl border border-[#ECEEE4] bg-white text-[#1F2A1F] font-medium text-sm hover:bg-[#FAFAF7] transition-colors flex items-center gap-2"
            >
              <Icon name="edit" size={16} />
              {isEditing ? "Cancel" : "Edit"}
            </button>
            <button
              onClick={() => setIsModalOpen(true)}
              className="px-4 py-2 rounded-xl bg-[#8F9E4F] text-white font-medium text-sm hover:brightness-110 transition-colors"
            >
              Preview
            </button>
          </div>
        </div>

        {/* Editor Form */}
        {isEditing && (
          <div className="mt-6 p-6 bg-[#FAFAF7] rounded-xl border border-[#ECEEE4] space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Title */}
              <div>
                <label className="block text-sm font-medium text-[#1F2A1F] mb-2">Title</label>
                <input
                  type="text"
                  value={modalContent.title}
                  onChange={(e) => setModalContent({ ...modalContent, title: e.target.value })}
                  className="w-full px-4 py-2 rounded-xl border border-[#ECEEE4] bg-white text-sm text-[#1F2A1F] focus:outline-none focus:ring-2 focus:ring-[#8F9E4F]"
                />
              </div>
              
              {/* Title Highlight */}
              <div>
                <label className="block text-sm font-medium text-[#1F2A1F] mb-2">Title Highlight (word to emphasize)</label>
                <input
                  type="text"
                  value={modalContent.titleHighlight}
                  onChange={(e) => setModalContent({ ...modalContent, titleHighlight: e.target.value })}
                  className="w-full px-4 py-2 rounded-xl border border-[#ECEEE4] bg-white text-sm text-[#1F2A1F] focus:outline-none focus:ring-2 focus:ring-[#8F9E4F]"
                />
              </div>

              {/* Subtitle */}
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-[#1F2A1F] mb-2">Subtitle</label>
                <textarea
                  value={modalContent.subtitle}
                  onChange={(e) => setModalContent({ ...modalContent, subtitle: e.target.value })}
                  rows={2}
                  className="w-full px-4 py-2 rounded-xl border border-[#ECEEE4] bg-white text-sm text-[#1F2A1F] focus:outline-none focus:ring-2 focus:ring-[#8F9E4F] resize-none"
                />
              </div>

              {/* Benefits */}
              <div className="md:col-span-2">
                <h4 className="text-sm font-semibold text-[#1F2A1F] mb-3">Benefits</h4>
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-[#6F7A5A] mb-1">Benefit 1 - Title</label>
                      <input
                        type="text"
                        value={modalContent.benefit1Title}
                        onChange={(e) => setModalContent({ ...modalContent, benefit1Title: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg border border-[#ECEEE4] bg-white text-sm text-[#1F2A1F] focus:outline-none focus:ring-2 focus:ring-[#8F9E4F]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[#6F7A5A] mb-1">Benefit 1 - Description</label>
                      <input
                        type="text"
                        value={modalContent.benefit1Desc}
                        onChange={(e) => setModalContent({ ...modalContent, benefit1Desc: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg border border-[#ECEEE4] bg-white text-sm text-[#1F2A1F] focus:outline-none focus:ring-2 focus:ring-[#8F9E4F]"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-[#6F7A5A] mb-1">Benefit 2 - Title</label>
                      <input
                        type="text"
                        value={modalContent.benefit2Title}
                        onChange={(e) => setModalContent({ ...modalContent, benefit2Title: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg border border-[#ECEEE4] bg-white text-sm text-[#1F2A1F] focus:outline-none focus:ring-2 focus:ring-[#8F9E4F]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[#6F7A5A] mb-1">Benefit 2 - Description</label>
                      <input
                        type="text"
                        value={modalContent.benefit2Desc}
                        onChange={(e) => setModalContent({ ...modalContent, benefit2Desc: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg border border-[#ECEEE4] bg-white text-sm text-[#1F2A1F] focus:outline-none focus:ring-2 focus:ring-[#8F9E4F]"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-[#6F7A5A] mb-1">Benefit 3 - Title</label>
                      <input
                        type="text"
                        value={modalContent.benefit3Title}
                        onChange={(e) => setModalContent({ ...modalContent, benefit3Title: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg border border-[#ECEEE4] bg-white text-sm text-[#1F2A1F] focus:outline-none focus:ring-2 focus:ring-[#8F9E4F]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[#6F7A5A] mb-1">Benefit 3 - Description</label>
                      <input
                        type="text"
                        value={modalContent.benefit3Desc}
                        onChange={(e) => setModalContent({ ...modalContent, benefit3Desc: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg border border-[#ECEEE4] bg-white text-sm text-[#1F2A1F] focus:outline-none focus:ring-2 focus:ring-[#8F9E4F]"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Social Proof */}
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-[#1F2A1F] mb-2">Social Proof</label>
                <input
                  type="text"
                  value={modalContent.socialProof}
                  onChange={(e) => setModalContent({ ...modalContent, socialProof: e.target.value })}
                  className="w-full px-4 py-2 rounded-xl border border-[#ECEEE4] bg-white text-sm text-[#1F2A1F] focus:outline-none focus:ring-2 focus:ring-[#8F9E4F]"
                />
              </div>

              {/* Price */}
              <div>
                <label className="block text-sm font-medium text-[#1F2A1F] mb-2">Price</label>
                <input
                  type="text"
                  value={modalContent.price}
                  onChange={(e) => setModalContent({ ...modalContent, price: e.target.value })}
                  className="w-full px-4 py-2 rounded-xl border border-[#ECEEE4] bg-white text-sm text-[#1F2A1F] focus:outline-none focus:ring-2 focus:ring-[#8F9E4F]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#1F2A1F] mb-2">Price Period</label>
                <input
                  type="text"
                  value={modalContent.pricePeriod}
                  onChange={(e) => setModalContent({ ...modalContent, pricePeriod: e.target.value })}
                  className="w-full px-4 py-2 rounded-xl border border-[#ECEEE4] bg-white text-sm text-[#1F2A1F] focus:outline-none focus:ring-2 focus:ring-[#8F9E4F]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#1F2A1F] mb-2">Price Subtext</label>
                <input
                  type="text"
                  value={modalContent.priceSubtext}
                  onChange={(e) => setModalContent({ ...modalContent, priceSubtext: e.target.value })}
                  className="w-full px-4 py-2 rounded-xl border border-[#ECEEE4] bg-white text-sm text-[#1F2A1F] focus:outline-none focus:ring-2 focus:ring-[#8F9E4F]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#1F2A1F] mb-2">Price Right Title</label>
                <input
                  type="text"
                  value={modalContent.priceRightTitle}
                  onChange={(e) => setModalContent({ ...modalContent, priceRightTitle: e.target.value })}
                  className="w-full px-4 py-2 rounded-xl border border-[#ECEEE4] bg-white text-sm text-[#1F2A1F] focus:outline-none focus:ring-2 focus:ring-[#8F9E4F]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#1F2A1F] mb-2">Price Right Description</label>
                <input
                  type="text"
                  value={modalContent.priceRightDesc}
                  onChange={(e) => setModalContent({ ...modalContent, priceRightDesc: e.target.value })}
                  className="w-full px-4 py-2 rounded-xl border border-[#ECEEE4] bg-white text-sm text-[#1F2A1F] focus:outline-none focus:ring-2 focus:ring-[#8F9E4F]"
                />
              </div>

              {/* Buttons */}
              <div>
                <label className="block text-sm font-medium text-[#1F2A1F] mb-2">Primary Button Text</label>
                <input
                  type="text"
                  value={modalContent.primaryButtonText}
                  onChange={(e) => setModalContent({ ...modalContent, primaryButtonText: e.target.value })}
                  className="w-full px-4 py-2 rounded-xl border border-[#ECEEE4] bg-white text-sm text-[#1F2A1F] focus:outline-none focus:ring-2 focus:ring-[#8F9E4F]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#1F2A1F] mb-2">Primary Button Link (URL)</label>
                <input
                  type="text"
                  value={modalContent.primaryButtonLink}
                  onChange={(e) => setModalContent({ ...modalContent, primaryButtonLink: e.target.value })}
                  placeholder="https://..."
                  className="w-full px-4 py-2 rounded-xl border border-[#ECEEE4] bg-white text-sm text-[#1F2A1F] focus:outline-none focus:ring-2 focus:ring-[#8F9E4F]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#1F2A1F] mb-2">Secondary Button Text</label>
                <input
                  type="text"
                  value={modalContent.secondaryButtonText}
                  onChange={(e) => setModalContent({ ...modalContent, secondaryButtonText: e.target.value })}
                  className="w-full px-4 py-2 rounded-xl border border-[#ECEEE4] bg-white text-sm text-[#1F2A1F] focus:outline-none focus:ring-2 focus:ring-[#8F9E4F]"
                />
              </div>

              {/* Footer */}
              <div>
                <label className="block text-sm font-medium text-[#1F2A1F] mb-2">Footer Text</label>
                <textarea
                  value={modalContent.footerText}
                  onChange={(e) => setModalContent({ ...modalContent, footerText: e.target.value })}
                  rows={2}
                  className="w-full px-4 py-2 rounded-xl border border-[#ECEEE4] bg-white text-sm text-[#1F2A1F] focus:outline-none focus:ring-2 focus:ring-[#8F9E4F] resize-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#1F2A1F] mb-2">Footer Link Text</label>
                <input
                  type="text"
                  value={modalContent.footerLinkText}
                  onChange={(e) => setModalContent({ ...modalContent, footerLinkText: e.target.value })}
                  className="w-full px-4 py-2 rounded-xl border border-[#ECEEE4] bg-white text-sm text-[#1F2A1F] focus:outline-none focus:ring-2 focus:ring-[#8F9E4F]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#1F2A1F] mb-2">Footer Link URL</label>
                <input
                  type="text"
                  value={modalContent.footerLinkUrl}
                  onChange={(e) => setModalContent({ ...modalContent, footerLinkUrl: e.target.value })}
                  placeholder="https://..."
                  className="w-full px-4 py-2 rounded-xl border border-[#ECEEE4] bg-white text-sm text-[#1F2A1F] focus:outline-none focus:ring-2 focus:ring-[#8F9E4F]"
                />
              </div>
            </div>
          </div>
        )}

        {/* Preview Button */}
        {!isEditing && (
          <div className="mt-4">
            <button
              onClick={() => setIsModalOpen(true)}
              className="px-4 py-2 rounded-xl bg-[#8F9E4F] text-white font-medium text-sm hover:brightness-110 transition-colors"
            >
              Open Modal Preview
            </button>
          </div>
        )}
      </div>

      {/* Modal Preview with Custom Content */}
      <PremiumUpsellModalPreview
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        content={modalContent}
      />
    </div>
  );
}

function PremiumUpsellModalPreview({ 
  open, 
  onClose, 
  content 
}: { 
  open: boolean; 
  onClose: () => void; 
  content: any;
}) {
  return (
    <PremiumUpsellModal 
      open={open} 
      onClose={onClose}
      customContent={content}
    />
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

          {/* Logo Guidelines Section */}
          <section>
            <h2 className="text-2xl font-semibold font-fraunces text-[#1F2A1F] mb-6">Maporia Logo Guidelines</h2>
            
            {/* Logo System */}
            <div className="space-y-4 mb-6">
              <h3 className="text-lg font-semibold text-[#1F2A1F]">Logo System</h3>
              <p className="text-sm text-[#6F7A5A] mb-4">
                Maporia uses a simple, scalable system:
              </p>
              <div className="space-y-2 text-sm text-[#1F2A1F]">
                <div className="flex items-start gap-2">
                  <span className="font-semibold">• Product mark:</span>
                  <span>the <strong>"M-pin" icon</strong> (symbol only)</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="font-semibold">• Brand lockup:</span>
                  <span><strong>M-pin + "Maporia" wordmark</strong> (desktop / marketing)</span>
                </div>
              </div>
              <div className="mt-4 p-4 rounded-xl border border-[#ECEEE4] bg-[#FAFAF7]">
                <p className="text-sm text-[#1F2A1F] font-medium mb-2">Rule of thumb:</p>
                <div className="space-y-1 text-sm text-[#6F7A5A]">
                  <div>• <strong className="text-[#1F2A1F]">Icon = product UI</strong> (mobile-first)</div>
                  <div>• <strong className="text-[#1F2A1F]">Icon + wordmark = brand presence</strong> (desktop + marketing)</div>
                </div>
              </div>
            </div>

            {/* Primary Logo */}
            <div className="space-y-4 mb-6">
              <h3 className="text-lg font-semibold text-[#1F2A1F]">Primary Logo (White Background)</h3>
              <p className="text-sm text-[#6F7A5A] mb-4">
                Use this as the default logo everywhere possible.
              </p>
              <div className="rounded-xl border border-[#ECEEE4] bg-white p-6">
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-16 h-16 rounded-lg bg-[#8F9E4F] flex items-center justify-center">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" fill="none" className="h-10 w-10">
                      <g fill="white" fillRule="evenodd" clipRule="evenodd">
                        <path d="M512 132C391 132 292 231 292 352C292 442 346 516 420 570C458 598 476 636 493 674L512 716L531 674C548 636 566 598 604 570C678 516 732 442 732 352C732 231 633 132 512 132ZM512 232C595 232 662 299 662 382C662 465 595 532 512 532C429 532 362 465 362 382C362 299 429 232 512 232Z"/>
                        <path d="M232 604C232 574 256 550 286 550L338 550C358 550 376 560 388 576L512 740L636 576C648 560 666 550 686 550L738 550C768 550 792 574 792 604L792 836C792 866 768 890 738 890L706 890C676 890 652 866 652 836L652 702L552 834C542 848 527 856 512 856C497 856 482 848 472 834L372 702L372 836C372 866 348 890 318 890L286 890C256 890 232 866 232 836Z"/>
                      </g>
                    </svg>
                  </div>
                  <div className="flex-1">
                    <div className="font-semibold text-[#1F2A1F] mb-1">Icon + Wordmark</div>
                    <div className="text-sm text-[#6F7A5A]">Background: white • Icon: #8F9E4F • Wordmark: #8F9E4F</div>
                  </div>
                </div>
                <div className="text-xs text-[#A8B096]">
                  Where to use: website header, desktop UI, email templates, presentations, docs
                </div>
              </div>
            </div>

            {/* Inverted Logo */}
            <div className="space-y-4 mb-6">
              <h3 className="text-lg font-semibold text-[#1F2A1F]">Inverted Logo (Green Background)</h3>
              <p className="text-sm text-[#6F7A5A] mb-4">
                Use when the background is the Maporia green.
              </p>
              <div className="rounded-xl border border-[#ECEEE4] bg-[#8F9E4F] p-6">
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-16 h-16 rounded-lg bg-white/10 flex items-center justify-center border border-white/20">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" fill="none" className="h-10 w-10">
                      <g fill="white" fillRule="evenodd" clipRule="evenodd">
                        <path d="M512 132C391 132 292 231 292 352C292 442 346 516 420 570C458 598 476 636 493 674L512 716L531 674C548 636 566 598 604 570C678 516 732 442 732 352C732 231 633 132 512 132ZM512 232C595 232 662 299 662 382C662 465 595 532 512 532C429 532 362 465 362 382C362 299 429 232 512 232Z"/>
                        <path d="M232 604C232 574 256 550 286 550L338 550C358 550 376 560 388 576L512 740L636 576C648 560 666 550 686 550L738 550C768 550 792 574 792 604L792 836C792 866 768 890 738 890L706 890C676 890 652 866 652 836L652 702L552 834C542 848 527 856 512 856C497 856 482 848 472 834L372 702L372 836C372 866 348 890 318 890L286 890C256 890 232 866 232 836Z"/>
                      </g>
                    </svg>
                  </div>
                  <div className="flex-1">
                    <div className="font-semibold text-white mb-1">Icon + Wordmark</div>
                    <div className="text-sm text-white/80">Background: #8F9E4F • Icon: white • Wordmark: white</div>
                  </div>
                </div>
                <div className="text-xs text-white/70">
                  Where to use: mobile splash screen, app icon, onboarding, hero blocks, stickers
                </div>
              </div>
            </div>

            {/* Typography for Wordmark */}
            <div className="space-y-4 mb-6">
              <h3 className="text-lg font-semibold text-[#1F2A1F]">Typography (Wordmark / UI)</h3>
              <div className="rounded-xl border border-[#ECEEE4] bg-white p-4">
                <div className="space-y-3">
                  <div>
                    <div className="text-sm font-semibold text-[#1F2A1F] mb-1">Primary font: <span className="font-mono text-[#8F9E4F]">Manrope</span></div>
                    <div className="text-xs text-[#6F7A5A]">Free, web-safe, modern, premium, readable. Works consistently across web + product UI.</div>
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-[#1F2A1F] mb-1">Recommended weights</div>
                    <div className="text-xs text-[#6F7A5A] space-y-1">
                      <div>• <strong>Desktop:</strong> Medium (500) / SemiBold (600)</div>
                      <div>• <strong>Mobile:</strong> Medium (500)</div>
                    </div>
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-[#1F2A1F] mb-1">Fallbacks</div>
                    <div className="text-xs text-[#6F7A5A] font-mono bg-[#FAFAF7] p-2 rounded-lg">
                      Manrope, Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Usage Rules */}
            <div className="space-y-4 mb-6">
              <h3 className="text-lg font-semibold text-[#1F2A1F]">Usage Rules (Do / Don't)</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-xl border border-[#7FA35C] bg-[#FAFAF7] p-4">
                  <div className="text-sm font-semibold text-[#1F2A1F] mb-3">Do</div>
                  <div className="space-y-2 text-sm text-[#6F7A5A]">
                    <div>• Keep the logo <strong className="text-[#1F2A1F]">flat and clean</strong></div>
                    <div>• Use <strong className="text-[#1F2A1F]">solid colors only</strong></div>
                    <div>• Use <strong className="text-[#1F2A1F]">icon-only</strong> in tight spaces (mobile nav, tabs, small headers)</div>
                    <div>• Use <strong className="text-[#1F2A1F]">icon + wordmark</strong> in spacious layouts (desktop header, marketing)</div>
                  </div>
                </div>
                <div className="rounded-xl border border-[#C96A5B] bg-[#FAFAF7] p-4">
                  <div className="text-sm font-semibold text-[#1F2A1F] mb-3">Don't</div>
                  <div className="space-y-2 text-sm text-[#6F7A5A]">
                    <div>• <strong className="text-[#C96A5B]">Do not stretch</strong> or skew</div>
                    <div>• <strong className="text-[#C96A5B">Do not add</strong> shadows, strokes, outlines, gradients, glows</div>
                    <div>• <strong className="text-[#C96A5B">Do not change</strong> icon proportions or corner radii</div>
                    <div>• <strong className="text-[#C96A5B">Do not recolor</strong> the logo outside the brand palette</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Clear Space & Minimum Sizes */}
            <div className="space-y-4 mb-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-xl border border-[#ECEEE4] bg-white p-4">
                  <h4 className="text-sm font-semibold text-[#1F2A1F] mb-3">Clear Space</h4>
                  <p className="text-xs text-[#6F7A5A] mb-2">Minimum clear space around the logo:</p>
                  <div className="text-xs text-[#6F7A5A] space-y-1">
                    <div>• <strong className="text-[#1F2A1F]">X = width of the "M" stroke</strong></div>
                    <div>• Keep at least <strong className="text-[#1F2A1F]">1X padding</strong> on all sides</div>
                  </div>
                </div>
                <div className="rounded-xl border border-[#ECEEE4] bg-white p-4">
                  <h4 className="text-sm font-semibold text-[#1F2A1F] mb-3">Minimum Sizes</h4>
                  <div className="text-xs text-[#6F7A5A] space-y-1">
                    <div>• <strong className="text-[#1F2A1F]">Icon-only:</strong> minimum <strong>24px</strong></div>
                    <div>• <strong className="text-[#1F2A1F]">Full lockup (icon + wordmark):</strong> minimum <strong>120px width</strong></div>
                    <div className="text-[#A8B096] mt-2">(If smaller → switch to icon-only.)</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Rules for Product UI */}
            <div className="rounded-xl border border-[#ECEEE4] bg-[#FAFAF7] p-4">
              <h4 className="text-sm font-semibold text-[#1F2A1F] mb-3">Quick Rules for Product UI</h4>
              <div className="space-y-2 text-sm text-[#6F7A5A]">
                <div>• <strong className="text-[#1F2A1F]">Mobile header:</strong> icon-only</div>
                <div>• <strong className="text-[#1F2A1F]">Desktop header:</strong> icon + "Maporia"</div>
                <div>• <strong className="text-[#1F2A1F]">App icon / favicon:</strong> icon-only</div>
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

          {/* Premium Upsell Modal Section */}
          <section>
            <h2 className="text-2xl font-semibold font-fraunces text-[#1F2A1F] mb-6">Premium Upsell Modal</h2>
            
            <PremiumUpsellModalEditor />
          </section>

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

          {/* Search Modal Section */}
          <section>
            <h2 className="text-2xl font-semibold font-fraunces text-[#1F2A1F] mb-6">Search Modal</h2>
            
            <div className="space-y-6">
              {/* Overview */}
              <div className="rounded-xl border border-[#ECEEE4] bg-white p-6">
                <h3 className="text-lg font-semibold text-[#1F2A1F] mb-4">Overview</h3>
                <p className="text-sm text-[#6F7A5A] mb-4 leading-relaxed">
                  The Search Modal is a full-screen, multi-step search experience inspired by Airbnb's search pattern. 
                  It provides a seamless way for users to find places by location and vibe/category. The modal uses 
                  a two-step flow: "Where?" (city selection) and "What's your vibe?" (tag/category selection).
                </p>
                <div className="space-y-2 text-sm text-[#6F7A5A]">
                  <p><strong className="text-[#1F2A1F]">Used in:</strong> Home page (triggered by search bar click)</p>
                  <p><strong className="text-[#1F2A1F]">Mobile:</strong> Full-screen bottom sheet (100dvh with safe-area insets)</p>
                  <p><strong className="text-[#1F2A1F]">Desktop:</strong> Centered modal (max-width: 2xl, rounded-2xl)</p>
                </div>
              </div>

              {/* Design Specifications */}
              <div className="rounded-xl border border-[#ECEEE4] bg-white p-6">
                <h3 className="text-lg font-semibold text-[#1F2A1F] mb-4">Design Specifications</h3>
                
                <div className="space-y-4">
                  <div>
                    <h4 className="text-sm font-semibold text-[#1F2A1F] mb-2">Container</h4>
                    <ul className="text-sm text-[#6F7A5A] space-y-1 ml-4 list-disc">
                      <li><strong>Mobile:</strong> Full-screen overlay (fixed inset-0), white background, z-50</li>
                      <li><strong>Desktop:</strong> Centered modal, max-width: 2xl (672px), rounded-2xl, shadow-xl</li>
                      <li><strong>Height:</strong> Mobile uses 100dvh with dynamic viewport height for Chrome compatibility</li>
                      <li><strong>Background:</strong> Mobile: white, Desktop: black/50 overlay</li>
                    </ul>
                  </div>

                  <div>
                    <h4 className="text-sm font-semibold text-[#1F2A1F] mb-2">Header</h4>
                    <ul className="text-sm text-[#6F7A5A] space-y-1 ml-4 list-disc">
                      <li><strong>Height:</strong> Auto (py-3, px-4)</li>
                      <li><strong>Border:</strong> Bottom border (#ECEEE4)</li>
                      <li><strong>Title:</strong> Fraunces, text-2xl, font-semibold, text-[#1F2A1F]</li>
                      <li><strong>Buttons:</strong> Circular (w-10 h-10), rounded-full, hover:bg-[#FAFAF7]</li>
                      <li><strong>Back button:</strong> Only visible on Step 2, left side</li>
                      <li><strong>Close button:</strong> Always visible, right side (X icon)</li>
                    </ul>
                  </div>

                  <div>
                    <h4 className="text-sm font-semibold text-[#1F2A1F] mb-2">Search Input (Step 1)</h4>
                    <ul className="text-sm text-[#6F7A5A] space-y-1 ml-4 list-disc">
                      <li><strong>Container:</strong> px-6 py-4, border-b (#ECEEE4)</li>
                      <li><strong>Input field:</strong> Full width, px-4 py-3.5, pl-12 (for icon), rounded-xl</li>
                      <li><strong>Border:</strong> border (#E5E8DB), focus: border-[#8F9E4F] + ring-2 ring-[#8F9E4F] ring-opacity-20</li>
                      <li><strong>Background:</strong> White (bg-white)</li>
                      <li><strong>Placeholder:</strong> text-[#A8B096]</li>
                      <li><strong>Icon:</strong> Search icon, 20px, absolute left-4, text-[#6F7A5A]</li>
                      <li><strong>Text:</strong> text-base, text-[#1F2A1F]</li>
                    </ul>
                  </div>

                  <div>
                    <h4 className="text-sm font-semibold text-[#1F2A1F] mb-2">Suggested Destinations (Step 1, Empty Query)</h4>
                    <ul className="text-sm text-[#6F7A5A] space-y-1 ml-4 list-disc">
                      <li><strong>Layout:</strong> Vertical list, space-y-0, px-6 py-4</li>
                      <li><strong>Section title:</strong> "Suggested destinations", text-sm font-medium, mb-4</li>
                      <li><strong>List items:</strong> Full-width buttons, px-0 py-4, border-b (#ECEEE4) between items</li>
                      <li><strong>Icon container:</strong> 12x12 (48px), rounded-xl, colored backgrounds with themed icons</li>
                      <li><strong>Text:</strong> Primary text (base, font-medium), secondary text (sm, text-[#6F7A5A])</li>
                      <li><strong>Hover:</strong> bg-[#FAFAF7] on entire row</li>
                      <li><strong>Icon colors:</strong> Rotating palette (green, pink, purple, teal, goldenrod, indigo)</li>
                    </ul>
                  </div>

                  <div>
                    <h4 className="text-sm font-semibold text-[#1F2A1F] mb-2">Search Results (Step 1, Typing)</h4>
                    <ul className="text-sm text-[#6F7A5A] space-y-1 ml-4 list-disc">
                      <li><strong>Layout:</strong> Vertical list, space-y-0, px-6 py-2</li>
                      <li><strong>Place results:</strong> Show cover images (12x12, rounded-xl) when available, fallback to colored icon</li>
                      <li><strong>City results:</strong> Colored location icons</li>
                      <li><strong>Image handling:</strong> object-cover, error fallback to icon</li>
                      <li><strong>Click behavior:</strong> Places navigate to place page, cities select city</li>
                    </ul>
                  </div>

                  <div>
                    <h4 className="text-sm font-semibold text-[#1F2A1F] mb-2">City Info Block (Step 2)</h4>
                    <ul className="text-sm text-[#6F7A5A] space-y-1 ml-4 list-disc">
                      <li><strong>Container:</strong> px-6 pt-6 pb-4, border-b (#ECEEE4)</li>
                      <li><strong>Icon:</strong> 10x10 (40px), rounded-xl, bg-[#E8F0E8], location icon (#8F9E4F)</li>
                      <li><strong>City name:</strong> text-base, font-semibold, text-[#1F2A1F]</li>
                      <li><strong>Count:</strong> text-sm, text-[#6F7A5A], shows "N locations available"</li>
                      <li><strong>Change button:</strong> text-sm, font-medium, text-[#8F9E4F], underline, hover: text-[#7A8A42]</li>
                    </ul>
                  </div>

                  <div>
                    <h4 className="text-sm font-semibold text-[#1F2A1F] mb-2">Tag Selection (Step 2)</h4>
                    <ul className="text-sm text-[#6F7A5A] space-y-1 ml-4 list-disc">
                      <li><strong>Layout:</strong> Vertical list, space-y-0, px-6</li>
                      <li><strong>Section title:</strong> "What's your vibe?", Fraunces, text-lg, font-semibold</li>
                      <li><strong>Subtitle:</strong> "Pick one or a few — we'll handle the rest.", text-sm, text-[#6F7A5A]</li>
                      <li><strong>Tag rows:</strong> Full-width buttons, px-0 py-4, border-b (#ECEEE4) between items</li>
                      <li><strong>Emoji:</strong> 2xl (24px), left side</li>
                      <li><strong>Label:</strong> text-base, font-medium, text-[#1F2A1F]</li>
                      <li><strong>Count:</strong> text-sm, text-[#6F7A5A], shows "(N)" next to label when city selected</li>
                      <li><strong>Selection indicator:</strong> 6x6 (24px) circle, selected: bg-[#8F9E4F] with white checkmark, unselected: border-2 (#ECEEE4)</li>
                      <li><strong>Hover:</strong> bg-[#FAFAF7] on entire row</li>
                      <li><strong>Selected state:</strong> bg-[#FAFAF7] on row</li>
                      <li><strong>Soft limit warning:</strong> Shows when {'>'}3 tags selected, text-xs, text-center, text-[#6F7A5A]</li>
                    </ul>
                  </div>

                  <div>
                    <h4 className="text-sm font-semibold text-[#1F2A1F] mb-2">Sticky Footer</h4>
                    <ul className="text-sm text-[#6F7A5A] space-y-1 ml-4 list-disc">
                      <li><strong>Container:</strong> border-t (#ECEEE4), px-6 py-4, flex justify-between</li>
                      <li><strong>Safe area:</strong> paddingBottom: max(16px, env(safe-area-inset-bottom))</li>
                      <li><strong>Clear button:</strong> Text button, underline, text-sm, font-medium, disabled: text-[#A8B096], no-underline</li>
                      <li><strong>Primary CTA:</strong> h-11, rounded-xl, bg-[#8F9E4F], text-white, px-5, text-sm, font-medium</li>
                      <li><strong>CTA states:</strong> Step 1: "Next" (if city selected) or "Search" (if query typed), Step 2: "Search"</li>
                      <li><strong>Disabled state:</strong> bg-[#DADDD0], cursor-not-allowed</li>
                      <li><strong>Icons:</strong> 20px, white, flex-shrink-0</li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* User Flow */}
              <div className="rounded-xl border border-[#ECEEE4] bg-white p-6">
                <h3 className="text-lg font-semibold text-[#1F2A1F] mb-4">User Flow & Interactions</h3>
                
                <div className="space-y-4">
                  <div>
                    <h4 className="text-sm font-semibold text-[#1F2A1F] mb-2">Step 1: "Where?" (City Selection)</h4>
                    <ol className="text-sm text-[#6F7A5A] space-y-1 ml-4 list-decimal">
                      <li>User clicks search bar → Modal opens, autofocus on input</li>
                      <li>Empty state: Shows "Suggested destinations" (Nearby, Current city, Popular cities, Recent searches)</li>
                      <li>Typing: Shows live search results (cities and places with cover images)</li>
                      <li>City selection: Clicking a city auto-advances to Step 2</li>
                      <li>Place selection: Clicking a place navigates to place page and closes modal</li>
                      <li>Button behavior: "Next" (if city selected) or "Search" (if query typed)</li>
                    </ol>
                  </div>

                  <div>
                    <h4 className="text-sm font-semibold text-[#1F2A1F] mb-2">Step 2: "What's your vibe?" (Tag Selection)</h4>
                    <ol className="text-sm text-[#6F7A5A] space-y-1 ml-4 list-decimal">
                      <li>Shows selected city info block with location count</li>
                      <li>Displays all categories as selectable rows with emoji, label, and count</li>
                      <li>User can select multiple tags (soft limit: 3, but not enforced)</li>
                      <li>Tag counts update dynamically based on selected city</li>
                      <li>Back button returns to Step 1</li>
                      <li>"Clear tags" button resets tag selection</li>
                      <li>"Search" button applies filters and closes modal</li>
                    </ol>
                  </div>

                  <div>
                    <h4 className="text-sm font-semibold text-[#1F2A1F] mb-2">State Management</h4>
                    <ul className="text-sm text-[#6F7A5A] space-y-1 ml-4 list-disc">
                      <li><strong>Recent searches:</strong> Stored in localStorage, includes city, query, and tags</li>
                      <li><strong>Persistence:</strong> Selections persist when modal closes and reopens</li>
                      <li><strong>Live counts:</strong> Tag counts and place counts update in real-time as filters change</li>
                      <li><strong>Debouncing:</strong> Search queries debounced (200ms) to reduce API calls</li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Technical Details */}
              <div className="rounded-xl border border-[#ECEEE4] bg-white p-6">
                <h3 className="text-lg font-semibold text-[#1F2A1F] mb-4">Technical Implementation</h3>
                
                <div className="space-y-4">
                  <div>
                    <h4 className="text-sm font-semibold text-[#1F2A1F] mb-2">Viewport Handling</h4>
                    <ul className="text-sm text-[#6F7A5A] space-y-1 ml-4 list-disc">
                      <li><strong>Mobile Chrome fix:</strong> Uses window.visualViewport.height for accurate 100dvh</li>
                      <li><strong>Safe area:</strong> paddingBottom uses env(safe-area-inset-bottom) for notched devices</li>
                      <li><strong>Dynamic height:</strong> Updates on viewport resize events</li>
                    </ul>
                  </div>

                  <div>
                    <h4 className="text-sm font-semibold text-[#1F2A1F] mb-2">Data Fetching</h4>
                    <ul className="text-sm text-[#6F7A5A] space-y-1 ml-4 list-disc">
                      <li><strong>City search:</strong> Filters cities client-side from loaded list</li>
                      <li><strong>Place search:</strong> Supabase query with ilike for title, description, country</li>
                      <li><strong>Tag counts:</strong> Separate queries for each category in selected city</li>
                      <li><strong>Filtered count:</strong> Combines city, tags, and query filters using Supabase overlaps</li>
                    </ul>
                  </div>

                  <div>
                    <h4 className="text-sm font-semibold text-[#1F2A1F] mb-2">Accessibility</h4>
                    <ul className="text-sm text-[#6F7A5A] space-y-1 ml-4 list-disc">
                      <li><strong>Keyboard:</strong> ESC closes modal, Tab navigation, Enter submits</li>
                      <li><strong>Focus trap:</strong> Desktop modal traps focus within</li>
                      <li><strong>ARIA labels:</strong> All buttons have aria-label attributes</li>
                      <li><strong>Screen readers:</strong> Semantic HTML, proper heading hierarchy</li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Brand Colors Used */}
              <div className="rounded-xl border border-[#ECEEE4] bg-white p-6">
                <h3 className="text-lg font-semibold text-[#1F2A1F] mb-4">Brand Colors Used</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-[#8F9E4F]" />
                    <div>
                      <div className="text-sm font-medium text-[#1F2A1F]">Primary Green</div>
                      <div className="text-xs text-[#6F7A5A]">#8F9E4F</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-[#1F2A1F]" />
                    <div>
                      <div className="text-sm font-medium text-[#1F2A1F]">Primary Text</div>
                      <div className="text-xs text-[#6F7A5A]">#1F2A1F</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-[#6F7A5A]" />
                    <div>
                      <div className="text-sm font-medium text-[#1F2A1F]">Secondary Text</div>
                      <div className="text-xs text-[#6F7A5A]">#6F7A5A</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-[#ECEEE4]" />
                    <div>
                      <div className="text-sm font-medium text-[#1F2A1F]">Border Light</div>
                      <div className="text-xs text-[#6F7A5A]">#ECEEE4</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-[#FAFAF7]" />
                    <div>
                      <div className="text-sm font-medium text-[#1F2A1F]">Warm White</div>
                      <div className="text-xs text-[#6F7A5A]">#FAFAF7</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-[#DADDD0]" />
                    <div>
                      <div className="text-sm font-medium text-[#1F2A1F]">Disabled</div>
                      <div className="text-xs text-[#6F7A5A]">#DADDD0</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* TopBar Section */}
          <section>
            <h2 className="text-2xl font-semibold font-fraunces text-[#1F2A1F] mb-6">TopBar Navigation</h2>
            
            <div className="space-y-6">
              {/* Overview */}
              <div className="rounded-xl border border-[#ECEEE4] bg-white p-6">
                <h3 className="text-lg font-semibold text-[#1F2A1F] mb-4">Overview</h3>
                <p className="text-sm text-[#6F7A5A] leading-relaxed mb-4">
                  The TopBar is the primary navigation component used across all pages. It adapts responsively between 
                  mobile and desktop layouts, with different configurations for each page type (Home, Map, Profile, Place pages, etc.).
                </p>
                <div className="space-y-2 text-sm text-[#6F7A5A]">
                  <div><strong className="text-[#1F2A1F]">Component:</strong> <code className="bg-[#FAFAF7] px-2 py-0.5 rounded">app/components/TopBar.tsx</code></div>
                  <div><strong className="text-[#1F2A1F]">Breakpoint:</strong> <code className="bg-[#FAFAF7] px-2 py-0.5 rounded">lg (1024px)</code> — переключение между мобильной и десктоп версиями</div>
                  <div><strong className="text-[#1F2A1F]">Z-index:</strong> <code className="bg-[#FAFAF7] px-2 py-0.5 rounded">z-40</code> (основной TopBar), <code className="bg-[#FAFAF7] px-2 py-0.5 rounded">z-30</code> (переключатель List/Map)</div>
                </div>
              </div>

              {/* Home Page */}
              <div className="rounded-xl border border-[#ECEEE4] bg-white p-6">
                <h3 className="text-lg font-semibold text-[#1F2A1F] mb-4">Home Page (`/`)</h3>
                
                <div className="space-y-4">
                  <div>
                    <h4 className="text-sm font-semibold text-[#1F2A1F] mb-2">Mobile Version (&lt; 1024px)</h4>
                    <div className="bg-[#FAFAF7] rounded-lg p-4 mb-3 font-mono text-xs">
                      [Back] [Search Pill] [Filters]
                    </div>
                    <ul className="text-sm text-[#6F7A5A] space-y-1 ml-4 list-disc">
                      <li><strong>Back Button:</strong> Скрыт на главной странице</li>
                      <li><strong>Search Pill:</strong> "Start to your search", центрирован, открывает SearchModal</li>
                      <li><strong>Filters Button:</strong> Скрыт на главной странице</li>
                    </ul>
                  </div>

                  <div>
                    <h4 className="text-sm font-semibold text-[#1F2A1F] mb-2">Desktop Version (≥ 1024px)</h4>
                    <div className="bg-[#FAFAF7] rounded-lg p-4 mb-3 font-mono text-xs">
                      [Wordmark Logo] [SearchBar (Airbnb-style)] [Add Place] [Auth/Avatar]
                    </div>
                    <ul className="text-sm text-[#6F7A5A] space-y-1 ml-4 list-disc">
                      <li><strong>Wordmark Logo:</strong> text-4xl, без иконки, без ® символа</li>
                      <li><strong>SearchBar:</strong> Полнофункциональный Airbnb-style pill с City Selector, Search Input, Filters</li>
                      <li><strong>Add Place:</strong> Виден только для авторизованных пользователей</li>
                      <li><strong>Auth Area:</strong> Login кнопка или Avatar с dropdown меню</li>
                      <li><strong>Border-bottom:</strong> <code className="bg-[#FAFAF7] px-1.5 py-0.5 rounded">border-b border-[#ECEEE4]</code></li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Map Page */}
              <div className="rounded-xl border border-[#ECEEE4] bg-white p-6">
                <h3 className="text-lg font-semibold text-[#1F2A1F] mb-4">Map Page (`/map`)</h3>
                
                <div className="space-y-4">
                  <div>
                    <h4 className="text-sm font-semibold text-[#1F2A1F] mb-2">Mobile Version (&lt; 1024px)</h4>
                    <div className="bg-[#FAFAF7] rounded-lg p-4 mb-3 font-mono text-xs">
                      [Back] [SearchBar (Mobile)] [Filters]<br/>
                      ─────────────────────────────────────<br/>
                      [List] [Map] ← Переключатель (fixed, top-[64px])
                    </div>
                    <ul className="text-sm text-[#6F7A5A] space-y-1 ml-4 list-disc">
                      <li><strong>Back Button:</strong> Навигация на `/`</li>
                      <li><strong>SearchBar:</strong> Кнопка-триггер, показывает `searchValue` или `selectedCity · Search...`, открывает SearchModal</li>
                      <li><strong>Filters Button:</strong> Badge с количеством фильтров (если `activeFiltersCount {'>'} 0`)</li>
                      <li><strong>View Toggle:</strong> Fixed на второй строке, только на мобильных (`lg:hidden`), две кнопки List/Map</li>
                      <li><strong>Border-bottom:</strong> Убран (`pathname === "/map"` → нет `border-b`)</li>
                    </ul>
                  </div>

                  <div>
                    <h4 className="text-sm font-semibold text-[#1F2A1F] mb-2">Desktop Version (≥ 1024px)</h4>
                    <div className="bg-[#FAFAF7] rounded-lg p-4 mb-3 font-mono text-xs">
                      [Wordmark Logo] [SearchBar (Airbnb-style)] [Add Place] [Auth/Avatar]
                    </div>
                    <ul className="text-sm text-[#6F7A5A] space-y-1 ml-4 list-disc">
                      <li><strong>SearchBar:</strong> Встроенный компонент с live search (не модальное окно)</li>
                      <li><strong>View Toggle:</strong> Скрыт (на десктопе используется split view)</li>
                      <li><strong>Border-bottom:</strong> Убран</li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Other Pages */}
              <div className="rounded-xl border border-[#ECEEE4] bg-white p-6">
                <h3 className="text-lg font-semibold text-[#1F2A1F] mb-4">Other Pages</h3>
                
                <div className="space-y-3">
                  <div>
                    <h4 className="text-sm font-semibold text-[#1F2A1F] mb-2">Place Page (`/id/[id]`)</h4>
                    <ul className="text-sm text-[#6F7A5A] space-y-1 ml-4 list-disc">
                      <li><strong>Mobile:</strong> [Back] [Share] [Favorite]</li>
                      <li><strong>Desktop:</strong> Стандартный TopBar с Logo, SearchBar, Auth</li>
                    </ul>
                  </div>

                  <div>
                    <h4 className="text-sm font-semibold text-[#1F2A1F] mb-2">Profile Page (`/profile`)</h4>
                    <ul className="text-sm text-[#6F7A5A] space-y-1 ml-4 list-disc">
                      <li><strong>Mobile:</strong> [Back] [Add Place (fixed, top-right)]</li>
                      <li><strong>Desktop:</strong> Стандартный TopBar</li>
                    </ul>
                  </div>

                  <div>
                    <h4 className="text-sm font-semibold text-[#1F2A1F] mb-2">Other Pages (`/explore`, `/feed`, `/saved`, `/settings`, `/collections`)</h4>
                    <ul className="text-sm text-[#6F7A5A] space-y-1 ml-4 list-disc">
                      <li><strong>Mobile:</strong> [Logo] [Search Pill] [Filters]</li>
                      <li><strong>Desktop:</strong> Стандартный TopBar с Logo, SearchBar, Auth</li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Technical Details */}
              <div className="rounded-xl border border-[#ECEEE4] bg-white p-6">
                <h3 className="text-lg font-semibold text-[#1F2A1F] mb-4">Technical Details</h3>
                
                <div className="space-y-4">
                  <div>
                    <h4 className="text-sm font-semibold text-[#1F2A1F] mb-2">Positioning & Layout</h4>
                    <ul className="text-sm text-[#6F7A5A] space-y-1 ml-4 list-disc">
                      <li><strong>TopBar:</strong> <code className="bg-[#FAFAF7] px-1.5 py-0.5 rounded">fixed top-0 left-0 right-0</code></li>
                      <li><strong>View Toggle:</strong> <code className="bg-[#FAFAF7] px-1.5 py-0.5 rounded">fixed top-[64px] lg:top-[80px]</code></li>
                      <li><strong>Add Place (profile):</strong> <code className="bg-[#FAFAF7] px-1.5 py-0.5 rounded">absolute top-safe-top top-3 right-4</code></li>
                    </ul>
                  </div>

                  <div>
                    <h4 className="text-sm font-semibold text-[#1F2A1F] mb-2">SearchBar States</h4>
                    <ul className="text-sm text-[#6F7A5A] space-y-1 ml-4 list-disc">
                      <li><strong>Mobile:</strong> Кнопка-триггер → открывает SearchModal</li>
                      <li><strong>Desktop:</strong> Встроенный компонент с live search</li>
                    </ul>
                  </div>

                  <div>
                    <h4 className="text-sm font-semibold text-[#1F2A1F] mb-2">Filter Indicators</h4>
                    <ul className="text-sm text-[#6F7A5A] space-y-1 ml-4 list-disc">
                      <li><strong>Mobile:</strong> Только на кнопке Filters (badge с количеством)</li>
                      <li><strong>Desktop:</strong> На кнопке Filters внутри SearchBar (badge)</li>
                      <li><strong>Badge style:</strong> <code className="bg-[#FAFAF7] px-1.5 py-0.5 rounded">w-5 h-5 rounded-full bg-[#8F9E4F] text-white text-xs</code></li>
                    </ul>
                  </div>

                  <div>
                    <h4 className="text-sm font-semibold text-[#1F2A1F] mb-2">View Toggle (List/Map)</h4>
                    <ul className="text-sm text-[#6F7A5A] space-y-1 ml-4 list-disc">
                      <li><strong>Visibility:</strong> Только на мобильных (`lg:hidden`)</li>
                      <li><strong>Position:</strong> Fixed на второй строке под TopBar</li>
                      <li><strong>Active state:</strong> <code className="bg-[#FAFAF7] px-1.5 py-0.5 rounded">bg-[#8F9E4F] text-white</code></li>
                      <li><strong>Inactive state:</strong> <code className="bg-[#FAFAF7] px-1.5 py-0.5 rounded">bg-white text-[#8F9E4F] border border-[#ECEEE4]</code></li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Props Interface */}
              <div className="rounded-xl border border-[#ECEEE4] bg-white p-6">
                <h3 className="text-lg font-semibold text-[#1F2A1F] mb-4">Props Interface</h3>
                <pre className="bg-[#FAFAF7] rounded-lg p-4 overflow-x-auto text-xs text-[#6F7A5A]">
{`type TopBarProps = {
  // Search bar props
  showSearchBar?: boolean;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  selectedCity?: string | null;
  onCityChange?: (city: string | null) => void;
  onFiltersClick?: () => void;
  activeFiltersCount?: number;
  activeFiltersSummary?: string;
  onSearchBarClick?: () => void; // Mobile: opens SearchModal
  
  // User props
  userAvatar?: string | null;
  userDisplayName?: string | null;
  userEmail?: string | null;
  
  // Custom props
  showBackButton?: boolean;
  showAddPlaceButton?: boolean;
  onBackClick?: () => void;
  
  // Place page props
  onShareClick?: () => void;
  onFavoriteClick?: () => void;
  isFavorite?: boolean;
  favoriteLoading?: boolean;
  
  // Map page view toggle
  view?: "list" | "map";
  onViewChange?: (view: "list" | "map") => void;
};`}
                </pre>
              </div>

              {/* Visual Schemas */}
              <div className="rounded-xl border border-[#ECEEE4] bg-white p-6">
                <h3 className="text-lg font-semibold text-[#1F2A1F] mb-4">Visual Schemas</h3>
                
                <div className="space-y-4">
                  <div>
                    <h4 className="text-sm font-semibold text-[#1F2A1F] mb-2">Home Page (Mobile)</h4>
                    <div className="bg-[#FAFAF7] rounded-lg p-4 font-mono text-xs border border-[#ECEEE4]">
                      ┌─────────────────────────────────┐<br/>
                      │ [🔍 Start to your search]      │<br/>
                      └─────────────────────────────────┘
                    </div>
                  </div>

                  <div>
                    <h4 className="text-sm font-semibold text-[#1F2A1F] mb-2">Home Page (Desktop)</h4>
                    <div className="bg-[#FAFAF7] rounded-lg p-4 font-mono text-xs border border-[#ECEEE4]">
                      ┌─────────────────────────────────────────────────────────────┐<br/>
                      │ [Maporia] [Anywhere ▼ | Search... | 🔍 Filters] [➕] [👤▼] │<br/>
                      └─────────────────────────────────────────────────────────────┘
                    </div>
                  </div>

                  <div>
                    <h4 className="text-sm font-semibold text-[#1F2A1F] mb-2">Map Page (Mobile)</h4>
                    <div className="bg-[#FAFAF7] rounded-lg p-4 font-mono text-xs border border-[#ECEEE4]">
                      ┌─────────────────────────────────┐<br/>
                      │ [←] [Miami · Search...] [🔍 2]   │<br/>
                      ├─────────────────────────────────┤<br/>
                      │ [List] [Map]                    │<br/>
                      └─────────────────────────────────┘
                    </div>
                  </div>

                  <div>
                    <h4 className="text-sm font-semibold text-[#1F2A1F] mb-2">Map Page (Desktop)</h4>
                    <div className="bg-[#FAFAF7] rounded-lg p-4 font-mono text-xs border border-[#ECEEE4]">
                      ┌─────────────────────────────────────────────────────────────┐<br/>
                      │ [Maporia] [Miami ▼ | Search... | 🔍 2] [➕] [👤▼]          │<br/>
                      └─────────────────────────────────────────────────────────────┘
                    </div>
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

          {/* Places Filtering Logic */}
          <section>
            <h2 className="text-2xl font-semibold font-fraunces text-[#1F2A1F] mb-6">Places Filtering Logic</h2>
            
            <div className="space-y-6">
              <div className="rounded-xl border border-[#ECEEE4] bg-white p-6">
                <h3 className="text-lg font-semibold text-[#1F2A1F] mb-4">Filter Structure</h3>
                <div className="space-y-4 text-sm text-[#6F7A5A]">
                  <div>
                    <strong className="text-[#1F2A1F]">Filter Groups:</strong>
                    <ul className="list-disc list-inside space-y-1 ml-4 mt-2">
                      <li><strong>Top Pills:</strong> Premium, Hidden, Vibe (boolean filters)</li>
                      <li><strong>City:</strong> Multi-select cities</li>
                      <li><strong>Category:</strong> Multi-select categories</li>
                    </ul>
                  </div>
                  <div>
                    <strong className="text-[#1F2A1F]">Filter Logic:</strong>
                    <ul className="list-disc list-inside space-y-1 ml-4 mt-2">
                      <li><strong>AND between groups:</strong> (Top Pills) AND (City) AND (Category)</li>
                      <li><strong>OR within groups:</strong> City OR City OR City, Category OR Category</li>
                      <li><strong>AND within Top Pills:</strong> Premium AND Hidden AND Vibe (if multiple selected)</li>
                    </ul>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-[#ECEEE4] bg-white p-6">
                <h3 className="text-lg font-semibold text-[#1F2A1F] mb-4">Filter Rules</h3>
                <div className="space-y-4 text-sm text-[#6F7A5A]">
                  <div>
                    <strong className="text-[#1F2A1F]">Top Pills (Premium, Hidden, Vibe):</strong>
                    <ul className="list-disc list-inside space-y-1 ml-4 mt-2">
                      <li>Each enabled pill adds an AND condition</li>
                      <li>Premium: <code className="bg-[#FAFAF7] px-1 rounded">is_premium === true</code> OR <code className="bg-[#FAFAF7] px-1 rounded">access_level === 'premium'</code></li>
                      <li>Hidden: <code className="bg-[#FAFAF7] px-1 rounded">is_hidden === true</code> OR category includes "🤫 Hidden & Unique"</li>
                      <li>Vibe: <code className="bg-[#FAFAF7] px-1 rounded">is_vibe === true</code> OR category includes "✨ Vibe & Atmosphere"</li>
                    </ul>
                  </div>
                  <div>
                    <strong className="text-[#1F2A1F]">City Filter:</strong>
                    <ul className="list-disc list-inside space-y-1 ml-4 mt-2">
                      <li>0 cities selected → no city filter applied</li>
                      <li>1 city selected → show places from that city only</li>
                      <li>2+ cities selected → show places from any selected city (OR logic)</li>
                      <li>All cities selected → show all places (sum of all cities)</li>
                      <li>City comparison uses normalized names (trim, lowercase)</li>
                    </ul>
                  </div>
                  <div>
                    <strong className="text-[#1F2A1F]">Category Filter:</strong>
                    <ul className="list-disc list-inside space-y-1 ml-4 mt-2">
                      <li>0 categories selected → no category filter applied</li>
                      <li>1+ categories selected → place passes if it has ANY selected category (OR logic)</li>
                      <li>All categories selected → show all places (no category filter)</li>
                    </ul>
                  </div>
                  <div>
                    <strong className="text-[#1F2A1F]">Special Cases:</strong>
                    <ul className="list-disc list-inside space-y-1 ml-4 mt-2">
                      <li>If no filters selected → show all places</li>
                      <li>If all cities selected → filter remains active, shows sum of all places</li>
                      <li>If all categories selected → filter remains active, shows all places</li>
                      <li>Search query is applied separately before filter logic</li>
                    </ul>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-[#ECEEE4] bg-white p-6">
                <h3 className="text-lg font-semibold text-[#1F2A1F] mb-4">Implementation</h3>
                <div className="space-y-3 text-sm text-[#6F7A5A]">
                  <div>
                    <strong className="text-[#1F2A1F]">Centralized Function:</strong>
                    <code className="block bg-[#FAFAF7] p-3 rounded-lg mt-2 font-mono text-xs">filterPlaces(places: Place[], filters: PlaceFilters): Place[]</code>
                  </div>
                  <div>
                    <strong className="text-[#1F2A1F]">Filter Order:</strong>
                    <ol className="list-decimal list-inside space-y-1 ml-4 mt-2">
                      <li>Apply search query filter (if exists)</li>
                      <li>Apply Top Pills filters (Premium, Hidden, Vibe) - AND between them</li>
                      <li>Apply City filter (OR within selected cities)</li>
                      <li>Apply Category filter (OR within selected categories)</li>
                    </ol>
                  </div>
                  <div>
                    <strong className="text-[#1F2A1F]">Count Calculation:</strong>
                    <ul className="list-disc list-inside space-y-1 ml-4 mt-2">
                      <li>Always loads all places from database for accurate count</li>
                      <li>Applies all filters client-side using <code className="bg-[#FAFAF7] px-1 rounded">filterPlaces</code></li>
                      <li>Returns filtered count for "Show X places" button</li>
                      <li>Button is disabled when count is 0</li>
                    </ul>
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
