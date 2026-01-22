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

      <div className="fixed top-0 left-0 right-0 z-40 bg-white border-b border-[#ECEEE4]">
        {/* Mobile TopBar (< 600px) */}
        <div className="max-[600px]:block hidden relative">
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

                  {/* Center: Search pill (clickable) - hidden on profile page and place page */}
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

        {/* Desktop TopBar (>= 600px) */}
        <div className="min-[600px]:block hidden">
          <div className="px-4 min-[900px]:px-8 pt-safe-top pt-3 pb-3">
            {/* Main row: Logo + (SearchBar or Tabs) + Auth */}
            <div className="flex items-center gap-3 min-[900px]:gap-6">
              {/* Left: Logo */}
              <Link href="/" className="flex items-center gap-2 flex-shrink-0">
            <div className="h-10 flex items-center justify-center">
              <svg width="159" height="36" viewBox="0 0 159 36" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-6 w-auto">
                <g clipPath="url(#clip0_288_14)">
                  <mask id="mask0_288_14" style={{ maskType: "luminance" }} maskUnits="userSpaceOnUse" x="0" y="0" width="145" height="36">
                    <path d="M145 0H0V36H145V0Z" fill="white"/>
                  </mask>
                  <g mask="url(#mask0_288_14)">
                    <path d="M0 27.8609V0.469565H7.58221L15.0863 17.8435H15.2426L22.6294 0.469565H30.1725V27.8609H24.31V9.74346H24.1536L17.8612 23.9478H12.1941L6.01887 9.74346H5.86253V27.8609H0ZM39.7597 28.3305C38.2226 28.3305 36.9589 28.0696 35.9688 27.5478C34.9787 27.0261 34.2491 26.3348 33.7801 25.4739C33.3371 24.587 33.1157 23.6087 33.1157 22.5392C33.1157 21.3652 33.4023 20.3348 33.9755 19.4478C34.5748 18.5348 35.4998 17.8174 36.7505 17.2957C38.0011 16.7739 39.6034 16.513 41.5576 16.513H46.3257C46.3257 15.6261 46.2085 14.9087 45.974 14.3609C45.7395 13.787 45.3619 13.3696 44.8406 13.1087C44.3458 12.8217 43.6814 12.6783 42.8473 12.6783C41.9355 12.6783 41.1409 12.8739 40.4632 13.2652C39.8121 13.6565 39.408 14.2696 39.2516 15.1044H33.6238C33.754 13.6696 34.2231 12.4304 35.0308 11.3869C35.8385 10.3174 36.9068 9.48262 38.2356 8.88259C39.5905 8.2826 41.1409 7.98259 42.8864 7.98259C44.7624 7.98259 46.391 8.2826 47.7718 8.88259C49.1788 9.48262 50.2603 10.3826 51.0158 11.5826C51.7974 12.7565 52.1883 14.2043 52.1883 15.9261V27.8609H47.3419L46.7166 24.9261H46.5602C46.1436 25.5 45.6875 26.0087 45.1923 26.4522C44.6975 26.8696 44.1633 27.2217 43.5899 27.5087C43.0427 27.7696 42.4436 27.9652 41.7921 28.0957C41.1409 28.2522 40.4632 28.3305 39.7597 28.3305ZM41.8311 23.8696C42.4827 23.8696 43.0427 23.7652 43.5117 23.5565C43.9807 23.3478 44.3849 23.0739 44.7233 22.7348C45.0884 22.3696 45.3748 21.9522 45.5832 21.4826C45.7919 21.0131 45.9482 20.5044 46.0522 19.9565H42.2611C41.5837 19.9565 41.0237 20.0478 40.5805 20.2305C40.1638 20.387 39.8512 20.6218 39.6425 20.9348C39.4341 21.2217 39.3298 21.5739 39.3298 21.9913C39.3298 22.4087 39.4341 22.7609 39.6425 23.0478C39.8512 23.3087 40.1505 23.5174 40.5414 23.6739C40.9322 23.8044 41.3621 23.8696 41.8311 23.8696ZM55.3048 35.687V8.45215H60.2293L60.5029 11.7782H60.6592C61.1544 10.9956 61.7274 10.3304 62.3789 9.78259C63.0562 9.2087 63.8379 8.7652 64.7239 8.45215C65.61 8.13911 66.5871 7.98259 67.6552 7.98259C69.4792 7.98259 71.0684 8.42609 72.4234 9.31302C73.7784 10.1739 74.8337 11.3739 75.5892 12.913C76.3447 14.4261 76.7226 16.1739 76.7226 18.1565C76.7226 20.1391 76.3447 21.9 75.5892 23.4392C74.8337 24.9522 73.7651 26.1522 72.3843 27.0392C71.0293 27.9 69.4269 28.3305 67.577 28.3305C66.1438 28.3305 64.8803 28.0696 63.7859 27.5478C62.6916 27 61.8189 26.3348 61.1673 25.5522V35.687H55.3048ZM65.8964 23.5957C66.8864 23.5957 67.7463 23.3739 68.476 22.9305C69.2057 22.4609 69.7657 21.8217 70.1566 21.013C70.5736 20.2044 70.7819 19.2652 70.7819 18.1957C70.7819 17.1261 70.5736 16.187 70.1566 15.3783C69.7657 14.5696 69.2057 13.9304 68.476 13.4609C67.7463 12.9913 66.8864 12.7565 65.8964 12.7565C64.9584 12.7565 64.1115 12.9913 63.356 13.4609C62.6005 13.9304 62.0143 14.5696 61.5973 15.3783C61.2064 16.187 61.011 17.1261 61.011 18.1957C61.011 19.2652 61.2064 20.2044 61.5973 21.013C62.0143 21.8217 62.6005 22.4609 63.356 22.9305C64.1115 23.3739 64.9584 23.5957 65.8964 23.5957ZM88.7275 28.3305C86.8515 28.3305 85.1451 27.9 83.6076 27.0392C82.0966 26.1522 80.8979 24.9522 80.0119 23.4392C79.1262 21.9 78.683 20.1391 78.683 18.1565C78.683 16.1739 79.1262 14.4131 80.0119 12.8739C80.8979 11.3348 82.0966 10.1348 83.6076 9.27389C85.1451 8.41302 86.8515 7.98259 88.7275 7.98259C90.6297 7.98259 92.3365 8.41302 93.8474 9.27389C95.3588 10.1348 96.5575 11.3348 97.4431 12.8739C98.3292 14.4131 98.772 16.1739 98.772 18.1565C98.772 20.1391 98.3292 21.9 97.4431 23.4392C96.5575 24.9522 95.3459 26.1522 93.8084 27.0392C92.2974 27.9 90.6035 28.3305 88.7275 28.3305ZM88.7275 23.3218C89.4834 23.3218 90.1607 23.1391 90.7598 22.7739C91.3852 22.3826 91.8804 21.8087 92.245 21.0522C92.6101 20.2696 92.7922 19.3044 92.7922 18.1565C92.7922 17.0087 92.6101 16.0565 92.245 15.3C91.8804 14.5174 91.3852 13.9435 90.7598 13.5783C90.1607 13.1869 89.4963 12.9913 88.7666 12.9913C88.0111 12.9913 87.3205 13.1869 86.6952 13.5783C86.0698 13.9435 85.575 14.5174 85.21 15.3C84.8453 16.0565 84.6628 17.0087 84.6628 18.1565C84.6628 19.3044 84.8453 20.2696 85.21 21.0522C85.575 21.8087 86.0698 22.3826 86.6952 22.7739C87.3205 23.1391 87.9982 23.3218 88.7275 23.3218ZM101.33 27.8609V8.45215H106.294L106.802 12.7174H106.958C107.506 11.3609 108.118 10.3435 108.795 9.6652C109.499 8.98695 110.293 8.54349 111.179 8.33476C112.065 8.09998 113.042 7.98259 114.111 7.98259V14.2044H112.508C111.674 14.2044 110.919 14.2957 110.241 14.4783C109.59 14.6609 109.03 14.9609 108.561 15.3783C108.118 15.7695 107.779 16.3043 107.545 16.9826C107.31 17.6348 107.193 18.4435 107.193 19.4087V27.8609H101.33ZM116.458 27.8609V8.45215H122.321V27.8609H116.458ZM119.429 6.41737C118.386 6.41737 117.527 6.1174 116.849 5.51737C116.198 4.89129 115.872 4.12175 115.872 3.2087C115.872 2.29565 116.198 1.53913 116.849 0.939131C117.527 0.313044 118.386 0 119.429 0C120.497 0 121.357 0.313044 122.008 0.939131C122.659 1.53913 122.985 2.29565 122.985 3.2087C122.985 4.12175 122.659 4.89129 122.008 5.51737C121.357 6.1174 120.497 6.41737 119.429 6.41737ZM132.355 28.3305C130.817 28.3305 129.553 28.0696 128.563 27.5478C127.573 27.0261 126.844 26.3348 126.375 25.4739C125.932 24.587 125.71 23.6087 125.71 22.5392C125.71 21.3652 125.997 20.3348 126.57 19.4478C127.169 18.5348 128.094 17.8174 129.345 17.2957C130.596 16.7739 132.198 16.513 134.152 16.513H138.921C138.921 15.6261 138.803 14.9087 138.569 14.3609C138.334 13.787 137.956 13.3696 137.435 13.1087C136.94 12.8217 136.276 12.6783 135.442 12.6783C134.53 12.6783 133.735 12.8739 133.058 13.2652C132.407 13.6565 132.003 14.2696 131.846 15.1044H126.218C126.349 13.6696 126.818 12.4304 127.625 11.3869C128.433 10.3174 129.501 9.48262 130.83 8.88259C132.185 8.2826 133.735 7.98259 135.481 7.98259C137.357 7.98259 138.985 8.2826 140.367 8.88259C141.774 9.48262 142.855 10.3826 143.611 11.5826C144.392 12.7565 144.783 14.2043 144.783 15.9261V27.8609H139.937L139.311 24.9261H139.155C138.738 25.5 138.282 26.0087 137.787 26.4522C137.292 26.8696 136.758 27.2217 136.185 27.5087C135.638 27.7696 135.038 27.9652 134.387 28.0957C133.735 28.2522 133.058 28.3305 132.355 28.3305ZM134.426 23.8696C135.077 23.8696 135.638 23.7652 136.107 23.5565C136.576 23.3478 136.979 23.0739 137.318 22.7348C137.683 22.3696 137.969 21.9522 138.178 21.4826C138.386 21.0131 138.543 20.5044 138.647 19.9565H134.856C134.178 19.9565 133.618 20.0478 133.175 20.2305C132.758 20.387 132.446 20.6218 132.237 20.9348C132.029 21.2217 131.925 21.5739 131.925 21.9913C131.925 22.4087 132.029 22.7609 132.237 23.0478C132.446 23.3087 132.745 23.5174 133.136 23.6739C133.527 23.8044 133.957 23.8696 134.426 23.8696Z" fill="#81904C"/>
                  </g>
                  <path d="M153.07 1C152.081 1 151.115 1.29324 150.292 1.84265C149.47 2.39206 148.829 3.17295 148.451 4.08658C148.072 5.00021 147.973 6.00555 148.166 6.97545C148.359 7.94536 148.836 8.83627 149.535 9.53553C150.234 10.2348 151.125 10.711 152.095 10.9039C153.065 11.0969 154.07 10.9978 154.984 10.6194C155.897 10.241 156.678 9.6001 157.228 8.77785C157.777 7.95561 158.07 6.98891 158.07 6C158.07 4.67392 157.544 3.40215 156.606 2.46447C155.668 1.52678 154.396 1 153.07 1ZM153.07 10C152.279 10 151.506 9.7654 150.848 9.32588C150.19 8.88635 149.678 8.26164 149.375 7.53073C149.072 6.79983 148.993 5.99556 149.147 5.21964C149.302 4.44371 149.682 3.73098 150.242 3.17157C150.801 2.61216 151.514 2.2312 152.29 2.07686C153.066 1.92252 153.87 2.00173 154.601 2.30448C155.332 2.60723 155.957 3.11992 156.396 3.77772C156.836 4.43552 157.07 5.20887 157.07 6C157.07 7.06087 156.649 8.07828 155.899 8.82843C155.149 9.57857 154.131 10 153.07 10Z" fill="#81904C"/>
                  <path d="M155.07 5C155.07 4.60218 154.912 4.22064 154.631 3.93934C154.35 3.65804 153.968 3.5 153.57 3.5H151.07V8.5H152.07V6.5H152.8L154.135 8.5H155.335L153.96 6.44C154.277 6.35461 154.558 6.16748 154.758 5.90734C154.959 5.64721 155.068 5.32845 155.07 5ZM153.57 5.5H152.07V4.5H153.57C153.703 4.5 153.83 4.55268 153.924 4.64645C154.018 4.74021 154.07 4.86739 154.07 5C154.07 5.13261 154.018 5.25979 153.924 5.35355C153.83 5.44732 153.703 5.5 153.57 5.5Z" fill="#81904C"/>
                </g>
                <defs>
                  <clipPath id="clip0_288_14">
                    <rect width="159" height="36" fill="white"/>
                  </clipPath>
                </defs>
              </svg>
            </div>
          </Link>

          {/* Center: SearchBar (always on desktop and tablet) */}
          <>
            {/* Desktop SearchBar (>= 1120px) */}
            <div className="hidden min-[1120px]:flex items-center justify-center flex-1 px-4">
              <SearchBar
                selectedCity={selectedCity}
                onCityChange={onCityChange}
                searchValue={searchValue}
                onSearchChange={onSearchChange || (() => {})}
                onFiltersClick={onFiltersClick || (() => {})}
                activeFiltersCount={activeFiltersCount}
              />
            </div>
            {/* Tablet SearchBar (600px - 1120px) */}
            <div className="flex min-[1120px]:hidden min-[600px]:flex items-center flex-1 px-2">
              <SearchBar
                selectedCity={selectedCity}
                onCityChange={onCityChange}
                searchValue={searchValue}
                onSearchChange={onSearchChange || (() => {})}
                onFiltersClick={onFiltersClick || (() => {})}
                activeFiltersCount={activeFiltersCount}
                isMobile={true}
              />
            </div>
          </>

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
            {/* Avatar with Dropdown Menu - Desktop only */}
            {isAuthenticated && (userAvatar || userDisplayName || userEmail) && (
              <div className="hidden min-[900px]:block relative">
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

        {/* Mobile Search Bar (only on mobile < 600px, not tablet) - outside main row to avoid overlap */}
        {showSearchBar && (
          <div className="max-[600px]:block hidden mt-3 px-4">
            <SearchBar
              selectedCity={selectedCity}
              onCityChange={onCityChange}
              searchValue={searchValue}
              onSearchChange={onSearchChange || (() => {})}
              onFiltersClick={onFiltersClick || (() => {})}
              activeFiltersCount={activeFiltersCount}
              isMobile={true}
            />
          </div>
        )}
        </div>
      </div>
    </>
  );
}
