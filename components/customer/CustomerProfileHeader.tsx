"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Customer } from "@/types/customer";
import { Staff } from "@/types/staff";
import {
  Phone,
  Link2,
  MessageCircle,
  MapPin,
  Cake,
  Tag,
  Clock,
  Edit2,
  Gem,
  User,
  Briefcase,
  Globe2,
  Flag,
  UserCog,
} from "lucide-react";
import Avatar from "@/components/ui/Avatar";
import Button from "@/components/ui/Button";
import { formatDate } from "@/lib/utils";
import Card from "@/components/ui/Card";
import InfoItem from "@/components/ui/InfoItem";
import Badge from "@/components/ui/Badge";
import { parseMultiValue } from "@/lib/customer.service";
import { getStaffById } from "@/lib/staff.service";
import {
  CUSTOMER_STATUS_OPTIONS,
  CUSTOMER_STATUS_BADGE_VARIANT,
  labelFor,
  getDaysSinceLastContact,
} from "@/lib/customer.constants";

interface Props {
  customer: Customer;
  onEdit: () => void;
}

export default function CustomerProfileHeader({ customer, onEdit }: Props) {
  const isVip = customer.vip_level === "VIP";
  const tags = parseMultiValue(customer.customer_tags);
  const [assignedStaff, setAssignedStaff] = useState<Staff | null>(null);

  // Feature 4 - Customer Assignment: resolve the assigned staff member's
  // name for display only, self-contained so this card doesn't require the
  // parent page to thread staff data through.
  useEffect(() => {
    let active = true;
    if (!customer.assigned_staff_id) {
      setAssignedStaff(null);
      return;
    }
    getStaffById(customer.assigned_staff_id).then((staff) => {
      if (active) setAssignedStaff(staff);
    });
    return () => {
      active = false;
    };
  }, [customer.assigned_staff_id]);

  return (
    <Card className="p-6 sm:p-7">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-6">
        <div className="flex items-center gap-5">
          <Avatar name={customer.full_name} vip={isVip} size="lg" />
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-2xl sm:text-[28px] font-bold text-foreground tracking-tight">
                {customer.full_name}
              </h1>
              {isVip && (
                <Badge variant="vip" className="text-sm px-2.5 py-0.5">
                  <Gem className="w-3.5 h-3.5" />
                  VIP
                </Badge>
              )}
              {customer.customer_status && (
                <Badge
                  variant={CUSTOMER_STATUS_BADGE_VARIANT[customer.customer_status] || "muted"}
                  className="text-sm px-2.5 py-0.5"
                >
                  {labelFor(CUSTOMER_STATUS_OPTIONS, customer.customer_status) || customer.customer_status}
                </Badge>
              )}
            </div>
            <p className="text-muted-foreground text-sm mt-1.5">Mã khách hàng: {customer.customer_code}</p>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2.5">
                {tags.map((t) => (
                  <Badge key={t} variant="secondary">
                    {t}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>

        <Button variant="primary" onClick={onEdit}>
          <Edit2 className="w-4 h-4" />
          Chỉnh sửa
        </Button>
      </div>

      <div className="mt-7 pt-6 border-t border-border grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-6">
        {customer.phone && (
          <InfoItem icon={<Phone className="w-4 h-4" />} label="Số điện thoại">
            <a href={`tel:${customer.phone}`} className="hover:text-primary hover:underline">
              {customer.phone}
            </a>
          </InfoItem>
        )}

        {customer.facebook && (
          <InfoItem icon={<Link2 className="w-4 h-4" />} label="Facebook">
            <a
              href={customer.facebook.startsWith("http") ? customer.facebook : `https://facebook.com/${customer.facebook}`}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-primary hover:underline"
            >
              {customer.facebook}
            </a>
          </InfoItem>
        )}

        {customer.zalo && (
          <InfoItem icon={<MessageCircle className="w-4 h-4" />} label="Zalo">
            {customer.zalo}
          </InfoItem>
        )}

        {customer.address && (
          <InfoItem icon={<MapPin className="w-4 h-4" />} label="Địa chỉ">
            {customer.address}
          </InfoItem>
        )}

        {customer.birthday && (
          <InfoItem icon={<Cake className="w-4 h-4" />} label="Ngày sinh">
            {formatDate(customer.birthday)}
          </InfoItem>
        )}

        {customer.source && (
          <InfoItem icon={<Tag className="w-4 h-4" />} label="Nguồn">
            {customer.source}
          </InfoItem>
        )}

        <InfoItem icon={<Clock className="w-4 h-4" />} label="Liên hệ lần cuối">
          {customer.last_contacted ? (
            <>
              {formatDate(customer.last_contacted)}
              <span className="text-muted-foreground">
                {" "}
                · {getDaysSinceLastContact(customer.last_contacted)} ngày trước
              </span>
            </>
          ) : (
            "Chưa liên hệ"
          )}
        </InfoItem>

        {customer.gender && (
          <InfoItem icon={<User className="w-4 h-4" />} label="Giới tính">
            {customer.gender}
          </InfoItem>
        )}

        {customer.occupation && (
          <InfoItem icon={<Briefcase className="w-4 h-4" />} label="Nghề nghiệp">
            {customer.occupation}
          </InfoItem>
        )}

        {customer.country && (
          <InfoItem icon={<Flag className="w-4 h-4" />} label="Quốc gia">
            {customer.country}
          </InfoItem>
        )}

        {customer.province && (
          <InfoItem icon={<Globe2 className="w-4 h-4" />} label="Thị trường">
            {customer.province}
          </InfoItem>
        )}

        {customer.district && (
          <InfoItem icon={<MapPin className="w-4 h-4" />} label="Địa phương">
            {customer.district}
          </InfoItem>
        )}

        {assignedStaff && (
          <InfoItem icon={<UserCog className="w-4 h-4" />} label="Nhân viên phụ trách">
            <Link href={`/settings/staff/${assignedStaff.id}`} className="hover:text-primary hover:underline">
              {assignedStaff.full_name}
            </Link>
          </InfoItem>
        )}
      </div>
    </Card>
  );
}
