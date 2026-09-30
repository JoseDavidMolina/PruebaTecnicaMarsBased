import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { Package, RotateCcw } from "lucide-react";
import { DEMO_NOW, formatDateTime, zoneName } from "@/lib/clock";
import { USERS } from "@/data";
import { AutoSubmitSelect, LiveRefresh, SubmitButton } from "@/components/client-controls";
import { resetDemo, switchUser } from "./actions";
import { getDemo } from "./demo";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Oskendra Shipment Tracker",
  description: "Consolidated, reliable shipment tracking across sites, operators and modes (prototype)",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const { user, simulated, done } = await getDemo();
  const ops = USERS.filter((u) => u.role === "ops");
  const customers = USERS.filter((u) => u.role === "customer");

  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <header className="sticky top-0 z-[1000] border-b bg-white/90 backdrop-blur">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
            <Link href="/" className="flex items-center gap-2 font-semibold">
              <span className="grid size-7 place-items-center rounded-md bg-slate-900 text-white">
                <Package className="size-4" />
              </span>
              Oskendra <span className="font-normal text-muted-foreground">Shipment Tracker</span>
            </Link>
            <span
              className="text-xs text-muted-foreground"
              title="Fixed clock so the demo is identical on every run. All times are Madrid time."
            >
              Demo clock · {formatDateTime(DEMO_NOW.toISOString())} {zoneName()}
            </span>
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
