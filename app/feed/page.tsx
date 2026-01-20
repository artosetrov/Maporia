"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import TopBar from "../components/TopBar";
import BottomNav from "../components/BottomNav";
import { supabase } from "../lib/supabase";

type ActivityItem =
  | { type: "liked"; created_at: string; placeId: string; placeTitle?: string | null; coverUrl?: string | null; address?: string | null; userId: string; userName: string; userAvatar: string | null }
  | { type: "commented"; created_at: string; placeId: string; placeTitle?: string | null; commentText?: string | null; coverUrl?: string | null; address?: string | null; userId: string; userName: string; userAvatar: string | null }
  | { type: "added"; created_at: string; placeId: string; placeTitle?: string | null; coverUrl?: string | null; address?: string | null; userId: string; userName: string; userAvatar: string | null };

function initialsFromName(name?: string | null) {
  if (!name) return "U";
  const parts = name.split(/\s+/).filter(Boolean);
  const a = (parts[0]?.[0] ?? name[0] ?? "U").toUpperCase();
  const b = (parts[1]?.[0] ?? "").toUpperCase();
  return (a + b).slice(0, 2);
}

function formatTime(iso: string) {
  const date = new Date(iso);
  const daysAgo = Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
  const timeStr = date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
  if (daysAgo === 0) return `today · ${timeStr}`;
  if (daysAgo === 1) return `1 day ago · ${timeStr}`;
  return `${daysAgo} days ago · ${timeStr}`;
}

function ActivityCard({ item }: { item: ActivityItem }) {
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
      className="block py-4 px-4 border-b border-[#6b7d47]/10 last:border-b-0 hover:bg-[#faf9f7] transition"
    >
      <div className="flex items-start">
        {/* Иконка события слева (прижата к левому краю) */}
        <div className="flex-shrink-0 mt-0.5 mr-3">{getIcon()}</div>

        <div className="flex-1 min-w-0">
          {/* Основная строка: аватар + имя → действие + время */}
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <div className="w-6 h-6 rounded-full bg-[#f5f4f2] overflow-hidden flex-shrink-0 border border-[#6b7d47]/10">
                {item.userAvatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.userAvatar} alt={item.userName} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-[10px] font-semibold text-[#6b7d47] flex items-center justify-center h-full">
                    {initialsFromName(item.userName)}
                  </span>
                )}
              </div>
              <span className="text-sm font-medium text-[#2d2d2d]">
                <span className="font-semibold">{item.userName}</span> {getActionText()}
              </span>
            </div>
            {/* Время (прижато к правому краю) */}
            <div className="text-xs text-[#6b7d47]/50 flex-shrink-0 ml-2">{formatTime(item.created_at)}</div>
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
              <div className="text-sm font-semibold text-[#2d2d2d] line-clamp-1">{item.placeTitle ?? "Place"}</div>
              {item.address && (
                <div className="text-xs text-[#6b7d47]/70 line-clamp-1">{item.address}</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}

export default function FeedPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userDisplayName, setUserDisplayName] = useState<string | null>(null);
  const [userAvatar, setUserAvatar] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (data.user) {
        setUserId(data.user.id);
        setUserEmail(data.user.email || null);

        // Загружаем профиль пользователя
        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("display_name, avatar_url")
          .eq("id", data.user.id)
          .maybeSingle();

        if (profileError) {
          console.error("Error loading user profile:", profileError);
        }

        if (profile) {
          setUserDisplayName(profile.display_name);
          setUserAvatar(profile.avatar_url);
        }
      }
    })();
  }, []);

  useEffect(() => {
    loadActivities();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadActivities() {
    setLoading(true);

    // Загружаем все активности: добавленные места, лайки, комментарии
    const [placesResult, likesResult, commentsResult] = await Promise.all([
      supabase
        .from("places")
        .select("id, title, cover_url, address, created_at, created_by")
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("reactions")
        .select("place_id, created_at, user_id")
        .eq("reaction", "like")
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("comments")
        .select("place_id, text, created_at, user_id")
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

    // Собираем все уникальные ID пользователей и мест для batch-загрузки
    const userIds = new Set<string>();
    const placeIds = new Set<string>();

    if (placesResult.data) {
      placesResult.data.forEach((p) => {
        if (p.created_by) userIds.add(p.created_by);
        placeIds.add(p.id);
      });
    }
    if (likesResult.data) {
      likesResult.data.forEach((l) => {
        userIds.add(l.user_id);
        placeIds.add(l.place_id);
      });
    }
    if (commentsResult.data) {
      commentsResult.data.forEach((c) => {
        userIds.add(c.user_id);
        placeIds.add(c.place_id);
      });
    }

    // Загружаем все профили и места одним запросом
    const [profilesResult, placesDataResult] = await Promise.all([
      userIds.size > 0
        ? supabase
            .from("profiles")
            .select("id, display_name, username, avatar_url")
            .in("id", Array.from(userIds))
        : { data: [], error: null },
      placeIds.size > 0
        ? supabase
            .from("places")
            .select("id, title, cover_url, address")
            .in("id", Array.from(placeIds))
        : { data: [], error: null },
    ]);

    // Создаем кэш для быстрого доступа
    const profilesCache = new Map<string, { display_name: string | null; username: string | null; avatar_url: string | null }>();
    if (profilesResult.data) {
      profilesResult.data.forEach((p) => {
        profilesCache.set(p.id, {
          display_name: p.display_name,
          username: p.username,
          avatar_url: p.avatar_url,
        });
      });
    }

    const placesCache = new Map<string, { title: string | null; cover_url: string | null; address: string | null }>();
    if (placesDataResult.data) {
      placesDataResult.data.forEach((p) => {
        placesCache.set(p.id, {
          title: p.title,
          cover_url: p.cover_url,
          address: p.address,
        });
      });
    }

    const allActivities: ActivityItem[] = [];

    // Добавляем добавленные места
    if (placesResult.data) {
      for (const place of placesResult.data) {
        const profile = place.created_by ? profilesCache.get(place.created_by) : null;
        const userName = profile?.display_name || profile?.username || "Unknown";
        allActivities.push({
          type: "added",
          created_at: place.created_at,
          placeId: place.id,
          placeTitle: place.title,
          coverUrl: place.cover_url,
          address: place.address,
          userId: place.created_by || "",
          userName,
          userAvatar: profile?.avatar_url || null,
        });
      }
    }

    // Добавляем лайки
    if (likesResult.data) {
      for (const like of likesResult.data) {
        const profile = profilesCache.get(like.user_id);
        const place = placesCache.get(like.place_id);
        const userName = profile?.display_name || profile?.username || "Unknown";
        allActivities.push({
          type: "liked",
          created_at: like.created_at,
          placeId: like.place_id,
          placeTitle: place?.title || null,
          coverUrl: place?.cover_url || null,
          address: place?.address || null,
          userId: like.user_id,
          userName,
          userAvatar: profile?.avatar_url || null,
        });
      }
    }

    // Добавляем комментарии
    if (commentsResult.data) {
      for (const comment of commentsResult.data) {
        const profile = profilesCache.get(comment.user_id);
        const place = placesCache.get(comment.place_id);
        const userName = profile?.display_name || profile?.username || "Unknown";
        allActivities.push({
          type: "commented",
          created_at: comment.created_at,
          placeId: comment.place_id,
          placeTitle: place?.title || null,
          commentText: comment.text || null,
          coverUrl: place?.cover_url || null,
          address: place?.address || null,
          userId: comment.user_id,
          userName,
          userAvatar: profile?.avatar_url || null,
        });
      }
    }

    // Сортируем по дате (новые сверху)
    allActivities.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    setActivities(allActivities.slice(0, 100)); // Ограничиваем 100 последними
    setLoading(false);
  }

  return (
    <main className="min-h-screen bg-[#faf9f7] flex flex-col">
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
      />

      <div className="flex-1 pt-[64px] pb-20">
        <div className="mx-auto max-w-2xl px-4 pt-4">
          {loading ? (
            <div className="text-center py-12 text-[#6b7d47]/60">Loading...</div>
          ) : activities.length === 0 ? (
            <div className="text-center py-12 text-[#6b7d47]/60">No activity yet</div>
          ) : (
            <div className="bg-white rounded-2xl border border-[#6b7d47]/10 overflow-hidden">
              {activities.map((activity, index) => (
                <ActivityCard key={`${activity.type}-${activity.placeId}-${activity.created_at}-${index}`} item={activity} />
              ))}
            </div>
          )}
        </div>
      </div>

      <BottomNav />
    </main>
  );
}
