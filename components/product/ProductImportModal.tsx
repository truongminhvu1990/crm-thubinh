"use client";

import { useState } from "react";
import { Upload, AlertTriangle, CheckCircle2, Copy } from "lucide-react";
import { parseProductImportFile, ParsedProductRow } from "@/lib/productImportExport";
import { bulkAddProducts, findExistingProductCodes } from "@/lib/product.service";
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
  failed: number;
}

type RowStatus = "valid" | "invalid" | "duplicate_db" | "duplicate_file";

interface CheckedRow extends ParsedProductRow {
  status: RowStatus;
}

export default function ProductImportModal({ open, onClose, onImported }: Props) {
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<CheckedRow[]>([]);
  const [isReading, setIsReading] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [readError, setReadError] = useState("");

  function reset() {
    setFileName("");
    setRows([]);
    setSummary(null);
    setReadError("");
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
    setReadError("");
    setIsReading(true);

    try {
      const parsed = await parseProductImportFile(file);

      // Duplicate Product Code validation - both within the file itself and
      // against products already in the database. Only the first occurrence
      // of a code within the file is left importable; every row sharing a
      // duplicated code (in-file or in-DB) is flagged and skipped.
      const codesToCheck = Array.from(
        new Set(parsed.filter((r) => r.errors.length === 0 && r.data.product_code).map((r) => r.data.product_code!))
      );
      const existingCodes = await findExistingProductCodes(codesToCheck);

      const seen = new Set<string>();
      const checked: CheckedRow[] = parsed.map((row) => {
        if (row.errors.length > 0) return { ...row, status: "invalid" };

        const code = row.data.product_code!;
        if (existingCodes.has(code)) return { ...row, status: "duplicate_db" };
        if (seen.has(code)) return { ...row, status: "duplicate_file" };
        seen.add(code);
        return { ...row, status: "valid" };
      });

      setRows(checked);
    } catch (error) {
      console.error("Error parsing product import file:", error);
      setReadError("Không đọc được tệp Excel. Vui lòng dùng tệp mẫu đã tải xuống.");
    } finally {
      setIsReading(false);
    }
  }

  const validRows = rows.filter((r) => r.status === "valid");
  const invalidRows = rows.filter((r) => r.status === "invalid");
  const duplicateRows = rows.filter((r) => r.status === "duplicate_db" || r.status === "duplicate_file");

  async function handleImport() {
    setIsImporting(true);
    try {
      const { data, error } = await bulkAddProducts(validRows.map((r) => r.data));

      if (error) {
        setSummary({ created: 0, duplicates: duplicateRows.length, invalid: invalidRows.length, failed: validRows.length });
        return;
      }

      setSummary({
        created: data?.length || 0,
        duplicates: duplicateRows.length,
        invalid: invalidRows.length,
        failed: 0,
      });
      setRows([]);
      onImported();
    } finally {
      setIsImporting(false);
    }
  }

  if (!open) return null;

  return (
    <Modal open={open} title="Nhập nhanh sản phẩm từ Excel" onClose={handleClose}>
      <div className="space-y-4">
        {!summary && (
          <>
            <p className="text-sm text-muted-foreground">
              Chọn tệp Excel (.xlsx) theo định dạng tệp mẫu. Mã sản phẩm và tên sản phẩm là bắt buộc.
              Sản phẩm trùng mã (trong tệp hoặc đã có trong hệ thống) sẽ bị bỏ qua.
            </p>

            <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-input rounded-lg py-8 cursor-pointer hover:border-primary transition-colors">
              <Upload className="w-6 h-6 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">{fileName || "Chọn tệp Excel (.xlsx)..."}</span>
              <input
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="hidden"
                onChange={handleFileChange}
              />
            </label>

            {isReading && <p className="text-sm text-muted-foreground text-center">Đang đọc tệp...</p>}
            {readError && <p className="text-sm text-destructive">{readError}</p>}

            {rows.length > 0 && !isReading && (
              <div className="text-sm space-y-2">
                <div className="flex flex-wrap items-center gap-4">
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
                  {duplicateRows.length > 0 && (
                    <span className="flex items-center gap-1.5 text-amber-600">
                      <Copy className="w-4 h-4" />
                      {duplicateRows.length} dòng trùng mã
                    </span>
                  )}
                </div>

                {invalidRows.length > 0 && (
                  <div className="max-h-32 overflow-y-auto border border-border rounded-lg divide-y divide-border">
                    {invalidRows.map((r) => (
                      <div key={r.rowNumber} className="px-3 py-1.5 text-xs text-muted-foreground">
                        Dòng {r.rowNumber}: {r.errors.join(", ")}
                      </div>
                    ))}
                  </div>
                )}

                {duplicateRows.length > 0 && (
                  <div className="max-h-32 overflow-y-auto border border-border rounded-lg divide-y divide-border">
                    {duplicateRows.map((r) => (
                      <div key={r.rowNumber} className="px-3 py-1.5 text-xs text-muted-foreground">
                        Dòng {r.rowNumber}: Mã &quot;{r.data.product_code}&quot;{" "}
                        {r.status === "duplicate_db" ? "đã tồn tại trong hệ thống" : "bị lặp lại trong tệp"}
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
            <p className="text-foreground font-medium">
              {summary.failed > 0 ? "Nhập dữ liệu thất bại" : "Hoàn tất nhập dữ liệu"}
            </p>
            {summary.failed > 0 ? (
              <p className="text-destructive">
                Lỗi khi ghi {summary.failed} sản phẩm vào hệ thống, vui lòng thử lại.
              </p>
            ) : (
              <p className="text-muted-foreground">Đã thêm: {summary.created} sản phẩm</p>
            )}
            {summary.duplicates > 0 && (
              <p className="text-muted-foreground">Bỏ qua (trùng mã sản phẩm): {summary.duplicates}</p>
            )}
            {summary.invalid > 0 && <p className="text-muted-foreground">Bỏ qua (dữ liệu không hợp lệ): {summary.invalid}</p>}
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
              disabled={validRows.length === 0 || isReading}
            >
              Nhập{validRows.length > 0 ? ` ${validRows.length} sản phẩm` : ""}
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
