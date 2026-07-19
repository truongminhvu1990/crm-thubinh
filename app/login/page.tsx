"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { LogIn } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    try {
      const { error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        setError("Email hoặc mật khẩu không chính xác");
        return;
      }

      router.push("/dashboard");
    } catch (err) {
      setError("Có lỗi xảy ra, vui lòng thử lại");
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary to-secondary flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">💎</h1>
          <h2 className="text-2xl font-bold text-white">
            CRM Cẩm Thạch Thu Bình
          </h2>
          <p className="text-white/80 mt-2">
            Hệ thống quản lý khách hàng
          </p>
        </div>

        {/* Login Form */}
        <div className="bg-card rounded-lg shadow-xl p-8">
          <h3 className="text-2xl font-bold text-foreground mb-6 text-center">
            🔐 Đăng nhập
          </h3>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <Input
              type="email"
              label="Email"
              placeholder="Nhập email của bạn"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isLoading}
            />

            <Input
              type="password"
              label="Mật khẩu"
              placeholder="Nhập mật khẩu"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isLoading}
            />

            <Button
              type="submit"
              variant="primary"
              fullWidth
              isLoading={isLoading}
              className="mt-6"
            >
              <LogIn className="w-4 h-4" />
              Đăng nhập
            </Button>
          </form>

          <p className="text-center text-muted-foreground text-sm mt-6">
            Chưa có tài khoản?{" "}
            <a href="#" className="text-primary hover:underline font-medium">
              Liên hệ quản trị viên
            </a>
          </p>
        </div>

        {/* Demo Info */}
        <div className="mt-6 bg-white/10 border border-white/20 rounded-lg p-4 text-center text-sm text-white/90">
          <p>
            <strong>Demo:</strong> Sử dụng thông tin đăng nhập từ Supabase
          </p>
        </div>
      </div>
    </div>
  );
}