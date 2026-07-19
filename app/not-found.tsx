import Link from "next/link";
import { SearchX } from "lucide-react";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";

export default function NotFound() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <Card className="max-w-md w-full text-center">
        <SearchX className="w-10 h-10 text-muted-foreground mx-auto mb-4" />
        <h2 className="text-xl font-bold text-foreground mb-2">Không tìm thấy trang</h2>
        <p className="text-muted-foreground mb-6">
          Trang bạn đang tìm không tồn tại hoặc đã bị di chuyển.
        </p>
        <Link href="/dashboard">
          <Button variant="primary">Về Dashboard</Button>
        </Link>
      </Card>
    </div>
  );
}
