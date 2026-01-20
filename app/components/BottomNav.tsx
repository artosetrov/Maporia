"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function BottomNav() {
  const pathname = usePathname();

  const navItems = [
    { href: "/map", label: "Map", icon: MapIcon },
    { href: "/saved", label: "Saved", icon: SavedIcon },
    { href: "/profile", label: "Profile", icon: ProfileIcon },
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 bg-white pb-safe-bottom lg:hidden">
      <div className="mx-auto max-w-md">
        <div className="flex items-center justify-around px-4 pt-2 pb-2">
          {navItems.map((item) => {
            const isActive = pathname === item.href || (item.href !== "/map" && pathname.startsWith(item.href));
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
      fill="currentColor"
      viewBox="0 0 24 24"
    >
      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
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
