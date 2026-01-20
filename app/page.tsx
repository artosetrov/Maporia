"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { GoogleMap, Marker, InfoWindow, useJsApiLoader } from "@react-google-maps/api";
import { CATEGORIES } from "./constants";
import TopBar from "./components/TopBar";
import BottomNav from "./components/BottomNav";
import PlaceCard from "./components/PlaceCard";
import Pill from "./components/Pill";
import { GOOGLE_MAPS_LIBRARIES, getGoogleMapsApiKey } from "./config/googleMaps";
import { supabase } from "./lib/supabase";

type Place = {
  id: string;
  title: string;
  description: string | null;
  city: string | null;
  country: string | null;
  address: string | null;
  cover_url: string | null;
  categories: string[] | null;
  tags: string[] | null;
  lat: number | null;
  lng: number | null;
  created_at: string;
};

function cx(...a: Array<string | false | undefined | null>) {
  return a.filter(Boolean).join(" ");
}

function initialsFromEmail(email?: string | null) {
  if (!email) return "U";
  const name = email.split("@")[0] || "U";
  const parts = name.split(/[.\-_]/).filter(Boolean);
  const a = (parts[0]?.[0] ?? name[0] ?? "U").toUpperCase();
  const b = (parts[1]?.[0] ?? name[1] ?? "").toUpperCase();
  return (a + b).slice(0, 2);
}

function timeAgo(iso: string) {
  const d = new Date(iso).getTime();
  const diff = Date.now() - d;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  return `${days}d ago`;
}

export default function HomePage() {
  const router = useRouter();
  const [view, setView] = useState<"list" | "map">("map");
  const [searchFocused, setSearchFocused] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [hoveredPlaceId, setHoveredPlaceId] = useState<string | null>(null);
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number } | null>(null);
  const [mapZoom, setMapZoom] = useState<number | null>(null);

  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [userDisplayName, setUserDisplayName] = useState<string | null>(null);
  const [userAvatar, setUserAvatar] = useState<string | null>(null);

  const [places, setPlaces] = useState<Place[]>([]);
  const [loading, setLoading] = useState(true);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());

  // search + filters
  const [searchDraft, setSearchDraft] = useState("");
  const [q, setQ] = useState("");
  const [city, setCity] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedTag, setSelectedTag] = useState<string>("");

  // modal
  const [filterOpen, setFilterOpen] = useState(false);

  const cities = useMemo(() => {
    const list = Array.from(new Set(places.map((p) => p.city).filter(Boolean))) as string[];
    list.sort((a, b) => a.localeCompare(b));
    return list;
  }, [places]);

  // Получаем популярные теги из всех мест
  const popularTags = useMemo(() => {
    const tagCounts = new Map<string, number>();
    places.forEach((place) => {
      if (place.tags && Array.isArray(place.tags)) {
        place.tags.forEach((tag) => {
          tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
        });
      }
    });
    const sortedTags = Array.from(tagCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([tag]) => tag);
    return sortedTags;
  }, [places]);

  async function loadUser() {
    const { data } = await supabase.auth.getUser();
    const u = data.user;
    if (!u) {
      setUserEmail(null);
      setUserId(null);
      setUserDisplayName(null);
      return;
    }
    setUserEmail(u.email ?? null);
    setUserId(u.id);

    // Загружаем профиль для получения display_name и avatar_url
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("display_name, avatar_url")
      .eq("id", u.id)
      .maybeSingle();
    
    if (profileError) {
      console.error("Error loading user profile:", profileError);
    }
    
    if (profile?.display_name) {
      setUserDisplayName(profile.display_name);
    } else {
      setUserDisplayName(u.email?.split("@")[0] || null);
    }
    
    if (profile?.avatar_url) {
      setUserAvatar(profile.avatar_url);
    }
  }

  async function loadPlaces() {
    setLoading(true);

    let query = supabase.from("places").select("*").order("created_at", { ascending: false });

    if (city) query = query.ilike("city", city);

    // Фильтрация по категориям - если выбраны категории, проверяем что place.categories содержит хотя бы одну из них
    if (selectedCategories.length > 0) {
      // Используем overlaps для проверки пересечения массивов
      query = query.overlaps("categories", selectedCategories);
    }

    if (q.trim()) {
      const s = q.trim();
      query = query.or(`title.ilike.%${s}%,description.ilike.%${s}%,country.ilike.%${s}%`);
    }

    if (selectedTag) {
      query = query.contains("tags", [selectedTag]);
    }

    const { data, error } = await query;
    console.log("places data", data, error);
    
    if (error) {
      console.error("Error loading places:", error);
      setPlaces([]);
    } else if (!data || data.length === 0) {
      console.log("No places found");
      setPlaces([]);
    } else {
      const placesWithCoords = (data ?? []).map((p: any) => ({
        ...p,
        lat: p.lat ?? null,
        lng: p.lng ?? null,
      }));
      const placesWithValidCoords = placesWithCoords.filter((p: any) => p.lat !== null && p.lng !== null);
      console.log("Loaded places:", placesWithCoords.length, "places with coordinates:", placesWithValidCoords.length);
      
      // Логируем места без координат для отладки
      const placesWithoutCoords = placesWithCoords.filter((p: any) => p.lat === null || p.lng === null);
      if (placesWithoutCoords.length > 0) {
        console.warn("Places without coordinates:", placesWithoutCoords.map((p: any) => ({
          id: p.id,
          title: p.title,
          address: p.address,
          lat: p.lat,
          lng: p.lng,
        })));
      }
      
      setPlaces(placesWithCoords as Place[]);
    }

    setLoading(false);
  }


  useEffect(() => {
    (async () => {
      await loadUser();
      await loadPlaces();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Загружаем избранное пользователя
  useEffect(() => {
    if (!userId) {
      setFavorites(new Set());
      return;
    }

    (async () => {
      try {
        const { data, error } = await supabase
          .from("reactions")
          .select("place_id")
          .eq("user_id", userId)
          .eq("reaction", "like");

        if (error) {
          console.error("Error loading favorites:", error);
          return;
        }

        if (data) {
          setFavorites(new Set(data.map((r) => r.place_id)));
        }
      } catch (err) {
        console.error("Exception loading favorites:", err);
      }
    })();
  }, [userId]);

  useEffect(() => {
    loadPlaces();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, city, selectedCategories, selectedTag]);

  // Live search: автоматически применяем поиск при вводе (с небольшой задержкой)
  useEffect(() => {
    const timer = setTimeout(() => {
      setQ(searchDraft);
    }, 300); // Debounce 300ms

    return () => clearTimeout(timer);
  }, [searchDraft]);

  function applySearch() {
    setQ(searchDraft);
  }

  function resetFilters() {
    setCity("");
    setSelectedCategories([]);
    setQ("");
    setSearchDraft("");
    setSelectedTag("");
  }

  function toggleCategory(category: string) {
    setSelectedCategories((prev) =>
      prev.includes(category) ? prev.filter((c) => c !== category) : [...prev, category]
    );
  }

  async function toggleFavorite(placeId: string, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();

    if (!userId) {
      router.push("/auth");
      return;
    }

    const isCurrentlyFavorite = favorites.has(placeId);

    try {
      if (isCurrentlyFavorite) {
        // Удаляем из избранного
        const { error } = await supabase
          .from("reactions")
          .delete()
          .eq("place_id", placeId)
          .eq("user_id", userId)
          .eq("reaction", "like");

        if (error) {
          console.error("Error removing favorite:", error);
          alert("Failed to remove from favorites: " + error.message);
        } else {
          setFavorites((prev) => {
            const next = new Set(prev);
            next.delete(placeId);
            return next;
          });
        }
      } else {
        // Добавляем в избранное
        const { error } = await supabase
          .from("reactions")
          .insert({
            place_id: placeId,
            user_id: userId,
            reaction: "like",
          });

        if (error) {
          console.error("Error adding favorite:", error);
          alert("Failed to add to favorites: " + error.message);
        } else {
          setFavorites((prev) => new Set(prev).add(placeId));
        }
      }
    } catch (err) {
      console.error("Toggle favorite error:", err);
      alert("An error occurred. Check console for details.");
    }
  }

  // Count active filters for badge
  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (selectedCategories.length > 0) count += selectedCategories.length;
    if (city) count += 1;
    if (q.trim()) count += 1;
    if (selectedTag) count += 1;
    return count;
  }, [selectedCategories, city, q, selectedTag]);

  // Quick search chips
  const quickSearchChips = ["Romantic", "Quiet", "Sunset", "Coffee", "Nature"];

  return (
    <main className="h-screen bg-[#faf9f7] flex flex-col overflow-hidden">
      <TopBar
        showDesktopTabs={true}
        userAvatar={userAvatar}
        userDisplayName={userDisplayName}
        userEmail={userEmail}
        left={
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
        }
        right={
          <div className="flex items-center gap-3">
            {/* Toggle only on mobile/tablet (hidden on desktop ≥1024px) */}
            <div className="flex items-center gap-2 lg:hidden">
              <span className="text-xs font-medium text-[#6b7d47]/70 hidden sm:inline">Map</span>
              <button
                onClick={() => setView(view === "map" ? "list" : "map")}
                className={cx(
                  "relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-[#6b7d47] focus:ring-offset-2",
                  view === "list" ? "bg-[#6b7d47]" : "bg-gray-300"
                )}
                role="switch"
                aria-checked={view === "list"}
              >
                <span
                  className={cx(
                    "inline-block h-5 w-5 transform rounded-full bg-white shadow-lg transition-transform",
                    view === "list" ? "translate-x-6" : "translate-x-0.5"
                  )}
                />
              </button>
              <span className="text-xs font-medium text-[#6b7d47]/70 hidden sm:inline">List</span>
            </div>
          </div>
        }
      />

      {/* MAIN CONTENT - Responsive layout */}
      <div className="flex-1 min-h-0 pt-[64px] overflow-hidden">
        {/* Desktop: Split view (≥1024px) */}
        <div className="hidden lg:flex h-full">
          {/* Left: Scrollable list */}
          <div className="w-1/2 overflow-y-auto px-4">
            {/* Search and Filter Bar */}
            <div className="sticky top-0 z-30 bg-[#faf9f7] pt-4 pb-3 border-b border-[#6b7d47]/10 mb-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="flex-1 relative">
                  <input
                    value={searchDraft}
                    onChange={(e) => setSearchDraft(e.target.value)}
                    onFocus={() => setSearchFocused(true)}
                    onBlur={() => setTimeout(() => setSearchFocused(false), 200)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        setSearchFocused(false);
                      }
                    }}
                    placeholder="Search by vibe, mood, or place"
                    className="w-full h-10 rounded-xl border border-[#6b7d47]/20 bg-white px-4 pl-10 text-sm text-[#2d2d2d] placeholder:text-[#6b7d47]/50 outline-none focus:border-[#6b7d47]/40 focus:bg-white transition"
                  />
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#6b7d47]/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
                <button
                  onClick={() => setFilterOpen(true)}
                  className="h-10 w-10 rounded-xl flex items-center justify-center text-[#556036] hover:bg-[#f5f4f2] transition relative border border-[#6b7d47]/20"
                  aria-label="Filters"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                  </svg>
                  {activeFiltersCount > 0 && (
                    <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-[#6b7d47] text-white text-[10px] font-medium flex items-center justify-center">
                      {activeFiltersCount > 9 ? "9+" : activeFiltersCount}
                    </span>
                  )}
                </button>
              </div>
              {/* Quick search chips - always visible */}
              <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
                {quickSearchChips.map((chip) => (
                  <button
                    key={chip}
                    onClick={() => {
                      setSearchDraft(chip);
                      setSearchFocused(false);
                    }}
                    className="shrink-0 rounded-full px-3 py-1.5 text-xs font-medium text-[#556036] bg-white border border-[#6b7d47]/20 hover:bg-[#f5f4f2] transition whitespace-nowrap"
                  >
                    {chip}
                  </button>
                ))}
              </div>
            </div>
            {loading ? (
              <Empty text="Loading…" />
            ) : places.length === 0 ? (
              <Empty text="No places with this vibe yet. Try fewer filters." />
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {places.map((p) => {
                  const isFavorite = favorites.has(p.id);
                  const isHovered = hoveredPlaceId === p.id || selectedPlaceId === p.id;
                  return (
                    <div
                      key={p.id}
                      onMouseEnter={() => setHoveredPlaceId(p.id)}
                      onMouseLeave={() => setHoveredPlaceId(null)}
                      onClick={() => {
                        setSelectedPlaceId(p.id);
                        // Обновляем карту только если есть координаты
                        if (p.lat != null && p.lng != null) {
                          setMapCenter({ lat: p.lat, lng: p.lng });
                          setMapZoom(15);
                        }
                      }}
                      className={`transition-all relative z-0 ${isHovered ? "ring-2 ring-[#6b7d47]/30 ring-offset-2 rounded-xl" : ""}`}
                    >
                      <PlaceCard
                        place={p}
                        favoriteButton={
                          userId ? (
                            <button
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                toggleFavorite(p.id, e);
                              }}
                              className={`h-8 w-8 rounded-full bg-white border border-[#6b7d47]/20 hover:bg-[#f5f4f2] hover:border-[#6b7d47]/40 flex items-center justify-center transition shadow-sm ${
                                isFavorite ? "bg-[#6b7d47]/10 border-[#6b7d47]/30" : ""
                              }`}
                              title={isFavorite ? "Remove from favorites" : "Add to favorites"}
                            >
                              <svg
                                className={`w-4 h-4 transition-transform ${
                                  isFavorite 
                                    ? "text-[#6b7d47] scale-110" 
                                    : "text-[#6b7d47]/60"
                                }`}
                                fill={isFavorite ? "currentColor" : "none"}
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
                                />
                              </svg>
                            </button>
                          ) : undefined
                        }
                        onTagClick={(tag) => {
                          setSelectedTag(tag);
                          setFilterOpen(true);
                        }}
                        onPhotoClick={() => {
                          router.push(`/id/${p.id}`);
                        }}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right: Sticky map */}
          <div className="w-1/2 h-full">
            <MapView
              places={places}
              loading={loading}
              selectedPlaceId={hoveredPlaceId || selectedPlaceId}
              mapCenter={mapCenter}
              mapZoom={mapZoom}
              onMapStateChange={(center, zoom) => {
                setMapCenter(center);
                setMapZoom(zoom);
              }}
            />
          </div>
        </div>

        {/* Mobile/Tablet: Toggle view (≤1023px) */}
        <div className="lg:hidden h-full flex flex-col transition-opacity duration-300">
          {/* Search and Filter for Mobile */}
          <div className="sticky top-[64px] z-30 bg-[#faf9f7] pb-4 -mt-4 px-4 flex-shrink-0">
            <div className="flex items-center gap-2 mb-2">
              <div className="relative flex-1">
                <input
                  value={searchDraft}
                  onChange={(e) => setSearchDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      applySearch();
                    }
                  }}
                  placeholder="Search by vibe, mood, or place"
                  className="w-full rounded-xl border border-[#6b7d47]/20 bg-white px-4 py-2.5 pl-10 text-sm text-[#2d2d2d] placeholder:text-[#6b7d47]/50 outline-none focus:border-[#6b7d47]/40 focus:bg-white transition"
                />
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#6b7d47]/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <button
                onClick={() => setFilterOpen(true)}
                className="h-10 w-10 rounded-xl flex items-center justify-center text-[#556036] hover:bg-[#f5f4f2] transition relative border border-[#6b7d47]/20"
                aria-label="Filters"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                </svg>
                {activeFiltersCount > 0 && (
                  <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-[#6b7d47] text-white text-[10px] font-medium flex items-center justify-center">
                    {activeFiltersCount > 9 ? "9+" : activeFiltersCount}
                  </span>
                )}
              </button>
            </div>
            {/* Quick search chips - always visible */}
            <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
              {quickSearchChips.map((chip) => (
                <button
                  key={chip}
                  onClick={() => {
                    setSearchDraft(chip);
                    setQ(chip);
                  }}
                  className="shrink-0 rounded-full px-3 py-1.5 text-xs font-medium text-[#556036] bg-white border border-[#6b7d47]/20 hover:bg-[#f5f4f2] transition whitespace-nowrap"
                >
                  {chip}
                </button>
              ))}
            </div>
          </div>
          {view === "map" ? (
            <div className="flex-1 min-h-0">
              <MapView
                places={places}
                loading={loading}
                selectedPlaceId={selectedPlaceId}
                mapCenter={mapCenter}
                mapZoom={mapZoom}
                onMapStateChange={(center, zoom) => {
                  setMapCenter(center);
                  setMapZoom(zoom);
                }}
              />
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto px-4 pt-4 pb-20">
              {loading ? (
                <Empty text="Loading…" />
              ) : places.length === 0 ? (
                <Empty text="No places with this vibe yet. Try fewer filters." />
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {places.map((p) => {
                    const isFavorite = favorites.has(p.id);
                    return (
                      <PlaceCard
                        key={p.id}
                        place={p}
                        favoriteButton={
                          userId ? (
                            <button
                              onClick={(e) => {
                                e.preventDefault();
                                toggleFavorite(p.id, e);
                              }}
                              className="h-8 w-8 rounded-full bg-black/50 hover:bg-black/70 flex items-center justify-center transition backdrop-blur-sm"
                              title={isFavorite ? "Remove from favorites" : "Add to favorites"}
                            >
                              <svg
                                className={`w-4 h-4 text-white transition-transform ${isFavorite ? "scale-110" : ""}`}
                                fill={isFavorite ? "currentColor" : "none"}
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
                                />
                              </svg>
                            </button>
                          ) : undefined
                        }
                        onTagClick={(tag) => {
                          setSelectedTag(tag);
                          setFilterOpen(true);
                        }}
                        onPhotoClick={() => {
                          router.push(`/id/${p.id}`);
                        }}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <BottomNav />

      {/* FILTER MODAL */}
      {filterOpen && (
        <div className="fixed inset-0 z-50">
          <button
            className="absolute inset-0 bg-black/40"
            onClick={() => setFilterOpen(false)}
            aria-label="Close"
          />

          <div className="absolute left-0 right-0 bottom-0 bg-white rounded-t-3xl shadow-2xl border-t border-[#6b7d47]/10 overflow-hidden max-h-[80vh]">
              <div className="px-5 py-4 overflow-y-auto max-h-[calc(80vh-80px)]">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <div className="text-xs text-[#6b7d47]/60">Maporia</div>
                    <div className="text-lg font-semibold text-[#2d2d2d]">Filters</div>
                  </div>

                  <button
                    onClick={() => setFilterOpen(false)}
                    className="h-9 w-9 rounded-xl border border-[#6b7d47]/20 bg-[#f5f4f2] hover:bg-[#6b7d47]/10 text-[#6b7d47] transition"
                  >
                    ✕
                  </button>
                </div>
                
                {/* Active filters count */}
                <div className="mb-4 text-sm text-[#6b7d47]/70">
                  {places.length} {places.length === 1 ? "place" : "places"} match
                </div>

              <div className="mt-4 space-y-3">
                <div>
                  <label className="text-xs font-medium text-[#6b7d47] mb-2 block">Categories</label>
                  <div className="flex flex-wrap gap-2">
                    {CATEGORIES.map((cat) => (
                      <button
                        key={cat}
                        onClick={() => toggleCategory(cat)}
                        className={cx(
                          "px-3 py-2 rounded-full text-sm border transition",
                          selectedCategories.includes(cat)
                            ? "bg-[#6b7d47] text-white border-[#6b7d47]"
                            : "bg-white border-[#6b7d47]/20 text-[#2d2d2d] hover:bg-[#f5f4f2]"
                        )}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                  {selectedCategories.length > 0 && (
                    <button
                      onClick={() => setSelectedCategories([])}
                      className="mt-2 text-xs text-[#6b7d47]/70 hover:text-[#556036]"
                    >
                      Clear all
                    </button>
                  )}
                </div>

                <div>
                  <label className="text-xs font-medium text-[#6b7d47] mb-2 block">City</label>
                  <select
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="w-full rounded-xl border border-[#6b7d47]/20 bg-[#f5f4f2] px-4 py-3 text-sm outline-none focus:bg-white focus:border-[#6b7d47]/40 text-[#2d2d2d] transition"
                  >
                    <option value="">All cities</option>
                    {cities.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-medium text-[#6b7d47] mb-2 block">Search</label>
                  <input
                    value={q}
                    onChange={(e) => {
                      setQ(e.target.value);
                      setSearchDraft(e.target.value);
                    }}
                    placeholder="Title, country, description…"
                    className="w-full rounded-xl border border-[#6b7d47]/20 bg-[#f5f4f2] px-4 py-3 text-sm outline-none focus:bg-white focus:border-[#6b7d47]/40 text-[#2d2d2d] transition"
                  />
                </div>

                {selectedTag && (
                  <div>
                    <label className="text-xs font-medium text-[#6b7d47] mb-2 block">Selected Tag</label>
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-[#6b7d47]/10 text-[#556036] px-3 py-2 text-sm font-medium border border-[#6b7d47]/20">
                        #{selectedTag}
                      </span>
                      <button
                        onClick={() => setSelectedTag("")}
                        className="text-xs text-[#6b7d47]/70 hover:text-[#556036]"
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-6 flex gap-2 sticky bottom-0 bg-white pt-4 pb-2">
                <button
                  onClick={resetFilters}
                  className="flex-1 rounded-xl border border-[#6b7d47]/20 bg-white px-4 py-3 text-sm font-medium text-[#6b7d47] hover:bg-[#f5f4f2] transition"
                >
                  Reset
                </button>
                <button
                  onClick={() => setFilterOpen(false)}
                  className="flex-1 rounded-xl bg-[#6b7d47] text-white px-4 py-3 text-sm font-medium hover:bg-[#556036] transition"
                >
                  Apply
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-white border border-[#6b7d47]/10 shadow-sm p-4 hover:shadow-md transition cursor-pointer">
      {children}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="text-sm text-[#6b7d47]/60 py-10">{text}</div>;
}

// Функция для создания круглого изображения
function createRoundIcon(imageUrl: string, size: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Could not get canvas context"));
        return;
      }
      
      // Создаем круглую обрезку
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, size / 2, 0, 2 * Math.PI);
      ctx.clip();
      
      // Рисуем изображение
      ctx.drawImage(img, 0, 0, size, size);
      
      // Добавляем белую обводку
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, size / 2 - 2, 0, 2 * Math.PI);
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 3;
      ctx.stroke();
      
      resolve(canvas.toDataURL());
    };
    img.onerror = reject;
    img.src = imageUrl;
  });
}

function MapView({
  places,
  loading,
  selectedPlaceId: externalSelectedPlaceId,
  mapCenter: externalMapCenter,
  mapZoom: externalMapZoom,
  onMapStateChange,
}: {
  places: Place[];
  loading: boolean;
  selectedPlaceId?: string | null;
  mapCenter?: { lat: number; lng: number } | null;
  mapZoom?: number | null;
  onMapStateChange?: (center: { lat: number; lng: number }, zoom: number) => void;
}) {
  const [internalSelectedPlaceId, setInternalSelectedPlaceId] = useState<string | null>(null);
  const [roundIcons, setRoundIcons] = useState<Map<string, string>>(new Map());
  const [mapInstance, setMapInstance] = useState<google.maps.Map | null>(null);
  const isUpdatingFromPropsRef = useRef(false);
  const lastReportedStateRef = useRef<{ center: { lat: number; lng: number }; zoom: number } | null>(null);
  const onMapStateChangeRef = useRef(onMapStateChange);
  
  // Обновляем ref при изменении callback
  useEffect(() => {
    onMapStateChangeRef.current = onMapStateChange;
  }, [onMapStateChange]);
  const { isLoaded } = useJsApiLoader({
    id: "google-maps-loader",
    googleMapsApiKey: getGoogleMapsApiKey(),
    libraries: GOOGLE_MAPS_LIBRARIES,
  });

  const selectedPlaceId = externalSelectedPlaceId ?? internalSelectedPlaceId;

  const placesWithCoords = useMemo(
    () => places.filter((p) => p.lat != null && p.lng != null),
    [places]
  );

  // Создаем круглые иконки для всех мест
  useEffect(() => {
    if (!isLoaded) return;
    
    for (const place of placesWithCoords) {
      if (place.cover_url) {
        const smallKey = `${place.id}-small`;
        const largeKey = `${place.id}-large`;
        
        setRoundIcons(prev => {
          const needsSmall = !prev.has(smallKey);
          const needsLarge = !prev.has(largeKey);
          
          if (needsSmall) {
            createRoundIcon(place.cover_url!, 36)
              .then(smallIcon => {
                setRoundIcons(current => {
                  if (!current.has(smallKey)) {
                    return new Map(current).set(smallKey, smallIcon);
                  }
                  return current;
                });
              })
              .catch(err => console.error("Error creating small round icon:", err));
          }
          
          if (needsLarge) {
            createRoundIcon(place.cover_url!, 44)
              .then(largeIcon => {
                setRoundIcons(current => {
                  if (!current.has(largeKey)) {
                    return new Map(current).set(largeKey, largeIcon);
                  }
                  return current;
                });
              })
              .catch(err => console.error("Error creating large round icon:", err));
          }
          
          return prev;
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placesWithCoords.map(p => `${p.id}-${p.cover_url || ''}`).join(','), isLoaded]);

  // Вычисляем центр карты на основе всех мест с координатами или используем внешний
  const center = useMemo(() => {
    if (externalMapCenter) return externalMapCenter;
    if (placesWithCoords.length === 0) {
      return { lat: 0, lng: 0 };
    }
    const avgLat =
      placesWithCoords.reduce((sum, p) => sum + (p.lat ?? 0), 0) / placesWithCoords.length;
    const avgLng =
      placesWithCoords.reduce((sum, p) => sum + (p.lng ?? 0), 0) / placesWithCoords.length;
    return { lat: avgLat, lng: avgLng };
  }, [placesWithCoords, externalMapCenter]);

  // Вычисляем zoom
  const zoom = useMemo(() => {
    if (externalMapZoom !== null && externalMapZoom !== undefined) return externalMapZoom;
    if (placesWithCoords.length === 1) return 15;
    if (placesWithCoords.length === 0) return 2;
    return 10;
  }, [placesWithCoords.length, externalMapZoom]);

  // Обновляем карту при изменении внешних пропсов center/zoom
  useEffect(() => {
    if (!mapInstance) return;
    if (externalMapCenter && externalMapZoom !== null && externalMapZoom !== undefined) {
      isUpdatingFromPropsRef.current = true;
      mapInstance.panTo(externalMapCenter);
      mapInstance.setZoom(externalMapZoom);
      lastReportedStateRef.current = { center: externalMapCenter, zoom: externalMapZoom };
      // Сбрасываем флаг после небольшой задержки
      setTimeout(() => {
        isUpdatingFromPropsRef.current = false;
      }, 100);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalMapCenter, externalMapZoom, mapInstance]);

  // Убрали автоматическое перемещение и увеличение карты при выборе места
  // Теперь карточка просто появляется без изменения масштаба и позиции карты

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Empty text="Loading…" />
      </div>
    );
  }

  if (placesWithCoords.length === 0) {
    return (
      <div className="h-full flex items-center justify-center px-4">
        <div className="text-center">
          <div className="text-sm font-medium text-[#2d2d2d] mb-1">No places yet</div>
          <div className="text-xs text-[#6b7d47]/60">
            Add places with coordinates to see them on the map.
          </div>
        </div>
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className="h-full flex items-center justify-center">
        <Empty text="Loading map…" />
      </div>
    );
  }

  return (
    <div className="relative h-full w-full transition-all duration-300">
      <div className="absolute inset-0">
        <GoogleMap
          mapContainerStyle={{ width: "100%", height: "100%" }}
          center={center}
          zoom={zoom}
          onLoad={(map) => setMapInstance(map)}
          onClick={() => {
            // Close InfoWindow when clicking on the map
            if (!externalSelectedPlaceId) {
              setInternalSelectedPlaceId(null);
            }
          }}
          onDragEnd={() => {
            if (isUpdatingFromPropsRef.current) return;
            if (mapInstance && onMapStateChangeRef.current) {
              const center = mapInstance.getCenter();
              const zoom = mapInstance.getZoom();
              if (center && zoom !== undefined) {
                const newState = { lat: center.lat(), lng: center.lng() };
                // Проверяем, изменилось ли состояние
                const lastState = lastReportedStateRef.current;
                if (!lastState || 
                    Math.abs(lastState.center.lat - newState.lat) > 0.0001 ||
                    Math.abs(lastState.center.lng - newState.lng) > 0.0001 ||
                    lastState.zoom !== zoom) {
                  lastReportedStateRef.current = { center: newState, zoom };
                  onMapStateChangeRef.current(newState, zoom);
                }
              }
            }
          }}
          onZoomChanged={() => {
            if (isUpdatingFromPropsRef.current) return;
            if (mapInstance && onMapStateChangeRef.current) {
              const center = mapInstance.getCenter();
              const zoom = mapInstance.getZoom();
              if (center && zoom !== undefined) {
                const newState = { lat: center.lat(), lng: center.lng() };
                // Проверяем, изменилось ли состояние
                const lastState = lastReportedStateRef.current;
                if (!lastState || 
                    Math.abs(lastState.center.lat - newState.lat) > 0.0001 ||
                    Math.abs(lastState.center.lng - newState.lng) > 0.0001 ||
                    lastState.zoom !== zoom) {
                  lastReportedStateRef.current = { center: newState, zoom };
                  onMapStateChangeRef.current(newState, zoom);
                }
              }
            }
          }}
          options={{
            disableDefaultUI: false,
            zoomControl: true,
            streetViewControl: false,
            mapTypeControl: false,
            fullscreenControl: false,
            styles: [
              {
                featureType: "poi",
                elementType: "labels",
                stylers: [{ visibility: "off" }],
              },
            ],
          }}
        >
          {placesWithCoords.map((place) => {
            if (typeof window === "undefined" || !(window as any).google?.maps) return null;
            
            const coverUrl = place.cover_url;
            const isSelected = selectedPlaceId === place.id;
            const iconSize = isSelected ? 44 : 36;
            
            let iconConfig: any;
            
            if (coverUrl) {
              const iconKey = `${place.id}-${isSelected ? "large" : "small"}`;
              const roundIconUrl = roundIcons.get(iconKey);
              
              if (roundIconUrl) {
                // Используем круглую иконку
                iconConfig = {
                  url: roundIconUrl,
                  scaledSize: new (window as any).google.maps.Size(iconSize, iconSize),
                  anchor: new (window as any).google.maps.Point(iconSize / 2, iconSize / 2),
                };
              } else {
                // Fallback на обычное изображение пока загружается круглое
                iconConfig = {
                  url: coverUrl,
                  scaledSize: new (window as any).google.maps.Size(iconSize, iconSize),
                  anchor: new (window as any).google.maps.Point(iconSize / 2, iconSize / 2),
                };
              }
            } else {
              // Fallback на стандартный маркер
              iconConfig = {
                path: (window as any).google?.maps?.SymbolPath?.CIRCLE,
                scale: isSelected ? 8 : 7,
                fillColor: isSelected ? "#556036" : "#6b7d47",
                fillOpacity: 1,
                strokeColor: "#ffffff",
                strokeWeight: 2,
              };
            }

            return (
              <Marker
                key={place.id}
                position={{ lat: place.lat!, lng: place.lng! }}
                title={place.title}
                icon={iconConfig}
                onClick={() => {
                  if (!externalSelectedPlaceId) {
                    setInternalSelectedPlaceId(place.id);
                  }
                  // Haptic feedback simulation
                  if (navigator.vibrate) {
                    navigator.vibrate(10);
                  }
                }}
              >
                {selectedPlaceId === place.id && (
                  <InfoWindow
                    position={{ lat: place.lat!, lng: place.lng! }}
                    onCloseClick={() => {
                      if (!externalSelectedPlaceId) {
                        setInternalSelectedPlaceId(null);
                      }
                    }}
                    options={{
                      pixelOffset: new (window as any).google.maps.Size(0, -10),
                    }}
                  >
                    <div className="w-72">
                      <Link
                        href={`/id/${place.id}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!externalSelectedPlaceId) {
                            setInternalSelectedPlaceId(null);
                          }
                        }}
                        className="block"
                      >
                        {place.cover_url ? (
                          <div className="relative w-full h-56 rounded-2xl overflow-hidden">
                            <img
                              src={place.cover_url}
                              alt={place.title}
                              className="w-full h-full object-cover"
                            />
                            {/* Overlay gradient for better text readability */}
                            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
                            
                            {/* Content overlay */}
                            <div className="absolute inset-0 flex flex-col justify-end p-4 text-white">
                              <h3 className="text-lg font-semibold mb-2 line-clamp-1 drop-shadow-lg">
                                {place.title}
                              </h3>
                              {place.address && (
                                <div className="flex items-center gap-1.5 text-sm mb-1 drop-shadow-md">
                                  <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                                  </svg>
                                  <span className="line-clamp-1">{place.address}</span>
                                </div>
                              )}
                              {place.city && (
                                <div className="text-xs opacity-90 drop-shadow-md">
                                  {place.city}
                                </div>
                              )}
                            </div>
                          </div>
                        ) : (
                          <div className="relative w-full h-56 rounded-2xl overflow-hidden bg-[#f5f4f2]">
                            <div className="absolute inset-0 flex items-center justify-center">
                              <svg className="w-12 h-12 text-[#6b7d47]/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                              </svg>
                            </div>
                            <div className="absolute inset-0 flex flex-col justify-end p-4 text-[#2d2d2d]">
                              <h3 className="text-lg font-semibold mb-2 line-clamp-1">
                                {place.title}
                              </h3>
                              {place.address && (
                                <div className="flex items-center gap-1.5 text-sm mb-1 text-[#6b7d47]/70">
                                  <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                                  </svg>
                                  <span className="line-clamp-1">{place.address}</span>
                                </div>
                              )}
                              {place.city && (
                                <div className="text-xs text-[#6b7d47]/60">
                                  {place.city}
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </Link>
                    </div>
                  </InfoWindow>
                )}
              </Marker>
            );
          })}
        </GoogleMap>
      </div>
    </div>
  );
}