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
  const hamburgerRef = useRef<HTMLButtonElement>(null);
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
          hamburgerRef.current && !hamburgerRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
        setMenuPosition(null);
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
                    <Icon name="share" size={20} className="text-[#1F2A1F]" />
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
                            {pathname === "/" ? "Start to your search" : (selectedCity || "Where?")}
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

                  {/* Right: Filter button and View toggle (for map page) */}
                  <div className="flex items-center gap-2 ml-auto">
                    {/* Filter button (other pages, not profile, not home, not place page) */}
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
                    
                    {/* View Toggle - только для страницы Map (скрыт на мобильной версии) */}
                    {view !== undefined && onViewChange && pathname === "/map" && (
                      <div className="hidden min-[600px]:flex items-center gap-1 bg-white border border-[#ECEEE4] rounded-full p-1">
                        <button
                          onClick={() => onViewChange("list")}
                          className={`px-3 py-1.5 rounded-full text-xs font-medium transition ${
                            view === "list"
                              ? "bg-[#8F9E4F] text-white"
                              : "bg-transparent text-[#6F7A5A] hover:text-[#1F2A1F]"
                          }`}
                        >
                          List
                        </button>
                        <button
                          onClick={() => onViewChange("map")}
                          className={`px-3 py-1.5 rounded-full text-xs font-medium transition ${
                            view === "map"
                              ? "bg-[#8F9E4F] text-white"
                              : "bg-transparent text-[#6F7A5A] hover:text-[#1F2A1F]"
                          }`}
                        >
                          Map
                        </button>
                      </div>
                    )}
                  </div>
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
              {/* Left: Logo - Pin.svg */}
              <Link href="/" className="flex-shrink-0">
                <img
                  src="/Pin.svg"
                  alt="Maporia"
                  className="h-10 w-auto"
                />
              </Link>

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
                    onSearchBarClick={onSearchBarClick}
                  />
                </div>
              )}

              {/* Right: Auth area */}
              <div className="flex-shrink-0 flex items-center gap-4 ml-auto">
                {/* Login Button - visible for unauthenticated users */}
                {!isAuthenticated && (
                  <Link
                    href="/auth"
                    className="flex items-center gap-2 px-5 py-2.5 h-11 rounded-xl bg-[#8F9E4F] text-white text-sm font-medium hover:brightness-110 active:brightness-90 transition-all"
                  >
                    Login
                  </Link>
                )}
                {/* Authenticated: Switch to hosting + Avatar + Hamburger menu */}
                {isAuthenticated && (userAvatar || userDisplayName || userEmail) && (
                  <>
                    {/* Add gem - link to add place */}
                    <Link
                      href="/add"
                      className="text-sm text-[#1F2A1F] hover:text-[#8F9E4F] transition-colors"
                    >
                      Add Gem
                    </Link>
                    
                    {/* Avatar - link to profile */}
                    <Link
                      href="/profile"
                      className="flex-shrink-0"
                    >
                      <div className="w-8 h-8 rounded-full bg-[#FAFAF7] overflow-hidden flex-shrink-0 border border-[#ECEEE4] hover:border-[#8F9E4F] transition-colors">
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
                    </Link>
                    
                    {/* Hamburger menu button */}
                    <div className="relative">
                      <button
                        ref={hamburgerRef}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (hamburgerRef.current) {
                            const rect = hamburgerRef.current.getBoundingClientRect();
                            setMenuPosition({ top: rect.bottom + 8, right: window.innerWidth - rect.right });
                          }
                          setMenuOpen(!menuOpen);
                        }}
                        className="w-8 h-8 rounded-full bg-[#FAFAF7] border border-[#ECEEE4] hover:bg-[#ECEEE4] transition-colors flex items-center justify-center flex-shrink-0"
                        aria-label="Menu"
                      >
                        <svg className="w-4 h-4 text-[#1F2A1F]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
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
                            className="absolute bg-white rounded-2xl border border-[#ECEEE4] overflow-hidden p-3"
                            style={{
                              top: `${menuPosition.top}px`,
                              right: `${menuPosition.right}px`,
                              boxShadow: '0 4px 12px rgba(0,0,0,0.06)',
                              minWidth: '280px',
                            }}
                          >
                            <div className="grid grid-cols-2 gap-2">
                              <Link
                                href="/add"
                                onClick={() => {
                                  setMenuOpen(false);
                                  setMenuPosition(null);
                                }}
                                className="flex flex-col items-center justify-center p-4 rounded-xl hover:bg-[#FAFAF7] transition-colors group"
                              >
                                <div className="w-12 h-12 rounded-full bg-[#FAFAF7] group-hover:bg-[#E5E8DB] flex items-center justify-center mb-2 transition-colors">
                                  <Icon name="add" size={24} className="text-[#1F2A1F]" />
                                </div>
                                <span className="text-xs font-medium text-[#1F2A1F] text-center">Add Gem</span>
                              </Link>
                              <Link
                                href="/profile?section=trips"
                                onClick={() => {
                                  setMenuOpen(false);
                                  setMenuPosition(null);
                                }}
                                className="flex flex-col items-center justify-center p-4 rounded-xl hover:bg-[#FAFAF7] transition-colors group"
                              >
                                <div className="w-12 h-12 rounded-full bg-[#FAFAF7] group-hover:bg-[#E5E8DB] flex items-center justify-center mb-2 transition-colors">
                                  <FavoriteIcon isActive={true} size={24} />
                                </div>
                                <span className="text-xs font-medium text-[#1F2A1F] text-center">My favorites</span>
                              </Link>
                              <Link
                                href="/profile?section=added"
                                onClick={() => {
                                  setMenuOpen(false);
                                  setMenuPosition(null);
                                }}
                                className="flex flex-col items-center justify-center p-4 rounded-xl hover:bg-[#FAFAF7] transition-colors group"
                              >
                                <div className="w-12 h-12 rounded-full bg-[#FAFAF7] group-hover:bg-[#E5E8DB] flex items-center justify-center mb-2 transition-colors">
                                  <Icon name="location" size={24} className="text-[#1F2A1F]" />
                                </div>
                                <span className="text-xs font-medium text-[#1F2A1F] text-center">Added places</span>
                              </Link>
                              <Link
                                href="/profile?section=history"
                                onClick={() => {
                                  setMenuOpen(false);
                                  setMenuPosition(null);
                                }}
                                className="flex flex-col items-center justify-center p-4 rounded-xl hover:bg-[#FAFAF7] transition-colors group"
                              >
                                <div className="w-12 h-12 rounded-full bg-[#FAFAF7] group-hover:bg-[#E5E8DB] flex items-center justify-center mb-2 transition-colors">
                                  <Icon name="clock" size={24} className="text-[#1F2A1F]" />
                                </div>
                                <span className="text-xs font-medium text-[#1F2A1F] text-center">History</span>
                              </Link>
                              <Link
                                href="/profile?section=activity"
                                onClick={() => {
                                  setMenuOpen(false);
                                  setMenuPosition(null);
                                }}
                                className="flex flex-col items-center justify-center p-4 rounded-xl hover:bg-[#FAFAF7] transition-colors group"
                              >
                                <div className="w-12 h-12 rounded-full bg-[#FAFAF7] group-hover:bg-[#E5E8DB] flex items-center justify-center mb-2 transition-colors">
                                  <Icon name="clock" size={24} className="text-[#1F2A1F]" />
                                </div>
                                <span className="text-xs font-medium text-[#1F2A1F] text-center">Activity</span>
                              </Link>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

    </>
  );
}
