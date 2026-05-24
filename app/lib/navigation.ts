type BackFallbackRouter = {
  back: () => void;
  push: (href: string) => void;
};

type PlaceCatalogKind = "location" | "service" | "experience" | null | undefined;

export function getPlaceCatalogHref(kind: PlaceCatalogKind): string {
  if (kind === "service") return "/map?kinds=service";
  if (kind === "experience") return "/map?kinds=experience";
  return "/map";
}

export function navigateBackOrFallback(router: BackFallbackRouter, fallbackHref = "/map") {
  if (typeof window === "undefined") return;

  if (window.history.length <= 1) {
    router.push(fallbackHref);
    return;
  }

  const currentHref = window.location.href;
  router.back();

  window.setTimeout(() => {
    if (window.location.href === currentHref) {
      router.push(fallbackHref);
    }
  }, 300);
}
