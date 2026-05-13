export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { PATCH as updateRole } from "../role/route";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const response = await updateRole(request, context);
  response.headers.set("x-maporia-admin-role-route", "role-v2");

  if (response.ok) {
    return response;
  }

  const body = await response
    .clone()
    .json()
    .catch(() => null);

  if (!body || typeof body !== "object" || !("error" in body)) {
    return response;
  }

  return NextResponse.json(
    {
      ...body,
      error: `[role-v2] ${String((body as { error: unknown }).error)}`,
    },
    {
      status: response.status,
      headers: {
        "x-maporia-admin-role-route": "role-v2",
      },
    }
  );
}
