import type { Metadata } from "next";
import { buildPlaceMetadata, getPlaceSeoById } from "../../lib/placeSeo";

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

export default function PlaceLayout({ children }: LayoutProps) {
  return children;
}
