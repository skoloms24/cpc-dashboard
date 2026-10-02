import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { auth, isAdmin, signOut } from "@/auth";

export const metadata: Metadata = {
  title: "All-Star CPC",
  description: "Weekly cost per candidate for All-Star Talent clients",
  icons: { icon: "/icon.svg" },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const email = session?.user?.email;
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Archivo:wght@600;700;800&family=Figtree:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap"
        />
      </head>
      <body>
        {email && (
          <header className="topbar">
            <div className="topbar-in">
              <Link href="/" className="brand">All-Star <span>CPC</span></Link>
              <nav className="nav">
                <Link href="/">Overview</Link>
                {isAdmin(email) && <Link href="/admin">Admin</Link>}
              </nav>
              <div className="who">
                <span>{email}</span>
                <form action={async () => { "use server"; await signOut({ redirectTo: "/login" }); }}>
                  <button className="btn small" type="submit">Sign out</button>
                </form>
              </div>
            </div>
          </header>
        )}
        {children}
      </body>
    </html>
  );
}
