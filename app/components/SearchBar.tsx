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
        className="w-full h-11 rounded-full border border-[#E5E8DB] bg-white hover:border-[#8F9E4F] transition-colors flex items-center gap-3 px-4 text-left"
      >
        <svg className="w-5 h-5 text-[#A8B096] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <span className="flex-1 text-sm text-[#A8B096]">
          {searchValue || "Search by vibe, mood, or place"}
        </span>
        {activeFiltersCount > 0 && (
          <span className="h-5 w-5 rounded-full bg-[#8F9E4F] text-white text-[10px] font-medium flex items-center justify-center">
            {activeFiltersCount > 9 ? "9+" : activeFiltersCount}
          </span>
        )}
      </button>
    );
  }

  // Desktop: full search bar (Airbnb-style pill)
  return (
    <div className="flex items-center gap-0 bg-white rounded-full border border-[#E5E8DB] hover:border-[#8F9E4F] transition-colors max-w-[920px] w-full">
      {/* City Selector */}
      <div ref={cityDropdownRef} className="relative flex-shrink-0">
        <button
          onClick={() => setCityDropdownOpen(!cityDropdownOpen)}
          className="h-11 px-6 rounded-l-full hover:bg-[#FAFAF7] transition-colors flex items-center justify-center border-r border-[#E5E8DB] min-w-[120px]"
        >
          <span className="text-sm font-medium text-[#1F2A1F] truncate max-w-[100px]">
            {isAnywhere ? "Anywhere" : displayCity}
          </span>
        </button>

        {/* City Dropdown Popover */}
        {cityDropdownOpen && (
          <div className="absolute top-full left-0 mt-2 bg-white rounded-2xl border border-[#ECEEE4] overflow-hidden z-50 min-w-[200px]"
               style={{ boxShadow: '0 4px 12px rgba(0,0,0,0.06)' }}>
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
                  className={`w-full px-4 py-3 text-left transition-colors ${
                    isSelected
                      ? "bg-[#FAFAF7] text-[#8F9E4F] font-medium"
                      : "text-[#1F2A1F] hover:bg-[#FAFAF7]"
                  }`}
                >
                  <div className="font-semibold text-sm">{city}</div>
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
              className={`w-full px-4 py-3 text-left transition-colors border-t border-[#ECEEE4] ${
                isAnywhere
                  ? "bg-[#FAFAF7] text-[#8F9E4F] font-medium"
                  : "text-[#1F2A1F] hover:bg-[#FAFAF7]"
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
          className="w-full h-11 px-6 pr-12 text-sm text-[#1F2A1F] placeholder:text-[#A8B096] outline-none bg-transparent focus:placeholder:text-[#6F7A5A]"
        />
        <svg className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#A8B096]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      </div>

      {/* Filters Button */}
      <button
        onClick={onFiltersClick}
        className="h-11 px-6 rounded-r-full hover:bg-[#FAFAF7] transition-colors flex items-center gap-2 border-l border-[#E5E8DB] flex-shrink-0 relative"
      >
        {/* Filter icon - three horizontal lines of varying lengths */}
        <svg className="w-5 h-5 text-[#1F2A1F]" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
          {/* Top line - longest */}
          <line x1="2" y1="6" x2="18" y2="6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          {/* Middle line - medium */}
          <line x1="2" y1="10" x2="14" y2="10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          {/* Bottom line - shortest */}
          <line x1="2" y1="14" x2="10" y2="14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <span className="text-sm font-medium text-[#1F2A1F] hidden min-[600px]:inline">Filters</span>
        {activeFiltersCount > 0 && (
          <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-[#8F9E4F] text-white text-[10px] font-medium flex items-center justify-center">
            {activeFiltersCount > 9 ? "9+" : activeFiltersCount}
          </span>
        )}
      </button>
    </div>
  );
}
