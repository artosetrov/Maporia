"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function BottomNav() {
  const pathname = usePathname();

  const navItems = [
    { href: "/", label: "Map", icon: MapIcon },
    { href: "/places", label: "Places", icon: PlacesIcon },
    { href: "/saved", label: "Saved", icon: SavedIcon },
    { href: "/profile", label: "Profile", icon: ProfileIcon },
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-sm border-t border-[#6b7d47]/10 pb-safe-bottom">
      <div className="mx-auto max-w-md">
        <div className="flex items-center justify-around px-4 pt-2 pb-2">
          {navItems.map((item) => {
            const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex flex-col items-center gap-1 py-2 px-4 transition"
              >
                <Icon active={isActive} />
                <span className={`text-[10px] font-medium transition ${isActive ? "text-[#6b7d47]" : "text-[#6b7d47]/50"}`}>
                  {item.label}
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function MapIcon({ active }: { active: boolean }) {
  return (
    <svg
      className={`w-5 h-5 transition ${active ? "text-[#6b7d47]" : "text-[#6b7d47]/50"}`}
      fill={active ? "currentColor" : "none"}
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      {active ? (
        <path d="M12 2L2 7v10c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-10-5z" />
      ) : (
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
      )}
    </svg>
  );
}

function PlacesIcon({ active }: { active: boolean }) {
  return (
    <svg
      className={`w-5 h-5 transition ${active ? "text-[#6b7d47]" : "text-[#6b7d47]/50"}`}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
    </svg>
  );
}

function SavedIcon({ active }: { active: boolean }) {
  return (
    <svg
      className={`w-5 h-5 transition ${active ? "text-[#6b7d47]" : "text-[#6b7d47]/50"}`}
      fill={active ? "currentColor" : "none"}
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
    </svg>
  );
}

function ProfileIcon({ active }: { active: boolean }) {
  return (
    <svg
      className={`w-5 h-5 transition ${active ? "text-[#6b7d47]" : "text-[#6b7d47]/50"}`}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
  );
}
