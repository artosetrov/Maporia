import { redirect } from "next/navigation";

// SectionErrorBoundary: redirect-only route; no renderable section to wrap.

type SearchParamsRecord = Record<string, string | string[] | undefined>;

function appendParam(params: URLSearchParams, key: string, value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    value.forEach((item) => {
      if (item) params.append(key, item);
    });
    return;
  }

  if (value) params.set(key, value);
}

export default async function SearchRedirectPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParamsRecord>;
}) {
  const incoming = (await searchParams) ?? {};
  const params = new URLSearchParams();

  Object.entries(incoming).forEach(([key, value]) => {
    appendParam(params, key, value);
  });

  const query = params.toString();
  redirect(query ? `/map?${query}` : "/map");
}
