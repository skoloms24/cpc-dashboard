export { auth as middleware } from "@/auth";

export const config = {
  // Everything requires sign-in except the sign-in page, auth callbacks, the cron endpoint (it checks its own secret) and static files.
  matcher: ["/((?!login|api/auth|api/cron|_next/static|_next/image|favicon.ico|icon.svg|brand).*)"],
};
