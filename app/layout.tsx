import type { Metadata } from "next";
// TEMP DISABLED
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";
import { createClient } from "@/lib/supabase/server";

// Display face utk judul/heading, body face utk teks & angka tabel — dipilih
// khusus, bukan default system font, supaya tampilan tidak terasa generik.
const display = { variable: "" };
const body = { variable: "" };

export const metadata: Metadata = {
  title: "SPJT Kendaraan ASN",
  description: "Monitoring kepatuhan pembayaran PKB kendaraan ASN",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <html lang="id" className={`${display.variable} ${body.variable}`}>
      <body>
        <div className="flex">
          <Sidebar isAdmin={!!user} />
          <div className="flex-1 min-h-screen flex flex-col">
            <Topbar />
            <main className="flex-1 p-6 max-w-6xl mx-auto w-full">{children}</main>
          </div>
        </div>
      </body>
    </html>
  );
}
