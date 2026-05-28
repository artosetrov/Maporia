import type { Metadata } from "next";
import { buildPlaceJsonLd, buildPlaceMetadata, getPlaceSeoById } from "../../lib/placeSeo";

export const dynamic = "force-dynamic";

type LayoutProps = {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: LayoutProps): Promise<Metadata> {
  const { id } = await params;
  const place = await getPlaceSeoById(id);
  return buildPlaceMetadata(place, `/id/${id}`);
}

export default async function PlaceLayout({ children, params }: LayoutProps) {
  const { id } = await params;
  const place = await getPlaceSeoById(id);
  const jsonLd = buildPlaceJsonLd(place);

  return (
    <>
      {/* schema.org structured data — rich snippets in Google.
          Server-rendered <script> with stringified JSON-LD is the
          documented pattern (https://nextjs.org/docs/app/guides/json-ld). */}
      {jsonLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      ) : null}
      {children}
    </>
  );
}
