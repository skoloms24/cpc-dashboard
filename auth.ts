import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

// Sign-in is Google Workspace SSO, limited to one company domain (same setup as the SMS Portal).
// FAIL CLOSED: if ALLOWED_EMAIL_DOMAIN is missing, nobody gets in. A misconfiguration should
// lock everyone out (obvious, fixed in a minute), never let the whole internet in.
const DOMAIN = (process.env.ALLOWED_EMAIL_DOMAIN || "").trim().toLowerCase();

export function emailAllowed(email?: string | null): boolean {
  if (!DOMAIN) return false;
  return !!email && email.toLowerCase().endsWith("@" + DOMAIN);
}

export function isAdmin(email?: string | null): boolean {
  const list = (process.env.ADMIN_EMAILS || "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
  return !!email && list.includes(email.toLowerCase());
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      // Nudges Google's account chooser to the company domain. Not a security check on its
      // own (it can be changed client-side); the signIn callback below is the real check.
      authorization: { params: { hd: DOMAIN || undefined, prompt: "select_account" } },
    }),
  ],
  pages: { signIn: "/login", error: "/login" },
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 14 },
  callbacks: {
    signIn({ profile }) {
      if (!DOMAIN) {
        console.error("[auth] ALLOWED_EMAIL_DOMAIN is not set — refusing ALL sign-ins.");
        return false;
      }
      if ((profile as { email_verified?: boolean } | undefined)?.email_verified === false) return false;
      return emailAllowed(profile?.email);
    },
    authorized({ auth }) {
      return emailAllowed(auth?.user?.email);
    },
  },
});
