import type { Metadata } from "next";
import { Barlow, Overpass_Mono } from "next/font/google";
import Link from "next/link";
import { RotateCcw } from "lucide-react";
import { USERS } from "@/data";
import { AutoSubmitSelect, LiveRefresh, SubmitButton } from "@/components/client-controls";
import { resetDemo, switchUser } from "./actions";
import { getDemo } from "./demo";
import "./globals.css";

// Barlow and Overpass Mono both descend from road-sign lettering; the mono is kept for verbatim operator data.
// Only latin is preloaded: latin-ext (Tomáš, México) still loads on demand through unicode-range.
const barlow = Barlow({ variable: "--font-barlow", subsets: ["latin"], weight: ["400", "500", "600", "700"] });
const overpassMono = Overpass_Mono({ variable: "--font-overpass-mono", subsets: ["latin"], preload: false });

/** A route from an origin (dot) to a destination (square). Same drawing as app/icon.svg. */
const Mark = () => (
  <svg viewBox="0 0 32 32" className="size-7" aria-hidden="true">
    <rect width="32" height="32" rx="7" fill="var(--primary)" />
    <path d="M11 21.5h3.5a3.5 3.5 0 0 0 3.5-3.5v-4a3.5 3.5 0 0 1 3.5-3.5" fill="none" stroke="#fff" strokeWidth="2.5" />
    <circle cx="8.5" cy="21.5" r="3" fill="#fff" />
    <rect x="21.5" y="7.5" width="5.5" height="5.5" rx="1" fill="none" stroke="#fff" strokeWidth="2.5" />
  </svg>
);

export const metadata: Metadata = {
  title: "Oskendra Shipment Tracker",
  description: "Consolidated, reliable shipment tracking across sites, operators and modes (prototype)",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const { user, simulated, done } = await getDemo();
  const ops = USERS.filter((u) => u.role === "ops");
  const customers = USERS.filter((u) => u.role === "customer");

  return (
    <html lang="en" className={`${barlow.variable} ${overpassMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <header className="sticky top-0 z-[1000] border-b bg-card/90 backdrop-blur">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
            <Link href="/" className="flex items-center gap-2 font-semibold">
              <Mark />
              Oskendra <span className="font-normal text-muted-foreground">Shipment Tracker</span>
            </Link>
            {/* Off in e2e runs (playwright.config.ts) so a refresh never lands mid-assertion. */}
            {user.role === "ops" && process.env.LIVE_REFRESH !== "off" && <LiveRefresh seconds={60} />}
            {/* Full width on phones so the switcher shrinks instead of pushing the page sideways. */}
            <div className="flex w-full min-w-0 items-center justify-end gap-2 sm:ml-auto sm:w-auto">
              {simulated.length + done.length > 0 && (
                <form action={resetDemo}>
                  <SubmitButton pendingText="Resetting…" className="shrink-0 px-2 text-muted-foreground hover:bg-muted">
                    <RotateCcw /> Reset demo
                  </SubmitButton>
                </form>
              )}
              <form action={switchUser} className="flex min-w-0 flex-1 items-center gap-2 sm:flex-initial">
                <label htmlFor="userId" className="shrink-0 text-xs text-muted-foreground">
                  Viewing as
                </label>
                <AutoSubmitSelect id="userId" name="userId" defaultValue={user.id} key={user.id} className="min-w-0 flex-1 sm:max-w-72">
                  <optgroup label="Operations">
                    {ops.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="Customers">
                    {customers.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </optgroup>
                </AutoSubmitSelect>
              </form>
            </div>
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
