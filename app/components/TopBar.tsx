"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "../lib/supabase";
import { DEFAULT_CITY } from "../constants";
import SearchBar from "./SearchBar";
import SearchModal from "./SearchModal";
import FavoriteIcon from "./FavoriteIcon";
import Icon from "./Icon";
import { useUserAccessContext } from "../contexts/UserAccessContext";
import { canUserAddPlace } from "../lib/access";
import { useAuthRedirect } from "../hooks/useAuthRedirect";
import { useIsDesktop } from "../hooks/useIsDesktop";
import { usePremiumGate } from "../hooks/usePremiumGate";
import AuthCTA from "./AuthCTA";
import AuthModal from "./AuthModal";

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

  // Получаем права пользователя (from context — single session/profile request)
  const { access } = useUserAccessContext();
  const isDesktop = useIsDesktop();
  const { openPremiumLocation, closeAuthModal, authModalOpen, authRedirectPath, authModalVariant } = usePremiumGate();

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

  // Проверяем, может ли пользователь создавать места
  const canAddPlace = canUserAddPlace(access);

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

  const { redirectToAuth } = useAuthRedirect();

  async function handleLogout() {
    await supabase.auth.signOut();
    redirectToAuth("topbar_logout");
  }

  const isActive = (href: string) => {
    if (href === "/") {
      return pathname === "/";
    }
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  const isHome = pathname === "/";
  const isMap = pathname === "/map";
  const shouldShowBackButton = showBackButton !== undefined ? showBackButton : !(isHome || isMap);
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

      <div className={`fixed top-0 left-0 right-0 z-[60] bg-white pointer-events-auto ${pathname === "/map" ? "" : "border-b border-[#ECEEE4]"}`}>
        {/* Mobile TopBar (default, < lg) */}
        <div className="lg:hidden relative">
          <div className="px-4 pt-safe-top pt-3 pb-3">
            <div className="flex items-center gap-3">
              {/* Left: Back button or Logo */}
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
              ) : (
                <Link
                  href="/"
                  className="flex-shrink-0"
                  aria-label="Go to Home"
                  tabIndex={0}
                >
                  <img
                    src="/Logo_maporia1.svg"
                    alt="Maporia"
                    className="h-8 w-auto"
                  />
                </Link>
              )}

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

                  {/* Right: Profile avatar, Add place (profile), Filter button, View toggle (map page) */}
                  <div className="flex items-center gap-2 ml-auto">
                    {/* Add new place - profile page, mobile */}
                    {pathname === "/profile" && shouldShowAddPlace && canAddPlace && (
                      <Link
                        href={`/add?returnTo=${encodeURIComponent(pathname)}`}
                        onClick={() => { if (navigator.vibrate) navigator.vibrate(10); }}
                        className="w-10 h-10 rounded-full bg-white border border-[#ECEEE4] hover:bg-[#FAFAF7] transition-colors flex items-center justify-center flex-shrink-0"
                        aria-label="Add new place"
                      >
                        <Icon name="add" size={20} className="text-[#1F2A1F]" />
                      </Link>
                    )}
                    {/* Filter button (not profile, not place page) */}
                    {pathname !== "/profile" && !pathname.startsWith("/id/") && (
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
                    {/* Profile avatar - home & map pages, mobile */}
                    {(pathname === "/" || pathname === "/map") && (
                      <Link
                        href="/profile"
                        className="w-10 h-10 rounded-full overflow-hidden flex items-center justify-center flex-shrink-0"
                        aria-label="Profile"
                        tabIndex={0}
                      >
                        {userAvatar ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={userAvatar}
                            alt="Profile"
                            className="w-full h-full object-cover rounded-full"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-[11px] font-semibold rounded-full bg-[#FAFAF7] text-[#6F7A5A] border border-[#ECEEE4]">
                            {userDisplayName
                              ? initialsFromName(userDisplayName)
                              : initialsFromEmail(userEmail)}
                          </div>
                        )}
                      </Link>
                    )}
                    
                    {/* View Toggle - только для страницы Map (скрыт на мобильной версии) */}
                    {view !== undefined && onViewChange && pathname === "/map" && (
                      <div className="hidden lg:flex items-center gap-1 bg-white border border-[#ECEEE4] rounded-full p-1">
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
        </div>

        {/* Desktop TopBar (>= lg) */}
        <div className="hidden lg:block">
          <div className="px-8 pt-safe-top pt-3 pb-3">
            {/* Main row: Logo + SearchBar + Auth */}
            <div className="flex items-center gap-6">
              {/* Left: Logo - Logo_maporia1.svg */}
              <Link href="/" className="flex-shrink-0">
                <img
                  src="/Logo_maporia1.svg"
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
                {/* Get Started — для неавторизованных. Desktop: модалка входа как при клике на премиум-карточку */}
                {!isAuthenticated && (
                  isDesktop ? (
                    <button
                      type="button"
                      onClick={() => openPremiumLocation("place")}
                      className="flex items-center justify-center gap-2 text-sm font-medium transition-all rounded-xl px-5 py-2.5 h-11 bg-[#8F9E4F] text-white hover:brightness-110 active:brightness-90"
                    >
                      Get Started
                    </button>
                  ) : (
                    <AuthCTA variant="sign-in" as="link" trigger="topbar_login">Get Started</AuthCTA>
                  )
                )}
                {/* Authenticated: Switch to hosting + Avatar + Hamburger menu */}
                {isAuthenticated && (userAvatar || userDisplayName || userEmail) && (
                  <>
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
                              {/* Add Gem - only for Premium and Admin, first and highlighted */}
                              {canAddPlace && (
                                <Link
                                  href={`/add?returnTo=${encodeURIComponent(pathname)}`}
                                  onClick={() => {
                                    setMenuOpen(false);
                                    setMenuPosition(null);
                                  }}
                                  className="flex flex-col items-center justify-center p-4 rounded-xl bg-[#8F9E4F] hover:bg-[#7A8A42] transition-colors group"
                                >
                                  <div className="w-12 h-12 rounded-full bg-white/20 group-hover:bg-white/30 flex items-center justify-center mb-2 transition-colors">
                                    <Icon name="add" size={24} className="text-white" />
                                  </div>
                                  <span className="text-xs font-medium text-white text-center">Add Gem</span>
                                </Link>
                              )}
                              <Link
                                href="/profile?section=trips"
                                onClick={() => {
                                  setMenuOpen(false);
                                  setMenuPosition(null);
                                }}
                                className="flex flex-col items-center justify-center p-4 rounded-xl hover:bg-[#FAFAF7] transition-colors group"
                              >
                                <div className="w-12 h-12 rounded-full bg-[#FAFAF7] group-hover:bg-[#E5E8DB] flex items-center justify-center mb-2 transition-colors">
                                  <Icon name="favorite" size={24} className="text-[#1F2A1F]" />
                                </div>
                                <span className="text-xs font-medium text-[#1F2A1F] text-center">My favorites</span>
                              </Link>
                              <Link
                                href="/collections"
                                onClick={() => {
                                  setMenuOpen(false);
                                  setMenuPosition(null);
                                }}
                                className="flex flex-col items-center justify-center p-4 rounded-xl hover:bg-[#FAFAF7] transition-colors group"
                              >
                                <div className="w-12 h-12 rounded-full bg-[#FAFAF7] group-hover:bg-[#E5E8DB] flex items-center justify-center mb-2 transition-colors">
                                  <Icon name="grid" size={24} className="text-[#1F2A1F]" />
                                </div>
                                <span className="text-xs font-medium text-[#1F2A1F] text-center">Collections</span>
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
                                  <Icon name="star" size={24} className="text-[#1F2A1F]" />
                                </div>
                                <span className="text-xs font-medium text-[#1F2A1F] text-center">Activity</span>
                              </Link>
                              <button
                                onClick={async () => {
                                  await handleLogout();
                                  setMenuOpen(false);
                                  setMenuPosition(null);
                                  router.push("/");
                                }}
                                className="flex flex-col items-center justify-center p-4 rounded-xl hover:bg-[#FAFAF7] transition-colors group"
                              >
                                <div className="w-12 h-12 rounded-full bg-[#FAFAF7] group-hover:bg-[#E5E8DB] flex items-center justify-center mb-2 transition-colors">
                                  <Icon name="logout" size={24} className="text-[#1F2A1F]" />
                                </div>
                                <span className="text-xs font-medium text-[#1F2A1F] text-center">Log out</span>
                              </button>
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

      <AuthModal
        isOpen={authModalOpen}
        onClose={closeAuthModal}
        redirectPath={authRedirectPath}
        variant={authModalVariant}
      />
    </>
  );
}
