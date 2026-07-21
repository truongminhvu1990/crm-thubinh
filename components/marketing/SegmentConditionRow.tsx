"use client";

import { Trash2 } from "lucide-react";
import Select from "@/components/ui/Select";
import Input from "@/components/ui/Input";
import {
  SEGMENT_CONDITION_FIELDS,
  SEGMENT_CONDITION_OPERATOR_LABELS,
} from "@/lib/marketing/marketing.constants";
import { MarketingSegmentCondition, SegmentConditionField, SegmentConditionOperator } from "@/types/marketing";
import { Option } from "@/lib/customer.constants";

const FIELD_OPTIONS: Option[] = (Object.keys(SEGMENT_CONDITION_FIELDS) as SegmentConditionField[]).map((field) => ({
  value: field,
  label: SEGMENT_CONDITION_FIELDS[field].label,
}));

const BIRTHDAY_VALUE_OPTIONS: Option[] = [
  { value: "today", label: "Hôm nay" },
  { value: "this_month", label: "Tháng này" },
];

export type DraftCondition = Pick<MarketingSegmentCondition, "field" | "operator" | "value">;

interface Props {
  condition: DraftCondition;
  staffOptions: Option[];
  onChange: (next: DraftCondition) => void;
  onRemove: () => void;
}

/** One Condition Builder row (MARKETING_UI.md §4.1) - Field/Operator/Value,
 * Value's input shape follows SEGMENT_CONDITION_FIELDS[field].valueKind. */
export default function SegmentConditionRow({ condition, staffOptions, onChange, onRemove }: Props) {
  const meta = SEGMENT_CONDITION_FIELDS[condition.field];
  const operatorOptions: Option[] = meta.operators.map((op) => ({
    value: op,
    label: SEGMENT_CONDITION_OPERATOR_LABELS[op],
  }));

  function handleFieldChange(field: SegmentConditionField) {
    const nextMeta = SEGMENT_CONDITION_FIELDS[field];
    onChange({ ...condition, field, operator: nextMeta.operators[0], value: defaultValueFor(nextMeta.valueKind) });
  }

  function defaultValueFor(kind: string): DraftCondition["value"] {
    if (kind === "number" || kind === "days") return 0;
    if (kind === "number_range") return [0, 0] as [number, number];
    if (kind === "birthday") return "today";
    return "";
  }

  function renderValueInput() {
    const operator: SegmentConditionOperator = condition.operator;

    if (meta.valueKind === "birthday") {
      return (
        <Select
          options={BIRTHDAY_VALUE_OPTIONS}
          value={typeof condition.value === "string" ? condition.value : "today"}
          onChange={(e) => onChange({ ...condition, value: e.target.value })}
        />
      );
    }

    if (meta.valueKind === "staff_select") {
      return (
        <Select
          options={staffOptions}
          placeholder="Chọn nhân viên"
          value={typeof condition.value === "string" ? condition.value : ""}
          onChange={(e) => onChange({ ...condition, value: e.target.value })}
        />
      );
    }

    if (operator === "between") {
      const [min, max] = Array.isArray(condition.value) ? condition.value : [0, 0];
      return (
        <div className="flex items-center gap-2">
          <Input
            type="number"
            value={min}
            onChange={(e) => onChange({ ...condition, value: [Number(e.target.value), max] })}
          />
          <span className="text-muted-foreground text-sm">-</span>
          <Input
            type="number"
            value={max}
            onChange={(e) => onChange({ ...condition, value: [min, Number(e.target.value)] })}
          />
        </div>
      );
    }

    if (operator === "within_last_days") {
      return (
        <Input
          type="number"
          min={0}
          placeholder="Số ngày"
          value={typeof condition.value === "number" ? condition.value : 0}
          onChange={(e) => onChange({ ...condition, value: Number(e.target.value) })}
        />
      );
    }

    if (operator === "before" || operator === "after") {
      return (
        <Input
          type="date"
          value={typeof condition.value === "string" ? condition.value : ""}
          onChange={(e) => onChange({ ...condition, value: e.target.value })}
        />
      );
    }

    if (meta.valueKind === "number") {
      return (
        <Input
          type="number"
          value={typeof condition.value === "number" ? condition.value : 0}
          onChange={(e) => onChange({ ...condition, value: Number(e.target.value) })}
        />
      );
    }

    return (
      <Input
        type="text"
        value={typeof condition.value === "string" ? condition.value : ""}
        onChange={(e) => onChange({ ...condition, value: e.target.value })}
      />
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-[1.2fr_1fr_1.2fr_auto] gap-3 items-start bg-muted/30 rounded-lg p-3">
      <Select options={FIELD_OPTIONS} value={condition.field} onChange={(e) => handleFieldChange(e.target.value as SegmentConditionField)} />
      <Select
        options={operatorOptions}
        value={condition.operator}
        onChange={(e) => onChange({ ...condition, operator: e.target.value as SegmentConditionOperator })}
      />
      {renderValueInput()}
      <button
        type="button"
        onClick={onRemove}
        className="p-2 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 self-center"
        title="Xóa điều kiện"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );
}
