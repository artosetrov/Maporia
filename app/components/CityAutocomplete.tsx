"use client";

import { useState, useEffect, useRef } from "react";
import { getCitiesWithPlaces, type City } from "../lib/cities";
import Icon from "./Icon";

type CityAutocompleteProps = {
  value: string;
  onChange: (city: string) => void;
  onCitySelect?: (city: City | null) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
};

export default function CityAutocomplete({
  value,
  onChange,
  onCitySelect,
  placeholder = "City",
  className = "",
  disabled = false,
}: CityAutocompleteProps) {
  const [cities, setCities] = useState<City[]>([]);
  const [filteredCities, setFilteredCities] = useState<City[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Load cities from database
  useEffect(() => {
    (async () => {
      setLoading(true);
      const citiesData = await getCitiesWithPlaces();
      setCities(citiesData);
      setFilteredCities(citiesData);
      setLoading(false);
    })();
  }, []);

  // Filter cities based on input
  useEffect(() => {
    if (!value.trim()) {
      setFilteredCities(cities);
      return;
    }

    const search = value.trim().toLowerCase();
    const filtered = cities.filter((city) =>
      city.name.toLowerCase().includes(search)
    );
    setFilteredCities(filtered);
  }, [value, cities]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const newValue = e.target.value;
    onChange(newValue);
    setIsOpen(true);
  }

  function handleCitySelect(city: City | null) {
    if (city) {
      onChange(city.name);
      onCitySelect?.(city);
    } else {
      // Allow clearing
      onChange("");
      onCitySelect?.(null);
    }
    setIsOpen(false);
    inputRef.current?.blur();
  }

  function handleInputFocus() {
    setIsOpen(true);
  }

  function handleInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      setIsOpen(false);
      inputRef.current?.blur();
    } else if (e.key === "Enter" && filteredCities.length > 0) {
      // Select first match on Enter
      e.preventDefault();
      handleCitySelect(filteredCities[0]);
    }
  }

  const showDropdown = isOpen && !disabled && (filteredCities.length > 0 || value.trim());

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={handleInputChange}
          onFocus={handleInputFocus}
          onKeyDown={handleInputKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          className="w-full rounded-xl border border-[#ECEEE4] bg-white px-4 py-3 text-sm text-[#1F2A1F] placeholder:text-[#A8B096] outline-none focus:border-[#8F9E4F] transition disabled:bg-[#FAFAF7] disabled:cursor-not-allowed"
        />
        {loading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#8F9E4F] border-t-transparent" />
          </div>
        )}
        {!loading && value && (
          <button
            type="button"
            onClick={() => handleCitySelect(null)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6F7A5A] hover:text-[#1F2A1F] transition"
            aria-label="Clear"
          >
            <Icon name="close" size={16} />
          </button>
        )}
      </div>

      {/* Dropdown */}
      {showDropdown && (
        <div className="absolute z-50 mt-1 w-full max-h-60 overflow-auto rounded-xl border border-[#ECEEE4] bg-white shadow-lg">
          {filteredCities.length > 0 ? (
            <div className="py-1">
              {filteredCities.slice(0, 10).map((city) => (
                <button
                  key={city.id}
                  type="button"
                  onClick={() => handleCitySelect(city)}
                  className="w-full text-left px-4 py-2 text-sm text-[#1F2A1F] hover:bg-[#FAFAF7] transition flex items-center justify-between"
                >
                  <span>{city.name}</span>
                  {city.state && (
                    <span className="text-xs text-[#6F7A5A] ml-2">
                      {city.state}
                    </span>
                  )}
                </button>
              ))}
              {filteredCities.length > 10 && (
                <div className="px-4 py-2 text-xs text-[#6F7A5A] border-t border-[#ECEEE4]">
                  +{filteredCities.length - 10} more cities
                </div>
              )}
            </div>
          ) : value.trim() ? (
            <div className="px-4 py-3 text-sm text-[#6F7A5A] text-center">
              <div className="mb-1">No cities found</div>
              <div className="text-xs">
                Press Enter to create "{value}"
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
