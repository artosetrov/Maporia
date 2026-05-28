/**
 * app/robots.ts — robots.txt.
 *
 * Разрешаем индексировать всё, кроме приватных/админ-роутов и API.
 * Sitemap — указатель для Google/Bing.
 *
 * Next.js автоматически отдаёт это по `/robots.txt`.
 * Документация: https://nextjs.org/docs/app/api-reference/file-conventions/metadata/robots
 */

import type { MetadataRoute } from "next";

const SITE_URL = "https://www.maporia.co";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/admin/",
          "/auth/",
          "/login",
          "/signup",
          "/settings/",
          "/profile",
          "/profile/",
          "/saved",
          "/feed",
          "/add",
          "/places/", // /places/[id]/edit/*
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
