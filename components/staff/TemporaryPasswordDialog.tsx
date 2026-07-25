"use client";

import { useState } from "react";
import { Copy, Check, ShieldAlert } from "lucide-react";
import { Staff } from "@/types/staff";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";

interface Props {
  staff: Staff | null;
  temporaryPassword: string | null;
  onClose: () => void;
}

/** navigator.clipboard is undefined in insecure contexts (plain HTTP) and
 * some older/embedded browsers - not just a permissions issue, the property
 * itself may not exist, so `navigator.clipboard.writeText` throws before
 * any Promise is even created. Falls back to the legacy hidden-textarea +
 * execCommand("copy") technique, which works without the Clipboard API. */
async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Clipboard API present but blocked (e.g. permission denied) - fall through.
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();

  let succeeded = false;
  try {
    succeeded = document.execCommand("copy");
  } catch {
    succeeded = false;
  }

  document.body.removeChild(textarea);
  return succeeded;
}

/** Business Rule 5 - the temporary password is shown exactly once. The
 * caller (app/settings/staff/page.tsx) holds `temporaryPassword` only in
 * local component state and clears it on close, whichever way the popup
 * closes (this button, the X, or Escape/overlay - all route through
 * Modal's onClose) - it is never written to a URL, log, or storage, so once
 * this component unmounts there is no way to view it again. Only Reset
 * Password (out of scope for this package) may issue another one. */
export default function TemporaryPasswordDialog({ staff, temporaryPassword, onClose }: Props) {
  const [copied, setCopied] = useState(false);

  if (!staff || !temporaryPassword) return null;

  async function handleCopy() {
    const ok = await copyToClipboard(temporaryPassword!);
    if (ok) setCopied(true);
  }

  return (
    <Modal open title="Đã tạo tài khoản đăng nhập" onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Tài khoản đăng nhập cho <span className="font-medium text-foreground">{staff.full_name}</span> ({staff.email}) đã
          được tạo. Mật khẩu tạm thời dưới đây chỉ hiển thị một lần duy nhất.
        </p>

        <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted px-4 py-3">
          <code className="font-mono text-base tracking-wide text-foreground select-all">{temporaryPassword}</code>
          <Button variant="secondary" size="sm" onClick={handleCopy}>
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {copied ? "Đã sao chép" : "Sao chép"}
          </Button>
        </div>

        <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
          <p>
            Hãy lưu lại mật khẩu này trước khi đóng. Sau khi đóng, mật khẩu sẽ không thể xem lại - chỉ có thể tạo mật khẩu
            mới qua chức năng Đặt lại mật khẩu.
          </p>
        </div>

        <div className="flex justify-end">
          <Button variant="primary" onClick={onClose}>
            Tôi đã lưu mật khẩu, đóng
          </Button>
        </div>
      </div>
    </Modal>
  );
}
