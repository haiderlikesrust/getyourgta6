import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/api/")) {
    const response = NextResponse.next();
    response.headers.set("X-Robots-Tag", "noindex");
    response.headers.set("Cache-Control", "no-store");
    return response;
  }
  return NextResponse.next();
}

export const config = {
  matcher: "/api/:path*",
};
