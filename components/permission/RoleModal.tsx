"use client";

import { useEffect, useState } from "react";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { slugify } from "@/lib/permission/permissionCenter.constants";

interface Props {
  open: boolean;
  title: string;
  initial?: { role_key?: string; name?: string; description?: string | null };
  lockRoleKey?: boolean;
  isSaving?: boolean;
  onSave: (values: { role_key: string; name: string; description?: string }) => void;
  onClose: () => void;
}

/** Reused by Role List's "Add Role"/Edit (§2), Role Detail's Edit, and
 * Clone Permission's "New role" target (§3.3). */
export default function RoleModal({ open, title, initial, lockRoleKey = false, isSaving = false, onSave, onClose }: Props) {
  const [name, setName] = useState(initial?.name || "");
  const [roleKey, setRoleKey] = useState(initial?.role_key || "");
  const [description, setDescription] = useState(initial?.description || "");
  const [roleKeyTouched, setRoleKeyTouched] = useState(!!initial?.role_key);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setName(initial?.name || "");
      setRoleKey(initial?.role_key || "");
      setDescription(initial?.description || "");
      setRoleKeyTouched(!!initial?.role_key);
      setError("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function handleNameChange(value: string) {
    setName(value);
    if (!roleKeyTouched && !lockRoleKey) setRoleKey(slugify(value));
  }

  function handleSave() {
    if (!name.trim()) {
      setError("Vui lòng nhập tên vai trò");
      return;
    }
    if (!roleKey.trim()) {
      setError("Vui lòng nhập mã vai trò");
      return;
    }
    onSave({ role_key: roleKey.trim(), name: name.trim(), description: description.trim() || undefined });
  }

  if (!open) return null;

  return (
    <Modal open={open} title={title} onClose={onClose}>
      <div className="space-y-4 mb-6">
        <Input label="Tên vai trò *" value={name} onChange={(e) => handleNameChange(e.target.value)} error={error && !name.trim() ? error : undefined} />
        <Input
          label="Mã vai trò *"
          value={roleKey}
          disabled={lockRoleKey}
          onChange={(e) => {
            setRoleKeyTouched(true);
            setRoleKey(e.target.value);
          }}
          error={error && !roleKey.trim() ? error : undefined}
        />
        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">Mô tả</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </div>
      </div>
      <div className="flex justify-end gap-3">
        <Button variant="secondary" onClick={onClose} disabled={isSaving}>
          Hủy
        </Button>
        <Button variant="primary" onClick={handleSave} isLoading={isSaving}>
          Lưu
        </Button>
      </div>
    </Modal>
  );
}
