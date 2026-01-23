"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useRef } from "react";
import { supabase } from "../lib/supabase";
import FavoriteIcon from "./FavoriteIcon";
import Icon from "./Icon";

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

export default function BottomNav() {
  const pathname = usePathname();
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isVisible, setIsVisible] = useState(true);
  const lastScrollY = useRef(0);
  const scrollTimeout = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    (async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData.session;

      if (session?.user) {
        setIsAuthenticated(true);
        setUserEmail(session.user.email ?? null);

        const { data: profile } = await supabase
          .from("profiles")
          .select("avatar_url, display_name")
          .eq("id", session.user.id)
          .maybeSingle();

        if (profile) {
          setAvatarUrl(profile.avatar_url);
          setDisplayName(profile.display_name);
        }
      } else {
        setIsAuthenticated(false);
      }

      const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
        if (session?.user) {
          setIsAuthenticated(true);
          setUserEmail(session.user.email ?? null);

          const { data: profile } = await supabase
            .from("profiles")
            .select("avatar_url, display_name")
            .eq("id", session.user.id)
            .maybeSingle();

          if (profile) {
            setAvatarUrl(profile.avatar_url);
            setDisplayName(profile.display_name);
          }
        } else {
          setIsAuthenticated(false);
          setAvatarUrl(null);
          setDisplayName(null);
          setUserEmail(null);
        }
      });

      return () => {
        subscription.unsubscribe();
      };
    })();
  }, []);

  // Hide/show bottom nav on scroll (mobile only)
  useEffect(() => {
    // Only apply on mobile (screen width < 1024px)
    if (typeof window === "undefined" || window.innerWidth >= 1024) {
      return;
    }

    const handleScroll = () => {
      if (scrollTimeout.current) {
        cancelAnimationFrame(scrollTimeout.current as any);
      }

      scrollTimeout.current = requestAnimationFrame(() => {
        const currentScrollY = window.scrollY || document.documentElement.scrollTop;
        const scrollDifference = Math.abs(currentScrollY - lastScrollY.current);
        const threshold = 15; // Minimum scroll distance to trigger hide/show

        // Only update if scroll difference is significant
        if (scrollDifference > threshold) {
          if (currentScrollY > lastScrollY.current && currentScrollY > 100) {
            // Scrolling down - hide nav
            setIsVisible(false);
          } else if (currentScrollY < lastScrollY.current) {
            // Scrolling up - show nav
            setIsVisible(true);
          }
          lastScrollY.current = currentScrollY;
        }
      });
    };

    // Initialize last scroll position
    lastScrollY.current = window.scrollY || document.documentElement.scrollTop;

    window.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      window.removeEventListener("scroll", handleScroll);
      if (scrollTimeout.current) {
        cancelAnimationFrame(scrollTimeout.current as any);
      }
    };
  }, []);

  const navItems = [
    { href: "/", label: "Explore", icon: SearchIcon },
    { href: "/saved", label: "Saved", icon: SavedIcon },
    { href: "/profile", label: "Profile", icon: ProfileIcon, isProfile: true },
  ];

  return (
    <div 
      className={`fixed left-0 right-0 z-40 bg-white lg:hidden transition-transform duration-300 ease-in-out ${
        isVisible ? 'translate-y-0' : 'translate-y-full'
      }`}
      style={{
        bottom: 'env(safe-area-inset-bottom, 0px)',
        paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 8px)',
      }}
    >
      <div className="mx-auto max-w-md">
        <div className="flex items-center justify-around px-4 pt-2 pb-2">
          {navItems.map((item) => {
            // For home page (/), check exact match. For other pages, check startsWith
            const isActive = item.href === "/" 
              ? pathname === "/"
              : pathname === item.href || pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex flex-col items-center gap-1 py-2 px-4 transition"
              >
                {item.isProfile && isAuthenticated ? (
                  <ProfileAvatarIcon 
                    active={isActive} 
                    avatarUrl={avatarUrl}
                    displayName={displayName}
                    userEmail={userEmail}
                  />
                ) : (
                  <Icon active={isActive} />
                )}
                <span className={`text-[10px] font-medium transition-colors ${isActive ? "text-[#8F9E4F]" : "text-[#A8B096]"}`}>
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

function SearchIcon({ active }: { active: boolean }) {
  return (
    <svg
      className={`w-5 h-5 transition-colors ${active ? "text-[#8F9E4F]" : "text-[#A8B096]"}`}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  );
}

function SavedIcon({ active }: { active: boolean }) {
  return <FavoriteIcon isActive={active} size={20} className="transition-colors" />;
}

function ProfileIcon({ active }: { active: boolean }) {
  return (
    <Icon
      name="profile"
      size={20}
      className={`transition-colors ${active ? "text-[#8F9E4F]" : "text-[#A8B096]"}`}
    />
  );
}

function ProfileAvatarIcon({ 
  active, 
  avatarUrl, 
  displayName, 
  userEmail 
}: { 
  active: boolean; 
  avatarUrl: string | null;
  displayName: string | null;
  userEmail: string | null;
}) {
  const initials = displayName 
    ? initialsFromName(displayName) 
    : initialsFromEmail(userEmail);

  return (
    <div className={`w-5 h-5 rounded-full overflow-hidden flex items-center justify-center transition-colors ${
      active 
        ? "ring-2 ring-[#8F9E4F] ring-offset-2 ring-offset-white" 
        : ""
    }`}>
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={avatarUrl}
          alt="Profile"
          className="w-full h-full object-cover"
        />
      ) : (
        <div className={`w-full h-full flex items-center justify-center text-[10px] font-semibold border ${
          active 
            ? "bg-[#8F9E4F] text-white border-[#8F9E4F]" 
            : "bg-[#FAFAF7] text-[#8F9E4F] border-[#ECEEE4]"
        }`}>
          {initials}
        </div>
      )}
    </div>
  );
}
