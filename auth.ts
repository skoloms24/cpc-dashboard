import NextAuth from "next-auth";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";

const DOMAIN = (process.env.ALLOWED_EMAIL_DOMAIN || "allstartalent.us").toLowerCase();

export function emailAllowed(email?: string | null): boolean {
  return !!email && email.toLowerCase().endsWith("@" + DOMAIN);
}

export function isAdmin(email?: string | null): boolean {
  const list = (process.env.ADMIN_EMAILS || "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
  return !!email && list.includes(email.toLowerCase());
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [MicrosoftEntraID],
  pages: { signIn: "/login", error: "/login" },
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 14 },
  callbacks: {
    // Only people with an @allstartalent.us Microsoft account get in.
    signIn({ user, profile }) {
      const email = (profile?.email as string) || (profile?.preferred_username as string) || user.email;
      return emailAllowed(email);
    },
    jwt({ token, profile }) {
      if (profile) token.email = ((profile.email as string) || (profile.preferred_username as string) || token.email || "").toLowerCase();
      return token;
    },
    session({ session, token }) {
      if (session.user && token.email) session.user.email = token.email as string;
      return session;
    },
    authorized({ auth }) {
      return emailAllowed(auth?.user?.email);
    },
  },
});
