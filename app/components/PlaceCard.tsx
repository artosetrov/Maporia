"use client";

import Link from "next/link";
import { ReactNode } from "react";

type PlaceCardProps = {
  place: {
    id: string;
    title: string;
    address?: string | null;
    city?: string | null;
    country?: string | null;
    cover_url?: string | null;
  };
  favoriteButton?: ReactNode;
  onClick?: () => void;
};

export default function PlaceCard({ place, favoriteButton, onClick }: PlaceCardProps) {
  return (
    <Link
      href={`/id/${place.id}`}
      onClick={onClick}
      className="block cursor-pointer active:scale-[0.98] transition-transform"
    >
      <div className="relative rounded-2xl bg-white border border-[#6b7d47]/10 shadow-sm overflow-hidden hover:shadow-md transition">
        {place.cover_url && (
          <img
            src={place.cover_url}
            alt={place.title}
            className="w-full h-48 object-cover"
          />
        )}
        <div className="p-4">
          <div className="text-sm font-semibold text-[#2d2d2d]">{place.title}</div>
          {place.address && (
            <div className="mt-1 text-xs text-[#6b7d47]/70">{place.address}</div>
          )}
          <div className="mt-1 text-xs text-[#6b7d47]/60">
            {place.city ?? "—"}, {place.country ?? "—"}
          </div>
        </div>
        {favoriteButton && (
          <div className="absolute top-2 right-2">{favoriteButton}</div>
        )}
      </div>
    </Link>
  );
}
