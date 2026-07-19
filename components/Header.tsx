"use client";

import { useRouter } from "next/navigation";
import { LogOut, Menu } from "lucide-react";
import Button from "@/components/ui/Button";
import Avatar from "@/components/ui/Avatar";
import { supabase } from "@/lib/supabase";

interface Props {
  onMenuClick: () => void;
}

export default function Header({ onMenuClick }: Props) {
  const router = useRouter();

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="h-16 bg-card/80 backdrop-blur-sm border-b border-border flex justify-between items-center px-4 sm:px-6 sticky top-0 z-30">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onMenuClick}
          className="lg:hidden text-muted-foreground hover:text-foreground p-1.5 -ml-1.5 rounded-md hover:bg-muted transition-colors touch-manipulation"
          aria-label="Mở menu"
        >
          <Menu className="w-5 h-5" />
        </button>
        <h2 className="text-lg font-semibold text-foreground tracking-tight">
          CRM Cẩm Thạch Thu Bình
        </h2>
      </div>

      <div className="flex items-center gap-4">
        <div className="hidden sm:flex items-center gap-2.5">
          <Avatar name="Admin" size="sm" />
          <div className="text-sm leading-tight">
            <p className="font-medium text-foreground">Admin</p>
            <p className="text-xs text-muted-foreground">Quản trị viên</p>
          </div>
        </div>
        <Button variant="secondary" size="sm" onClick={handleLogout}>
          <LogOut className="w-4 h-4" />
          <span className="hidden sm:inline">Đăng xuất</span>
        </Button>
      </div>
    </header>
  );
}
