import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import AppShell from "@/components/AppShell";
import { ReportPreferencesProvider } from "@/lib/reportColumns/useReportColumns";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin", "latin-ext"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "CRM Cẩm Thạch Thu Bình",
  description: "CRM quản lý khách hàng",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body className="bg-background margin-0 font-sans antialiased">
        <ReportPreferencesProvider>
          <AppShell>{children}</AppShell>
        </ReportPreferencesProvider>
      </body>
    </html>
  );
}