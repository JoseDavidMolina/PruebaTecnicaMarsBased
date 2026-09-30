import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { Package, RotateCcw } from "lucide-react";
import { DEMO_NOW, formatDateTime } from "@/lib/clock";
import { USERS } from "@/data";
import { AutoSubmitSelect, SubmitButton } from "@/components/client-controls";
import { resetDemo, switchUser } from "./actions";
import { getDemo } from "./demo";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Arvenza Shipment Tracker",
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
              Arvenza <span className="font-normal text-muted-foreground">Shipment Tracker</span>
            </Link>
            <span className="text-xs text-muted-foreground" title="Fixed clock so the demo is identical on every run">
              Demo clock · {formatDateTime(DEMO_NOW.toISOString())}
            </span>
            <div className="ml-auto flex items-center gap-2">
              {simulated.length + done.length > 0 && (
                <form action={resetDemo}>
                  <SubmitButton pendingText="Resetting…" className="text-muted-foreground hover:bg-muted">
                    <RotateCcw /> Reset demo
                  </SubmitButton>
                </form>
              )}
              <form action={switchUser} className="flex items-center gap-2">
                <label htmlFor="userId" className="text-xs text-muted-foreground">
                  Viewing as
                </label>
                <AutoSubmitSelect id="userId" name="userId" defaultValue={user.id} key={user.id} className="max-w-72">
                  <optgroup label="Operations">
                    {ops.map((u) => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </optgroup>
                  <optgroup label="Customers">
                    {customers.map((u) => (
                      <option key={u.id} value={u.id}>{u.name}</option>
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
