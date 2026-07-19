import Link from "next/link";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 to-secondary/10">
      {/* Hero Section */}
      <div className="max-w-4xl mx-auto px-6 py-20 text-center">
        <h1 className="text-5xl font-bold text-foreground mb-4">
          💎 CRM Cẩm Thạch Thu Bình
        </h1>
        <p className="text-xl text-muted-foreground mb-8">
          Hệ thống quản lý khách hàng hiện đại, đơn giản và hiệu quả
        </p>

        <div className="flex gap-4 justify-center mb-12">
          <Link href="/dashboard">
            <Button variant="primary" size="lg">
              🚀 Bắt đầu ngay
            </Button>
          </Link>
          <Link href="/customers">
            <Button variant="secondary" size="lg">
              👥 Xem khách hàng
            </Button>
          </Link>
        </div>
      </div>

      {/* Features Section */}
      <div className="max-w-6xl mx-auto px-6 py-12">
        <h2 className="text-3xl font-bold text-foreground mb-8 text-center">
          ✨ Tính năng chính
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card>
            <h3 className="text-lg font-semibold text-foreground mb-2">
              👥 Quản lý khách hàng
            </h3>
            <p className="text-muted-foreground">
              Lưu trữ và quản lý thông tin khách hàng một cách centralized, dễ tìm kiếm
            </p>
          </Card>

          <Card>
            <h3 className="text-lg font-semibold text-foreground mb-2">
              🔍 Tìm kiếm và lọc
            </h3>
            <p className="text-muted-foreground">
              Tìm kiếm nhanh chóng theo tên, mã khách, số điện thoại hoặc loại khách
            </p>
          </Card>

          <Card>
            <h3 className="text-lg font-semibold text-foreground mb-2">
              💎 VIP Management
            </h3>
            <p className="text-muted-foreground">
              Phân loại khách VIP và khách thường để quản lý hiệu quả hơn
            </p>
          </Card>

          <Card>
            <h3 className="text-lg font-semibold text-foreground mb-2">
              📞 Thông tin liên hệ
            </h3>
            <p className="text-muted-foreground">
              Lưu đầy đủ thông tin liên hệ: điện thoại, Facebook, Zalo...
            </p>
          </Card>

          <Card>
            <h3 className="text-lg font-semibold text-foreground mb-2">
              📊 Thống kê
            </h3>
            <p className="text-muted-foreground">
              Dashboard hiển thị thống kê tổng quan về khách hàng và hoạt động
            </p>
          </Card>

          <Card>
            <h3 className="text-lg font-semibold text-foreground mb-2">
              📝 Ghi chú
            </h3>
            <p className="text-muted-foreground">
              Thêm ghi chú chi tiết về mỗi khách hàng để theo dõi quan hệ
            </p>
          </Card>
        </div>
      </div>

      {/* CTA Section */}
      <div className="bg-card py-12 mt-12">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h2 className="text-2xl font-bold text-foreground mb-4">
            Sẵn sàng để bắt đầu?
          </h2>
          <p className="text-muted-foreground mb-6">
            Đăng nhập vào hệ thống để bắt đầu quản lý khách hàng của bạn ngay hôm nay
          </p>
          <Link href="/dashboard">
            <Button variant="primary" size="lg">
              Vào Dashboard
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}