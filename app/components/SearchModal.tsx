"use client";

import { useState, useEffect } from "react";
import { DEFAULT_CITY } from "../constants";
import { getCitiesWithPlaces } from "../lib/cities";
import Icon from "./Icon";

type SearchModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onCitySelect: (city: string | null) => void;
  selectedCity?: string | null;
};

export default function SearchModal({
  isOpen,
  onClose,
  onCitySelect,
  selectedCity,
}: SearchModalProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [recentCities, setRecentCities] = useState<string[]>([]);
  const [cities, setCities] = useState<Array<{ id: string; name: string }>>([]);
  const [citiesLoading, setCitiesLoading] = useState(true);

  // Load cities from database
  useEffect(() => {
    (async () => {
      setCitiesLoading(true);
      const citiesData = await getCitiesWithPlaces();
      setCities(citiesData.map(c => ({ id: c.id, name: c.name })));
      setCitiesLoading(false);
    })();
  }, []);

  // Load recent cities from localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("recentCities");
      if (stored) {
        try {
          setRecentCities(JSON.parse(stored));
        } catch (e) {
          console.error("Error parsing recent cities:", e);
        }
      }
    }
  }, []);

  // Save city to recent cities
  const saveToRecent = (city: string) => {
    if (typeof window !== "undefined") {
      const updated = [city, ...recentCities.filter((c) => c !== city)].slice(0, 5);
      setRecentCities(updated);
      localStorage.setItem("recentCities", JSON.stringify(updated));
    }
  };

  const handleCitySelect = (city: string | null) => {
    if (city) {
      saveToRecent(city);
    }
    onCitySelect(city);
    onClose();
  };

  // Filter cities based on search query
  const filteredCities = cities.filter((city) =>
    city.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-white">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#ECEEE4]">
        <button
          onClick={onClose}
          className="w-10 h-10 rounded-full hover:bg-[#FAFAF7] transition flex items-center justify-center"
          aria-label="Close"
        >
          <svg className="w-6 h-6 text-[#1F2A1F]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        <h2 className="text-lg font-semibold font-fraunces text-[#1F2A1F]">Search destinations</h2>
        <div className="w-10" /> {/* Spacer for centering */}
      </div>

      {/* Search Input */}
      <div className="px-4 py-4 border-b border-[#ECEEE4]">
        <div className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search destinations"
            className="w-full px-4 py-3 pl-12 rounded-xl border-2 border-[#ECEEE4] focus:border-[#8F9E4F] focus:outline-none text-[#1F2A1F]"
            autoFocus
          />
          <Icon name="search" size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#6F7A5A]" />
        </div>
      </div>

      {/* Content (scrollable) */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {/* Recent Cities */}
        {recentCities.length > 0 && searchQuery === "" && (
          <div className="mb-6">
            <h3 className="text-sm font-semibold font-fraunces text-[#1F2A1F] mb-3">Recent</h3>
            <div className="space-y-2">
              {recentCities.map((city) => (
                <button
                  key={city}
                  onClick={() => handleCitySelect(city)}
                  className="w-full text-left px-4 py-3 rounded-xl hover:bg-[#FAFAF7] transition flex items-center justify-between"
                >
                  <span className="text-[#1F2A1F]">{city}</span>
                  {selectedCity === city && (
                    <svg className="w-5 h-5 text-[#8F9E4F]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Popular Cities / Search Results */}
        <div>
          <h3 className="text-sm font-semibold font-fraunces text-[#1F2A1F] mb-3">
            {searchQuery ? "Search results" : "Popular cities"}
          </h3>
          <div className="space-y-2">
            {citiesLoading ? (
              <div className="px-4 py-8 text-center text-[#6F7A5A]">
                Loading cities...
              </div>
            ) : filteredCities.length > 0 ? (
              filteredCities.map((city) => (
                <button
                  key={city.id}
                  onClick={() => handleCitySelect(city.name)}
                  className="w-full text-left px-4 py-3 rounded-xl hover:bg-[#FAFAF7] transition flex items-center justify-between"
                >
                  <span className="text-[#1F2A1F]">{city.name}</span>
                  {selectedCity === city.name && (
                    <svg className="w-5 h-5 text-[#8F9E4F]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
              ))
            ) : (
              <div className="px-4 py-8 text-center text-[#6F7A5A]">
                No cities found
              </div>
            )}
          </div>
        </div>

        {/* Anywhere option */}
        {searchQuery === "" && (
          <div className="mt-6 pt-6 border-t border-[#ECEEE4]">
            <button
              onClick={() => handleCitySelect(null)}
              className="w-full text-left px-4 py-3 rounded-xl hover:bg-[#FAFAF7] transition flex items-center justify-between"
            >
              <span className="text-[#1F2A1F] font-medium">Anywhere</span>
              {!selectedCity && (
                <Icon name="check" size={20} className="text-[#8F9E4F]" />
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
