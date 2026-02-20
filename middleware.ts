import { NextResponse, type NextRequest } from "next/server";

const PROTECTED_PREFIXES = [
  "/",
  "/equipment",
  "/vehicles",
  "/inventory",
  "/employees",
  "/ops",
  "/scan",
  "/maintenance",
];

function isProtected(pathname: string) {
  return PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );
}

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();

  const { pathname } = req.nextUrl;

  // API routes should not be auth-gated by browser middleware.
  if (pathname.startsWith("/api")) return res;

  // Allow auth entry points through
  if (pathname.startsWith("/login") || pathname.startsWith("/auth/callback")) return res;

  // In Edge middleware, avoid heavy auth client usage.
  // Presence of Supabase auth-token cookies is enough for route gating.
  const hasAuthCookie = req.cookies
    .getAll()
    .some(
      (c) =>
        c.name.includes("-auth-token") &&
        (c.name.startsWith("sb-") || c.name.startsWith("__Secure-sb-"))
    );

  // Redirect if protected and not authenticated
  if (isProtected(pathname) && !hasAuthCookie) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return res;
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|favicon.png|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
