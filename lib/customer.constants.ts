export interface Option {
  value: string;
  label: string;
  swatch?: string;
}

export const GENDER_OPTIONS: Option[] = [
  { value: "Nam", label: "Nam" },
  { value: "Nữ", label: "Nữ" },
  { value: "Khác", label: "Khác" },
];

export const JADE_ORIGINS: Option[] = [
  { value: "Myanmar", label: "Myanmar" },
  { value: "Guatemala", label: "Guatemala" },
  { value: "Other", label: "Khác" },
];

export function labelFor(options: Option[], value?: string | null): string | undefined {
  return options.find((o) => o.value === value)?.label;
}
