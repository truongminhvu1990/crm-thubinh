"use client";

import { Customer } from "@/types/customer";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import {
  MapPin,
  Phone,
  Link2,
  MessageCircle,
  Cake,
  Briefcase,
  Globe2,
  Ruler,
  Wallet,
  Eye,
} from "lucide-react";
import { GENDER_OPTIONS, JADE_ORIGINS } from "@/lib/customer.constants";
import { HCM_DISTRICTS, HANOI_DISTRICTS } from "@/lib/location.constants";
import { parseMultiValue, serializeMultiValue } from "@/lib/customer.service";
import { useMasterDataOptions } from "@/lib/hooks/useMasterDataOptions";
import { useStaffOptions } from "@/lib/hooks/useStaffOptions";
import { useTagOptions } from "@/lib/hooks/useTagOptions";
import CreatableSelect from "@/components/ui/CreatableSelect";
import CreatableMultiSelect from "@/components/ui/CreatableMultiSelect";

interface Props {
  customer: Partial<Customer>;
  setCustomer: React.Dispatch<React.SetStateAction<Partial<Customer>>>;
  errors?: Record<string, string>;
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-sm font-semibold text-primary uppercase tracking-wide pt-2 first:pt-0">
      {children}
    </h3>
  );
}

export default function CustomerForm({
  customer,
  setCustomer,
  errors = {},
}: Props) {
  const updateField = (
    field: keyof Customer,
    value: string
  ) => {
    setCustomer({
      ...customer,
      [field]: value,
    });
  };

  const jadeType = useTagOptions("jade_type", customer.favorite_type);
  const favoriteColor = useTagOptions("favorite_color", customer.favorite_color);
  const purpose = useTagOptions("purchase_purpose", customer.purpose);
  const stageOptions = useMasterDataOptions("customer_stage", customer.vip_level);
  const salespersonOptions = useMasterDataOptions("salesperson", customer.assigned_salesperson);
  const staffOptions = useStaffOptions();
  const countryOptions = useMasterDataOptions("country", customer.country);
  const marketOptions = useMasterDataOptions("market", customer.province);

  const isVietnam = customer.country === "Việt Nam";
  const districtOptions =
    isVietnam && customer.province === "Hồ Chí Minh"
      ? HCM_DISTRICTS
      : isVietnam && customer.province === "Hà Nội"
      ? HANOI_DISTRICTS
      : null;
  const districtOptionsWithCurrent =
    districtOptions && customer.district && !districtOptions.some((o) => o.value === customer.district)
      ? [...districtOptions, { value: customer.district, label: customer.district }]
      : districtOptions;

  return (
    <div className="space-y-4">
      <SectionTitle>Cơ bản</SectionTitle>

      <div className="grid grid-cols-2 gap-4">
        <Input
          label="Mã khách hàng"
          placeholder="VD: KH001"
          value={customer.customer_code || ""}
          onChange={(e) => updateField("customer_code", e.target.value)}
          error={errors.customer_code}
        />

        <Input
          id="customer-full_name"
          label="Họ tên *"
          placeholder="Nhập họ tên"
          value={customer.full_name || ""}
          onChange={(e) => updateField("full_name", e.target.value)}
          error={errors.full_name}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Input
          id="customer-phone"
          label="Số điện thoại *"
          placeholder="Nhập số điện thoại"
          type="tel"
          value={customer.phone || ""}
          onChange={(e) => updateField("phone", e.target.value)}
          error={errors.phone}
          icon={<Phone className="w-4 h-4" />}
        />

        <Input
          label="Ngày sinh"
          type="date"
          value={customer.birthday || ""}
          onChange={(e) => updateField("birthday", e.target.value)}
          icon={<Cake className="w-4 h-4" />}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Select
          label="Giới tính"
          placeholder="Chọn giới tính"
          options={GENDER_OPTIONS}
          value={customer.gender || ""}
          onChange={(e) => updateField("gender", e.target.value)}
        />

        <Input
          label="Nghề nghiệp"
          placeholder="Nhập nghề nghiệp"
          value={customer.occupation || ""}
          onChange={(e) => updateField("occupation", e.target.value)}
          icon={<Briefcase className="w-4 h-4" />}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Input
          label="Facebook"
          placeholder="URL hoặc tên tài khoản"
          value={customer.facebook || ""}
          onChange={(e) => updateField("facebook", e.target.value)}
          icon={<Link2 className="w-4 h-4" />}
        />

        <Input
          label="Zalo"
          placeholder="Số điện thoại Zalo"
          value={customer.zalo || ""}
          onChange={(e) => updateField("zalo", e.target.value)}
          icon={<MessageCircle className="w-4 h-4" />}
        />
      </div>

      <Input
        label="Địa chỉ"
        placeholder="Số nhà, đường..."
        value={customer.address || ""}
        onChange={(e) => updateField("address", e.target.value)}
        icon={<MapPin className="w-4 h-4" />}
      />

      <Select
        label="Quốc gia"
        placeholder="Chọn quốc gia"
        options={countryOptions}
        value={customer.country || ""}
        onChange={(e) => updateField("country", e.target.value)}
      />

      <div className="grid grid-cols-2 gap-4">
        {isVietnam ? (
          <Select
            label="Thị trường"
            placeholder="Chọn thị trường"
            options={marketOptions}
            value={customer.province || ""}
            onChange={(e) => updateField("province", e.target.value)}
          />
        ) : (
          <Input
            label="Thị trường"
            placeholder="VD: California, Toronto, Sydney..."
            value={customer.province || ""}
            onChange={(e) => updateField("province", e.target.value)}
            icon={<Globe2 className="w-4 h-4" />}
          />
        )}
        {districtOptionsWithCurrent ? (
          <Select
            label="Địa phương"
            placeholder="Chọn địa phương"
            options={districtOptionsWithCurrent}
            value={customer.district || ""}
            onChange={(e) => updateField("district", e.target.value)}
          />
        ) : (
          <Input
            label="Địa phương"
            placeholder="VD: California, Toronto, Bình Tân, Quận 1..."
            value={customer.district || ""}
            onChange={(e) => updateField("district", e.target.value)}
            icon={<Globe2 className="w-4 h-4" />}
          />
        )}
      </div>

      <SectionTitle>Sở thích đá quý</SectionTitle>

      <div className="grid grid-cols-3 gap-4">
        <Input
          label="Kích thước cổ tay"
          placeholder="VD: 15cm"
          value={customer.wrist_size || ""}
          onChange={(e) => updateField("wrist_size", e.target.value)}
          icon={<Ruler className="w-4 h-4" />}
        />

        <Input
          label="Size nhẫn"
          placeholder="VD: 7"
          value={customer.ring_size || ""}
          onChange={(e) => updateField("ring_size", e.target.value)}
          icon={<Ruler className="w-4 h-4" />}
        />

        <Input
          label="Ngân sách"
          placeholder="VD: 10-20 triệu"
          value={customer.budget || ""}
          onChange={(e) => updateField("budget", e.target.value)}
          icon={<Wallet className="w-4 h-4" />}
        />
      </div>

      <CreatableMultiSelect
        label="Loại sản phẩm quan tâm"
        placeholder="Nhập hoặc chọn loại sản phẩm..."
        options={jadeType.options}
        values={parseMultiValue(customer.favorite_type)}
        onChange={(values) => updateField("favorite_type", serializeMultiValue(values))}
        onCreate={jadeType.createOption}
      />

      <CreatableMultiSelect
        label="Màu sắc yêu thích"
        placeholder="Nhập hoặc chọn màu sắc..."
        options={favoriteColor.options}
        values={parseMultiValue(customer.favorite_color)}
        onChange={(values) => updateField("favorite_color", serializeMultiValue(values))}
        onCreate={favoriteColor.createOption}
      />

      <div className="grid grid-cols-2 gap-4">
        <Select
          label="Nguồn gốc ưa thích"
          placeholder="Chọn nguồn gốc"
          options={JADE_ORIGINS}
          value={customer.preferred_origin || ""}
          onChange={(e) => updateField("preferred_origin", e.target.value)}
        />

        <CreatableSelect
          label="Mục đích"
          placeholder="Nhập hoặc chọn mục đích..."
          options={purpose.options}
          value={customer.purpose || ""}
          onChange={(value) => updateField("purpose", value)}
          onCreate={purpose.createOption}
        />
      </div>

      <SectionTitle>Kinh doanh</SectionTitle>

      <div className="grid grid-cols-2 gap-4">
        <Select
          label="Giai đoạn khách hàng"
          placeholder="Chọn giai đoạn"
          options={stageOptions}
          value={customer.vip_level || ""}
          onChange={(e) => updateField("vip_level", e.target.value)}
        />

        <Input
          label="Nguồn"
          placeholder="VD: Facebook, Giới thiệu, Tìm kiếm..."
          value={customer.source || ""}
          onChange={(e) => updateField("source", e.target.value)}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Select
          label="Nhân viên phụ trách (cũ)"
          placeholder="Chọn nhân viên"
          options={salespersonOptions}
          value={customer.assigned_salesperson || ""}
          onChange={(e) => updateField("assigned_salesperson", e.target.value)}
        />

        <Select
          label="Nhân viên phụ trách"
          placeholder="Chọn nhân viên"
          options={staffOptions}
          value={customer.assigned_staff_id || ""}
          onChange={(e) => updateField("assigned_staff_id", e.target.value)}
        />
      </div>

      <Input
        label="Sản phẩm xem gần nhất"
        placeholder="VD: Vòng ngọc bích size 15"
        value={customer.last_viewed_product || ""}
        onChange={(e) => updateField("last_viewed_product", e.target.value)}
        icon={<Eye className="w-4 h-4" />}
      />
    </div>
  );
}
