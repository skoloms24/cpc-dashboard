import { signIn } from "@/auth";

export const metadata = { title: "Sign in · All-Star CPC" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; callbackUrl?: string }> }) {
  const { error, callbackUrl } = await searchParams;
  return (
    <div className="login">
      <div className="card">
        <div>
          <div className="eyebrow">All-Star Talent</div>
          <h1>CPC Dashboard</h1>
        </div>
        <p className="hint">Weekly candidates, ad spend and cost per candidate for every client. Sign in with your allstartalent.us Microsoft account.</p>
        {error && (
          <div className="msg bad">
            {error === "AccessDenied"
              ? "That account isn't an allstartalent.us account. Sign in with your work email."
              : "Sign-in didn't finish. Try again."}
          </div>
        )}
        <form action={async () => { "use server"; await signIn("microsoft-entra-id", { redirectTo: callbackUrl || "/" }); }}>
          <button className="btn primary" type="submit" style={{ width: "100%", padding: "11px 14px" }}>Sign in with Microsoft</button>
        </form>
      </div>
    </div>
  );
}
