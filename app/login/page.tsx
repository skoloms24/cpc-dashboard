import { signIn } from "@/auth";

export const metadata = { title: "Sign in · All-Star CPC" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; callbackUrl?: string }> }) {
  const { error, callbackUrl } = await searchParams;
  return (
    <div className="login">
      <div className="card">
        <div style={{ display: "grid", gap: 14 }}>
          <picture>
            <source srcSet="/brand/ast-logo-white.png" media="(prefers-color-scheme: dark)" />
            <img src="/brand/ast-logo.png" alt="All-Star Talent" width={150} height={51} />
          </picture>
          <h1>CPC Dashboard</h1>
        </div>
        <p className="hint">Weekly candidates, ad spend and cost per candidate for every client. Sign in with your All-Star Talent Google account.</p>
        {error && (
          <div className="msg bad">
            {error === "AccessDenied"
              ? "That Google account isn't an All-Star Talent account. Sign in with your work email."
              : "Sign-in didn't finish. Try again."}
          </div>
        )}
        <form action={async () => { "use server"; await signIn("google", { redirectTo: callbackUrl || "/" }); }}>
          <button className="btn primary" type="submit" style={{ width: "100%", padding: "11px 14px" }}>Sign in with Google</button>
        </form>
      </div>
    </div>
  );
}
