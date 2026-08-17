"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Landmark, Plus, Pencil, Power } from "lucide-react";
import { useMasterDataIdOptions } from "@/lib/hooks/useMasterDataOptions";
import { getPartners } from "@/lib/partner/partner.service";
import { getReceivingAccounts } from "@/lib/receivingAccount.service";
import { ReceivingAccount, CreateReceivingAccountInput, UpdateReceivingAccountInput } from "@/types/receivingAccount";
import { Partner } from "@/types/partner";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Badge from "@/components/ui/Badge";
import Modal from "@/components/ui/Modal";

/** Payment / Bank Account / Money-Debt domain redesign, Stage 3, Phase 8 —
 * management UI for receiving_accounts. Placed as its own dedicated
 * Settings sub-page (matching the existing Settings hub's own
 * tile-per-area pattern — Master Data, Staff, Permissions each already
 * have one) rather than folded into the flat Master Data value-list page,
 * since a receiving account has two FK relationships (bank, owner) that
 * page's UI isn't built to resolve/display. No DELETE action anywhere —
 * is_active=false (via the Power toggle) is the only supported way to
 * retire an account, per the approved design. */
export default function ReceivingAccountsPage() {
  const [accounts, setAccounts] = useState<ReceivingAccount[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ReceivingAccount | null>(null);
  const [bankId, setBankId] = useState("");
  const [ownerPartnerId, setOwnerPartnerId] = useState("");
  const [currencyValue, setCurrencyValue] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [label, setLabel] = useState("");
  const [moneyChangerPartnerId, setMoneyChangerPartnerId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Dev fix (2026-08-17) — bank_id is a real UUID FK to master_data.id
  // (receiving_accounts.bank_id REFERENCES master_data(id)), not the plain
  // text `value` column every other master-data dropdown in this codebase
  // uses. useMasterDataIdOptions returns options whose `value` IS the id
  // directly, so bankId always holds a UUID from the moment it's set — no
  // resolve/convert step needed anywhere before this form submits.
  const bankOptions = useMasterDataIdOptions("bank", bankId);
  const bankById = new Map(bankOptions.map((b) => [b.value, b.label]));
  // Stage 5 (Product Owner Locked Decisions, 2026-08-16), Phase 3 — only
  // partners whose partner_type is exactly "Money Changer" may appear here
  // (Decision 8: Money Changer only for this stage; Supplier excluded).
  // Never inferred from ownerPartnerId — a fully independent selection.
  const moneyChangerPartners = partners.filter((p) => p.partner_type === "Money Changer");

  async function reload() {
    setLoading(true);
    const [accountRows, partnerRows] = await Promise.all([
      getReceivingAccounts({ includeInactive: true }),
      getPartners(),
    ]);
    setAccounts(accountRows);
    setPartners(partnerRows);
    setLoading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load on mount, not an external-system subscription
    reload();
  }, []);

  const partnerNameById = new Map(partners.map((p) => [p.id, p.name]));

  function openCreate() {
    setEditing(null);
    setBankId("");
    setOwnerPartnerId("");
    setCurrencyValue("");
    setAccountNumber("");
    setLabel("");
    setMoneyChangerPartnerId("");
    setError(null);
    setModalOpen(true);
  }

  function openEdit(account: ReceivingAccount) {
    setEditing(account);
    setBankId(account.bank_id);
    setOwnerPartnerId(account.owner_partner_id);
    setCurrencyValue(account.currency);
    setAccountNumber(account.account_number);
    setLabel(account.label ?? "");
    setMoneyChangerPartnerId(account.money_changer_partner_id ?? "");
    setError(null);
    setModalOpen(true);
  }

  async function handleSave() {
    setError(null);
    if (!bankId) return setError("Vui lòng chọn ngân hàng");
    if (!ownerPartnerId) return setError("Vui lòng chọn chủ tài khoản");
    if (!currencyValue) return setError("Vui lòng nhập loại tiền tệ");
    if (!accountNumber) return setError("Vui lòng nhập số tài khoản");

    setIsSaving(true);
    try {
      const path = editing ? `/api/receiving-accounts/${editing.id}` : "/api/receiving-accounts";
      const method = editing ? "PATCH" : "POST";
      const body: CreateReceivingAccountInput | UpdateReceivingAccountInput = {
        bank_id: bankId,
        owner_partner_id: ownerPartnerId,
        currency: currencyValue,
        account_number: accountNumber,
        label: label || null,
        // Always sent explicitly (never omitted) so an edit can clear a
        // previously-set association back to NULL, not just add/change one.
        money_changer_partner_id: moneyChangerPartnerId || null,
      };
      const res = await fetch(path, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) {
        const responseBody = await res.json().catch(() => ({}));
        throw new Error(responseBody.error || "Không thể lưu tài khoản nhận tiền");
      }
      setModalOpen(false);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Đã có lỗi xảy ra");
    } finally {
      setIsSaving(false);
    }
  }

  async function toggleActive(account: ReceivingAccount) {
    await fetch(`/api/receiving-accounts/${account.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !account.is_active }),
    });
    await reload();
  }

  return (
    <div className="pb-8">
      <Link href="/settings" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft className="w-4 h-4" /> Cài đặt
      </Link>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Landmark className="w-6 h-6 text-primary" />
            Tài khoản nhận tiền
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Ngân hàng, chủ tài khoản và số tài khoản dùng để nhận thanh toán Chuyển khoản ngân hàng
          </p>
        </div>
        <Button data-testid="add-receiving-account-button" onClick={openCreate}>
          <Plus className="w-4 h-4 mr-1.5" /> Thêm tài khoản
        </Button>
      </div>

      <Card className="p-0 overflow-hidden">
        {loading ? (
          <p className="p-6 text-sm text-muted-foreground">Đang tải...</p>
        ) : accounts.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">Chưa có tài khoản nhận tiền nào.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground uppercase tracking-wide bg-muted/30">
                <th className="text-left font-semibold px-4 py-2.5">Ngân hàng</th>
                <th className="text-left font-semibold px-4 py-2.5">Chủ tài khoản</th>
                <th className="text-left font-semibold px-4 py-2.5">Tiền tệ</th>
                <th className="text-left font-semibold px-4 py-2.5">Số tài khoản</th>
                <th className="text-left font-semibold px-4 py-2.5">Ghi chú</th>
                <th className="text-left font-semibold px-4 py-2.5">Money Changer</th>
                <th className="text-left font-semibold px-4 py-2.5">Trạng thái</th>
                <th className="text-right font-semibold px-4 py-2.5">Hành động</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((account) => (
                <tr key={account.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-2.5">{bankById.get(account.bank_id) ?? "—"}</td>
                  <td className="px-4 py-2.5">{partnerNameById.get(account.owner_partner_id) ?? "—"}</td>
                  <td className="px-4 py-2.5">{account.currency}</td>
                  <td className="px-4 py-2.5">{account.account_number}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{account.label || "—"}</td>
                  <td className="px-4 py-2.5">
                    {account.money_changer_partner_id ? (partnerNameById.get(account.money_changer_partner_id) ?? "—") : "—"}
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge variant={account.is_active ? "success" : "muted"}>{account.is_active ? "Đang hoạt động" : "Ngừng hoạt động"}</Badge>
                  </td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => openEdit(account)}
                      className="p-1.5 text-muted-foreground hover:text-foreground"
                      aria-label="Sửa"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleActive(account)}
                      className="p-1.5 text-muted-foreground hover:text-foreground"
                      aria-label={account.is_active ? "Ngừng hoạt động" : "Kích hoạt lại"}
                    >
                      <Power className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Modal open={modalOpen} title={editing ? "Sửa tài khoản nhận tiền" : "Thêm tài khoản nhận tiền"} onClose={() => setModalOpen(false)}>
        {error && <div className="mb-4 rounded-lg bg-red-100 text-red-700 text-sm px-3 py-2">{error}</div>}
        <div className="space-y-4">
          <Select
            label="Ngân hàng *"
            placeholder="Chọn ngân hàng"
            options={bankOptions}
            value={bankId}
            onChange={(e) => setBankId(e.target.value)}
          />
          <Select
            label="Chủ tài khoản *"
            placeholder="Chọn đối tác"
            options={partners.map((p) => ({ value: p.id, label: p.name }))}
            value={ownerPartnerId}
            onChange={(e) => setOwnerPartnerId(e.target.value)}
          />
          <Input label="Tiền tệ *" placeholder="VND / CNY / USD" value={currencyValue} onChange={(e) => setCurrencyValue(e.target.value)} />
          <Input label="Số tài khoản *" placeholder="****1234" value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} />
          <Input label="Ghi chú" value={label} onChange={(e) => setLabel(e.target.value)} />
          <Select
            data-testid="receiving-account-money-changer-select"
            label="Money Changer"
            placeholder="Không liên kết (None)"
            options={moneyChangerPartners.map((p) => ({ value: p.id, label: p.name }))}
            value={moneyChangerPartnerId}
            onChange={(e) => setMoneyChangerPartnerId(e.target.value)}
          />
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <Button variant="secondary" onClick={() => setModalOpen(false)} disabled={isSaving}>
            Hủy
          </Button>
          <Button variant="primary" onClick={handleSave} isLoading={isSaving}>
            Lưu
          </Button>
        </div>
      </Modal>
    </div>
  );
}
