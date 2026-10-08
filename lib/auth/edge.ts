import type { NextAuthConfig } from "next-auth";

/** Edge-safe config for middleware only (no Prisma, crypto, or password providers). */
export const edgeAuthConfig = {
  providers: [],
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const path = nextUrl.pathname;
      const isPublic =
        path === "/signin" ||
        path === "/setup" ||
        path === "/accept-invite" ||
        path.startsWith("/api/auth") ||
        path.startsWith("/_next") ||
        path === "/favicon.ico";
      if (isPublic) return true;
      return isLoggedIn;
    },
  },
  trustHost: true,
} satisfies NextAuthConfig;
