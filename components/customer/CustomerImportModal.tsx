"use client";

import { useState } from "react";
import { Upload, AlertTriangle, CheckCircle2 } from "lucide-react";
import { parseCustomersCsv, ParsedCustomerRow } from "@/lib/customerImportExport";
import { addCustomer, findCustomerByPhone } from "@/lib/customer.service";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";

interface Props {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
}

interface ImportSummary {
  created: number;
  duplicates: number;
  invalid: number;
}

export default function CustomerImportModal({ open, onClose, onImported }: Props) {
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<ParsedCustomerRow[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [summary, setSummary] = useState<ImportSummary | null>(null);

  function reset() {
    setFileName("");
    setRows([]);
    setSummary(null);
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setFileName(file.name);
    setSummary(null);
    const text = await file.text();
    setRows(parseCustomersCsv(text));
  }

  const validRows = rows.filter((r) => r.errors.length === 0);
  const invalidRows = rows.filter((r) => r.errors.length > 0);

  async function handleImport() {
    setIsImporting(true);
    let created = 0;
    let duplicates = 0;
    try {
      for (const row of validRows) {
        const duplicate = await findCustomerByPhone(row.data.phone!);
        if (duplicate) {
          duplicates++;
          continue;
        }
        const { error } = await addCustomer(row.data);
        if (!error) created++;
      }
      setSummary({ created, duplicates, invalid: invalidRows.length });
      setRows([]);
      onImported();
    } finally {
      setIsImporting(false);
    }
  }

  if (!open) return null;

  return (
    <Modal open={open} title="Nhập khách hàng từ CSV" onClose={handleClose}>
      <div className="space-y-4">
        {!summary && (
          <>
            <p className="text-sm text-muted-foreground">
              Chọn tệp CSV theo định dạng xuất từ hệ thống (dòng đầu là tên cột: customer_code,
              full_name, phone, ...). Họ tên và số điện thoại là bắt buộc. Khách hàng trùng số điện
              thoại với dữ liệu hiện có sẽ được bỏ qua.
            </p>

            <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-input rounded-lg py-8 cursor-pointer hover:border-primary transition-colors">
              <Upload className="w-6 h-6 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">{fileName || "Chọn tệp CSV..."}</span>
              <input type="file" accept=".csv,text/csv" className="hidden" onChange={handleFileChange} />
            </label>

            {rows.length > 0 && (
              <div className="text-sm space-y-2">
                <div className="flex items-center gap-4">
                  <span className="flex items-center gap-1.5 text-foreground">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    {validRows.length} dòng hợp lệ
                  </span>
                  {invalidRows.length > 0 && (
                    <span className="flex items-center gap-1.5 text-destructive">
                      <AlertTriangle className="w-4 h-4" />
                      {invalidRows.length} dòng lỗi
                    </span>
                  )}
                </div>

                {invalidRows.length > 0 && (
                  <div className="max-h-40 overflow-y-auto border border-border rounded-lg divide-y divide-border">
                    {invalidRows.map((r) => (
                      <div key={r.rowNumber} className="px-3 py-1.5 text-xs text-muted-foreground">
                        Dòng {r.rowNumber}: {r.errors.join(", ")}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {summary && (
          <div className="text-sm space-y-1.5 bg-muted/40 rounded-lg p-4">
            <p className="text-foreground font-medium">Hoàn tất nhập dữ liệu</p>
            <p className="text-muted-foreground">Đã thêm: {summary.created} khách hàng</p>
            {summary.duplicates > 0 && (
              <p className="text-muted-foreground">Bỏ qua (trùng số điện thoại): {summary.duplicates}</p>
            )}
            {summary.invalid > 0 && (
              <p className="text-muted-foreground">Bỏ qua (thiếu dữ liệu): {summary.invalid}</p>
            )}
          </div>
        )}

        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={handleClose} disabled={isImporting}>
            {summary ? "Đóng" : "Hủy"}
          </Button>
          {!summary && (
            <Button
              variant="primary"
              onClick={handleImport}
              isLoading={isImporting}
              disabled={validRows.length === 0}
            >
              Nhập{validRows.length > 0 ? ` ${validRows.length} khách hàng` : ""}
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
