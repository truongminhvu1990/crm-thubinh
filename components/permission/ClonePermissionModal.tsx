"use client";

import { useState } from "react";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import Select from "@/components/ui/Select";
import Input from "@/components/ui/Input";
import { Role } from "@/types/permissionCenter";
import { slugify } from "@/lib/permission/permissionCenter.constants";

interface Props {
  open: boolean;
  sourceRole: Role;
  otherRoles: Role[];
  isSaving?: boolean;
  onClose: () => void;
  onClone: (target: { target_role_id?: string; role_key?: string; name?: string; description?: string }) => void;
}

/** Clone Permission (Decision 14, PERMISSION_UI.md §3.3) - target is a new
 * role or an existing one. Copies role_permissions only. */
export default function ClonePermissionModal({ open, sourceRole, otherRoles, isSaving = false, onClose, onClone }: Props) {
  const [mode, setMode] = useState<"new" | "existing">("existing");
  const [targetRoleId, setTargetRoleId] = useState("");
  const [newName, setNewName] = useState("");
  const [newKey, setNewKey] = useState("");
  const [error, setError] = useState("");

  if (!open) return null;

  function handleSubmit() {
    if (mode === "existing") {
      if (!targetRoleId) {
        setError("Vui lòng chọn vai trò đích");
        return;
      }
      onClone({ target_role_id: targetRoleId });
    } else {
      if (!newName.trim() || !newKey.trim()) {
        setError("Vui lòng nhập tên và mã vai trò mới");
        return;
      }
      onClone({ role_key: newKey.trim(), name: newName.trim() });
    }
  }

  return (
    <Modal open={open} title={`Sao chép quyền từ "${sourceRole.name}"`} onClose={onClose}>
      <div className="space-y-4 mb-6">
        <div className="flex gap-2">
          <Button variant={mode === "existing" ? "primary" : "secondary"} size="sm" onClick={() => setMode("existing")}>
            Vai trò có sẵn
          </Button>
          <Button variant={mode === "new" ? "primary" : "secondary"} size="sm" onClick={() => setMode("new")}>
            Vai trò mới
          </Button>
        </div>

        {mode === "existing" ? (
          <Select
            label="Vai trò đích"
            placeholder="Chọn vai trò"
            value={targetRoleId}
            onChange={(e) => setTargetRoleId(e.target.value)}
            options={otherRoles.map((r) => ({ value: r.id, label: r.name }))}
          />
        ) : (
          <>
            <Input
              label="Tên vai trò mới *"
              value={newName}
              onChange={(e) => {
                setNewName(e.target.value);
                setNewKey((prev) => (prev === slugify(newName) ? slugify(e.target.value) : prev || slugify(e.target.value)));
              }}
            />
            <Input label="Mã vai trò mới *" value={newKey} onChange={(e) => setNewKey(e.target.value)} />
          </>
        )}
        {error && <p className="text-destructive text-xs">{error}</p>}
        <p className="text-xs text-muted-foreground">
          Chỉ sao chép danh sách quyền. Phạm vi dữ liệu và cấu hình trường nhạy cảm của vai trò đích không thay đổi.
        </p>
      </div>
      <div className="flex justify-end gap-3">
        <Button variant="secondary" onClick={onClose} disabled={isSaving}>
          Hủy
        </Button>
        <Button variant="primary" onClick={handleSubmit} isLoading={isSaving}>
          Sao chép
        </Button>
      </div>
    </Modal>
  );
}
