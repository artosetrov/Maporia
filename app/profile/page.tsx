"use client";
export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState, useRef } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import TopBar from "../components/TopBar";
import BottomNav from "../components/BottomNav";
import PlaceCard from "../components/PlaceCard";

type Place = {
  id: string;
  title: string;
  city: string | null;
  country: string | null;
  address: string | null;
  cover_url: string | null;
  created_at: string;
};

type ActivityItem =
  | { type: "liked"; created_at: string; placeId: string; placeTitle?: string | null; coverUrl?: string | null; address?: string | null }
  | { type: "commented"; created_at: string; placeId: string; placeTitle?: string | null; commentText?: string | null; coverUrl?: string | null; address?: string | null }
  | { type: "added"; created_at: string; placeId: string; placeTitle?: string | null; coverUrl?: string | null; address?: string | null };

type Profile = {
  id: string;
  username: string | null;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
};

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

function initialsFromEmail(email?: string | null) {
  if (!email) return "U";
  const name = email.split("@")[0] || "U";
  const parts = name.split(/[.\-_]/).filter(Boolean);
  const a = (parts[0]?.[0] ?? name[0] ?? "U").toUpperCase();
  const b = (parts[1]?.[0] ?? name[1] ?? "").toUpperCase();
  return (a + b).slice(0, 2);
}

function initialsFromName(name?: string | null) {
  if (!name) return "U";
  const parts = name.split(/\s+/).filter(Boolean);
  const a = (parts[0]?.[0] ?? name[0] ?? "U").toUpperCase();
  const b = (parts[1]?.[0] ?? "").toUpperCase();
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

function formatTime(iso: string) {
  const date = new Date(iso);
  const daysAgo = Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
  const timeStr = date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
  if (daysAgo === 0) return `today · ${timeStr}`;
  if (daysAgo === 1) return `1 day ago · ${timeStr}`;
  return `${daysAgo} days ago · ${timeStr}`;
}

function cx(...a: Array<string | false | undefined | null>) {
  return a.filter(Boolean).join(" ");
}

export default function ProfilePage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [tab, setTab] = useState<"added" | "liked" | "activity">("activity");
  const [loading, setLoading] = useState(true);

  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  const [profile, setProfile] = useState<Profile | null>(null);

  const [liked, setLiked] = useState<Place[]>([]);
  const [added, setAdded] = useState<Place[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);

  const stats = useMemo(() => ({
    addedCount: added.length,
    likedCount: liked.length,
  }), [added, liked]);

  const activeList = useMemo(() => {
    if (tab === "added") return added;
    if (tab === "liked") return liked;
    return [];
  }, [tab, added, liked]);

  // settings modal
  const [settingsOpen, setSettingsOpen] = useState(false);
  const editProcessedRef = useRef(false);

  // Открываем модальное окно редактирования, если в URL есть параметр edit=true
  useEffect(() => {
    const editParam = searchParams.get("edit");
    if (editParam === "true" && !editProcessedRef.current) {
      editProcessedRef.current = true;
      setSettingsOpen(true);
      // Убираем параметр из URL без перезагрузки страницы
      router.replace("/profile", { scroll: false });
    } else if (editParam !== "true") {
      // Сбрасываем флаг, если параметр был удален
      editProcessedRef.current = false;
    }
  }, [searchParams, router]);
  const [displayNameDraft, setDisplayNameDraft] = useState("");
  const [bioDraft, setBioDraft] = useState("");
  const [avatarDraft, setAvatarDraft] = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let mounted = true;

    (async () => {
      setLoading(true);

      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData.session;

      if (!mounted) return;

      if (!session?.user) {
        router.replace("/auth");
        return;
      }

      const user = session.user;
      setUserId(user.id);
      setUserEmail(user.email ?? null);

      // profile
      const { data: prof } = await supabase
        .from("profiles")
        .select("id, username, display_name, bio, avatar_url")
        .eq("id", user.id)
        .single();

      if (mounted) {
        setProfile((prof as Profile) ?? null);
        setDisplayNameDraft((prof as any)?.display_name ?? (user.email ?? ""));
        setBioDraft((prof as any)?.bio ?? "");
        setAvatarDraft((prof as any)?.avatar_url ?? null);
      }

      // reactions (likes)
      const { data: reactions } = await supabase
        .from("reactions")
        .select("place_id, reaction, created_at")
        .eq("user_id", user.id)
        .eq("reaction", "like");

      const placeIds = (reactions ?? []).map((r: any) => r.place_id);

      let likedPlaces: Place[] = [];
      if (placeIds.length) {
        const { data } = await supabase
          .from("places")
          .select("id,title,city,country,address,cover_url,created_at")
          .in("id", placeIds)
          .order("created_at", { ascending: false });
        likedPlaces = (data ?? []) as Place[];
      }
      if (mounted) setLiked(likedPlaces);

      // added places
      const { data: addedPlaces } = await supabase
        .from("places")
        .select("id,title,city,country,address,cover_url,created_at")
        .eq("created_by", user.id)
        .order("created_at", { ascending: false });

      if (mounted) setAdded((addedPlaces ?? []) as Place[]);

      // activity
      const likesAct: ActivityItem[] = (reactions ?? []).map((r: any) => ({
        type: "liked",
        created_at: r.created_at,
        placeId: r.place_id,
      }));

      const { data: comments } = await supabase
        .from("comments")
        .select("place_id, created_at, text")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50);

      const commentsAct: ActivityItem[] = (comments ?? []).map((c: any) => ({
        type: "commented",
        created_at: c.created_at,
        placeId: c.place_id,
        commentText: c.text,
      }));

      const addedAct: ActivityItem[] = ((addedPlaces ?? []) as any[]).map((p) => ({
        type: "added",
        created_at: p.created_at,
        placeId: p.id,
      }));

      const act = [...likesAct, ...commentsAct, ...addedAct].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

      const actPlaceIds = Array.from(new Set(act.map((a) => a.placeId)));
      const placesMap = new Map<string, { title: string; cover_url: string | null; address: string | null }>();

      if (actPlaceIds.length) {
        const { data: ps } = await supabase.from("places").select("id,title,cover_url,address").in("id", actPlaceIds);
        (ps ?? []).forEach((p: any) => placesMap.set(p.id, { title: p.title, cover_url: p.cover_url, address: p.address }));
      }

      const actWithTitles = act.map((a) => {
        const place = placesMap.get(a.placeId);
        return {
          ...a,
          placeTitle: place?.title ?? "Place",
          ...(a.type === "added" || a.type === "liked" || a.type === "commented" ? { coverUrl: place?.cover_url ?? null, address: place?.address ?? null } : {}),
        };
      });

      if (mounted) setActivity(actWithTitles);
      if (mounted) setLoading(false);
    })();

    return () => {
      mounted = false;
    };
  }, [router]);

  async function logout() {
    await supabase.auth.signOut();
    router.push("/");
  }

  async function removeFavorite(placeId: string) {
    if (!userId) return;

    try {
      const { error } = await supabase
        .from("reactions")
        .delete()
        .eq("place_id", placeId)
        .eq("user_id", userId)
        .eq("reaction", "like");

      if (error) {
        console.error("Error removing favorite:", error);
        alert("Failed to remove from favorites: " + (error.message || "Unknown error"));
        return;
      }

      // Обновляем список избранного
      setLiked((prev) => prev.filter((p) => p.id !== placeId));

      // Обновляем активность
      setActivity((prev) => prev.filter((a) => !(a.type === "liked" && a.placeId === placeId)));
    } catch (err) {
      console.error("Remove favorite error:", err);
      alert("An error occurred. Please try again.");
    }
  }

  async function uploadAvatar(file: File): Promise<{ url: string | null; error: string | null }> {
    try {
      const ext = file.name.split(".").pop() || "jpg";
      // Path should be relative to bucket: userId/uuid.jpg (without "avatars/" prefix)
      const path = `${userId}/${crypto.randomUUID()}.${ext}`;

      const { error } = await supabase.storage.from("avatars").upload(path, file, {
        cacheControl: "3600",
        upsert: false,
      });

      if (error) {
        console.error("Upload error:", error);
        return { url: null, error: error.message || "Upload failed" };
      }

      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      return { url: data.publicUrl ?? null, error: null };
    } catch (err) {
      console.error("Upload exception:", err);
      const errorMessage = err instanceof Error ? err.message : "Upload failed";
      return { url: null, error: errorMessage };
    }
  }

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !userId) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      alert("Please select an image file");
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert("Image size should be less than 5MB");
      return;
    }

    setAvatarUploading(true);

    // Delete old avatar if exists (check path, not id)
    if (avatarDraft && avatarDraft.includes("avatars/")) {
      // Extract path from URL: avatars/{userId}/{uuid}.jpg
      const pathMatch = avatarDraft.match(/avatars\/(.+)$/);
      if (pathMatch && pathMatch[1]) {
        const path = pathMatch[1].split('?')[0]; // Remove query params if any
        await supabase.storage.from("avatars").remove([path]);
      }
    }

    const result = await uploadAvatar(file);
    setAvatarUploading(false);

    if (result.url) {
      setAvatarDraft(result.url);
      
      // Update profile immediately (using upsert for safety)
      const { error } = await supabase
        .from("profiles")
        .upsert(
          { id: userId, avatar_url: result.url },
          { onConflict: "id" }
        );

      if (!error) {
        setProfile((p) => (p ? { ...p, avatar_url: result.url } : p));
      }
    } else {
      alert(result.error || "Failed to upload avatar");
    }

    // Reset input
    e.target.value = "";
  }

  async function deleteAvatar() {
    if (!userId || !avatarDraft) return;

    // Delete from storage (check path, not id)
    if (avatarDraft.includes("avatars/")) {
      // Extract path from URL: avatars/{userId}/{uuid}.jpg
      const pathMatch = avatarDraft.match(/avatars\/(.+)$/);
      if (pathMatch && pathMatch[1]) {
        const path = pathMatch[1].split('?')[0]; // Remove query params if any
        await supabase.storage.from("avatars").remove([path]);
      }
    }

    // Update profile (using upsert for safety)
    const { error } = await supabase
      .from("profiles")
      .upsert(
        { id: userId, avatar_url: null },
        { onConflict: "id" }
      );

    if (!error) {
      setAvatarDraft(null);
      setProfile((p) => (p ? { ...p, avatar_url: null } : p));
    }
  }

  async function saveProfile() {
    if (!userId) return;
    setSaving(true);

    // Use upsert for safety (create if doesn't exist, update if exists)
    const { error } = await supabase
      .from("profiles")
      .upsert(
        {
          id: userId,
          display_name: displayNameDraft,
          bio: bioDraft,
          avatar_url: avatarDraft,
        },
        { onConflict: "id" }
      );

    setSaving(false);

    if (!error) {
      setProfile((p) =>
        p
          ? { ...p, display_name: displayNameDraft, bio: bioDraft, avatar_url: avatarDraft }
          : ({
              id: userId,
              username: null,
              display_name: displayNameDraft,
              bio: bioDraft,
              avatar_url: avatarDraft,
            } as Profile)
      );
      setSettingsOpen(false);
    }
  }

  const displayName =
    profile?.display_name || profile?.username || userEmail || "User";

  return (
    <main className="min-h-screen bg-[#faf9f7]">
      <TopBar
        showDesktopTabs={true}
        userAvatar={profile?.avatar_url ?? null}
        userDisplayName={displayName}
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
      />

      <div className="pt-[80px]">
        {/* Profile block */}
        <div className="mx-auto max-w-md px-4 pt-6 pb-4 md:max-w-7xl">
          <div className="flex items-start gap-4">
            {/* Avatar */}
            <div className="h-16 w-16 rounded-2xl bg-[#f5f4f2] border border-[#6b7d47]/20 flex items-center justify-center overflow-hidden flex-shrink-0">
              {profile?.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={profile.avatar_url} alt="avatar" className="h-full w-full object-cover" />
              ) : (
                <span className="text-xl font-semibold text-[#6b7d47]">{initialsFromEmail(userEmail)}</span>
              )}
            </div>

            <div className="flex-1 min-w-0">
              <div className="text-xl font-bold leading-tight text-[#2d2d2d] mb-1">{displayName}</div>
              {profile?.bio ? (
                <div className="text-sm text-[#6b7d47]/80 line-clamp-2">{profile.bio}</div>
              ) : (
                <button
                  onClick={() => setSettingsOpen(true)}
                  className="text-sm text-[#6b7d47]/70 hover:text-[#6b7d47] underline underline-offset-2 transition"
                >
                  Add bio
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs + Content */}
      <div className="mx-auto max-w-7xl px-4 pb-20 pt-4">
        {/* Tabs — underline style */}
        <div className="flex border-b border-[#6b7d47]/20 mb-4">
          <button
            onClick={() => setTab("activity")}
            className={cx(
              "px-4 py-3 text-sm font-medium transition flex-shrink-0 -mb-px",
              tab === "activity"
                ? "text-[#6b7d47] border-b-2 border-[#6b7d47]"
                : "text-[#6b7d47]/60 hover:text-[#6b7d47]/80"
            )}
          >
            Activity{activity.length > 0 ? ` (${activity.length})` : ""}
          </button>
          <button
            onClick={() => setTab("added")}
            className={cx(
              "px-4 py-3 text-sm font-medium transition flex-shrink-0 -mb-px",
              tab === "added"
                ? "text-[#6b7d47] border-b-2 border-[#6b7d47]"
                : "text-[#6b7d47]/60 hover:text-[#6b7d47]/80"
            )}
          >
            Added{stats.addedCount > 0 ? ` (${stats.addedCount})` : ""}
          </button>
          <button
            onClick={() => setTab("liked")}
            className={cx(
              "px-4 py-3 text-sm font-medium transition flex-shrink-0 -mb-px",
              tab === "liked"
                ? "text-[#6b7d47] border-b-2 border-[#6b7d47]"
                : "text-[#6b7d47]/60 hover:text-[#6b7d47]/80"
            )}
          >
            Liked{stats.likedCount > 0 ? ` (${stats.likedCount})` : ""}
          </button>
        </div>

        <div className="transition-opacity duration-200">
          {loading ? (
            <Empty text="Loading…" />
          ) : tab === "activity" ? (
            activity.length === 0 ? (
              <Empty text="No activity yet" />
            ) : (
              <div>
                {activity.slice(0, 50).map((a, idx) => (
                  <ActivityCard
                    key={`${a.type}-${a.placeId}-${idx}`}
                    item={a}
                    userAvatar={profile?.avatar_url ?? null}
                    userName={displayName}
                  />
                ))}
              </div>
            )
          ) : activeList.length === 0 ? (
            <Empty
              text={
                tab === "liked"
                  ? "Save places to find them later"
                  : "You haven't added places yet"
              }
            />
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {activeList.map((p) => (
                <PlaceCard
                  key={p.id}
                  place={p}
                  favoriteButton={
                    tab === "liked" ? (
                      <button
                        type="button"
                        onClick={async (e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          await removeFavorite(p.id);
                        }}
                        className="h-8 w-8 rounded-full bg-white border border-[#6b7d47]/20 hover:bg-[#f5f4f2] hover:border-[#6b7d47]/40 flex items-center justify-center transition shadow-sm bg-[#6b7d47]/10 border-[#6b7d47]/30"
                        aria-label="Remove from favorites"
                        title="Remove from favorites"
                      >
                        <svg
                          className="w-4 h-4 text-[#6b7d47]"
                          fill="currentColor"
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
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Settings Modal */}
      {settingsOpen && (
        <div className="fixed inset-0 z-50">
          <button
            className="absolute inset-0 bg-black/20 backdrop-blur-sm"
            onClick={() => setSettingsOpen(false)}
            aria-label="Close"
          />
          <div className="absolute left-0 right-0 bottom-0 bg-white rounded-t-3xl shadow-2xl border-t border-[#6b7d47]/10 max-h-[80vh] overflow-y-auto">
            <div className="px-5 py-4">
              <div className="flex items-center justify-between mb-6">
                <div className="text-lg font-semibold text-[#2d2d2d]">Edit profile</div>
                <button
                  onClick={() => setSettingsOpen(false)}
                  className="h-9 w-9 rounded-xl border border-[#6b7d47]/20 bg-[#f5f4f2] hover:bg-[#6b7d47]/10 text-[#6b7d47] transition flex items-center justify-center"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-4">
                {/* Avatar Section */}
                <div>
                  <label className="text-xs font-medium text-[#6b7d47] mb-2 block">Avatar</label>
                  <div className="flex items-center gap-4">
                    <div className="relative h-20 w-20 rounded-2xl bg-[#f5f4f2] border border-[#6b7d47]/20 flex items-center justify-center overflow-hidden flex-shrink-0">
                      {avatarDraft ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={avatarDraft} alt="avatar" className="h-full w-full object-cover" />
                      ) : (
                        <span className="text-2xl font-semibold text-[#6b7d47]">{initialsFromEmail(userEmail)}</span>
                      )}
                      {avatarUploading && (
                        <div className="absolute inset-0 rounded-2xl bg-black/40 flex items-center justify-center z-10">
                          <div className="text-white text-xs">Uploading…</div>
                        </div>
                      )}
                    </div>
                    <div className="flex-1 space-y-2">
                      <label className="cursor-pointer block">
                        <span className="inline-flex items-center justify-center rounded-xl border border-[#6b7d47]/20 bg-white px-4 py-2 text-xs font-medium text-[#6b7d47] hover:bg-[#f5f4f2] transition active:scale-[0.98]">
                          {avatarDraft ? "Change" : "Upload"}
                        </span>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={handleAvatarUpload}
                          disabled={avatarUploading}
                        />
                      </label>
                      {avatarDraft && (
                        <button
                          type="button"
                          onClick={deleteAvatar}
                          disabled={avatarUploading}
                          className="text-xs text-red-600 hover:text-red-700 transition disabled:opacity-50"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-medium text-[#6b7d47] mb-2 block">Display name</label>
                  <input
                    className="w-full rounded-xl border border-[#6b7d47]/20 bg-[#f5f4f2] px-4 py-3 text-sm outline-none focus:bg-white focus:border-[#6b7d47]/40 text-[#2d2d2d] transition"
                    value={displayNameDraft}
                    onChange={(e) => setDisplayNameDraft(e.target.value)}
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-[#6b7d47] mb-2 block">Bio</label>
                  <textarea
                    className="w-full min-h-[110px] rounded-xl border border-[#6b7d47]/20 bg-[#f5f4f2] px-4 py-3 text-sm outline-none focus:bg-white focus:border-[#6b7d47]/40 text-[#2d2d2d] transition resize-none"
                    value={bioDraft}
                    onChange={(e) => setBioDraft(e.target.value)}
                    placeholder="Short description…"
                  />
                </div>
              </div>

              <button
                onClick={saveProfile}
                disabled={saving}
                className="mt-6 w-full rounded-xl bg-[#6b7d47] text-white py-3 font-medium hover:bg-[#556036] disabled:opacity-60 transition active:scale-[0.98]"
              >
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      <BottomNav />
    </main>
  );
}

function ActivityCard({ item, userAvatar, userName }: { item: ActivityItem; userAvatar: string | null; userName: string }) {
  const getIcon = () => {
    const iconClass = "w-6 h-6";
    if (item.type === "liked") {
      return (
        <svg className={iconClass} fill="currentColor" viewBox="0 0 24 24" style={{ color: "#ef4444" }}>
          <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
        </svg>
      );
    }
    if (item.type === "commented") {
      return (
        <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: "#3b82f6" }}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
          />
        </svg>
      );
    }
    return (
      <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: "#6b7d47" }}>
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
      </svg>
    );
  };

  const getActionText = () => {
    if (item.type === "liked") return "liked a place";
    if (item.type === "commented") return "commented";
    return "added a place";
  };

  return (
    <Link
      href={`/id/${item.placeId}`}
      className="block py-4 border-b border-[#6b7d47]/10 last:border-b-0 hover:bg-[#faf9f7] transition"
    >
      <div className="flex items-start gap-3">
        {/* Иконка события слева */}
        <div className="flex-shrink-0 mt-0.5">{getIcon()}</div>

        <div className="flex-1 min-w-0">
          {/* Основная строка: аватар + имя → действие + время справа */}
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-6 h-6 rounded-full bg-[#f5f4f2] overflow-hidden flex-shrink-0 border border-[#6b7d47]/10">
                {userAvatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={userAvatar} alt={userName} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-[10px] font-semibold text-[#6b7d47] flex items-center justify-center h-full">
                    {initialsFromName(userName)}
                  </span>
                )}
              </div>
              <span className="text-sm font-medium text-[#2d2d2d]">
                <span className="font-semibold">{userName}</span> {getActionText()}
              </span>
            </div>
            {/* Время справа */}
            <div className="text-xs text-[#6b7d47]/50 flex-shrink-0">{formatTime(item.created_at)}</div>
          </div>

          {/* Комментарий (если есть) */}
          {item.type === "commented" && item.commentText && (
            <div className="text-sm text-[#2d2d2d] bg-[#f5f4f2] rounded-xl p-3 mb-3 border border-[#6b7d47]/10 line-clamp-2">
              {item.commentText}
            </div>
          )}

          {/* Блок локации: карточка-превью */}
          <div className="flex items-center gap-3 rounded-xl bg-white border border-[#6b7d47]/10 p-2.5">
            {item.coverUrl ? (
              <div className="w-14 h-14 rounded-lg bg-[#f5f4f2] overflow-hidden flex-shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.coverUrl}
                  alt={item.placeTitle ?? "Place"}
                  className="w-full h-full object-cover"
                />
              </div>
            ) : (
              <div className="w-14 h-14 rounded-lg bg-[#f5f4f2] flex items-center justify-center flex-shrink-0">
                <svg className="w-6 h-6 text-[#6b7d47]/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-[#2d2d2d] mb-0.5 truncate">
                {item.placeTitle ?? "Place"}
              </div>
              {item.address && (
                <div className="text-xs text-[#6b7d47]/60 truncate">{item.address}</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}


function Empty({ text }: { text: string }) {
  return (
    <div className="text-center py-16 px-4">
      <div className="text-sm text-[#6b7d47]/60">{text}</div>
    </div>
  );
}