import type { NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/db";
import { ensureOwnerBootstrap } from "@/lib/auth/bootstrap";
import { redeemStashedInvite } from "@/lib/auth/redeem-invite";
import { isOidcEnabled, jwtSessionsEnabled } from "@/lib/auth/methods";
import { verifyPassword } from "@/lib/auth/password";
import { verifyStoredTotp } from "@/lib/auth/totp";
import { uniqueUsernameFromEmail } from "@/lib/auth/username";
import { checkRateLimit } from "@/lib/auth/rate-limit";

function buildOidcProvider() {
  if (!isOidcEnabled()) return null;
  const issuer = process.env.AUTH_OIDC_ISSUER;
  const clientId = process.env.AUTH_OIDC_CLIENT_ID;
  const clientSecret = process.env.AUTH_OIDC_CLIENT_SECRET;
  if (!issuer || !clientId || !clientSecret) {
    return null;
  }
  return {
    id: "oidc",
    name: "OIDC",
    type: "oidc" as const,
    issuer,
    clientId,
    clientSecret,
    checks: ["pkce", "state"] as ("pkce" | "state")[],
  };
}

function buildCredentialsProvider() {
  return Credentials({
    id: "credentials",
    name: "Credentials",
    credentials: {
      username: { label: "Username", type: "text" },
      password: { label: "Password", type: "password" },
      totpCode: { label: "TOTP", type: "text" },
    },
    async authorize(credentials) {
      const username = String(credentials?.username ?? "").trim();
      const password = String(credentials?.password ?? "");
      const totpCode = String(credentials?.totpCode ?? "").trim();
      if (!username || !password) return null;

      const rl = checkRateLimit(`login:${username}`, 20, 15 * 60 * 1000);
      if (!rl.allowed) return null;

      const user = await prisma.user.findFirst({
        where: {
          OR: [{ username }, { email: username.toLowerCase() }],
        },
      });
      if (!user?.passwordHash) return null;

      const ok = await verifyPassword(password, user.passwordHash);
      if (!ok) return null;

      const authSecret = process.env.AUTH_SECRET;
      if (!authSecret || authSecret.length < 32) return null;

      if (user.totpEnabled && user.totpSecret) {
        if (!totpCode) return null;
        if (!verifyStoredTotp(user.totpSecret, totpCode, authSecret)) {
          return null;
        }
      }

      return {
        id: user.id,
        email: user.email,
        name: user.name,
        image: user.image,
      };
    },
  });
}

const baseAdapter = PrismaAdapter(prisma);

const adapter = {
  ...baseAdapter,
  createUser: async (data: { id?: string; name?: string | null; email: string; emailVerified?: Date | null; image?: string | null }) => {
    const username = await uniqueUsernameFromEmail(data.email);
    return prisma.user.create({
      data: {
        email: data.email,
        emailVerified: data.emailVerified,
        name: data.name,
        image: data.image,
        username,
      },
    });
  },
};

const providers = [buildOidcProvider(), buildCredentialsProvider()].filter(
  Boolean,
) as NextAuthConfig["providers"];

if (providers.length === 0) {
  throw new Error(
    "No auth providers configured. Local credentials must always be available.",
  );
}

export const authConfig: NextAuthConfig = {
  adapter,
  providers,
  session: { strategy: jwtSessionsEnabled() ? "jwt" : "database" },
  pages: {
    signIn: "/signin",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user?.id) {
        token.sub = user.id;
      }
      return token;
    },
    async session({ session, token, user }) {
      const userId = user?.id ?? token?.sub;
      if (session.user && userId) {
        session.user.id = userId;
      }
      return session;
    },
    async signIn({ user, account }) {
      if (user.id && user.email) {
        if (account?.providerAccountId) {
          await prisma.user.update({
            where: { id: user.id },
            data: { oidcSub: account.providerAccountId },
          });
        }
        await ensureOwnerBootstrap(user.id, user.email);
        const inviteOk = await redeemStashedInvite(user.id, user.email);
        if (!inviteOk) return "/signin?signup=1&error=InviteEmailMismatch";
      }
      return true;
    },
  },
  trustHost: true,
};

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email?: string | null;
      name?: string | null;
      image?: string | null;
    };
  }
}
