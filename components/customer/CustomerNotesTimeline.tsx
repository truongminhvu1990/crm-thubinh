"use client";

import { useState } from "react";
import { Clock3, Pencil, Trash2, Send, X, Check } from "lucide-react";
import { Customer, CustomerNote } from "@/types/customer";
import {
  parseCustomerNotes,
  addCustomerNote,
  updateCustomerNote,
  deleteCustomerNote,
} from "@/lib/customer.service";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import AlertDialog from "@/components/ui/AlertDialog";

interface Props {
  customer: Customer;
  onUpdate: (updated: Customer) => void;
}

function sortNotes(notes: CustomerNote[]): CustomerNote[] {
  return [...notes].sort((a, b) => {
    if (!a.created_at) return 1;
    if (!b.created_at) return -1;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}

function formatTimestamp(iso: string): string {
  if (!iso) return "Trước đây";
  return new Date(iso).toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function CustomerNotesTimeline({ customer, onUpdate }: Props) {
  const notes = sortNotes(parseCustomerNotes(customer.notes));

  const [newNote, setNewNote] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  async function handleAdd() {
    if (!customer.id || !newNote.trim()) return;
    setIsSaving(true);
    try {
      const { data, error } = await addCustomerNote(customer.id, notes, newNote.trim());
      if (error) throw error;
      if (data) {
        onUpdate(data);
        setNewNote("");
      }
    } catch (error) {
      alert("Lỗi khi thêm ghi chú");
      console.error(error);
    } finally {
      setIsSaving(false);
    }
  }

  function startEdit(note: CustomerNote) {
    setEditingId(note.id);
    setEditingText(note.content);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditingText("");
  }

  async function handleSaveEdit(noteId: string) {
    if (!customer.id || !editingText.trim()) return;
    setIsSaving(true);
    try {
      const { data, error } = await updateCustomerNote(customer.id, notes, noteId, editingText.trim());
      if (error) throw error;
      if (data) {
        onUpdate(data);
        cancelEdit();
      }
    } catch (error) {
      alert("Lỗi khi cập nhật ghi chú");
      console.error(error);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(noteId: string) {
    if (!customer.id) return;
    setIsSaving(true);
    try {
      const { data, error } = await deleteCustomerNote(customer.id, notes, noteId);
      if (error) throw error;
      if (data) onUpdate(data);
    } catch (error) {
      alert("Lỗi khi xóa ghi chú");
      console.error(error);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Card>
      <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
        <Clock3 className="w-5 h-5 text-primary" />
        Timeline
      </h2>

      <div className="flex gap-2 mb-5">
        <textarea
          placeholder="Thêm sự kiện mới về khách hàng..."
          value={newNote}
          onChange={(e) => setNewNote(e.target.value)}
          rows={2}
          disabled={isSaving}
          className="flex-1 rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
        />
        <Button
          variant="primary"
          size="sm"
          onClick={handleAdd}
          disabled={isSaving || !newNote.trim()}
          className="self-end"
        >
          <Send className="w-4 h-4" />
          Thêm
        </Button>
      </div>

      {notes.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">Chưa có sự kiện nào.</p>
      ) : (
        <ul className="space-y-4">
          {notes.map((note, index) => (
            <li key={note.id} className="relative pl-5">
              {index !== notes.length - 1 && (
                <span className="absolute left-[5px] top-4 bottom-[-16px] w-px bg-border" />
              )}
              <span className="absolute left-0 top-1.5 w-2.5 h-2.5 rounded-full bg-primary" />

              {editingId === note.id ? (
                <div className="space-y-2">
                  <textarea
                    value={editingText}
                    onChange={(e) => setEditingText(e.target.value)}
                    rows={2}
                    disabled={isSaving}
                    className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                  <div className="flex gap-2">
                    <Button variant="primary" size="sm" onClick={() => handleSaveEdit(note.id)} disabled={isSaving}>
                      <Check className="w-3.5 h-3.5" />
                      Lưu
                    </Button>
                    <Button variant="secondary" size="sm" onClick={cancelEdit} disabled={isSaving}>
                      <X className="w-3.5 h-3.5" />
                      Hủy
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="group">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm text-foreground whitespace-pre-wrap">{note.content}</p>
                    {note.id !== "legacy" && (
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                        <button
                          onClick={() => startEdit(note)}
                          className="p-1 hover:bg-primary/10 rounded transition-colors"
                          title="Sửa"
                        >
                          <Pencil className="w-3.5 h-3.5 text-primary" />
                        </button>
                        <button
                          onClick={() => setPendingDeleteId(note.id)}
                          className="p-1 hover:bg-destructive/10 rounded transition-colors"
                          title="Xóa"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-destructive" />
                        </button>
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {formatTimestamp(note.created_at)}
                    {note.updated_at && " (đã chỉnh sửa)"}
                  </p>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <AlertDialog
        open={!!pendingDeleteId}
        title="Xóa sự kiện này?"
        description="Hành động này không thể hoàn tác."
        onOpenChange={(open) => !open && setPendingDeleteId(null)}
        onConfirm={() => {
          if (pendingDeleteId) handleDelete(pendingDeleteId);
          setPendingDeleteId(null);
        }}
      />
    </Card>
  );
}
