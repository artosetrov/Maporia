"use client";

import { useState, useRef, useEffect } from "react";
import { CITIES, DEFAULT_CITY } from "../constants";
import Icon from "./Icon";

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
  
  // Mobile search bar click handler
  onSearchBarClick?: () => void;
};

export default function SearchBar({
  selectedCity,
  onCityChange,
  onFiltersClick,
  activeFiltersCount,
  isMobile = false,
  onSearchBarClick,
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

  // Close dropdown when selectedCity or activeFiltersCount changes (e.g., after filter is applied)
  useEffect(() => {
    setCityDropdownOpen(false);
  }, [selectedCity, activeFiltersCount]);

  // Показываем "Anywhere" только если город явно не выбран (null)
  // Если город установлен (даже если это DEFAULT_CITY), показываем его название
  const displayCity = selectedCity || DEFAULT_CITY;
  const isAnywhere = !selectedCity; // Только когда selectedCity === null

  // Mobile: pill "Where?" | иконка фильтров (подпись не дублируем — aria-label).
  if (isMobile) {
    return (
      <div className="flex items-center gap-0 bg-white rounded-full border border-[#E5E8DB] hover:border-[#8F9E4F] transition-colors w-full">
        {/* City Selector / Where? */}
        <button
          onClick={() => {
            if (onSearchBarClick) {
              onSearchBarClick();
            }
          }}
          className="h-11 px-4 rounded-l-full hover:bg-[#FAFAF7] transition-colors flex items-center justify-center border-r border-[#E5E8DB] flex-1 min-w-0"
          aria-label="Search location"
          tabIndex={0}
        >
          <span className="text-sm font-medium text-[#1F2A1F] truncate">
            {isAnywhere ? "Where?" : displayCity}
          </span>
        </button>

        {/* Filters Button */}
        <button
          onClick={onFiltersClick}
          className="relative flex h-11 w-12 shrink-0 items-center justify-center rounded-r-full border-l border-[#E5E8DB] transition-colors hover:bg-[#FAFAF7]"
          aria-label={
            activeFiltersCount > 0
              ? `Filters (${activeFiltersCount} applied)`
              : "Filters"
          }
          tabIndex={0}
        >
          <Icon name="filter" size={18} className="text-[#1F2A1F]" />
          {activeFiltersCount > 0 && (
            <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-[#8F9E4F] text-white text-[10px] font-medium flex items-center justify-center">
              {activeFiltersCount > 9 ? "9+" : activeFiltersCount}
            </span>
          )}
        </button>
      </div>
    );
  }

  // Desktop: simplified search bar with only "Anywhere" and "Filters"
  return (
    <div className="flex items-center gap-0 bg-white rounded-full border border-[#E5E8DB] hover:border-[#8F9E4F] transition-colors">
      {/* City Selector */}
      <div ref={cityDropdownRef} className="relative flex-shrink-0">
        <button
          onClick={() => {
            // Always close dropdown first if it's open
            if (cityDropdownOpen) {
              setCityDropdownOpen(false);
              return;
            }
            // Always open SearchModal if onSearchBarClick is provided (same as mobile)
            if (onSearchBarClick) {
              onSearchBarClick();
            } else {
              // Fallback: toggle dropdown for city selection (if no SearchModal handler)
              setCityDropdownOpen(!cityDropdownOpen);
            }
          }}
          className="h-11 px-6 rounded-l-full hover:bg-[#FAFAF7] transition-colors flex items-center justify-center border-r border-[#E5E8DB] min-w-[180px]"
        >
          <span className="text-sm font-medium text-[#1F2A1F] truncate">
            {isAnywhere ? "Where?" : displayCity}
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
              <div className="font-semibold text-sm">Where?</div>
            </button>
          </div>
        )}
      </div>

      {/* Filters Button */}
      <button
        onClick={onFiltersClick}
        className="h-11 px-6 rounded-r-full hover:bg-[#FAFAF7] transition-colors flex items-center justify-center gap-2 border-l border-[#E5E8DB] min-w-[180px] relative"
      >
        <Icon name="filter" size={20} className="text-[#1F2A1F]" />
        <span className="text-sm font-medium text-[#1F2A1F] hidden lg:inline">Filters</span>
        {activeFiltersCount > 0 && (
          <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-[#8F9E4F] text-white text-[10px] font-medium flex items-center justify-center">
            {activeFiltersCount > 9 ? "9+" : activeFiltersCount}
          </span>
        )}
      </button>
    </div>
  );
}
