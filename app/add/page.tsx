"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { Autocomplete, useJsApiLoader } from "@react-google-maps/api";
import { CATEGORIES } from "../constants";
import Pill from "../components/Pill";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type UploadingPhoto = {
  file: File;
  preview: string;
  uploading: boolean;
  url?: string;
  error?: string;
};

function cx(...a: Array<string | false | undefined | null>) {
  return a.filter(Boolean).join(" ");
}

export default function AddPlacePage() {
  const router = useRouter();
  
  const { isLoaded } = useJsApiLoader({
    id: "google-maps-loader",
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY!,
    libraries: ["places"],
  });

  const [userId, setUserId] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [city, setCity] = useState("");
  const [categories, setCategories] = useState<string[]>([]);
  const [link, setLink] = useState("");

  const [address, setAddress] = useState("");
  const [googlePlaceId, setGooglePlaceId] = useState<string | null>(null);
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);

  const [photos, setPhotos] = useState<UploadingPhoto[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showTitleError, setShowTitleError] = useState(false);

  const coverReady = useMemo(() => photos.some((p) => !!p.url), [photos]);
  const canPublish = useMemo(() => title.trim().length > 0 && coverReady, [title, coverReady]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const u = data.user;
      if (!u) {
        router.push("/auth");
        return;
      }
      setUserId(u.id);
    })();
  }, [router]);

  function onPickFiles(files: FileList | null) {
    if (!files) return;

    const next: UploadingPhoto[] = Array.from(files).map((file) => ({
      file,
      preview: URL.createObjectURL(file),
      uploading: true,
    }));

    setPhotos((prev) => [...prev, ...next]);

    next.forEach(async (item) => {
      const result = await uploadToSupabase(item.file);
      setPhotos((prev) =>
        prev.map((p) => {
          if (p.preview !== item.preview) return p;
          if (!result.url) {
            return { ...p, uploading: false, error: result.error || "Upload failed" };
          }
          return { ...p, uploading: false, url: result.url };
        })
      );
    });
  }

  async function uploadToSupabase(file: File): Promise<{ url: string | null; error: string | null }> {
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `places/${crypto.randomUUID()}.${ext}`;

      const { error } = await supabase.storage.from("place-photos").upload(path, file, {
        cacheControl: "3600",
        upsert: false,
      });

      if (error) {
        console.error("Upload error:", error);
        return { url: null, error: error.message || "Upload failed" };
      }

      const { data } = supabase.storage.from("place-photos").getPublicUrl(path);
      return { url: data.publicUrl ?? null, error: null };
    } catch (err) {
      console.error("Upload exception:", err);
      const errorMessage = err instanceof Error ? err.message : "Upload failed";
      return { url: null, error: errorMessage };
    }
  }

  function removePhoto(preview: string) {
    setPhotos((prev) => {
      const p = prev.find((x) => x.preview === preview);
      if (p) URL.revokeObjectURL(p.preview);
      return prev.filter((x) => x.preview !== preview);
    });
  }

  async function savePlace() {
    setError(null);
    setShowTitleError(false);

    if (!userId) {
      setError("Please sign in to continue");
      return;
    }
    if (!title.trim()) {
      setShowTitleError(true);
      setError("Place name is required");
      return;
    }
    if (!coverReady) {
      setError("Add at least 1 photo (this will be the cover)");
      return;
    }

    // Validate categories
    const validCategories = categories.filter((cat) => CATEGORIES.includes(cat as any));
    if (categories.length > 0 && validCategories.length !== categories.length) {
      setError("One or more selected categories are invalid");
      return;
    }

    // Проверяем, что все фото загружены
    const photosStillUploading = photos.some((p) => p.uploading);
    const photosWithErrors = photos.filter((p) => p.error);
    
    if (photosStillUploading) {
      setError("Please wait for all photos to finish uploading");
      return;
    }

    if (photosWithErrors.length > 0) {
      setError(`Some photos failed to upload. Please remove them or try again.`);
      return;
    }

    // Собираем все URL загруженных фото
    const photoUrls = photos.map((p) => p.url).filter(Boolean) as string[];
    
    if (photoUrls.length === 0) {
      setError("Add at least 1 photo (this will be the cover)");
      return;
    }

    const coverUrl = photoUrls[0];

    // Debug: логируем, что сохраняем
    console.log("Saving place with photos:", {
      totalPhotos: photos.length,
      photosWithUrls: photoUrls.length,
      photoUrls: photoUrls
    });

    setSaving(true);

    // Try to extract city from Google address if not set
    let finalCity = city.trim();
    if (!finalCity && address && autocompleteRef.current) {
      const place = autocompleteRef.current.getPlace();
      if (place?.address_components) {
        const cityComponent = place.address_components.find(
          (comp) => comp.types.includes("locality") || comp.types.includes("administrative_area_level_1")
        );
        if (cityComponent) {
          finalCity = cityComponent.long_name;
        }
      }
    }

    // Сначала создаем место (без фото, так как они в отдельной таблице)
    const payload = {
      title: title.trim(),
      description: description.trim() || null,
      city: finalCity || null,
      country: null,
      categories: validCategories.length > 0 ? validCategories : null,
      address: address.trim() || null,
      google_place_id: googlePlaceId,
      lat: lat,
      lng: lng,
      link: link.trim() || null,
      cover_url: coverUrl, // Оставляем для обратной совместимости
      created_by: userId,
    };

    const { data, error } = await supabase
      .from("places")
      .insert(payload)
      .select("id")
      .single();

    if (error) {
      console.error("Save error:", error);
      setError(error.message || "Failed to save place. Please try again.");
      setSaving(false);
      return;
    }

    const placeId = data.id;

    // Получаем пользователя для сохранения фото
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setError("Not authenticated");
      setSaving(false);
      // Удаляем созданное место, если пользователь не аутентифицирован
      await supabase.from("places").delete().eq("id", placeId);
      return;
    }

    // Подготавливаем данные для вставки
    const rows = photoUrls.map((url, i) => ({
      place_id: placeId,
      user_id: user.id,
      url,
      is_cover: i === 0,
      sort: i,
    }));

    console.log("uid", user?.id);
    console.log("rows", rows);

    // Теперь сохраняем все фото в таблицу place_photos
    const { error: photosError } = await supabase
      .from("place_photos")
      .insert(rows);

    setSaving(false);

    if (photosError) {
      console.error("Photos save error:", photosError);
      setError(photosError.message || "Failed to save photos. Please try again.");
      // Удаляем созданное место, если фото не удалось сохранить
      await supabase.from("places").delete().eq("id", placeId);
      return;
    }

    // Haptic feedback
    if (navigator.vibrate) {
      navigator.vibrate(10);
    }

    router.push("/profile");
  }

  return (
    <main className="min-h-screen bg-[#faf9f7]">
      {/* Header with olive green */}
      <div className="bg-[#6b7d47] text-white">
        <div className="mx-auto max-w-md px-4 pt-safe-top pt-3 pb-6">
          <div className="flex items-center justify-between mb-4">
            <Link href="/profile" className="text-white/90 hover:text-white transition">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <div className="text-lg font-semibold">Add place</div>
            <div className="w-10" />
          </div>
          <div className="text-sm text-white/80">
            Cover photo is required (min 1)
          </div>
        </div>
        
        {/* Soft rounded bottom */}
        <div className="h-4 bg-[#faf9f7] rounded-t-3xl"></div>
      </div>

      {/* Main content card */}
      <div className="mx-auto max-w-md px-4 pb-10 -mt-4">
        <div className="rounded-3xl bg-white shadow-sm border border-[#6b7d47]/10">
          <div className="p-5 space-y-6">
            {/* PHOTOS SECTION - Top Priority */}
            <section>
              <div className="flex items-center justify-between mb-3">
                <div className="text-sm font-semibold text-[#2d2d2d]">Photos</div>
                <label className="cursor-pointer rounded-xl bg-[#6b7d47] text-white px-4 py-2 text-xs font-medium hover:bg-[#556036] transition active:scale-[0.98]">
                  + Add photos
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => onPickFiles(e.target.files)}
                  />
                </label>
              </div>

              {photos.length === 0 ? (
                <div className="mt-3 rounded-2xl border-2 border-dashed border-[#6b7d47]/20 bg-[#f5f4f2] p-8 text-center">
                  <div className="text-sm text-[#6b7d47]/70">
                    Add at least 1 photo (this will be the cover)
                  </div>
                </div>
              ) : (
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {photos.map((p, idx) => (
                    <div
                      key={p.preview}
                      className="relative"
                      style={{ animation: "fadeInScale 0.3s ease-out forwards" }}
                    >
                      <img
                        src={p.url || p.preview}
                        alt=""
                        className="h-24 w-full rounded-2xl object-cover border border-[#6b7d47]/10"
                      />
                      {idx === 0 && (
                        <div className="absolute left-2 top-2 rounded-full bg-black/70 text-white text-[10px] px-2 py-0.5 font-medium">
                          Cover
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => removePhoto(p.preview)}
                        className="absolute right-2 top-2 h-6 w-6 rounded-full bg-black/70 text-white text-xs flex items-center justify-center hover:bg-black/80 transition"
                        title="Remove"
                      >
                        ✕
                      </button>

                      {p.uploading && (
                        <div className="absolute inset-0 rounded-2xl bg-black/40 flex items-center justify-center text-white text-xs">
                          Uploading…
                        </div>
                      )}
                      {p.error && (
                        <div className="absolute inset-0 rounded-2xl bg-red-500/40 flex items-center justify-center text-white text-xs px-2 text-center">
                          {p.error}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* PLACE NAME */}
            <section>
              <label className="text-xs font-medium text-[#6b7d47] mb-2 block">Place name</label>
              <input
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  setShowTitleError(false);
                  setError(null);
                }}
                placeholder="e.g. Secret rooftop bar"
                className={cx(
                  "w-full rounded-xl border px-4 py-3 text-sm text-[#2d2d2d] placeholder:text-[#6b7d47]/40 outline-none transition",
                  showTitleError
                    ? "border-red-300 bg-red-50/50 focus:bg-white focus:border-red-400"
                    : "border-[#6b7d47]/20 bg-[#f5f4f2] focus:bg-white focus:border-[#6b7d47]/40"
                )}
              />
            </section>

            {/* DESCRIPTION */}
            <section>
              <label className="text-xs font-medium text-[#6b7d47] mb-2 block">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Why it's special, best time to go, what locals know…"
                rows={4}
                className="w-full rounded-xl border border-[#6b7d47]/20 bg-[#f5f4f2] px-4 py-3 text-sm text-[#2d2d2d] placeholder:text-[#6b7d47]/40 outline-none focus:bg-white focus:border-[#6b7d47]/40 transition resize-none"
              />
            </section>

            {/* CATEGORIES */}
            <section>
              <label className="text-xs font-medium text-[#6b7d47] mb-2 block">
                Categories
                <span className="text-[#6b7d47]/60 font-normal ml-1">(optional)</span>
              </label>
              <div className="mt-2 flex flex-wrap gap-2">
                {CATEGORIES.map((cat) => (
                  <Pill
                    key={cat}
                    active={categories.includes(cat)}
                    onClick={() => {
                      setCategories((prev) =>
                        prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
                      );
                    }}
                  >
                    {cat}
                  </Pill>
                ))}
              </div>
              {categories.length === 0 && (
                <div className="mt-2 text-xs text-[#6b7d47]/60">
                  Pick what best describes the vibe
                </div>
              )}
            </section>

            {/* LOCATION */}
            <section>
              <label className="text-xs font-medium text-[#6b7d47] mb-2 block">Location</label>
              
              {/* City */}
              <div className="mb-3">
                <input
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="City"
                  className="w-full rounded-xl border border-[#6b7d47]/20 bg-[#f5f4f2] px-4 py-3 text-sm text-[#2d2d2d] placeholder:text-[#6b7d47]/40 outline-none focus:bg-white focus:border-[#6b7d47]/40 transition"
                />
              </div>

              {/* Google Address Autocomplete */}
              {isLoaded ? (
                <Autocomplete
                  onLoad={(a) => {
                    autocompleteRef.current = a;
                  }}
                  onPlaceChanged={() => {
                    const place = autocompleteRef.current?.getPlace();
                    if (!place) return;
                    setAddress(place.formatted_address ?? "");
                    setGooglePlaceId(place.place_id ?? null);
                    
                    // Extract coordinates
                    if (place.geometry?.location) {
                      setLat(place.geometry.location.lat());
                      setLng(place.geometry.location.lng());
                    }
                    
                    // Extract city if not set
                    if (!city && place.address_components) {
                      const cityComponent = place.address_components.find(
                        (comp) => comp.types.includes("locality") || comp.types.includes("administrative_area_level_1")
                      );
                      if (cityComponent) {
                        setCity(cityComponent.long_name);
                      }
                    }
                  }}
                >
                  <input
                    value={address}
                    onChange={(e) => {
                      setAddress(e.target.value);
                      setGooglePlaceId(null);
                      setLat(null);
                      setLng(null);
                    }}
                    placeholder="Start typing address…"
                    className="w-full rounded-xl border border-[#6b7d47]/20 bg-[#f5f4f2] px-4 py-3 text-sm text-[#2d2d2d] placeholder:text-[#6b7d47]/40 outline-none focus:bg-white focus:border-[#6b7d47]/40 transition"
                  />
                </Autocomplete>
              ) : (
                <input
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Start typing address…"
                  className="w-full rounded-xl border border-[#6b7d47]/20 bg-[#f5f4f2] px-4 py-3 text-sm text-[#2d2d2d] placeholder:text-[#6b7d47]/40 outline-none focus:bg-white focus:border-[#6b7d47]/40 transition"
                />
              )}

              <div className="mt-2 text-xs text-[#6b7d47]/60">
                We store address + Google place ID
              </div>
            </section>

            {/* LINK */}
            <section>
              <label className="text-xs font-medium text-[#6b7d47] mb-2 block">
                Link
                <span className="text-[#6b7d47]/60 font-normal ml-1">(optional)</span>
              </label>
              <input
                value={link}
                onChange={(e) => setLink(e.target.value)}
                placeholder="https://"
                className="w-full rounded-xl border border-[#6b7d47]/20 bg-[#f5f4f2] px-4 py-3 text-sm text-[#2d2d2d] placeholder:text-[#6b7d47]/40 outline-none focus:bg-white focus:border-[#6b7d47]/40 transition"
              />
            </section>

            {/* Error message */}
            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50/50 p-3 text-sm text-red-700">
                {error}
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3 pt-4 border-t border-[#6b7d47]/10 mt-4">
              <button
                type="button"
                onClick={() => router.push("/profile")}
                className="flex-1 rounded-xl border border-[#6b7d47]/20 bg-white px-4 py-3 text-sm font-medium text-[#6b7d47] hover:bg-[#f5f4f2] transition active:scale-[0.98]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={savePlace}
                disabled={saving || !canPublish}
                className={cx(
                  "flex-1 rounded-xl px-4 py-3 text-sm font-medium transition active:scale-[0.98]",
                  canPublish && !saving
                    ? "bg-[#6b7d47] text-white hover:bg-[#556036]"
                    : "bg-[#6b7d47]/40 text-white/70 cursor-not-allowed"
                )}
              >
                {saving ? "Publishing…" : "Publish"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
