-- B2: обернуть auth.uid() и is_admin() в (select …)
-- ====================================================
-- Контекст: docs/PROFILE_PERF_PLAN.md (направление B, этап 3).
-- Postgres зовёт STABLE-функции per-row, если они вызваны напрямую в WHERE.
-- Обёртка `(select auth.uid())` превращает вызов в initplan — выполняется
-- один раз на запрос. Семантика идентична.
--
-- Что НЕ трогаем в этой миграции:
--   - has_premium_access(), get_user_role() — VOLATILE; обёртка не помогает,
--     отдельный фикс в B2.1 (пометить STABLE).
--   - Дубли политик (B3) — не удаляем, только обновляем.
--
-- Применяется одной транзакцией. Если хоть один ALTER не валидный —
-- весь набор откатывается.

BEGIN;

-- =========== comments ===========

ALTER POLICY "Admins can delete any comment" ON public.comments
USING ((select is_admin()) = true);

ALTER POLICY "Users can delete their own comments" ON public.comments
USING ((select auth.uid()) = user_id);

ALTER POLICY "comments delete own" ON public.comments
USING ((select auth.uid()) = user_id);

ALTER POLICY "Authenticated users can comment" ON public.comments
WITH CHECK (
  ((select auth.uid()) IS NOT NULL)
  AND ((select auth.uid()) = user_id)
  AND (EXISTS (
    SELECT 1 FROM places
    WHERE places.id = comments.place_id
      AND ((places.comments_enabled IS NULL) OR (places.comments_enabled = true))
  ))
);

ALTER POLICY "comments insert own" ON public.comments
WITH CHECK ((select auth.uid()) = user_id);

ALTER POLICY "Premium users can view comments on premium places" ON public.comments
USING (EXISTS (
  SELECT 1 FROM places
  WHERE places.id = comments.place_id
    AND places.access_level = 'premium'::text
    AND ((has_premium_access() = true) OR (places.created_by = (select auth.uid())))
));

ALTER POLICY "Users can update their own comments" ON public.comments
USING ((select auth.uid()) = user_id)
WITH CHECK ((select auth.uid()) = user_id);

ALTER POLICY "comments update own" ON public.comments
USING ((select auth.uid()) = user_id);

-- =========== place_links ===========

ALTER POLICY "place_links_delete" ON public.place_links
USING (
  ((select auth.uid()) = (SELECT places.created_by FROM places WHERE places.id = place_links.parent_place_id))
  OR ((select auth.uid()) = (SELECT places.created_by FROM places WHERE places.id = place_links.child_place_id))
);

ALTER POLICY "place_links_insert" ON public.place_links
WITH CHECK (
  ((select auth.uid()) = (SELECT places.created_by FROM places WHERE places.id = place_links.child_place_id))
  AND (
    (
      ((select auth.uid()) = (SELECT places.created_by FROM places WHERE places.id = place_links.parent_place_id))
      AND (status = 'active'::text)
    )
    OR (
      ((select auth.uid()) <> (SELECT places.created_by FROM places WHERE places.id = place_links.parent_place_id))
      AND (status = 'pending'::text)
    )
  )
);

ALTER POLICY "place_links_select" ON public.place_links
USING (
  (status = 'active'::text)
  OR ((select auth.uid()) = (SELECT places.created_by FROM places WHERE places.id = place_links.parent_place_id))
  OR ((select auth.uid()) = (SELECT places.created_by FROM places WHERE places.id = place_links.child_place_id))
);

ALTER POLICY "place_links_update" ON public.place_links
USING ((select auth.uid()) = (SELECT places.created_by FROM places WHERE places.id = place_links.parent_place_id));

-- =========== place_photos ===========

ALTER POLICY "Users can delete place photos" ON public.place_photos
USING (EXISTS (
  SELECT 1 FROM places
  WHERE places.id = place_photos.place_id
    AND places.created_by = (select auth.uid())
));

ALTER POLICY "place_photos delete own" ON public.place_photos
USING ((select auth.uid()) = user_id);

ALTER POLICY "Users can insert place photos" ON public.place_photos
WITH CHECK (EXISTS (
  SELECT 1 FROM places
  WHERE places.id = place_photos.place_id
    AND places.created_by = (select auth.uid())
));

ALTER POLICY "place_photos insert own" ON public.place_photos
WITH CHECK ((select auth.uid()) = user_id);

ALTER POLICY "Users can update place photos" ON public.place_photos
USING (EXISTS (
  SELECT 1 FROM places
  WHERE places.id = place_photos.place_id
    AND places.created_by = (select auth.uid())
))
WITH CHECK (EXISTS (
  SELECT 1 FROM places
  WHERE places.id = place_photos.place_id
    AND places.created_by = (select auth.uid())
));

ALTER POLICY "place_photos update own" ON public.place_photos
USING ((select auth.uid()) = user_id);

-- =========== places ===========

ALTER POLICY "Admins can delete any place" ON public.places
USING ((select is_admin()) = true);

ALTER POLICY "Users can delete their own places" ON public.places
USING ((select auth.uid()) = created_by);

ALTER POLICY "Premium users and admins can create premium places" ON public.places
WITH CHECK (
  ((select auth.uid()) IS NOT NULL)
  AND (has_premium_access() = true)
  AND (access_level = 'premium'::text)
);

ALTER POLICY "Premium users and admins can create public places" ON public.places
WITH CHECK (
  ((select auth.uid()) IS NOT NULL)
  AND (has_premium_access() = true)
  AND ((access_level IS NULL) OR (access_level <> 'premium'::text))
);

ALTER POLICY "Users can create places" ON public.places
WITH CHECK ((select auth.uid()) = created_by);

ALTER POLICY "Users can insert places" ON public.places
WITH CHECK ((select auth.uid()) IS NOT NULL);

ALTER POLICY "Premium places viewable by premium users and admins" ON public.places
USING (
  (access_level = 'premium'::text)
  AND ((has_premium_access() = true) OR ((select auth.uid()) = created_by))
);

ALTER POLICY "Users can view their own places" ON public.places
USING ((select auth.uid()) = created_by);

ALTER POLICY "Admins can update any place" ON public.places
USING ((select is_admin()) = true)
WITH CHECK ((select is_admin()) = true);

ALTER POLICY "Users can update their own places" ON public.places
USING ((select auth.uid()) = created_by)
WITH CHECK (
  ((select auth.uid()) = created_by)
  AND (
    (get_user_role() <> 'standard'::text)
    OR ((access_level IS NULL) OR (access_level <> 'premium'::text))
    OR ((access_level = 'premium'::text) AND (has_premium_access() = true))
  )
);

-- =========== profiles ===========

ALTER POLICY "Admins can delete any profile" ON public.profiles
USING ((select is_admin()) = true);

ALTER POLICY "Users can insert own profile" ON public.profiles
WITH CHECK ((select auth.uid()) = id);

ALTER POLICY "Users can view own profile" ON public.profiles
USING ((select auth.uid()) = id);

ALTER POLICY "Admins can update any profile" ON public.profiles
USING ((select is_admin()) = true)
WITH CHECK ((select is_admin()) = true);

ALTER POLICY "Users can update own profile" ON public.profiles
USING ((select auth.uid()) = id);

ALTER POLICY "Users can update their own profile" ON public.profiles
USING ((select auth.uid()) = id)
WITH CHECK (
  ((select auth.uid()) = id)
  AND (
    (role IS NULL)
    OR (role = (SELECT profiles_1.role FROM profiles profiles_1 WHERE profiles_1.id = (select auth.uid())))
  )
  AND (
    (is_admin IS NULL)
    OR (is_admin = (SELECT profiles_1.is_admin FROM profiles profiles_1 WHERE profiles_1.id = (select auth.uid())))
  )
);

-- =========== reactions ===========

ALTER POLICY "Users can delete their own reactions" ON public.reactions
USING ((select auth.uid()) = user_id);

ALTER POLICY "Users can unlike places" ON public.reactions
USING ((select auth.uid()) = user_id);

ALTER POLICY "Authenticated users can like places" ON public.reactions
WITH CHECK (
  ((select auth.uid()) IS NOT NULL)
  AND ((select auth.uid()) = user_id)
);

ALTER POLICY "Users can like places" ON public.reactions
WITH CHECK ((select auth.uid()) = user_id);

ALTER POLICY "Users can view their own reactions" ON public.reactions
USING ((select auth.uid()) = user_id);

-- =========== subscriptions ===========

ALTER POLICY "subscriptions_self_select" ON public.subscriptions
USING ((select auth.uid()) = user_id);

COMMIT;

-- ===========================================
-- Sanity check (раскомментировать для ручного прогона):
-- SELECT tablename, policyname, qual, with_check
-- FROM pg_policies
-- WHERE schemaname = 'public'
--   AND tablename IN ('profiles','places','comments','reactions','place_photos','place_links','subscriptions')
--   AND (qual ~ '\bauth\.uid\(\)' OR with_check ~ '\bauth\.uid\(\)')
--   AND (qual !~ '\(select auth\.uid' OR qual IS NULL)
--   AND (with_check !~ '\(select auth\.uid' OR with_check IS NULL);
-- Должен вернуть 0 строк.
