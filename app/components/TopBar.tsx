"use client";

import { ReactNode, useState, useRef, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "../lib/supabase";
import { CATEGORIES, DEFAULT_CITY } from "../constants";
import SearchBar from "./SearchBar";
import SearchModal from "./SearchModal";
import FavoriteIcon from "./FavoriteIcon";
import Icon from "./Icon";
import Wordmark from "./Wordmark";

type TopBarProps = {
  // Search bar props (only for /map page) - Airbnb style
  showSearchBar?: boolean;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  selectedCity?: string | null;
  onCityChange?: (city: string | null) => void;
  onFiltersClick?: () => void;
  activeFiltersCount?: number;
  // Active filters summary (for mobile search pill subtitle)
  activeFiltersSummary?: string;
  // Callback when search bar is clicked (for mobile to open modal)
  onSearchBarClick?: () => void;
  // User props
  userAvatar?: string | null;
  userDisplayName?: string | null;
  userEmail?: string | null;
  // Custom props for profile page
  showBackButton?: boolean;
  showAddPlaceButton?: boolean;
  onBackClick?: () => void;
  // Custom props for place page
  onShareClick?: () => void;
  onFavoriteClick?: () => void;
  isFavorite?: boolean;
  favoriteLoading?: boolean;
  // Map page view toggle props
  view?: "list" | "map";
  onViewChange?: (view: "list" | "map") => void;
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

export default function TopBar({
  showSearchBar = false,
  searchValue = "",
  onSearchChange,
  selectedCity = null,
  onCityChange,
  onFiltersClick,
  activeFiltersCount = 0,
  activeFiltersSummary,
  onSearchBarClick,
  userAvatar,
  userDisplayName,
  userEmail,
  showBackButton,
  showAddPlaceButton,
  onBackClick,
  onShareClick,
  onFavoriteClick,
  isFavorite,
  favoriteLoading,
  view,
  onViewChange,
}: TopBarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const avatarRef = useRef<HTMLButtonElement>(null);
  const [menuPosition, setMenuPosition] = useState<{ top: number; right: number } | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Проверяем авторизацию
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      setIsAuthenticated(!!data.user);
    })();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthenticated(!!session?.user);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const navItems = [
    { href: "/", label: "Home" },
    { href: "/map", label: "Map" },
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

  const isActive = (href: string) => {
    if (href === "/") {
      return pathname === "/";
    }
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  const isHome = pathname === "/";
  const shouldShowBackButton = showBackButton !== undefined ? showBackButton : !isHome;
  const shouldShowAddPlace = showAddPlaceButton !== undefined ? showAddPlaceButton : isAuthenticated;

  return (
    <>
      {/* Search Modal */}
      <SearchModal
        isOpen={searchModalOpen}
        onClose={() => setSearchModalOpen(false)}
        onCitySelect={(city) => {
          if (onCityChange) {
            onCityChange(city);
          }
        }}
        selectedCity={selectedCity}
      />

      <div className={`fixed top-0 left-0 right-0 z-40 bg-white ${pathname === "/map" ? "" : "border-b border-[#ECEEE4]"}`}>
        {/* Mobile TopBar (default, < lg) */}
        <div className="lg:hidden relative">
          <div className="px-4 pt-safe-top pt-3 pb-3">
            <div className="flex items-center gap-3">
              {/* Left: Back button */}
              {shouldShowBackButton ? (
                <button
                  onClick={() => {
                    if (onBackClick) {
                      onBackClick();
                    } else {
                      router.push("/");
                    }
                  }}
                  className="w-10 h-10 rounded-full hover:bg-[#FAFAF7] transition-colors flex items-center justify-center flex-shrink-0"
                  aria-label="Back to Home"
                >
                  <Icon name="back" size={24} className="text-[#1F2A1F]" />
                </button>
              ) : null}

              {/* Place page: Share and Favorite buttons on the right */}
              {pathname.startsWith("/id/") && onShareClick && onFavoriteClick ? (
                <div className="flex items-center gap-2 ml-auto">
                  {/* Share button */}
                  <button
                    onClick={onShareClick}
                    className="w-10 h-10 rounded-full bg-white border border-[#ECEEE4] hover:bg-[#FAFAF7] transition-colors flex items-center justify-center flex-shrink-0"
                    aria-label="Share"
                  >
                    <svg className="w-5 h-5 text-[#1F2A1F]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                    </svg>
                  </button>
                  {/* Favorite button */}
                  <button
                    onClick={onFavoriteClick}
                    disabled={favoriteLoading}
                    className={`w-10 h-10 rounded-full border border-[#ECEEE4] bg-white hover:bg-[#FAFAF7] transition-colors flex items-center justify-center flex-shrink-0 ${
                      favoriteLoading ? "opacity-50" : ""
                    }`}
                    aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
                  >
                    <FavoriteIcon isActive={isFavorite} size={20} />
                  </button>
                </div>
              ) : (
                <>
                  {/* Center: Search - flex-1, растягивается между Back и Filters */}
                  {showSearchBar ? (
                    <div className="flex-1 min-w-0">
                      <SearchBar
                        selectedCity={selectedCity}
                        onCityChange={onCityChange || (() => {})}
                        searchValue={searchValue}
                        onSearchChange={onSearchChange || (() => {})}
                        onFiltersClick={onFiltersClick || (() => {})}
                        activeFiltersCount={activeFiltersCount}
                        isMobile={true}
                        onSearchBarClick={onSearchBarClick}
                      />
                    </div>
                  ) : (
                    <>
                      {/* Logo - left of search (hidden on home page and map page) */}
                      {pathname !== "/profile" && pathname !== "/" && pathname !== "/map" && !pathname.startsWith("/id/") && (
                        <Link href="/" className="flex-shrink-0 w-10 h-10 rounded-full bg-[#8F9E4F] flex items-center justify-center">
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" fill="none" className="h-7 w-7">
                            <g fill="white" fillRule="evenodd" clipRule="evenodd">
                              <path d="M512 132C391 132 292 231 292 352C292 442 346 516 420 570C458 598 476 636 493 674L512 716L531 674C548 636 566 598 604 570C678 516 732 442 732 352C732 231 633 132 512 132ZM512 232C595 232 662 299 662 382C662 465 595 532 512 532C429 532 362 465 362 382C362 299 429 232 512 232Z"/>
                              <path d="M232 604C232 574 256 550 286 550L338 550C358 550 376 560 388 576L512 740L636 576C648 560 666 550 686 550L738 550C768 550 792 574 792 604L792 836C792 866 768 890 738 890L706 890C676 890 652 866 652 836L652 702L552 834C542 848 527 856 512 856C497 856 482 848 472 834L372 702L372 836C372 866 348 890 318 890L286 890C256 890 232 866 232 836Z"/>
                            </g>
                          </svg>
                        </Link>
                      )}

                      {/* Center: Search pill (clickable) - hidden when showSearchBar is true, on profile page and place page */}
                      {pathname !== "/profile" && !pathname.startsWith("/id/") && (
                        <button
                          onClick={() => setSearchModalOpen(true)}
                          className={`flex-1 min-w-0 bg-white rounded-full border border-[#E5E8DB] hover:border-[#8F9E4F] transition-colors px-4 py-2.5 flex items-center gap-3 ${pathname === "/" ? "justify-center" : "text-left"}`}
                        >
                          {pathname === "/" && (
                            <Icon name="search" size={20} className="text-[#A8B096] flex-shrink-0" />
                          )}
                          <div className={`text-sm font-medium text-[#1F2A1F] ${pathname === "/" ? "" : "truncate"}`}>
                            {pathname === "/" ? "Start to your search" : (selectedCity || "Anywhere")}
                          </div>
                          {activeFiltersSummary && pathname !== "/" && (
                            <div className="text-xs text-[#6F7A5A] truncate mt-0.5">
                              {activeFiltersSummary}
                            </div>
                          )}
                        </button>
                      )}
                    </>
                  )}

                  {/* Right: Filter button (other pages, not profile, not home, not place page) */}
                  {pathname !== "/profile" && pathname !== "/" && !pathname.startsWith("/id/") && (
                    <button
                      onClick={onFiltersClick}
                      className="w-10 h-10 rounded-full bg-white border border-[#ECEEE4] hover:bg-[#FAFAF7] transition-colors flex items-center justify-center flex-shrink-0 relative"
                      aria-label="Filters"
                    >
                      <Icon name="filter" size={20} className="text-[#1F2A1F]" />
                      {activeFiltersCount > 0 && (
                        <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-[#8F9E4F] text-white text-xs font-medium flex items-center justify-center">
                          {activeFiltersCount}
                        </span>
                      )}
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
          
          {/* Add Place button - fixed in top right corner (on profile page) */}
          {pathname === "/profile" && shouldShowAddPlace && (
            <Link
                href="/add"
                onClick={() => { if (navigator.vibrate) navigator.vibrate(10); }}
                className="absolute top-safe-top top-3 right-4 w-10 h-10 rounded-full bg-white border border-[#ECEEE4] hover:bg-[#FAFAF7] transition-colors flex items-center justify-center z-10"
                aria-label="Add new place"
              >
                <Icon name="add" size={20} className="text-[#1F2A1F]" />
            </Link>
          )}
        </div>

        {/* Desktop TopBar (>= lg) */}
        <div className="hidden lg:block">
          <div className="px-8 pt-safe-top pt-3 pb-3">
            {/* Main row: Logo + SearchBar + Auth */}
            <div className="flex items-center gap-6">
              {/* Left: Logo - Wordmark only */}
              <Wordmark
                href="/"
                withIcon={false}
                size="default"
                showRegistered={false}
                className="flex-shrink-0 text-4xl"
              />

              {/* Center: SearchBar (only when showSearchBar is true) */}
              {showSearchBar && (
                <div className="flex items-center justify-center flex-1 px-4">
                  <SearchBar
                    selectedCity={selectedCity}
                    onCityChange={onCityChange || (() => {})}
                    searchValue={searchValue}
                    onSearchChange={onSearchChange || (() => {})}
                    onFiltersClick={onFiltersClick || (() => {})}
                    activeFiltersCount={activeFiltersCount}
                  />
                </div>
              )}

              {/* Right: Auth area */}
              <div className="flex-shrink-0 flex items-center gap-3 ml-auto">
                {/* Add Place Button - visible only for authenticated users */}
                {isAuthenticated && (
                  <Link
                    href="/add"
                    onClick={() => { if (navigator.vibrate) navigator.vibrate(10); }}
                    className="h-10 w-10 rounded-xl flex items-center justify-center text-[#8F9E4F] hover:bg-[#FAFAF7] transition-colors"
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
                    className="flex items-center gap-2 px-5 py-2.5 h-11 rounded-xl bg-[#8F9E4F] text-white text-sm font-medium hover:brightness-110 active:brightness-90 transition-all"
                  >
                    Login
                  </Link>
                )}
                {/* Avatar with Dropdown Menu */}
                {isAuthenticated && (userAvatar || userDisplayName || userEmail) && (
                  <div className="relative">
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
                      className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-[#FAFAF7] transition-colors"
                    >
                      <div className="w-8 h-8 rounded-full bg-[#FAFAF7] overflow-hidden flex-shrink-0 border border-[#ECEEE4]">
                        {userAvatar ? (
                          <img
                            src={userAvatar}
                            alt={userDisplayName || userEmail || "User"}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <span className="text-xs font-semibold text-[#8F9E4F] flex items-center justify-center h-full">
                            {userDisplayName ? initialsFromName(userDisplayName) : initialsFromEmail(userEmail)}
                          </span>
                        )}
                      </div>
                      <Icon name="chevron-down" size={16} className="text-[#A8B096]" />
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
                          className="absolute bg-white rounded-2xl border border-[#ECEEE4] overflow-hidden min-w-[200px]"
                          style={{
                            top: `${menuPosition.top}px`,
                            right: `${menuPosition.right}px`,
                            boxShadow: '0 4px 12px rgba(0,0,0,0.06)'
                          }}
                        >
                          <Link
                            href="/profile"
                            onClick={() => {
                              setMenuOpen(false);
                              setMenuPosition(null);
                            }}
                            className="w-full px-4 py-3 text-left text-sm text-[#1F2A1F] hover:bg-[#FAFAF7] transition-colors flex items-center gap-3"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                            </svg>
                            Profile
                          </Link>
                          <Link
                            href="/feed"
                            onClick={() => {
                              setMenuOpen(false);
                              setMenuPosition(null);
                            }}
                            className="w-full px-4 py-3 text-left text-sm text-[#1F2A1F] hover:bg-[#FAFAF7] transition-colors flex items-center gap-3 border-t border-[#ECEEE4]"
                          >
                            <Icon name="add" size={16} />
                            Feed
                          </Link>
                          <Link
                            href="/saved"
                            onClick={() => {
                              setMenuOpen(false);
                              setMenuPosition(null);
                            }}
                            className="w-full px-4 py-3 text-left text-sm text-[#1F2A1F] hover:bg-[#FAFAF7] transition-colors flex items-center gap-3 border-t border-[#ECEEE4]"
                          >
                            <FavoriteIcon isActive={true} size={16} />
                            Saved
                          </Link>
                          <Link
                            href="/settings"
                            onClick={() => {
                              setMenuOpen(false);
                              setMenuPosition(null);
                            }}
                            className="w-full px-4 py-3 text-left text-sm text-[#1F2A1F] hover:bg-[#FAFAF7] transition-colors flex items-center gap-3 border-t border-[#ECEEE4]"
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
                            className="w-full px-4 py-3 text-left text-sm text-[#C96A5B] hover:bg-[#FAFAF7] transition-colors flex items-center gap-3 border-t border-[#ECEEE4]"
                          >
                            <Icon name="logout" size={16} />
                            Logout
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* View Toggle (List/Map) - только для страницы Map на следующей строке */}
      {view !== undefined && onViewChange && (
        <div className="fixed top-[64px] lg:top-[80px] left-0 right-0 z-30 bg-white lg:hidden">
          <div className="flex items-center gap-2 px-4 py-2">
            <button
              onClick={() => onViewChange("list")}
              className={`flex-1 px-4 py-2 rounded-xl text-sm font-medium transition ${
                view === "list"
                  ? "bg-[#8F9E4F] text-white"
                  : "bg-white text-[#8F9E4F] border border-[#ECEEE4] hover:bg-[#FAFAF7]"
              }`}
            >
              List
            </button>
            <button
              onClick={() => onViewChange("map")}
              className={`flex-1 px-4 py-2 rounded-xl text-sm font-medium transition ${
                view === "map"
                  ? "bg-[#8F9E4F] text-white"
                  : "bg-white text-[#8F9E4F] border border-[#ECEEE4] hover:bg-[#FAFAF7]"
              }`}
            >
              Map
            </button>
          </div>
        </div>
      )}
    </>
  );
}
