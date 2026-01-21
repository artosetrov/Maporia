"use client";

import { useState, useRef, useEffect } from "react";
import { CITIES, DEFAULT_CITY } from "../constants";

type SearchBarProps = {
  // City
  selectedCity?: string | null;
  onCityChange?: (city: string | null) => void;
  
  // Search
  searchValue: string;
  onSearchChange: (value: string) => void;
  
  // Filters
  onFiltersClick: () => void;
  activeFiltersCount: number;
  
  // Responsive
  isMobile?: boolean;
};

export default function SearchBar({
  selectedCity,
  onCityChange,
  searchValue,
  onSearchChange,
  onFiltersClick,
  activeFiltersCount,
  isMobile = false,
}: SearchBarProps) {
  const [cityDropdownOpen, setCityDropdownOpen] = useState(false);
  const cityDropdownRef = useRef<HTMLDivElement>(null);

  // Close city dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (cityDropdownRef.current && !cityDropdownRef.current.contains(event.target as Node)) {
        setCityDropdownOpen(false);
      }
    }

    if (cityDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [cityDropdownOpen]);

  // Показываем "Anywhere" только если город явно не выбран (null)
  // Если город установлен (даже если это DEFAULT_CITY), показываем его название
  const displayCity = selectedCity || DEFAULT_CITY;
  const isAnywhere = !selectedCity; // Только когда selectedCity === null

  // Mobile: compact version
  if (isMobile) {
    return (
      <button
        onClick={() => {
          // On mobile, clicking search bar could open full-screen search
          // For now, just focus the search input
          onSearchChange("");
        }}
        className="w-full h-12 rounded-full border border-[#6b7d47]/20 bg-white shadow-sm hover:shadow-md transition flex items-center gap-3 px-4 text-left"
      >
        <svg className="w-5 h-5 text-[#6b7d47]/60 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <span className="flex-1 text-sm text-[#6b7d47]/60">
          {searchValue || "Search by vibe, mood, or place"}
        </span>
        {activeFiltersCount > 0 && (
          <span className="h-5 w-5 rounded-full bg-[#6b7d47] text-white text-[10px] font-medium flex items-center justify-center">
            {activeFiltersCount > 9 ? "9+" : activeFiltersCount}
          </span>
        )}
      </button>
    );
  }

  // Desktop: full search bar (Airbnb-style pill)
  return (
    <div className="flex items-center gap-0 bg-white rounded-full shadow-md hover:shadow-lg transition-shadow border border-[#6b7d47]/10 max-w-[920px] w-full">
      {/* City Selector */}
      <div ref={cityDropdownRef} className="relative flex-shrink-0">
        <button
          onClick={() => setCityDropdownOpen(!cityDropdownOpen)}
          className="h-14 px-6 rounded-l-full hover:bg-[#f5f4f2] transition flex flex-col items-start justify-center border-r border-[#6b7d47]/10 min-w-[120px]"
        >
          <span className="text-xs font-medium text-[#6b7d47]/60 uppercase tracking-wide">Where</span>
          <span className="text-sm font-medium text-[#2d2d2d] mt-0.5 truncate max-w-[100px]">
            {isAnywhere ? "Anywhere" : displayCity}
          </span>
        </button>

        {/* City Dropdown Popover */}
        {cityDropdownOpen && (
          <div className="absolute top-full left-0 mt-2 bg-white rounded-2xl shadow-xl border border-[#6b7d47]/10 overflow-hidden z-50 min-w-[200px] shadow-xl">
            {CITIES.map((city) => {
              const isSelected = selectedCity === city;
              return (
                <button
                  key={city}
                  onClick={() => {
                    if (onCityChange) {
                      onCityChange(city);
                    }
                    setCityDropdownOpen(false);
                  }}
                  className={`w-full px-4 py-3 text-left transition ${
                    isSelected
                      ? "bg-[#6b7d47]/10 text-[#6b7d47] font-medium"
                      : "text-[#2d2d2d] hover:bg-[#f5f4f2]"
                  }`}
                >
                  <div className="font-semibold text-sm">{city}</div>
                  <div className="text-xs text-[#6b7d47]/60 mt-0.5">City</div>
                </button>
              );
            })}
            <button
              onClick={() => {
                if (onCityChange) {
                  onCityChange(null);
                }
                setCityDropdownOpen(false);
              }}
              className={`w-full px-4 py-3 text-left transition border-t border-[#6b7d47]/10 ${
                isAnywhere
                  ? "bg-[#6b7d47]/10 text-[#6b7d47] font-medium"
                  : "text-[#2d2d2d] hover:bg-[#f5f4f2]"
              }`}
            >
              <div className="font-semibold text-sm">Anywhere</div>
            </button>
          </div>
        )}
      </div>

      {/* Search Input */}
      <div className="flex-1 relative min-w-0">
        <input
          value={searchValue}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search by vibe, mood, or place"
          className="w-full h-14 px-6 pr-12 text-sm text-[#2d2d2d] placeholder:text-[#6b7d47]/50 outline-none bg-transparent"
        />
        <svg className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#6b7d47]/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      </div>

      {/* Filters Button */}
      <button
        onClick={onFiltersClick}
        className="h-14 px-6 rounded-r-full hover:bg-[#f5f4f2] transition flex items-center gap-2 border-l border-[#6b7d47]/10 flex-shrink-0 relative"
      >
        {/* Filter icon - three horizontal lines of varying lengths */}
        <svg className="w-5 h-5 text-[#2d2d2d]" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
          {/* Top line - longest */}
          <line x1="2" y1="6" x2="18" y2="6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          {/* Middle line - medium */}
          <line x1="2" y1="10" x2="14" y2="10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          {/* Bottom line - shortest */}
          <line x1="2" y1="14" x2="10" y2="14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <span className="text-sm font-medium text-[#2d2d2d] hidden min-[600px]:inline">Filters</span>
        {activeFiltersCount > 0 && (
          <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-[#2d2d2d] text-white text-[10px] font-medium flex items-center justify-center">
            {activeFiltersCount > 9 ? "9+" : activeFiltersCount}
          </span>
        )}
      </button>
    </div>
  );
}
