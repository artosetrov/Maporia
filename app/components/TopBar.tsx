"use client";

import { ReactNode, useState, useRef, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type TopBarProps = {
  left?: ReactNode;
  center?: ReactNode;
  right?: ReactNode;
  title?: string;
  bottom?: ReactNode;
  onBack?: () => void;
  backHref?: string;
  showDesktopTabs?: boolean;
  userAvatar?: string | null;
  userDisplayName?: string | null;
  userEmail?: string | null;
};

function initialsFromEmail(email?: string | null) {
  if (!email) return "U";
  const name = email.split("@")[0] || "U";
  const parts = name.split(/[.\-_]/).filter(Boolean);
  const a = (parts[0]?.[0] ?? name[0] ?? "U").toUpperCase();
  const b = (parts[1]?.[0] ?? name[1] ?? "").toUpperCase();
  return (a + b).slice(0, 2);
}

function initialsFromName(name?: string | null) {
  if (!name) return "U";
  const parts = name.split(/\s+/).filter(Boolean);
  const a = (parts[0]?.[0] ?? name[0] ?? "U").toUpperCase();
  const b = (parts[1]?.[0] ?? "").toUpperCase();
  return (a + b).slice(0, 2);
}

export default function TopBar({ left, center, right, title, bottom, onBack, backHref, showDesktopTabs = false, userAvatar, userDisplayName, userEmail }: TopBarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const avatarRef = useRef<HTMLButtonElement>(null);
  const [menuPosition, setMenuPosition] = useState<{ top: number; right: number } | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const centerContent = center ?? (title ? <div className="text-sm font-semibold text-[#2d2d2d]">{title}</div> : undefined);

  // Проверяем авторизацию
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      setIsAuthenticated(!!data.user);
    })();

    // Слушаем изменения авторизации
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthenticated(!!session?.user);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const navItems = [
    { href: "/", label: "Place" },
    { href: "/feed", label: "Feed" },
    ...(isAuthenticated ? [{ href: "/saved", label: "Favorites" }] : []),
  ];

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node) && 
          avatarRef.current && !avatarRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }

    if (menuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [menuOpen]);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/auth");
  }

  return (
    <div className="fixed top-0 left-0 right-0 z-40 bg-[#faf9f7]/95 backdrop-blur-sm border-b border-[#6b7d47]/10">
      <div className="mx-auto max-w-7xl px-4 pt-safe-top pt-3 pb-3">
        <div className="flex items-center gap-3">
          {/* Left */}
          <div className="flex-shrink-0">
            {backHref ? (
              <Link
                href={backHref}
                className={`h-10 w-10 rounded-xl flex items-center justify-center text-[#556036] hover:bg-[#f5f4f2] transition ${showDesktopTabs ? "lg:hidden" : ""}`}
                aria-label="Back"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </Link>
            ) : onBack ? (
              <button
                onClick={onBack}
                className="h-10 w-10 rounded-xl flex items-center justify-center text-[#556036] hover:bg-[#f5f4f2] transition"
                aria-label="Back"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
            ) : left ? (
              left
            ) : (
              <div className="w-10" />
            )}
          </div>

          {/* Desktop Tabs (after logo) */}
          {showDesktopTabs && (
            <div className="hidden lg:flex items-center gap-1 ml-4">
              {navItems.map((item) => {
                // Для главной страницы (/) проверяем точное совпадение или что это не другие страницы
                let isActive = false;
                if (item.href === "/") {
                  isActive = pathname === "/" || pathname === "/places";
                } else if (item.href === "/saved") {
                  isActive = pathname === "/saved" || pathname.startsWith("/saved");
                } else if (item.href === "/feed") {
                  isActive = pathname === "/feed" || pathname.startsWith("/feed");
                }
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`px-4 py-2 text-sm font-medium transition rounded-lg ${
                      isActive
                        ? "text-[#6b7d47] bg-[#6b7d47]/10"
                        : "text-[#6b7d47]/60 hover:text-[#6b7d47] hover:bg-[#f5f4f2]"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
          )}

          {/* Center */}
          <div className="flex-1 min-w-0">{centerContent}</div>

          {/* Right */}
          <div className="flex-shrink-0 flex items-center gap-3">
            {right}
            {/* Add Place Button - visible only for authenticated users */}
            {isAuthenticated && (
              <Link
                href="/add"
                onClick={() => { if (navigator.vibrate) navigator.vibrate(10); }}
                className="h-10 w-10 rounded-xl flex items-center justify-center text-[#556036] hover:bg-[#f5f4f2] transition"
                aria-label="Add new place"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </Link>
            )}
            {/* Login Button - visible for unauthenticated users */}
            {!isAuthenticated && (
              <Link
                href="/auth"
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#6b7d47] text-white text-sm font-medium hover:bg-[#556036] transition"
              >
                Login
              </Link>
            )}
            {/* Desktop Avatar with Dropdown Menu */}
            {showDesktopTabs && isAuthenticated && (userAvatar || userDisplayName || userEmail) && (
              <div className="hidden lg:block relative">
                <button
                  ref={avatarRef}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (avatarRef.current) {
                      const rect = avatarRef.current.getBoundingClientRect();
                      setMenuPosition({ top: rect.bottom + 8, right: window.innerWidth - rect.right });
                    }
                    setMenuOpen(!menuOpen);
                  }}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-[#f5f4f2] transition"
                >
                  <div className="w-8 h-8 rounded-full bg-[#f5f4f2] overflow-hidden flex-shrink-0 border border-[#6b7d47]/10">
                    {userAvatar ? (
                      <img
                        src={userAvatar}
                        alt={userDisplayName || userEmail || "User"}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="text-xs font-semibold text-[#6b7d47] flex items-center justify-center h-full">
                        {userDisplayName ? initialsFromName(userDisplayName) : initialsFromEmail(userEmail)}
                      </span>
                    )}
                  </div>
                  <svg className="w-4 h-4 text-[#6b7d47]/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {/* Dropdown Menu */}
                {menuOpen && menuPosition && (
                  <div className="fixed inset-0 z-50">
                    <button
                      className="absolute inset-0 bg-black/20 backdrop-blur-sm"
                      onClick={() => {
                        setMenuOpen(false);
                        setMenuPosition(null);
                      }}
                      aria-label="Close menu"
                    />
                    <div
                      ref={menuRef}
                      className="absolute bg-white rounded-2xl shadow-xl border border-[#6b7d47]/10 overflow-hidden min-w-[200px]"
                      style={{
                        top: `${menuPosition.top}px`,
                        right: `${menuPosition.right}px`,
                      }}
                    >
                      <Link
                        href="/profile"
                        onClick={() => {
                          setMenuOpen(false);
                          setMenuPosition(null);
                        }}
                        className="w-full px-4 py-3 text-left text-sm text-[#2d2d2d] hover:bg-[#f5f4f2] transition flex items-center gap-3"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                        Profile
                      </Link>
                      <Link
                        href="/profile?edit=true"
                        onClick={() => {
                          setMenuOpen(false);
                          setMenuPosition(null);
                        }}
                        className="w-full px-4 py-3 text-left text-sm text-[#2d2d2d] hover:bg-[#f5f4f2] transition flex items-center gap-3 border-t border-[#6b7d47]/10"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                        Edit
                      </Link>
                      <Link
                        href="/settings"
                        onClick={() => {
                          setMenuOpen(false);
                          setMenuPosition(null);
                        }}
                        className="w-full px-4 py-3 text-left text-sm text-[#2d2d2d] hover:bg-[#f5f4f2] transition flex items-center gap-3 border-t border-[#6b7d47]/10"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        Settings
                      </Link>
                      <button
                        onClick={() => {
                          setMenuOpen(false);
                          setMenuPosition(null);
                          handleLogout();
                        }}
                        className="w-full px-4 py-3 text-left text-sm text-red-600 hover:bg-red-50 transition flex items-center gap-3 border-t border-[#6b7d47]/10"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                        </svg>
                        Logout
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        {bottom}
      </div>
    </div>
  );
}
