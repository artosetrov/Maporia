"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import dynamic from "next/dynamic";
import { CATEGORIES } from "../../../constants";
import Pill from "../../../components/Pill";
import { supabase } from "../../../lib/supabase";

const AddressAutocomplete = dynamic(
  () => import("../../../components/AddressAutocomplete"),
  { ssr: false }
);

type UploadingPhoto = {
  file?: File;
  preview: string;
  uploading: boolean;
  url?: string;
  error?: string;
};

type PlaceRow = {
  id: string;
  created_by: string;
  title: string | null;
  description: string | null;
  city: string | null;
  categories: string[] | null;
  link: string | null;
  address: string | null;
  google_place_id: string | null;
  lat: number | null;
  lng: number | null;
  photo_urls: unknown[] | null; // legacy
  cover_url: unknown; // legacy
};

type PlacePhotoRow = {
  url: string | null;
  sort: number | null;
  is_cover: boolean | null;
};

function cx(...a: Array<string | false | undefined | null>) {
  return a.filter(Boolean).join(" ");
}

function generateUUID(): string {
  if (typeof window !== "undefined" && window.crypto && window.crypto.randomUUID) {
    return window.crypto.randomUUID();
  }
  // Fallback for build/Edge environments
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export default function EditPlacePage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const placeId = params?.id;

  const [userId, setUserId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [city, setCity] = useState("");
  const [categories, setCategories] = useState<string[]>([]);
  const [link, setLink] = useState("");

  const [address, setAddress] = useState("");
  const [googlePlaceId, setGooglePlaceId] = useState<string | null>(null);
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const autocompleteRef = useRef<any>(null);

  const [originalTitle, setOriginalTitle] = useState("");
  const [originalDescription, setOriginalDescription] = useState("");
  const [originalCity, setOriginalCity] = useState("");
  const [originalCategories, setOriginalCategories] = useState<string[]>([]);
  const [originalLink, setOriginalLink] = useState("");
  const [originalAddress, setOriginalAddress] = useState("");
  const [originalGooglePlaceId, setOriginalGooglePlaceId] = useState<string | null>(null);
  const [originalLat, setOriginalLat] = useState<number | null>(null);
  const [originalLng, setOriginalLng] = useState<number | null>(null);
  const [originalPhotos, setOriginalPhotos] = useState<UploadingPhoto[]>([]);

  const [photos, setPhotos] = useState<UploadingPhoto[]>([]);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showTitleError, setShowTitleError] = useState(false);

  const coverReady = useMemo(() => photos.some((p) => !!p.url), [photos]);

  const hasChanges = useMemo(() => {
    if (loading) return false;

    if (title.trim() !== originalTitle.trim()) return true;
    if ((description.trim() || "") !== (originalDescription.trim() || "")) return true;
    if ((city.trim() || "") !== (originalCity.trim() || "")) return true;

    const currentCats = [...categories].sort().join(",");
    const origCats = [...originalCategories].sort().join(",");
    if (currentCats !== origCats) return true;

    if ((link.trim() || "") !== (originalLink.trim() || "")) return true;
    if ((address.trim() || "") !== (originalAddress.trim() || "")) return true;

    if (googlePlaceId !== originalGooglePlaceId) return true;
    if (lat !== originalLat || lng !== originalLng) return true;

    const currentPhotoUrls = photos.map((p) => p.url || p.preview).filter(Boolean).sort();
    const origPhotoUrls = originalPhotos.map((p) => p.url || p.preview).filter(Boolean).sort();

    if (currentPhotoUrls.length !== origPhotoUrls.length) return true;
    for (let i = 0; i < currentPhotoUrls.length; i++) {
      if (currentPhotoUrls[i] !== origPhotoUrls[i]) return true;
    }

    return false;
  }, [
    title,
    description,
    city,
    categories,
    link,
    address,
    googlePlaceId,
    lat,
    lng,
    photos,
    originalTitle,
    originalDescription,
    originalCity,
    originalCategories,
    originalLink,
    originalAddress,
    originalGooglePlaceId,
    originalLat,
    originalLng,
    originalPhotos,
    loading,
  ]);

  const canSave = useMemo(() => title.trim().length > 0 && coverReady && hasChanges, [
    title,
    coverReady,
    hasChanges,
  ]);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.auth.getUser();
      if (error) {
        console.error("Error getting user:", error);
        router.push("/auth");
        return;
      }
      const u = data.user;
      if (!u) {
        console.log("No user found, redirecting to auth");
        router.push("/auth");
        return;
      }
      console.log("User loaded in edit page:", u.id);
      setUserId(u.id);

      // Проверяем, является ли пользователь администратором
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("is_admin")
        .eq("id", u.id)
        .maybeSingle();

      if (profileError) {
        console.error("Error checking admin status:", profileError);
      } else if (profile?.is_admin) {
        console.log("User is admin");
        setIsAdmin(true);
      }
    })();
  }, [router]);

  useEffect(() => {
    if (!placeId || !userId) return;

    (async () => {
      setLoading(true);

      const { data: placeDataRaw, error: placeError } = await supabase
        .from("places")
        .select("*")
        .eq("id", placeId)
        .single();

      const placeData = placeDataRaw as PlaceRow | null;

      if (placeError || !placeData) {
        setError("Place not found");
        setLoading(false);
        return;
      }

      // Проверяем права доступа: пользователь должен быть создателем ИЛИ администратором
      // Сначала проверяем, является ли пользователь администратором
      const { data: profile } = await supabase
        .from("profiles")
        .select("is_admin")
        .eq("id", userId)
        .maybeSingle();

      const userIsAdmin = profile?.is_admin === true;

      if (placeData.created_by !== userId && !userIsAdmin) {
        // Пользователь не создатель и не администратор - перенаправляем на страницу просмотра
        router.push(`/id/${placeId}`);
        return;
      }

      if (userIsAdmin) {
        setIsAdmin(true);
        console.log("Admin user editing place");
      }

      const placeTitle = placeData.title || "";
      const placeDescription = placeData.description || "";
      const placeCity = placeData.city || "";
      const placeCategories = Array.isArray(placeData.categories) ? placeData.categories : [];
      const placeLink = placeData.link || "";
      const placeAddress = placeData.address || "";
      const placeGooglePlaceId = placeData.google_place_id || null;
      const placeLat = placeData.lat ?? null;
      const placeLng = placeData.lng ?? null;

      setTitle(placeTitle);
      setDescription(placeDescription);
      setCity(placeCity);
      setCategories(placeCategories);
      setLink(placeLink);
      setAddress(placeAddress);
      setGooglePlaceId(placeGooglePlaceId);
      setLat(placeLat);
      setLng(placeLng);

      setOriginalTitle(placeTitle);
      setOriginalDescription(placeDescription);
      setOriginalCity(placeCity);
      setOriginalCategories(placeCategories);
      setOriginalLink(placeLink);
      setOriginalAddress(placeAddress);
      setOriginalGooglePlaceId(placeGooglePlaceId);
      setOriginalLat(placeLat);
      setOriginalLng(placeLng);

      const { data: photosDataRaw, error: photosError } = await supabase
        .from("place_photos")
        .select("url, sort, is_cover")
        .eq("place_id", placeId)
        .order("sort", { ascending: true });

      const photosData = (photosDataRaw as PlacePhotoRow[] | null) ?? [];

      let photoUrls: string[] = [];

      if (!photosError && photosData.length > 0) {
        photoUrls = photosData
          .map((p) => p.url)
          .filter((u: string | null): u is string => typeof u === "string" && u.length > 0);
      } else {
        if (photoUrls.length === 0 && typeof placeData.cover_url === "string" && placeData.cover_url.length > 0) {
          photoUrls.push(placeData.cover_url);
        }
      }

      console.log("Loaded photos for editing:", {
        photosFromTable: photosData.length,
        totalLoaded: photoUrls.length,
        photoUrls,
      });

      const existingPhotos: UploadingPhoto[] = photoUrls.map((url) => ({
        preview: url,
        uploading: false,
        url,
      }));

      setPhotos(existingPhotos);
      setOriginalPhotos(existingPhotos.map((p) => ({ ...p })));
      setLoading(false);
    })();
  }, [placeId, userId, router]);

  function onPickFiles(files: FileList | null) {
    if (!files) return;

    const next: UploadingPhoto[] = Array.from(files).map((file) => ({
      file,
      preview: URL.createObjectURL(file),
      uploading: true,
    }));

    setPhotos((prev) => [...prev, ...next]);

    next.forEach(async (item) => {
      const result = await uploadToSupabase(item.file!);
      setPhotos((prev) =>
        prev.map((p) => {
          if (p.preview !== item.preview) return p;
          if (!result.url) return { ...p, uploading: false, error: result.error || "Upload failed" };
          return { ...p, uploading: false, url: result.url };
        })
      );
    });
  }

  async function uploadToSupabase(file: File): Promise<{ url: string | null; error: string | null }> {
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `places/${generateUUID()}.${ext}`;

      const { error } = await supabase.storage.from("place-photos").upload(path, file, {
        cacheControl: "3600",
        upsert: false,
      });

      if (error) return { url: null, error: error.message || "Upload failed" };

      const { data } = supabase.storage.from("place-photos").getPublicUrl(path);
      return { url: data.publicUrl ?? null, error: null };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Upload failed";
      return { url: null, error: errorMessage };
    }
  }

  function removePhoto(preview: string) {
    setError(null);

    setPhotos((prev) => {
      const photoToRemove = prev.find((x) => x.preview === preview);
      if (!photoToRemove) return prev;

      const isCover = prev.indexOf(photoToRemove) === 0;
      const isLast = prev.length === 1;

      if (isCover && isLast) {
        setError("Cannot remove the last photo (cover is required)");
        setTimeout(() => setError(null), 3000);
        return prev;
      }

      if (photoToRemove.file) URL.revokeObjectURL(photoToRemove.preview);
      return prev.filter((x) => x.preview !== preview);
    });
  }

  async function savePlace() {
    setError(null);
    setShowTitleError(false);

    if (!userId || !placeId) return setError("Please sign in to continue");
    if (!title.trim()) {
      setShowTitleError(true);
      return setError("Place name is required");
    }
    if (!coverReady) return setError("Add at least 1 photo (this will be the cover)");

    const validCategories = categories.filter((cat) => CATEGORIES.includes(cat as any));
    if (categories.length > 0 && validCategories.length !== categories.length) {
      return setError("One or more selected categories are invalid");
    }

    if (photos.some((p) => p.uploading)) return setError("Please wait for all photos to finish uploading");
    if (photos.some((p) => p.error)) return setError("Some photos failed to upload. Please remove them or try again.");

    const photoUrls = photos.map((p) => p.url).filter((u: string | undefined): u is string => typeof u === "string" && u.length > 0);
    if (photoUrls.length === 0) return setError("Add at least 1 photo (this will be the cover)");

    const coverUrl = photoUrls[0];

    setSaving(true);

    let finalCity = city.trim();
    if (!finalCity && address && autocompleteRef.current && typeof autocompleteRef.current.getPlace === "function") {
      try {
        const place = autocompleteRef.current.getPlace();
        const comps = place?.address_components ?? [];
        const cityComponent = comps.find(
          (comp: any) =>
            comp.types.includes("locality") || comp.types.includes("administrative_area_level_1")
        );
        if (cityComponent) finalCity = cityComponent.long_name;
      } catch {
        // Ignore errors if Google Maps API is not available
      }
    }

    const payload = {
      title: title.trim(),
      description: description.trim() || null,
      city: finalCity || null,
      country: null,
      categories: validCategories.length > 0 ? validCategories : null,
      address: address.trim() || null,
      google_place_id: googlePlaceId,
      lat: lat !== null && lat !== undefined ? Number(lat) : null,
      lng: lng !== null && lng !== undefined ? Number(lng) : null,
      link: link.trim() || null,
      cover_url: coverUrl, // legacy
    };

    console.log("Updating place with payload:", payload);
    console.log("Coordinates:", { 
      lat, 
      lng, 
      hasCoordinates: lat !== null && lng !== null,
      latType: typeof lat,
      lngType: typeof lng,
      payloadLat: payload.lat,
      payloadLng: payload.lng,
    });

    const { error, data } = await supabase
      .from("places")
      .update(payload)
      .eq("id", placeId)
      .eq("created_by", userId)
      .select("id, lat, lng");
    
    if (error) {
      console.error("Update error:", error);
      setSaving(false);
      return setError(error.message || "Failed to save place. Please try again.");
    }
    
    if (data && data.length > 0) {
      console.log("Place updated, returned data:", data[0]);
    } else {
      console.warn("Update succeeded but no data returned");
    }

    const { data: authData } = await supabase.auth.getUser();
    const user = authData.user;
    if (!user) {
      setSaving(false);
      return setError("Not authenticated");
    }

    await supabase.from("place_photos").delete().eq("place_id", placeId).eq("user_id", user.id);

    const rows = photoUrls.map((url, i) => ({
      place_id: placeId,
      user_id: user.id,
      url,
      is_cover: i === 0,
      sort: i,
    }));

    const { error: photosError } = await supabase.from("place_photos").insert(rows);

    setSaving(false);

    if (photosError) return setError(photosError.message || "Failed to save photos. Please try again.");

    if (navigator.vibrate) navigator.vibrate(10);
    
    // Перенаправляем на страницу места с полной перезагрузкой для обновления данных
    window.location.href = `/id/${placeId}`;
  }

  async function deletePlace() {
    console.log("=== DELETE PLACE START ===");
    console.log("deletePlace called", { userId, placeId, deleting });
    
    if (!userId || !placeId) {
      const errorMsg = `User ID or Place ID is missing. userId: ${userId}, placeId: ${placeId}`;
      console.error(errorMsg);
      setError(errorMsg);
      return;
    }

    setDeleting(true);
    setError(null);

    try {
      // Сначала проверяем, что пользователь является создателем места
      const { data: placeCheck, error: checkError } = await supabase
        .from("places")
        .select("id, created_by, title")
        .eq("id", placeId)
        .single();

      if (checkError) {
        console.error("Error checking place:", checkError);
        const errorMsg = "Failed to verify place ownership. " + checkError.message;
        setError(errorMsg);
        setDeleting(false);
        // Не закрываем модальное окно, чтобы пользователь видел ошибку
        return;
      }

      if (!placeCheck) {
        console.error("Place not found:", placeId);
        setError("Place not found.");
        setDeleting(false);
        // Не закрываем модальное окно, чтобы пользователь видел ошибку
        return;
      }

      // Проверяем права: пользователь должен быть создателем ИЛИ администратором
      if (placeCheck.created_by !== userId && !isAdmin) {
        console.error("User is not the creator and not admin", { 
          placeCreatedBy: placeCheck.created_by, 
          currentUserId: userId,
          isAdmin: isAdmin
        });
        setError("You don't have permission to delete this place.");
        setDeleting(false);
        // Не закрываем модальное окно, чтобы пользователь видел ошибку
        return;
      }

      if (isAdmin && placeCheck.created_by !== userId) {
        console.log("Admin deleting place created by another user");
      }

      console.log("Deleting place:", { 
        placeId, 
        title: placeCheck.title,
        userId, 
        createdBy: placeCheck.created_by 
      });

      // Удаляем связанные данные сначала
      // 1. Удаляем фото
      const { error: photosError } = await supabase
        .from("place_photos")
        .delete()
        .eq("place_id", placeId);

      if (photosError) {
        console.warn("Warning deleting photos:", photosError);
        // Продолжаем удаление даже если фото не удалились
      } else {
        console.log("Photos deleted successfully");
      }

      // 2. Удаляем комментарии
      const { error: commentsError } = await supabase
        .from("comments")
        .delete()
        .eq("place_id", placeId);

      if (commentsError) {
        console.warn("Warning deleting comments:", commentsError);
        // Продолжаем удаление даже если комментарии не удалились
      } else {
        console.log("Comments deleted successfully");
      }

      // 3. Удаляем реакции (лайки)
      const { error: reactionsError } = await supabase
        .from("reactions")
        .delete()
        .eq("place_id", placeId);

      if (reactionsError) {
        console.warn("Warning deleting reactions:", reactionsError);
      } else {
        console.log("Reactions deleted successfully");
      }

      // 4. Удаляем само место
      console.log("Attempting to delete place from database...");
      // Администраторы могут удалять любые места, обычные пользователи - только свои
      let deleteQuery = supabase
        .from("places")
        .delete()
        .eq("id", placeId);
      
      // Если пользователь не администратор, добавляем проверку created_by
      if (!isAdmin) {
        deleteQuery = deleteQuery.eq("created_by", userId);
      }
      
      const { error: deleteError } = await deleteQuery;

      if (deleteError) {
        console.error("Error deleting place:", deleteError);
        console.error("Error details:", JSON.stringify(deleteError, null, 2));
        const errorMsg = deleteError.message || "Failed to delete place. Please try again.";
        setError(errorMsg);
        setDeleting(false);
        // Не закрываем модальное окно при ошибке, чтобы пользователь видел сообщение
        return;
      }

      console.log("Delete query executed successfully");

      // Небольшая задержка перед проверкой, чтобы дать базе данных время обработать удаление
      await new Promise(resolve => setTimeout(resolve, 500));

      // Проверяем, что место действительно удалено, делая повторный запрос
      const { data: verifyData, error: verifyError } = await supabase
        .from("places")
        .select("id")
        .eq("id", placeId)
        .maybeSingle();

      if (verifyError) {
        console.warn("Error verifying deletion:", verifyError);
        // Если ошибка при проверке, но не ошибка "not found", это может быть проблема
        if (verifyError.code !== 'PGRST116') {
          console.error("Unexpected error during verification:", verifyError);
          setError(`Failed to verify deletion: ${verifyError.message}. The place might still exist.`);
          setDeleting(false);
          return;
        }
        // PGRST116 означает "not found", что хорошо - место удалено
        console.log("Place not found (deleted successfully)");
      } else if (verifyData) {
        console.error("Place still exists after delete attempt!");
        console.error("This indicates an RLS (Row Level Security) policy issue.");
        console.error("The DELETE query executed, but RLS policy is preventing the actual deletion.");
        console.error("Solution: Run the SQL script 'fix-rls-policies.sql' in Supabase Dashboard > SQL Editor");
        setError("Failed to delete place. The database security policy (RLS) is blocking deletion. Please run the fix-rls-policies.sql script in Supabase Dashboard to fix this issue.");
        setDeleting(false);
        return;
      } else {
        // verifyData is null, что означает место не найдено - успешно удалено
        console.log("Place verified as deleted (not found in database)");
      }

      console.log("Place deleted successfully and verified");
      console.log("=== DELETE PLACE SUCCESS ===");

      // Закрываем модальное окно перед редиректом
      setDeleteConfirmOpen(false);
      setDeleting(false);

      if (navigator.vibrate) navigator.vibrate(10);
      
      // Перенаправляем на профиль с полной перезагрузкой
      console.log("Redirecting to profile page...");
      setTimeout(() => {
        window.location.href = "/profile";
      }, 100);
    } catch (err) {
      console.error("=== DELETE PLACE EXCEPTION ===");
      console.error("Exception deleting place:", err);
      console.error("Exception details:", err instanceof Error ? err.stack : String(err));
      setDeleting(false);
      // Не закрываем модальное окно при ошибке
      setError(err instanceof Error ? err.message : "An error occurred while deleting the place.");
    }
  }

  function handleBack() {
    router.push(`/id/${placeId}`);
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#faf9f7] flex items-center justify-center">
        <div className="text-sm text-[#6b7d47]/60">Loading…</div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#faf9f7]">
      <div className="bg-[#6b7d47] text-white">
        <div className="mx-auto max-w-md px-4 pt-safe-top pt-3 pb-6">
          <div className="flex items-center justify-between mb-4">
            <button onClick={handleBack} className="text-white/90 hover:text-white transition">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div className="text-lg font-semibold">Edit place</div>
            <button
              onClick={savePlace}
              disabled={saving || !canSave}
              className={cx(
                "px-4 py-1.5 rounded-xl text-sm font-medium transition",
                canSave && !saving ? "bg-white/20 text-white hover:bg-white/30" : "bg-white/10 text-white/50 cursor-not-allowed"
              )}
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
          <div className="text-sm text-white/80">Cover photo is required (min 1)</div>
        </div>
        <div className="h-4 bg-[#faf9f7] rounded-t-3xl"></div>
      </div>

      <div className="mx-auto max-w-md px-4 pb-10 -mt-4">
        <div className="rounded-3xl bg-white shadow-sm border border-[#6b7d47]/10">
          <div className="p-5 space-y-6">
            <section>
              <div className="flex items-center justify-between mb-3">
                <div className="text-sm font-semibold text-[#2d2d2d]">Photos</div>
                <label className="cursor-pointer rounded-xl bg-[#6b7d47] text-white px-4 py-2 text-xs font-medium hover:bg-[#556036] transition active:scale-[0.98]">
                  + Add photos
                  <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => onPickFiles(e.target.files)} />
                </label>
              </div>

              {photos.length === 0 ? (
                <div className="mt-3 rounded-2xl border-2 border-dashed border-[#6b7d47]/20 bg-[#f5f4f2] p-8 text-center">
                  <div className="text-sm text-[#6b7d47]/70">Add at least 1 photo (this will be the cover)</div>
                </div>
              ) : (
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {photos.map((p, idx) => (
                    <div key={p.preview} className="relative" style={{ animation: "fadeInScale 0.3s ease-out forwards" }}>
                      <img src={p.url || p.preview} alt="" className="h-24 w-full rounded-2xl object-cover border border-[#6b7d47]/10" />

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

            <section>
              <label className="text-xs font-medium text-[#6b7d47] mb-2 block">
                Categories <span className="text-[#6b7d47]/60 font-normal ml-1">(optional)</span>
              </label>
              <div className="mt-2 flex flex-wrap gap-2">
                {CATEGORIES.map((cat) => (
                  <Pill
                    key={cat}
                    active={categories.includes(cat)}
                    onClick={() => {
                      setCategories((prev) => (prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]));
                    }}
                  >
                    {cat}
                  </Pill>
                ))}
              </div>
              {categories.length === 0 && <div className="mt-2 text-xs text-[#6b7d47]/60">Pick what best describes the vibe</div>}
            </section>

            <section>
              <label className="text-xs font-medium text-[#6b7d47] mb-2 block">Location</label>

              <div className="mb-3">
                <input
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="City"
                  className="w-full rounded-xl border border-[#6b7d47]/20 bg-[#f5f4f2] px-4 py-3 text-sm text-[#2d2d2d] placeholder:text-[#6b7d47]/40 outline-none focus:bg-white focus:border-[#6b7d47]/40 transition"
                />
              </div>

              <AddressAutocomplete
                value={address}
                onChange={(value) => {
                  setAddress(value);
                  setGooglePlaceId(null);
                  setLat(null);
                  setLng(null);
                }}
                onPlaceSelect={(place) => {
                  setAddress(place.address);
                  setGooglePlaceId(place.googlePlaceId);
                  setLat(place.lat);
                  setLng(place.lng);
                  if (place.city && !city) {
                    setCity(place.city);
                  }
                }}
                onAutocompleteRef={(ref) => {
                  autocompleteRef.current = ref;
                }}
              />

              <div className="mt-2 text-xs text-[#6b7d47]/60">We store address + Google place ID</div>
            </section>

            <section>
              <label className="text-xs font-medium text-[#6b7d47] mb-2 block">
                Link <span className="text-[#6b7d47]/60 font-normal ml-1">(optional)</span>
              </label>
              <input
                value={link}
                onChange={(e) => setLink(e.target.value)}
                placeholder="https://"
                className="w-full rounded-xl border border-[#6b7d47]/20 bg-[#f5f4f2] px-4 py-3 text-sm text-[#2d2d2d] placeholder:text-[#6b7d47]/40 outline-none focus:bg-white focus:border-[#6b7d47]/40 transition"
              />
            </section>

            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50/50 p-3 text-sm text-red-700">{error}</div>
            )}

            <div className="space-y-3 pt-4 border-t border-[#6b7d47]/10 mt-4">
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => router.push(`/id/${placeId}`)}
                  className="flex-1 rounded-xl border border-[#6b7d47]/20 bg-white px-4 py-3 text-sm font-medium text-[#6b7d47] hover:bg-[#f5f4f2] transition active:scale-[0.98]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={savePlace}
                  disabled={saving || !canSave}
                  className={cx(
                    "flex-1 rounded-xl px-4 py-3 text-sm font-medium transition active:scale-[0.98]",
                    canSave && !saving ? "bg-[#6b7d47] text-white hover:bg-[#556036]" : "bg-[#6b7d47]/40 text-white/70 cursor-not-allowed"
                  )}
                >
                  {saving ? "Saving changes…" : "Save changes"}
                </button>
              </div>

              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  console.log("Delete button clicked");
                  setDeleteConfirmOpen(true);
                }}
                disabled={deleting}
                className="w-full rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700 hover:bg-red-100 transition active:scale-[0.98] disabled:opacity-50"
              >
                {deleting ? "Deleting…" : "Delete place"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {deleteConfirmOpen && (
        <div className="fixed inset-0 z-50">
          <button 
            className="absolute inset-0 bg-black/40 backdrop-blur-sm" 
            onClick={(e) => {
              if (!deleting) {
                setDeleteConfirmOpen(false);
              }
            }} 
            aria-label="Close"
            disabled={deleting}
          />
          <div 
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 mx-4 w-full max-w-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="rounded-2xl bg-white shadow-xl border border-[#6b7d47]/10 p-6">
              <div className="text-lg font-semibold text-[#2d2d2d] mb-2">Delete place</div>
              <div className="text-sm text-[#6b7d47]/70 mb-6">
                This action cannot be undone. The place will be permanently deleted.
              </div>
              {error && (
                <div className="mb-4 rounded-xl border border-red-200 bg-red-50/50 p-3 text-sm text-red-700">{error}</div>
              )}
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (!deleting) {
                      setDeleteConfirmOpen(false);
                      setError(null);
                    }
                  }}
                  disabled={deleting}
                  className="flex-1 rounded-xl border border-[#6b7d47]/20 bg-white px-4 py-3 text-sm font-medium text-[#6b7d47] hover:bg-[#f5f4f2] transition active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={async (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    console.log("Confirm delete button clicked");
                    await deletePlace();
                  }}
                  disabled={deleting}
                  className="flex-1 rounded-xl bg-red-600 text-white px-4 py-3 text-sm font-medium hover:bg-red-700 transition active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {deleting ? "Deleting…" : "Delete"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}