#!/usr/bin/env bash
#
# Аккуратный коммит email+пароль auth, без чужой работы (impersonation,
# contacts, airbnb-research) которая параллельно лежит в рабочей копии.
#
# Запуск из корня репозитория:
#   bash docs/auth-pr-commit.sh
#
# Что делает:
#  1. Снимает stale .git/index.lock (если есть — пустой, остался от падения).
#  2. Сохраняет текущий profile/page.tsx (с чужими impersonation-правками)
#     во временный файл.
#  3. Откатывает profile/page.tsx к HEAD.
#  4. Применяет поверх только 4 моих изменения (импорт + три router.push).
#  5. Stage-ит только мои auth-файлы и коммитит.
#  6. Восстанавливает impersonation-версию profile/page.tsx обратно в рабочую копию.
#
# После этого ты сам делаешь `git push` (или открываешь PR).

set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

# 1. Снять stale lock, если он пустой
if [ -f .git/index.lock ] && [ ! -s .git/index.lock ]; then
  echo "Removing stale .git/index.lock"
  rm -f .git/index.lock
fi

PROFILE="app/(auth)/profile/page.tsx"
BACKUP="$(mktemp -t profile_with_others.XXXXXX.tsx)"

# 2. Сохраняем текущий profile (с impersonation-правками) во временный файл
cp "$PROFILE" "$BACKUP"
echo "Backed up current $PROFILE -> $BACKUP"

# 3. Откатываем к HEAD
git checkout HEAD -- "$PROFILE"
echo "Reverted $PROFILE to HEAD"

# 4. Применяем мои 4 правки. Используем sed/perl для точечности.
#    a) Импорт getAuthUrl после useAuthRedirect
perl -i -pe '
  if (/^import \{ useAuthRedirect \} from "\.\.\/\.\.\/hooks\/useAuthRedirect";$/) {
    $_ .= qq(import { getAuthUrl } from "../../lib/authRedirect";\n);
  }
' "$PROFILE"

#    b) Три замены router.push("/auth?next=/profile?section=premium")
perl -i -pe 's{router\.push\("/auth\?next=/profile\?section=premium"\)}{router.push(getAuthUrl("/profile?section=premium"))}g' "$PROFILE"

# Sanity-check: должно быть ровно 3 вхождения нового кода
COUNT=$(grep -c 'router.push(getAuthUrl("/profile?section=premium"))' "$PROFILE" || true)
if [ "$COUNT" != "3" ]; then
  echo "ERROR: expected 3 router.push patches in $PROFILE, found $COUNT"
  echo "Restoring original from backup and aborting."
  cp "$BACKUP" "$PROFILE"
  exit 1
fi

if ! grep -q 'import { getAuthUrl } from "../../lib/authRedirect";' "$PROFILE"; then
  echo "ERROR: getAuthUrl import missing in $PROFILE"
  cp "$BACKUP" "$PROFILE"
  exit 1
fi

# 5. Точечный staging: только auth-файлы
git add \
  app/lib/auth/ \
  app/components/auth/ \
  app/login/ \
  app/signup/ \
  app/auth/callback/ \
  app/auth/reset/ \
  app/auth/update-password/ \
  app/auth/page.tsx \
  app/components/AuthModal.tsx \
  app/lib/authRedirect.ts \
  "$PROFILE" \
  docs/auth-email-password-plan.md \
  docs/auth-pr-commit.sh

echo
echo "==== git status (staged) ===="
git status --short

echo
echo "==== git diff --stat (staged) ===="
git diff --cached --stat

echo
read -r -p "Continue with commit? [y/N] " ans
if [ "$ans" != "y" ] && [ "$ans" != "Y" ]; then
  echo "Aborting. Restoring impersonation version of profile."
  cp "$BACKUP" "$PROFILE"
  git reset HEAD >/dev/null 2>&1 || true
  exit 1
fi

# 6. Commit
git commit -m "feat(auth): email + password sign in / sign up

- Add Supabase Auth wrappers (signUp, signInWithPassword, requestPasswordReset,
  updatePassword, resendConfirmation, sendMagicLink) with typed error mapping.
- Add AuthForm + PasswordField, used by /login, /signup, /auth/reset and
  /auth/update-password (mode-driven).
- Add /auth/callback as the single landing for confirm/reset/magic links and
  Google OAuth.
- Convert /auth into a back-compat bridge: forwards token URLs to
  /auth/callback, otherwise redirects to /login.
- AuthModal: primary CTA goes to /login, magic link kept as fallback.
- authRedirect.ts: getAuthUrl now returns /login?from=…; add getSignupUrl;
  expand BLOCKED_REDIRECT_PATHS.
- profile/page.tsx: fix three direct router.push(\"/auth?next=…\") calls
  (had a double-? bug) to use getAuthUrl().

Plan: docs/auth-email-password-plan.md
Dashboard side: enable Email provider with Confirm email = ON, add
/auth/callback to redirect URLs, set up SMTP before launch (Supabase free
tier limits to 2 emails/hour)."

# 7. Восстанавливаем impersonation в рабочей копии
cp "$BACKUP" "$PROFILE"
echo
echo "Restored impersonation version of $PROFILE in working copy."
echo "(Not staged. Untouched files from other in-flight work also remain.)"

echo
echo "Done. To push:"
echo "  git push origin main"
echo "Or open a feature branch instead:"
echo "  git checkout -b feature/auth-email-password && git push -u origin feature/auth-email-password"
