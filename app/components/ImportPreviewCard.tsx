"use client";

import { useState } from "react";
import Icon from "./Icon";

type SearchResult = {
  title: string | null;
  address: string | null;
  description: string | null;
  photos: Array<{ id: string; url: string; reference: string }>;
  lat: number | null;
  lng: number | null;
  google_place_id: string | null;
  google_maps_url: string | null;
  is_coordinate_only?: boolean; // True if this is a coordinate-only location (no Place ID)
};

type ImportPreviewCardProps = {
  result: SearchResult;
  generatingDescription?: boolean;
  descriptionHint?: string | null;
  onImport: (selectedFields: {
    title: boolean;
    address: boolean;
    description: boolean;
    photos: string[];
  }) => void;
  importing: boolean;
};

export default function ImportPreviewCard({
  result,
  generatingDescription = false,
  descriptionHint = null,
  onImport,
  importing,
}: ImportPreviewCardProps) {
  const [titleSelected, setTitleSelected] = useState(true);
  const [addressSelected, setAddressSelected] = useState(true);
  const [descriptionSelected, setDescriptionSelected] = useState(true);
  const [selectedPhotos, setSelectedPhotos] = useState<string[]>(
    result.photos.slice(0, 3).map((p) => p.id) // Select first 3 photos by default
  );
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);

  const handleTogglePhoto = (photoId: string) => {
    setSelectedPhotos((prev) =>
      prev.includes(photoId)
        ? prev.filter((id) => id !== photoId)
        : [...prev, photoId]
    );
  };

  const handleImport = () => {
    onImport({
      title: titleSelected,
      address: addressSelected,
      description: descriptionSelected,
      photos: selectedPhotos,
    });
  };

  const isCoordinateOnly = result.is_coordinate_only === true || !result.google_place_id;

  // For coordinate-only locations, coordinates are always included, so we need at least one other field
  // OR just coordinates alone is enough
  const hasSelectedFields =
    isCoordinateOnly ||
    titleSelected ||
    addressSelected ||
    descriptionSelected ||
    selectedPhotos.length > 0;

  return (
    <div className="rounded-2xl border border-[#ECEEE4] bg-white p-6 shadow-sm space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold font-fraunces text-[#1F2A1F]">Import Preview</h3>
        <a
          href={result.google_maps_url || "#"}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-[#8F9E4F] hover:text-[#556036] flex items-center gap-1.5 transition-colors"
        >
          <Icon name="external-link" size={14} />
          <span>View on Google Maps</span>
        </a>
      </div>

      {/* Coordinate-only warning */}
      {isCoordinateOnly && (
        <div className="rounded-xl border border-[#C96A5B]/30 bg-[#C96A5B]/10 p-3 text-sm text-[#C96A5B] flex items-start gap-2">
          <Icon name="alert-circle" size={16} className="flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium mb-1">Unregistered location</p>
            <p className="text-xs opacity-90">
              This location doesn't have a Google Place ID. Only coordinates and address will be imported.
            </p>
          </div>
        </div>
      )}

      {/* Coordinates Field - Always show for coordinate-only locations */}
      {isCoordinateOnly && result.lat !== null && result.lng !== null && (
        <div className="space-y-2">
          <label className="flex items-center gap-3 cursor-pointer group">
            <button
              type="button"
              className={cx(
                "w-5 h-5 rounded border-2 flex items-center justify-center transition-all flex-shrink-0",
                "bg-[#8F9E4F] border-[#8F9E4F]"
              )}
            >
              <Icon name="check" size={12} className="text-white" />
            </button>
            <span className="text-sm font-medium text-[#1F2A1F]">Coordinates</span>
          </label>
          <div className="pl-8 text-sm text-[#6F7A5A] flex items-start gap-2">
            <Icon name="location" size={16} className="mt-0.5 flex-shrink-0" />
            <span className="font-mono">
              {result.lat.toFixed(6)}, {result.lng.toFixed(6)}
            </span>
          </div>
        </div>
      )}

      {/* Title Field */}
      {result.title && (
        <div className="space-y-2">
          <label className="flex items-center gap-3 cursor-pointer group">
            <button
              type="button"
              onClick={() => setTitleSelected(!titleSelected)}
              className={cx(
                "w-5 h-5 rounded border-2 flex items-center justify-center transition-all flex-shrink-0",
                titleSelected
                  ? "bg-[#8F9E4F] border-[#8F9E4F]"
                  : "bg-white border-[#ECEEE4] group-hover:border-[#8F9E4F]"
              )}
            >
              {titleSelected && <Icon name="check" size={12} className="text-white" />}
            </button>
            <span className="text-sm font-medium text-[#1F2A1F]">Title</span>
          </label>
          {titleSelected && (
            <div className="pl-8 text-sm text-[#1F2A1F]">{result.title}</div>
          )}
        </div>
      )}

      {/* Address Field */}
      {result.address && (
        <div className="space-y-2">
          <label className="flex items-center gap-3 cursor-pointer group">
            <button
              type="button"
              onClick={() => setAddressSelected(!addressSelected)}
              className={cx(
                "w-5 h-5 rounded border-2 flex items-center justify-center transition-all flex-shrink-0",
                addressSelected
                  ? "bg-[#8F9E4F] border-[#8F9E4F]"
                  : "bg-white border-[#ECEEE4] group-hover:border-[#8F9E4F]"
              )}
            >
              {addressSelected && <Icon name="check" size={12} className="text-white" />}
            </button>
            <span className="text-sm font-medium text-[#1F2A1F]">Address</span>
          </label>
          {addressSelected && (
            <div className="pl-8 text-sm text-[#6F7A5A] flex items-start gap-2">
              <Icon name="location" size={16} className="mt-0.5 flex-shrink-0" />
              <span>{result.address}</span>
            </div>
          )}
        </div>
      )}

      {/* Description Field (AI draft) */}
      {(generatingDescription || result.description) && (
        <div className="space-y-2">
          <label className="flex items-center gap-3 cursor-pointer group">
            <button
              type="button"
              onClick={() => setDescriptionSelected(!descriptionSelected)}
              className={cx(
                "w-5 h-5 rounded border-2 flex items-center justify-center transition-all flex-shrink-0",
                descriptionSelected
                  ? "bg-[#8F9E4F] border-[#8F9E4F]"
                  : "bg-white border-[#ECEEE4] group-hover:border-[#8F9E4F]"
              )}
            >
              {descriptionSelected && <Icon name="check" size={12} className="text-white" />}
            </button>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-[#1F2A1F]">Description</span>
              <span className="text-[11px] rounded-full border border-[#ECEEE4] bg-[#FAFAF7] px-2 py-0.5 text-[#6F7A5A]">
                AI draft
              </span>
            </div>
          </label>
          {descriptionSelected && (
            <div className="pl-8 space-y-1">
              {generatingDescription && !result.description ? (
                <div className="text-sm text-[#6F7A5A]">
                  Generating description…
                </div>
              ) : (
                <>
                  <div
                    className={`text-sm text-[#6F7A5A] ${
                      !descriptionExpanded ? "line-clamp-3" : ""
                    }`}
                  >
                    {result.description}
                  </div>
                  {result.description && result.description.length > 100 && (
                    <button
                      onClick={() => setDescriptionExpanded(!descriptionExpanded)}
                      className="text-xs text-[#8F9E4F] hover:text-[#556036] underline"
                    >
                      {descriptionExpanded ? "Show less" : "Show more"}
                    </button>
                  )}
                </>
              )}
              {descriptionHint && (
                <div className="text-xs text-[#6F7A5A]">{descriptionHint}</div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Photos Field */}
      {result.photos.length > 0 && (
        <div className="space-y-2">
          <label className="flex items-center gap-3 cursor-pointer group">
            <button
              type="button"
              onClick={() => {
                if (selectedPhotos.length > 0) {
                  setSelectedPhotos([]);
                } else {
                  setSelectedPhotos(result.photos.slice(0, 3).map((p) => p.id));
                }
              }}
              className={cx(
                "w-5 h-5 rounded border-2 flex items-center justify-center transition-all flex-shrink-0",
                selectedPhotos.length > 0
                  ? "bg-[#8F9E4F] border-[#8F9E4F]"
                  : "bg-white border-[#ECEEE4] group-hover:border-[#8F9E4F]"
              )}
            >
              {selectedPhotos.length > 0 && <Icon name="check" size={12} className="text-white" />}
            </button>
            <span className="text-sm font-medium text-[#1F2A1F]">
              Photos ({selectedPhotos.length} selected)
            </span>
          </label>
          {selectedPhotos.length > 0 && (
            <div className="pl-8">
              <div className="grid grid-cols-3 gap-2">
                {result.photos.map((photo) => {
                  const isSelected = selectedPhotos.includes(photo.id);
                  return (
                    <div
                      key={photo.id}
                      className="relative group cursor-pointer"
                      onClick={() => handleTogglePhoto(photo.id)}
                    >
                      <div className="relative" style={{ paddingBottom: "100%" }}>
                        <img
                          src={photo.url}
                          alt="Place photo"
                          className="absolute inset-0 w-full h-full object-cover rounded-lg"
                          onError={(e) => {
                            // Fallback if image fails to load
                            (e.target as HTMLImageElement).src =
                              "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100'%3E%3Crect fill='%23ECEEE4' width='100' height='100'/%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' dy='.3em' fill='%236F7A5A' font-size='12'%3EPhoto%3C/text%3E%3C/svg%3E";
                          }}
                        />
                        {/* Selection overlay */}
                        <div
                          className={`absolute inset-0 rounded-lg border-2 transition ${
                            isSelected
                              ? "border-[#8F9E4F] bg-[#8F9E4F]/20"
                              : "border-transparent group-hover:border-[#ECEEE4]"
                          }`}
                        >
                          {isSelected && (
                            <div className="absolute top-1 right-1 bg-[#8F9E4F] rounded-full p-1">
                              <Icon name="check" size={12} className="text-white" />
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Info: Coordinates and place_id are always included */}
      <div className="pt-4 border-t border-[#ECEEE4]">
        <p className="text-xs text-[#6F7A5A]">
          Coordinates, Google Place ID, and Google Maps URL will always be included.
        </p>
      </div>

      {/* Import Button */}
      <button
        onClick={handleImport}
        disabled={!hasSelectedFields || importing}
        className={cx(
          "w-full rounded-xl px-4 py-3 text-sm font-medium transition",
          hasSelectedFields && !importing
            ? "bg-[#8F9E4F] text-white hover:bg-[#556036]"
            : "bg-[#DADDD0] text-[#6F7A5A] cursor-not-allowed"
        )}
      >
        {importing ? "Importing..." : "Import Selected"}
      </button>

      {/* Google Attribution */}
      <div className="pt-2 border-t border-[#ECEEE4]">
        <p className="text-xs text-[#A8B096] text-center">
          Data provided by Google Places API
        </p>
      </div>
    </div>
  );
}

function cx(...a: Array<string | false | undefined | null>) {
  return a.filter(Boolean).join(" ");
}
