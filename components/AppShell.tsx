"use client";

import { useState, useRef } from "react";
import { usePathname } from "next/navigation";
import Sidebar from "./Sidebar";
import Header from "./Header";
import { GlobalDateFilterProvider } from "@/lib/hooks/useGlobalDateFilter";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();

  // Guards against the mobile "ghost click" problem: some touch browsers
  // dispatch a second, slightly-delayed synthetic click for a single
  // physical tap. Opening the sidebar renders a full-screen backdrop over
  // the same spot the hamburger button sits at, so that duplicate click can
  // land on the backdrop and close the drawer immediately after it opens.
  // Ignoring close requests within a short window of opening absorbs the
  // duplicate event without adding a second piece of open/closed state -
  // sidebarOpen above remains the only source of truth.
  const openedAtRef = useRef(0);

  function openSidebar() {
    openedAtRef.current = Date.now();
    setSidebarOpen(true);
  }

  function closeSidebar() {
    if (Date.now() - openedAtRef.current < 400) return;
    setSidebarOpen(false);
  }

  // Close the mobile drawer whenever the route changes. Adjusted during
  // render (not in an effect) per React's guidance for state that depends
  // on a changing prop - avoids an extra render pass.
  const [lastPathname, setLastPathname] = useState(pathname);
  if (pathname !== lastPathname) {
    setLastPathname(pathname);
    setSidebarOpen(false);
  }

  return (
    <GlobalDateFilterProvider>
      <div className="min-h-screen">
        <Sidebar open={sidebarOpen} onClose={closeSidebar} />

        <div className="lg:pl-64 flex flex-col min-h-screen">
          <Header onMenuClick={openSidebar} />

          <main className="flex-1">
            <div className="max-w-[1400px] mx-auto p-4 sm:p-6 lg:p-8">{children}</div>
          </main>
        </div>
      </div>
    </GlobalDateFilterProvider>
  );
}
