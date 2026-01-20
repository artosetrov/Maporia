"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { GoogleMap, Marker, useJsApiLoader } from "@react-google-maps/api";
import { CATEGORIES } from "../../constants";
import TopBar from "../../components/TopBar";
import BottomNav from "../../components/BottomNav";
import { GOOGLE_MAPS_LIBRARIES, getGoogleMapsApiKey } from "../../config/googleMaps";
import { supabase } from "../../lib/supabase";

type Place = {
  id: string;
  title: string;
  description: string | null;
  city: string | null;
  country: string | null;
  address: string | null;
  link: string | null;
  tags: string[] | null;
  categories: string[] | null;
  cover_url: string | null;
  photo_urls: string[] | null;
  created_by: string | null;
  lat: number | null;
  lng: number | null;
  created_at: string;
};

type Comment = { 
  id: string; 
  text: string; 
  created_at: string; 
  user_id: string;
  user_display_name?: string | null;
  user_username?: string | null;
  user_avatar_url?: string | null;
};

type CreatorProfile = { 
  display_name: string | null; 
  username: string | null; 
  avatar_url: string | null;
};

function cx(...a: Array<string | false | undefined | null>) {
  return a.filter(Boolean).join(" ");
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
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 4) return `${weeks}w ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

function initialsFromName(displayName?: string | null, username?: string | null): string {
  if (displayName) {
    const parts = displayName.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase().slice(0, 2);
    }
    return displayName[0]?.toUpperCase() || "U";
  }
  if (username) {
    return username[0]?.toUpperCase() || "U";
  }
  return "U";
}

export default function PlacePage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params?.id;

  const [activeSection, setActiveSection] = useState<"overview" | "photos" | "details" | "map" | "comments">("overview");
  const [stickyNavVisible, setStickyNavVisible] = useState(false);
  const [place, setPlace] = useState<Place | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentText, setCommentText] = useState("");
  const [sending, setSending] = useState(false);
  const [commentsLoading, setCommentsLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userDisplayName, setUserDisplayName] = useState<string | null>(null);
  const [userAvatar, setUserAvatar] = useState<string | null>(null);
  const [isFavorite, setIsFavorite] = useState(false);
  const [favoriteLoading, setFavoriteLoading] = useState(false);
  const [creatorProfile, setCreatorProfile] = useState<CreatorProfile | null>(null);
  const [commentError, setCommentError] = useState<string | null>(null);
  const [deletingCommentId, setDeletingCommentId] = useState<string | null>(null);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
  const [photosExpanded, setPhotosExpanded] = useState(false);

  // Refs for smooth scrolling
  const overviewRef = useRef<HTMLDivElement>(null);
  const photosRef = useRef<HTMLDivElement>(null);
  const detailsRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const commentsRef = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLDivElement>(null);

  const tags = useMemo(() => place?.tags ?? [], [place]);
  const categories = useMemo(() => place?.categories ?? [], [place]);
  const isOwner = place?.created_by === userId;

  // Get photos from place_photos table
  const [loadedPhotos, setLoadedPhotos] = useState<string[]>([]);

  useEffect(() => {
    if (!id || !place) return;

    (async () => {
      const { data: photosData, error } = await supabase
        .from("place_photos")
        .select("url")
        .eq("place_id", id)
        .order("sort", { ascending: true });

      if (!error && photosData && photosData.length > 0) {
        const urls = photosData.map((p: any) => p.url).filter(Boolean);
        setLoadedPhotos(urls);
      } else {
        // Fallback: use legacy format
        const photos: string[] = [];
        if (place.photo_urls && Array.isArray(place.photo_urls) && place.photo_urls.length > 0) {
          photos.push(...place.photo_urls.filter((url): url is string => typeof url === "string" && url.length > 0));
        } else if (place.cover_url) {
          photos.push(place.cover_url);
        }
        setLoadedPhotos(photos);
      }
    })();
  }, [id, place?.id]);

  const allPhotos = useMemo(() => {
    if (loadedPhotos.length > 0) {
      return loadedPhotos;
    }
    if (!place) return [];
    const photos: string[] = [];
    if (place.photo_urls && Array.isArray(place.photo_urls) && place.photo_urls.length > 0) {
      photos.push(...place.photo_urls.filter((url): url is string => typeof url === "string" && url.length > 0));
    } else if (place.cover_url) {
      photos.push(place.cover_url);
    }
    return photos;
  }, [loadedPhotos, place?.photo_urls, place?.cover_url]);

  // Sticky nav visibility on scroll
  useEffect(() => {
    const checkVisibility = () => {
      if (heroRef.current) {
        const heroBottom = heroRef.current.getBoundingClientRect().bottom;
        setStickyNavVisible(heroBottom <= 0);
      } else {
        setStickyNavVisible(false);
      }
    };

    // Check initial state
    checkVisibility();

    // Check on scroll
    const handleScroll = () => {
      checkVisibility();
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [place]); // Re-check when place data loads

  // Active section detection on scroll
  useEffect(() => {
    const handleScroll = () => {
      const scrollPos = window.scrollY + 100;
      
      if (commentsRef.current && scrollPos >= commentsRef.current.offsetTop - 200) {
        setActiveSection("comments");
      } else if (mapRef.current && scrollPos >= mapRef.current.offsetTop - 200) {
        setActiveSection("map");
      } else if (detailsRef.current && scrollPos >= detailsRef.current.offsetTop - 200) {
        setActiveSection("details");
      } else if (photosRef.current && scrollPos >= photosRef.current.offsetTop - 200) {
        setActiveSection("photos");
      } else {
        setActiveSection("overview");
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [place]);

  // Smooth scroll to section
  const scrollToSection = (section: "overview" | "photos" | "details" | "map" | "comments") => {
    setActiveSection(section);
    const refs = {
      overview: overviewRef,
      photos: photosRef,
      details: detailsRef,
      map: mapRef,
      comments: commentsRef,
    };
    const ref = refs[section];
    if (ref.current) {
      const offset = stickyNavVisible ? 120 : 80; // Account for sticky nav (single row)
      const elementPosition = ref.current.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.scrollY - offset;
      window.scrollTo({
        top: offsetPosition,
        behavior: "smooth",
      });
    }
  };

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (data.user) {
        setUserId(data.user.id);
        setUserEmail(data.user.email ?? null);

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
    if (!id) return;

    (async () => {
      const { data: placeData, error: pErr } = await supabase
        .from("places")
        .select("*")
        .eq("id", id)
        .single();

      if (pErr || !placeData) {
        router.push("/");
        return;
      }
      const placeItem = placeData as Place;
      setPlace(placeItem);

      // Load creator profile
      if (placeItem.created_by) {
        const { data: profileData, error: profileError } = await supabase
          .from("profiles")
          .select("display_name, username, avatar_url")
          .eq("id", placeItem.created_by)
          .maybeSingle();

        if (profileError) {
          console.error("Error loading creator profile:", profileError);
        }

        setCreatorProfile({
          display_name: profileData?.display_name ?? null,
          username: profileData?.username ?? null,
          avatar_url: profileData?.avatar_url ?? null,
        });
      }

      // Load comments
      setCommentsLoading(true);
      const { data: commentData, error: commentErr } = await supabase
        .from("comments")
        .select("id,text,created_at,user_id")
        .eq("place_id", id)
        .order("created_at", { ascending: false });

      if (commentErr) {
        console.error("Error loading comments:", commentErr);
        if (comments.length === 0) {
          setCommentError("Failed to load comments. Please refresh the page.");
        }
      } else {
        const userIds = Array.from(new Set((commentData ?? []).map((c: any) => c.user_id)));
        const profilesMap = new Map<string, { display_name: string | null; username: string | null; avatar_url: string | null }>();

        if (userIds.length > 0) {
          const { data: profilesData } = await supabase
            .from("profiles")
            .select("id, display_name, username, avatar_url")
            .in("id", userIds);

          (profilesData ?? []).forEach((p: any) => {
            profilesMap.set(p.id, {
              display_name: p.display_name,
              username: p.username,
              avatar_url: p.avatar_url,
            });
          });
        }

        const commentsWithProfiles: Comment[] = (commentData ?? []).map((c: any) => {
          const profile = profilesMap.get(c.user_id);
          return {
            ...c,
            user_display_name: profile?.display_name ?? null,
            user_username: profile?.username ?? null,
            user_avatar_url: profile?.avatar_url ?? null,
          };
        });

        setComments(commentsWithProfiles);
        setCommentError(null);
      }
      setCommentsLoading(false);
    })();
  }, [id, router]);

  // Check if place is favorited
  useEffect(() => {
    if (!id || !userId) {
      setIsFavorite(false);
      return;
    }

    (async () => {
      try {
        const { data, error } = await supabase
          .from("reactions")
          .select("place_id")
          .eq("place_id", id)
          .eq("user_id", userId)
          .eq("reaction", "like")
          .maybeSingle();

        if (error) {
          console.error("Error checking favorite status:", error);
          return;
        }

        setIsFavorite(!!data);
      } catch (err) {
        console.error("Exception checking favorite status:", err);
      }
    })();
  }, [id, userId]);

  async function toggleFavorite() {
    if (!userId || !id) {
      router.push("/auth");
      return;
    }

    setFavoriteLoading(true);
    if (navigator.vibrate) {
      navigator.vibrate(10);
    }

    try {
      if (isFavorite) {
        const { error } = await supabase
          .from("reactions")
          .delete()
          .eq("place_id", id)
          .eq("user_id", userId)
          .eq("reaction", "like");

        if (error) {
          console.error("Error removing favorite:", error);
        } else {
          setIsFavorite(false);
        }
      } else {
        const { data: existingData } = await supabase
          .from("reactions")
          .select("id")
          .eq("place_id", id)
          .eq("user_id", userId)
          .eq("reaction", "like")
          .maybeSingle();

        if (existingData) {
          setIsFavorite(true);
        } else {
          const { error } = await supabase
            .from("reactions")
            .insert({
              place_id: id,
              user_id: userId,
              reaction: "like",
            });

          if (error) {
            console.error("Error adding favorite:", error);
          } else {
            setIsFavorite(true);
          }
        }
      }
    } catch (err) {
      console.error("Unexpected error:", err);
    } finally {
      setFavoriteLoading(false);
    }
  }

  async function handleShare() {
    if (!place || !id) return;

    const shareUrl = `${window.location.origin}/id/${id}`;
    const shareData = {
      title: place.title,
      text: place.description || place.title,
      url: shareUrl,
    };

    try {
      if (navigator.share && navigator.canShare && navigator.canShare(shareData)) {
        await navigator.share(shareData);
      } else {
        // Fallback: копируем в буфер обмена
        await navigator.clipboard.writeText(shareUrl);
        alert("Link copied to clipboard!");
      }
    } catch (err) {
      // Пользователь отменил или произошла ошибка
      if ((err as Error).name !== "AbortError") {
        // Fallback: копируем в буфер обмена
        try {
          await navigator.clipboard.writeText(shareUrl);
          alert("Link copied to clipboard!");
        } catch (clipboardErr) {
          console.error("Failed to copy:", clipboardErr);
        }
      }
    }
  }

  async function addComment() {
    if (!place || !commentText.trim() || sending) return;

    setSending(true);
    setCommentError(null);
    
    try {
      const { data: auth, error: authError } = await supabase.auth.getUser();
      
      if (authError || !auth.user) {
        setSending(false);
        setCommentError("You need to sign in to post comments.");
        setTimeout(() => {
          router.push("/auth");
        }, 2000);
        return;
      }

      const user = auth.user;
      
      if (!user || !user.id) {
        setSending(false);
        setCommentError("User ID is missing. Please sign in again.");
        setTimeout(() => {
          router.push("/auth");
        }, 2000);
        return;
      }

      const trimmedText = commentText.trim();

      if (!trimmedText) {
        setSending(false);
        return;
      }

      const { data, error } = await supabase
        .from("comments")
        .insert({
          place_id: place.id,
          user_id: user.id,
          text: trimmedText,
        })
        .select("id,text,created_at,user_id")
        .single();

      setSending(false);
      
      if (error) {
        console.error("Error adding comment:", error);
        setCommentError(error.message || "Failed to post comment. Please try again.");
        return;
      }
      
      if (data) {
        const { data: profileData } = await supabase
          .from("profiles")
          .select("display_name, username, avatar_url")
          .eq("id", user.id)
          .single();

        const newComment: Comment = {
          ...data,
          user_display_name: profileData?.display_name ?? null,
          user_username: profileData?.username ?? null,
          user_avatar_url: profileData?.avatar_url ?? null,
        };

        setComments((prev) => [newComment, ...prev]);
        setCommentText("");
        setCommentError(null);
      }
    } catch (err) {
      console.error("Unexpected error adding comment:", err);
      setSending(false);
      setCommentError("An unexpected error occurred. Please try again.");
    }
  }

  async function deleteComment(commentId: string) {
    if (!userId) return;

    setDeletingCommentId(commentId);

    try {
      const { error } = await supabase
        .from("comments")
        .delete()
        .eq("id", commentId)
        .eq("user_id", userId);

      if (error) {
        console.error("Error deleting comment:", error);
        setCommentError("Failed to delete comment. Please try again.");
      } else {
        setComments((prev) => prev.filter((c) => c.id !== commentId));
      }
    } catch (err) {
      console.error("Unexpected error deleting comment:", err);
      setCommentError("An unexpected error occurred while deleting.");
    } finally {
      setDeletingCommentId(null);
    }
  }

  const creatorName = creatorProfile?.display_name || creatorProfile?.username || "User";

  if (!place) {
    return (
      <main className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-sm text-[#6b7d47]/60">Loading…</div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-white">
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

      {/* Combined Sticky Bar - All in one row */}
      <div
        className={cx(
          "fixed top-[64px] left-0 right-0 z-30 bg-white border-b border-[#6b7d47]/10 transition-all duration-200",
          stickyNavVisible ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-full pointer-events-none"
        )}
      >
        <div className="px-4 lg:px-8">
          <div className="flex items-center gap-3 py-3">
            {/* Left: Back button */}
            <button
              onClick={() => router.back()}
              className="h-10 w-10 rounded-full bg-[#f5f4f2] hover:bg-[#6b7d47]/10 flex items-center justify-center text-[#2d2d2d] transition flex-shrink-0"
              aria-label="Back"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>

            {/* Center: Navigation tabs */}
            {/* Desktop: Full-width tabs */}
            <div className="hidden lg:flex items-center gap-1 flex-1">
              {(["overview", "photos", "details", "map", "comments"] as const).map((section) => (
                <button
                  key={section}
                  onClick={() => scrollToSection(section)}
                  className={cx(
                    "px-4 py-2 text-sm font-medium transition border-b-2",
                    activeSection === section
                      ? "text-[#6b7d47] border-[#6b7d47]"
                      : "text-[#6b7d47]/60 border-transparent hover:text-[#6b7d47]"
                  )}
                >
                  {section.charAt(0).toUpperCase() + section.slice(1)}
                </button>
              ))}
            </div>

            {/* Mobile: Horizontally scrollable tabs */}
            <div className="lg:hidden overflow-x-auto scrollbar-hide flex-1 -mx-4 px-4">
              <div className="flex items-center gap-1 min-w-max">
                {(["overview", "photos", "details", "map", "comments"] as const).map((section) => (
                  <button
                    key={section}
                    onClick={() => scrollToSection(section)}
                    className={cx(
                      "px-4 py-2 text-sm font-medium transition whitespace-nowrap border-b-2",
                      activeSection === section
                        ? "text-[#6b7d47] border-[#6b7d47]"
                        : "text-[#6b7d47]/60 border-transparent"
                    )}
                  >
                    {section.charAt(0).toUpperCase() + section.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* Right: Action buttons */}
            <div className="flex items-center gap-2 flex-shrink-0">
              {/* Favorite button */}
              {userId && (
                <button
                  onClick={toggleFavorite}
                  disabled={favoriteLoading}
                  className={cx(
                    "h-10 w-10 rounded-full bg-[#f5f4f2] hover:bg-[#6b7d47]/10 flex items-center justify-center transition flex-shrink-0",
                    isFavorite ? "text-[#6b7d47]" : "text-[#6b7d47]/60",
                    favoriteLoading && "opacity-50"
                  )}
                  aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
                >
                  <svg
                    className="w-5 h-5"
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
              )}
              
              {/* Edit button (only for owner) */}
              {isOwner && (
                <button
                  onClick={() => router.push(`/id/${id}/edit`)}
                  className="h-10 w-10 rounded-full bg-[#f5f4f2] hover:bg-[#6b7d47]/10 flex items-center justify-center text-[#2d2d2d] transition flex-shrink-0"
                  aria-label="Edit"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
              )}
              
              {/* Share button */}
              <button
                onClick={handleShare}
                className="h-10 w-10 rounded-full bg-[#f5f4f2] hover:bg-[#6b7d47]/10 flex items-center justify-center text-[#2d2d2d] transition flex-shrink-0"
                aria-label="Share"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Hero Photo Gallery */}
      <div ref={heroRef} className="relative w-full" style={{ height: "min(60vh, 600px)" }}>
        {allPhotos.length > 0 ? (
          <div className="relative w-full h-full bg-[#f5f4f2] rounded-b-3xl overflow-hidden">
            {allPhotos.length === 1 ? (
              <img
                src={allPhotos[0]}
                alt={place.title}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="grid grid-cols-2 h-full gap-1">
                {/* Main large photo on left */}
                <div className="relative">
                  <img
                    src={allPhotos[0]}
                    alt={place.title}
                    className="w-full h-full object-cover"
                  />
                </div>
                {/* Grid of smaller photos on right */}
                <div className="grid grid-rows-2 gap-1">
                  {allPhotos.slice(1, 3).map((photo, index) => (
                    <div key={index} className="relative overflow-hidden">
                      <img
                        src={photo}
                        alt={`${place.title} - Photo ${index + 2}`}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ))}
                  {allPhotos.length > 3 && (
                    <button
                      onClick={() => scrollToSection("photos")}
                      className="relative bg-black/40 hover:bg-black/50 transition group"
                    >
                      <img
                        src={allPhotos[3]}
                        alt={`${place.title} - Photo 4`}
                        className="w-full h-full object-cover opacity-60 group-hover:opacity-70"
                      />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-white font-semibold text-lg">
                          +{allPhotos.length - 3}
                        </span>
                      </div>
                    </button>
                  )}
                </div>
              </div>
            )}
            
            {/* Navigation buttons */}
            <button
              onClick={() => router.back()}
              className="absolute top-4 left-4 h-10 w-10 rounded-full bg-white/90 backdrop-blur-sm flex items-center justify-center text-[#2d2d2d] hover:bg-white transition shadow-sm z-10"
              aria-label="Back"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>

            <div className="absolute top-4 right-4 flex items-center gap-2 z-10">
              {userId && (
                <button
                  onClick={toggleFavorite}
                  disabled={favoriteLoading}
                  className={cx(
                    "h-10 w-10 rounded-full bg-white/90 backdrop-blur-sm flex items-center justify-center transition shadow-sm",
                    isFavorite ? "text-[#6b7d47]" : "text-[#6b7d47]/60",
                    favoriteLoading && "opacity-50"
                  )}
                  aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
                >
                  <svg
                    className="w-5 h-5"
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
              )}
              {isOwner && (
                <button
                  onClick={() => router.push(`/id/${id}/edit`)}
                  className="h-10 w-10 rounded-full bg-white/90 backdrop-blur-sm flex items-center justify-center text-[#2d2d2d] hover:bg-white transition shadow-sm"
                  aria-label="Edit"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="w-full h-full bg-[#f5f4f2] flex items-center justify-center rounded-b-3xl">
            <svg className="w-16 h-16 text-[#6b7d47]/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
        )}
      </div>

      {/* Title and Meta Section */}
      <div className="px-4 lg:px-8 pt-6 pb-4">
        <div className="flex items-start justify-between gap-4 mb-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-2xl lg:text-3xl font-semibold text-[#2d2d2d]">{place.title}</h1>
              {isOwner && (
                <Link
                  href={`/id/${id}/edit`}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#6b7d47] text-white text-sm font-medium hover:bg-[#556036] transition shadow-sm"
                  title="Edit place"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  <span className="hidden sm:inline">Edit</span>
                </Link>
              )}
            </div>
            <div className="flex items-center gap-2 text-sm text-[#6b7d47]/70 mb-3">
              {place.city && <span>{place.city}</span>}
              {place.country && place.city && <span>·</span>}
              {place.country && <span>{place.country}</span>}
            </div>
          </div>
        </div>

        {/* Category chips */}
        {categories.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {categories.map((cat) => (
              <Link
                key={cat}
                href={`/?category=${encodeURIComponent(cat)}`}
                className="px-3 py-1.5 rounded-full text-xs font-medium text-[#6b7d47] bg-[#f5f4f2] border border-[#6b7d47]/20 hover:bg-[#6b7d47]/5 transition"
              >
                {cat}
              </Link>
            ))}
          </div>
        )}

        {/* Added by */}
        <div className="flex items-center gap-2 text-sm text-[#6b7d47]/60">
          <span>Added by {creatorName}</span>
          <span>·</span>
          <span>{timeAgo(place.created_at)}</span>
        </div>
      </div>


      {/* Content Sections */}
      <div className="px-4 lg:px-8 py-8">
        {/* Overview Section */}
        <section ref={overviewRef} id="overview" className="mb-16">
          {place.description && (
            <div className="mb-6">
              <p className="text-base text-[#2d2d2d] leading-relaxed whitespace-pre-wrap">
                {place.description}
              </p>
            </div>
          )}

          {/* Highlights */}
          {tags.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold text-[#2d2d2d] mb-3">Highlights</h3>
              <div className="flex flex-wrap gap-2">
                {tags.slice(0, 6).map((tag) => (
                  <span
                    key={tag}
                    className="px-3 py-1.5 rounded-full text-sm text-[#6b7d47] bg-[#f5f4f2] border border-[#6b7d47]/20"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Photos Section */}
        <section ref={photosRef} id="photos" className="mb-16">
          <h2 className="text-2xl font-semibold text-[#2d2d2d] mb-6">Photos</h2>
          {allPhotos.length === 0 ? (
            <div className="text-center py-12 text-[#6b7d47]/60">No photos available</div>
          ) : (
            <>
              <div className={cx(
                "grid gap-2",
                photosExpanded || allPhotos.length <= 4
                  ? "grid-cols-2 lg:grid-cols-3"
                  : "grid-cols-2 lg:grid-cols-4"
              )}>
                {(photosExpanded ? allPhotos : allPhotos.slice(0, 4)).map((photo, index) => (
                  <button
                    key={index}
                    onClick={() => {
                      setCurrentPhotoIndex(index);
                      setPhotosExpanded(true);
                    }}
                    className="aspect-square rounded-xl overflow-hidden bg-[#f5f4f2] group"
                  >
                    <img
                      src={photo}
                      alt={`${place.title} - Photo ${index + 1}`}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                    />
                  </button>
                ))}
              </div>
              {allPhotos.length > 4 && !photosExpanded && (
                <button
                  onClick={() => setPhotosExpanded(true)}
                  className="mt-4 w-full py-3 rounded-xl border border-[#6b7d47]/20 text-[#6b7d47] font-medium hover:bg-[#f5f4f2] transition"
                >
                  Show all {allPhotos.length} photos
                </button>
              )}
            </>
          )}
        </section>

        {/* Details Section */}
        <section ref={detailsRef} id="details" className="mb-16">
          <h2 className="text-2xl font-semibold text-[#2d2d2d] mb-6">Details</h2>
          
          <div className="space-y-6">
            {/* Address */}
            {place.address && (
              <div>
                <h3 className="text-sm font-semibold text-[#2d2d2d] mb-2">Address</h3>
                <p className="text-sm text-[#6b7d47]/70">{place.address}</p>
              </div>
            )}

            {/* Tags/Vibes */}
            {tags.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-[#2d2d2d] mb-2">Vibes</h3>
                <div className="flex flex-wrap gap-2">
                  {tags.map((tag) => (
                    <span
                      key={tag}
                      className="px-3 py-1.5 rounded-full text-sm text-[#6b7d47] bg-[#f5f4f2] border border-[#6b7d47]/20"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Added by */}
            <div>
              <h3 className="text-sm font-semibold text-[#2d2d2d] mb-2">Added by</h3>
              <div className="flex items-center gap-3">
                {creatorProfile?.avatar_url ? (
                  <img
                    src={creatorProfile.avatar_url}
                    alt={creatorName}
                    className="w-10 h-10 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-[#6b7d47]/20 flex items-center justify-center">
                    <span className="text-sm font-semibold text-[#6b7d47]">
                      {initialsFromName(creatorProfile?.display_name, creatorProfile?.username)}
                    </span>
                  </div>
                )}
                <div>
                  <div className="text-sm font-medium text-[#2d2d2d]">{creatorName}</div>
                  <div className="text-xs text-[#6b7d47]/60">{timeAgo(place.created_at)}</div>
                </div>
              </div>
            </div>

            {/* External Link */}
            {place.link && (
              <div>
                <a
                  href={place.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#6b7d47] text-white text-sm font-medium hover:bg-[#556036] transition"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                  Visit Website
                </a>
              </div>
            )}
          </div>
        </section>

        {/* Map Section */}
        <section ref={mapRef} id="map" className="mb-16">
          <h2 className="text-2xl font-semibold text-[#2d2d2d] mb-6">Location</h2>
          {place.lat && place.lng ? (
            <div className="space-y-4">
              <div className="h-[400px] lg:h-[500px] rounded-xl overflow-hidden bg-[#f5f4f2]">
                <PlaceMapView place={place} />
              </div>
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${place.lat},${place.lng}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-[#6b7d47]/20 text-[#6b7d47] text-sm font-medium hover:bg-[#f5f4f2] transition"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
                Open in Maps
              </a>
            </div>
          ) : (
            <div className="text-center py-12 text-[#6b7d47]/60">Location not available</div>
          )}
        </section>

        {/* Comments Section */}
        <section ref={commentsRef} id="comments" className="mb-16">
          <h2 className="text-2xl font-semibold text-[#2d2d2d] mb-6">Comments</h2>

          {/* Add comment */}
          {userId ? (
            <div className="mb-6 rounded-xl border border-[#6b7d47]/10 bg-white p-4">
              <textarea
                className="w-full bg-transparent text-sm outline-none text-[#2d2d2d] placeholder:text-[#6b7d47]/40 resize-none mb-3"
                placeholder="Share your thoughts..."
                rows={3}
                value={commentText}
                onChange={(e) => {
                  setCommentText(e.target.value);
                  setCommentError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    if (commentText.trim() && !sending) {
                      addComment();
                    }
                  }
                }}
              />
              {commentError && (
                <div className="mb-3 text-xs text-red-500">{commentError}</div>
              )}
              <div className="flex justify-end">
                <button
                  onClick={addComment}
                  disabled={!commentText.trim() || sending}
                  className="px-4 py-2 rounded-xl bg-[#6b7d47] text-white text-sm font-medium hover:bg-[#556036] disabled:opacity-50 transition"
                >
                  {sending ? "Posting…" : "Post"}
                </button>
              </div>
            </div>
          ) : (
            <div className="mb-6 rounded-xl border border-[#6b7d47]/10 bg-white p-4 text-center">
              <div className="text-sm text-[#6b7d47]/60 mb-2">Sign in to post comments</div>
              <button
                onClick={() => router.push("/auth")}
                className="px-4 py-2 rounded-xl bg-[#6b7d47] text-white text-sm font-medium hover:bg-[#556036] transition"
              >
                Sign In
              </button>
            </div>
          )}

          {/* Comments list */}
          {commentsLoading ? (
            <div className="text-center py-12 text-[#6b7d47]/60">Loading comments…</div>
          ) : comments.length === 0 ? (
            <div className="text-center py-12 text-[#6b7d47]/60">
              <div className="mb-1">No comments yet</div>
              <div className="text-sm">Be the first to share your thoughts</div>
            </div>
          ) : (
            <div className="space-y-4">
              {comments.map((c) => {
                const isMyComment = userId && c.user_id === userId;
                const userName = c.user_display_name || c.user_username || "User";
                const userAvatar = c.user_avatar_url;
                const userInitials = initialsFromName(c.user_display_name, c.user_username);
                
                return (
                  <div
                    key={c.id}
                    className="rounded-xl border border-[#6b7d47]/10 bg-white p-4"
                  >
                    <div className="flex items-start gap-3">
                      {userAvatar ? (
                        <img
                          src={userAvatar}
                          alt={userName}
                          className="w-10 h-10 rounded-full object-cover flex-shrink-0"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-[#6b7d47]/20 flex items-center justify-center flex-shrink-0">
                          <span className="text-sm font-semibold text-[#6b7d47]">
                            {userInitials}
                          </span>
                        </div>
                      )}
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <div className="flex items-center gap-2">
                            <div className="text-sm font-semibold text-[#2d2d2d]">
                              {userName}
                            </div>
                            <div className="text-xs text-[#6b7d47]/60">
                              {timeAgo(c.created_at)}
                            </div>
                          </div>
                          {isMyComment && (
                            <button
                              onClick={() => {
                                if (confirm("Delete this comment?")) {
                                  deleteComment(c.id);
                                }
                              }}
                              disabled={deletingCommentId === c.id}
                              className="text-xs text-red-500 hover:text-red-700 disabled:opacity-50 transition flex-shrink-0"
                            >
                              {deletingCommentId === c.id ? "Deleting..." : "Delete"}
                            </button>
                          )}
                        </div>
                        <div className="text-sm text-[#2d2d2d] leading-relaxed">
                          {c.text}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      <BottomNav />
    </main>
  );
}

// Map View Component
function PlaceMapView({ place }: { place: Place }) {
  const { isLoaded } = useJsApiLoader({
    id: "google-maps-loader",
    googleMapsApiKey: getGoogleMapsApiKey(),
    libraries: GOOGLE_MAPS_LIBRARIES,
  });

  if (!place.lat || !place.lng) {
    return (
      <div className="w-full h-full flex items-center justify-center text-[#6b7d47]/60">
        Location not available
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className="w-full h-full flex items-center justify-center text-[#6b7d47]/60">
        Loading map…
      </div>
    );
  }

  return (
    <GoogleMap
      mapContainerStyle={{ width: "100%", height: "100%" }}
      center={{ lat: place.lat, lng: place.lng }}
      zoom={15}
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
      <Marker
        position={{ lat: place.lat, lng: place.lng }}
        title={place.title}
      />
    </GoogleMap>
  );
}
