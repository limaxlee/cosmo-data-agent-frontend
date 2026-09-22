import { NextRequest, NextResponse } from "next/server";

function backendOrigin(): string {
  return (process.env.BACKEND_ORIGIN || "").replace(/\/+$/, "");
}

const STRIPPED_RESPONSE_HEADERS = new Set([
  "content-encoding",
  "content-length",
  "transfer-encoding",
  "connection",
]);

async function proxy(
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> },
): Promise<NextResponse> {
  const origin = backendOrigin();

  if (!origin) {
    return new NextResponse("BACKEND_ORIGIN is not configured", {
      status: 500,
    });
  }

  const { path } = await ctx.params;

  const target = `${origin}/${path.map(encodeURIComponent).join("/")}${
    req.nextUrl.search
  }`;

  const headers = new Headers();

  for (const name of ["accept", "content-type"]) {
    const value = req.headers.get(name);

    if (value) headers.set(name, value);
  }

  const hasBody = req.method !== "GET" && req.method !== "HEAD";

  try {
    const upstream = await fetch(target, {
      method: req.method,
      headers,
      body: hasBody ? await req.arrayBuffer() : undefined,
      cache: "no-store",
    });

    const responseHeaders = new Headers();

    upstream.headers.forEach((value, name) => {
      if (!STRIPPED_RESPONSE_HEADERS.has(name.toLowerCase())) {
        responseHeaders.set(name, value);
      }
    });

    return new NextResponse(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error(`Backend proxy failed for ${req.method} ${target}:`, error);

    return new NextResponse("Backend unreachable", { status: 502 });
  }
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;

export const dynamic = "force-dynamic";
