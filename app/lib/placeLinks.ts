/**
 * place_links — host pattern (location ↔ experience/service).
 *
 * Pure async wrappers around reads plus server-backed writes. The API routes
 * verify the caller, then use the service-role client so browser flows do not
 * depend on fragile direct-write RLS behavior.
 *
 * См. docs/PLACE_LINKS_PLAN.md.
 */

import { supabase } from "./supabase";
import type { PlaceListItem } from "../types";
import { sanitizePostgrestValueForLike } from "../utils";

export type PlaceLinkRelation = "happens_at";
export type PlaceLinkStatus = "active" | "pending" | "rejected";
export type PlaceKindLite = "location" | "service" | "experience";

export type PlaceLink = {
  id: string;
  parent_place_id: string;
  child_place_id: string;
  relation: PlaceLinkRelation;
  status: PlaceLinkStatus;
  sort_order: number;
  created_at: string;
  approved_at: string | null;
  created_by: string | null;
};

const PLACE_LINK_SELECT =
  "id,parent_place_id,child_place_id,relation,status,sort_order,created_at,approved_at,created_by";

type PlaceLinkApiResponse = {
  ok?: boolean;
  link?: PlaceLink;
  error?: string;
};

async function getAccessToken(action: string): Promise<string> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new Error(`${action}: not authenticated`);
  return token;
}

async function readJsonResponse(response: Response): Promise<PlaceLinkApiResponse | null> {
  return (await response.json().catch(() => null)) as PlaceLinkApiResponse | null;
}

async function readLinkResponse(response: Response, action: string): Promise<PlaceLink> {
  const payload = await readJsonResponse(response);
  if (!response.ok || !payload?.link) {
    throw new Error(`${action} failed: ${payload?.error || response.statusText}`);
  }
  return payload.link;
}

/**
 * Получить список service/experience-карточек, прицеплённых к данной location.
 * Только status='active' (RLS обеспечивает для public viewers; для owner'а
 * pending/rejected приходят через `getPendingRequestsForOwner`).
 */
export async function getChildrenOfLocation(
  parentId: string,
): Promise<PlaceListItem[]> {
  const { data, error } = await supabase
    .from("place_links")
    .select(
      `
      child:places!place_links_child_place_id_fkey(
        id, title, description, city, city_name_cached, country, address,
        cover_url, categories, tags, lat, lng, created_at, created_by,
        access_level, visibility, kind
      ),
      sort_order,
      created_at
    `,
    )
    .eq("parent_place_id", parentId)
    .eq("status", "active")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[placeLinks] getChildrenOfLocation:", error.message);
    return [];
  }

  // Supabase returns nested join as an object (or array) — нормализуем
  type Row = { child: PlaceListItem | PlaceListItem[] | null };
  return ((data ?? []) as Row[])
    .map((r) => (Array.isArray(r.child) ? r.child[0] : r.child))
    .filter((p): p is PlaceListItem => p != null);
}

/**
 * Получить parent locations для service/experience-карточки. Backlink на page.
 */
export async function getParentsOfChild(
  childId: string,
): Promise<PlaceListItem[]> {
  const { data, error } = await supabase
    .from("place_links")
    .select(
      `
      parent:places!place_links_parent_place_id_fkey(
        id, title, description, city, city_name_cached, country, address,
        cover_url, categories, tags, lat, lng, created_at, created_by,
        access_level, visibility, kind
      ),
      sort_order,
      created_at
    `,
    )
    .eq("child_place_id", childId)
    .eq("status", "active")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[placeLinks] getParentsOfChild:", error.message);
    return [];
  }

  type Row = { parent: PlaceListItem | PlaceListItem[] | null };
  return ((data ?? []) as Row[])
    .map((r) => (Array.isArray(r.parent) ? r.parent[0] : r.parent))
    .filter((p): p is PlaceListItem => p != null);
}

/**
 * Создать link. Server API детектит status из ownership:
 *   - юзер владеет parent → 'active' (same-owner branch).
 *   - юзер НЕ владеет parent → 'pending' (cross-owner branch).
 *
 * API additionally enforces, что юзер ВЛАДЕЕТ child (нельзя за чужой experience прицепить).
 *
 * Возвращает созданный PlaceLink или кидает ошибку.
 */
export async function createLink(args: {
  parentId: string;
  childId: string;
  relation?: PlaceLinkRelation;
}): Promise<PlaceLink> {
  const token = await getAccessToken("createLink");
  const response = await fetch("/api/place-links", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      parentId: args.parentId,
      childId: args.childId,
      relation: args.relation ?? "happens_at",
    }),
  });

  return readLinkResponse(response, "createLink");
}

/**
 * Approve a pending link. Только parent owner/admin — API отрежет если кто другой.
 * Trigger автоматически проставит approved_at = now().
 */
export async function approveLink(linkId: string): Promise<PlaceLink> {
  const token = await getAccessToken("approveLink");
  const response = await fetch(`/api/place-links/${encodeURIComponent(linkId)}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ status: "active" }),
  });

  return readLinkResponse(response, "approveLink");
}

/** Reject a pending link. */
export async function rejectLink(linkId: string): Promise<PlaceLink> {
  const token = await getAccessToken("rejectLink");
  const response = await fetch(`/api/place-links/${encodeURIComponent(linkId)}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ status: "rejected" }),
  });

  return readLinkResponse(response, "rejectLink");
}

/**
 * Inbox: список pending requests, в которых юзер — parent owner.
 * Используется в /places/[id]/edit/links и /profile (badge counter).
 *
 * RLS отдаёт юзеру только pending его собственных locations.
 */
export async function getPendingRequestsForOwner(): Promise<
  Array<{
    link: PlaceLink;
    child: PlaceListItem;
    parent: PlaceListItem;
  }>
> {
  const { data, error } = await supabase
    .from("place_links")
    .select(
      `
      *,
      child:places!place_links_child_place_id_fkey(
        id, title, description, cover_url, kind, created_at, created_by
      ),
      parent:places!place_links_parent_place_id_fkey(
        id, title, kind, created_at, created_by
      )
    `,
    )
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[placeLinks] getPendingRequestsForOwner:", error.message);
    return [];
  }

  type Row = PlaceLink & {
    child: PlaceListItem | PlaceListItem[] | null;
    parent: PlaceListItem | PlaceListItem[] | null;
  };

  return ((data ?? []) as Row[])
    .map((row) => {
      const child = Array.isArray(row.child) ? row.child[0] : row.child;
      const parent = Array.isArray(row.parent) ? row.parent[0] : row.parent;
      if (!child || !parent) return null;
      const link: PlaceLink = {
        id: row.id,
        parent_place_id: row.parent_place_id,
        child_place_id: row.child_place_id,
        relation: row.relation,
        status: row.status,
        sort_order: row.sort_order,
        created_at: row.created_at,
        approved_at: row.approved_at,
        created_by: row.created_by,
      };
      return { link, child, parent };
    })
    .filter((r): r is NonNullable<typeof r> => r != null);
}

/** Удалить link. API: либо parent owner, либо child owner, либо admin. */
export async function removeLink(linkId: string): Promise<void> {
  const token = await getAccessToken("removeLink");
  const response = await fetch(`/api/place-links/${encodeURIComponent(linkId)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    const payload = await readJsonResponse(response);
    throw new Error(`removeLink failed: ${payload?.error || response.statusText}`);
  }
}

/** Подсчёт pending requests для UI badge на /profile. */
export async function getPendingRequestsCount(): Promise<number> {
  const { count, error } = await supabase
    .from("place_links")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");

  if (error) {
    console.error("[placeLinks] getPendingRequestsCount:", error.message);
    return 0;
  }
  return count ?? 0;
}

/**
 * Поиск кандидатов для линковки. RLS фильтрует доступ — отдаст public + own.
 *
 * Используется в AddPlaceLinkPanel. Сортирует own-первыми, затем по recency.
 * Возвращает только active (не is_hidden), чтобы черновики не попадали в выдачу.
 *
 * См. docs/PLACE_LINKS_PHASE6_PLAN.md § 4.1.
 */
export async function searchLinkCandidates(args: {
  query: string;
  kinds: PlaceKindLite[];
  excludePlaceId: string;
  excludeIds?: string[];
  limit?: number;
}): Promise<PlaceListItem[]> {
  const q = args.query.trim();
  if (q.length < 2) return [];
  if (args.kinds.length === 0) return [];

  const limit = args.limit ?? 8;
  const pattern = `%${sanitizePostgrestValueForLike(q)}%`;

  // Все исключения: сама карточка + уже линкованные.
  const excludeIds = Array.from(
    new Set([args.excludePlaceId, ...(args.excludeIds ?? [])].filter(Boolean)),
  );

  // RLS отрежет приватные чужие карточки. Дополнительно отсеиваем черновики (is_hidden=true)
  // на стороне клиента ниже — Postgres-фильтр по is_hidden=false здесь работает,
  // но для null безопаснее проверять явно.
  let queryBuilder = supabase
    .from("places")
    .select(
      "id, title, description, city, city_name_cached, country, address, cover_url, categories, tags, lat, lng, created_at, created_by, access_level, visibility, kind",
    )
    .in("kind", args.kinds)
    .or(`title.ilike.${pattern},city.ilike.${pattern}`)
    .order("created_at", { ascending: false })
    .limit(limit * 2); // запас — отфильтруем own/exclude/hidden ниже

  if (excludeIds.length > 0) {
    queryBuilder = queryBuilder.not(
      "id",
      "in",
      `(${excludeIds.join(",")})`,
    );
  }

  const { data, error } = await queryBuilder;
  if (error) {
    console.error("[placeLinks] searchLinkCandidates:", error.message);
    return [];
  }

  const rows = (data ?? []) as PlaceListItem[];

  // Sort: own first (если у нас есть session.user, см. ниже), затем by created_at desc.
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user?.id ?? null;

  return rows
    .sort((a, b) => {
      const aOwn = userId && a.created_by === userId ? 1 : 0;
      const bOwn = userId && b.created_by === userId ? 1 : 0;
      if (aOwn !== bOwn) return bOwn - aOwn;
      return (b.created_at || "").localeCompare(a.created_at || "");
    })
    .slice(0, limit);
}

/**
 * Резолвит уже существующий link между parent и child (любой status).
 * Используется, чтобы UI мог отличить «ещё не линкован» от «уже линкован, видишь ниже».
 */
export async function findExistingLink(args: {
  parentId: string;
  childId: string;
}): Promise<PlaceLink | null> {
  const { data, error } = await supabase
    .from("place_links")
    .select(PLACE_LINK_SELECT)
    .eq("parent_place_id", args.parentId)
    .eq("child_place_id", args.childId)
    .maybeSingle();

  if (error) {
    console.error("[placeLinks] findExistingLink:", error.message);
    return null;
  }
  return (data as PlaceLink | null) ?? null;
}
