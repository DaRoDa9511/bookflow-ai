import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/ui/misc";
import { HoursEditor } from "@/features/catalog/HoursEditor";
import { ServicesEditor } from "@/features/catalog/ServicesEditor";
import { StaffEditor } from "@/features/catalog/StaffEditor";
import { TimeOffEditor } from "@/features/catalog/TimeOffEditor";
import { useBusiness } from "@/lib/auth";

export function ServicesPage() {
  const { t } = useTranslation();
  const { business } = useBusiness();
  return (
    <>
      <PageHeader title={t("nav.services")} description={t("onboarding.stepServicesHint")} />
      <ServicesEditor business={business} />
    </>
  );
}

export function StaffPage() {
  const { t } = useTranslation();
  const { business } = useBusiness();
  return (
    <>
      <PageHeader title={t("nav.staff")} description={t("onboarding.stepStaffHint")} />
      <StaffEditor business={business} />
    </>
  );
}

export function HoursPage() {
  const { t } = useTranslation();
  const { business, isOwner, staffId } = useBusiness();
  return (
    <>
      <PageHeader title={t("nav.hours")} description={t("onboarding.stepHoursHint")} />
      <div className="space-y-6">
        {isOwner && <HoursEditor business={business} />}
        <TimeOffEditor business={business} onlyStaffId={isOwner ? null : staffId} />
      </div>
    </>
  );
}
