/**
 * place_links — host pattern (location ↔ experience/service).
 *
 * Pure async wrappers вокруг supabase-js. RLS делает security: same-owner →
 * INSERT status='active'; cross-owner → INSERT status='pending', нужна approval.
 *
 * См. docs/PLACE_LINKS_PLAN.md.
 */

import { supabase } from "./supabase";
import type { PlaceListItem } from "../types";

export type PlaceLinkRelation = "happens_at";
export type PlaceLinkStatus = "active" | "pending" | "rejected";

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
 * Создать link. Status автоматически детектится из ownership:
 *   - юзер владеет parent → 'active' (same-owner branch).
 *   - юзер НЕ владеет parent → 'pending' (cross-owner branch).
 *
 * RLS additionally enforces, что юзер ВЛАДЕЕТ child (нельзя за чужой experience прицепить).
 *
 * Возвращает созданный PlaceLink или кидает ошибку.
 */
export async function createLink(args: {
  parentId: string;
  childId: string;
  relation?: PlaceLinkRelation;
}): Promise<PlaceLink> {
  // Резолвим owner'ов чтобы предсказать status (RLS будет двойной check)
  const { data: parents, error: parentErr } = await supabase
    .from("places")
    .select("id, created_by")
    .eq("id", args.parentId)
    .single();
  if (parentErr || !parents) {
    throw new Error(`createLink: parent place not found (${args.parentId})`);
  }

  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user?.id;
  if (!userId) {
    throw new Error("createLink: not authenticated");
  }

  const parentPlace = parents as { created_by: string | null };
  const status: PlaceLinkStatus =
    parentPlace.created_by === userId ? "active" : "pending";

  const { data, error } = await supabase
    .from("place_links")
    .insert({
      parent_place_id: args.parentId,
      child_place_id: args.childId,
      relation: args.relation ?? "happens_at",
      status,
      created_by: userId,
    } as never)
    .select(PLACE_LINK_SELECT)
    .single();

  if (error) {
    throw new Error(`createLink failed: ${error.message}`);
  }
  return data as PlaceLink;
}

/**
 * Approve a pending link. Только parent owner — RLS отрежет если кто другой.
 * Trigger автоматически проставит approved_at = now().
 */
export async function approveLink(linkId: string): Promise<PlaceLink> {
  const { data, error } = await supabase
    .from("place_links")
    .update({ status: "active" } as never)
    .eq("id", linkId)
    .eq("status", "pending")
    .select(PLACE_LINK_SELECT)
    .single();

  if (error) throw new Error(`approveLink failed: ${error.message}`);
  return data as PlaceLink;
}

/** Reject a pending link. */
export async function rejectLink(linkId: string): Promise<PlaceLink> {
  const { data, error } = await supabase
    .from("place_links")
    .update({ status: "rejected" } as never)
    .eq("id", linkId)
    .eq("status", "pending")
    .select(PLACE_LINK_SELECT)
    .single();

  if (error) throw new Error(`rejectLink failed: ${error.message}`);
  return data as PlaceLink;
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

/** Удалить link. RLS: либо parent owner, либо child owner. */
export async function removeLink(linkId: string): Promise<void> {
  const { error } = await supabase.from("place_links").delete().eq("id", linkId);
  if (error) throw new Error(`removeLink failed: ${error.message}`);
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
