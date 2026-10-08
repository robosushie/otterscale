import NextAuth from "next-auth";
import { edgeAuthConfig } from "@/lib/auth/edge";

const { auth } = NextAuth({
  ...edgeAuthConfig,
  secret: process.env.AUTH_SECRET,
});

export default auth;

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
