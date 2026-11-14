"use client";

import { useEffect, useState } from "react";
import CadastruLoadingIcon from "@/components/CadastruLoadingIcon";
import Tooltip from "@/components/Tooltip";
import { useTranslation } from "@/context/LanguageContext";

export default function CadastruBuildingManagement({ address, cadastralNumber, shareSlug, accessToken, onLockedClick }) {
  const { t } = useTranslation();
  const { city, road_type, street, house_number } = address || {};
  const [contacts, setContacts] = useState(null);

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      try {
        const response = await fetch("/api/cadastru/building-management", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
          body: JSON.stringify(shareSlug ? { share_slug: shareSlug } : { city, road_type, street, house_number,
            ...(cadastralNumber ? { cadastral_number: cadastralNumber } : {}) }),
          signal: controller.signal,
          priority: "low",
        });
        const result = response.ok ? await response.json() : null;
        if (!controller.signal.aborted) setContacts(Array.isArray(result?.contacts) ? result.contacts : []);
      } catch {
        if (!controller.signal.aborted) setContacts([]);
      }
    }

    void load();
    return () => controller.abort();
  }, [city, road_type, street, house_number, cadastralNumber, shareSlug, accessToken]);

  if (contacts?.length === 0) return null;

  const fullName = t("cadastru.buildingManagementFullName");
  const officeLabel = t("cadastru.buildingManagementOfficeAddress");
  const phoneLabel = t("cadastru.buildingManagementPhones");
  const lockedValue = (label, placeholder) => {
    const blurred = <span aria-hidden="true" className="select-none blur-sm">{placeholder}</span>;
    return onLockedClick ? (
      <button type="button" onClick={onLockedClick} aria-label={`${label} · ${t("cadastru.payToUnlock")}`}
        className="cursor-pointer rounded text-left focus-visible:outline-2 focus-visible:outline-emerald-700">
        {blurred}
      </button>
    ) : blurred;
  };
  return (
    <section className="border-t border-emerald-100 pt-5">
      <div className="flex items-center gap-1.5 text-emerald-700">
        <h3 className="text-sm font-semibold uppercase tracking-wider">{t("cadastru.buildingManagementTitle")}</h3>
        <Tooltip text={fullName}>
          <button type="button" aria-label={fullName} onClick={(event) => event.currentTarget.focus()}
            className="inline-flex h-8 w-8 cursor-help items-center justify-center rounded-full hover:bg-emerald-50 focus-visible:outline-2">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"
              strokeLinecap="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 16v-4m0-4h.01" />
            </svg>
          </button>
        </Tooltip>
      </div>
      {contacts === null ? (
        <p role="status" className="mt-2 flex items-center gap-2 text-sm text-gray-500">
          <span aria-hidden="true" className="shrink-0">
            <CadastruLoadingIcon bold className="h-8 w-auto text-primary-dark" />
          </span>
          <span>{t("cadastru.buildingManagementLoading")}</span>
        </p>
      ) : (
        <ul className="mt-2 space-y-3">
          {contacts.map((contact) => {
            const { assignment, locked, name, office_address, phones, phone_source_address } = contact;
            const showOffice = locked ? contact.has_office_address : Boolean(office_address);
            const phoneEntries = locked ? Array.from({ length: contact.phone_count }, () => "022 000 000") : phones || [];
            const showPhones = phoneEntries.length > 0;
            const sourceUrl = assignment?.source_url?.startsWith("https://") ? assignment.source_url : null;
            const assignmentLabel = t("cadastru.buildingManagementDirectory");
            return (
              <li key={name} className="space-y-1 break-words text-sm text-gray-600">
                <p className="text-base font-medium text-gray-900">{name}</p>
                {(showOffice || showPhones) && (
                  <dl className="space-y-1">
                    {showOffice && <div className="flex items-baseline gap-2">
                      <dt className="shrink-0 font-medium text-gray-700">{officeLabel}</dt>
                      <dd className="min-w-0">{locked ? lockedValue(officeLabel, "str. Exemplu 10") : office_address}</dd>
                    </div>}
                    {showPhones && <div>
                      <dt className="sr-only">{phoneLabel}</dt>
                      <dd className="flex min-w-0 flex-wrap gap-x-3 gap-y-1">
                        {phoneEntries.map((phone, index) => (
                          <span key={locked ? index : phone} className="inline-flex items-center gap-2">
                            <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-gray-700" fill="none" stroke="currentColor"
                              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <path d="M22 16.9v3a2 2 0 0 1-2.2 2 18 18 0 0 1-7.8-2.8 18 18 0 0 1-5.5-5.5 18 18 0 0 1-2.8-7.9A2 2 0 0 1 5.7 3h3a2 2 0 0 1 2 1.7l.5 2.8a2 2 0 0 1-.5 2l-1.3 1.3a14 14 0 0 0 5 5l1.3-1.3a2 2 0 0 1 2-.5l2.8.5a2 2 0 0 1 1.5 2.4Z" />
                            </svg>
                            {locked ? lockedValue(phoneLabel, phone) : (
                              <a href={`tel:${phone}`} className="font-medium text-emerald-700 hover:underline">{phone}</a>
                            )}
                          </span>
                        ))}
                      </dd>
                    </div>}
                  </dl>
                )}
                {locked && !showOffice && !showPhones && lockedValue(name, "••••••••••")}
                {phone_source_address && <p className="text-xs">{t("cadastru.buildingManagementPhoneSource", { address: phone_source_address })}</p>}
                {assignment?.status === "unverified" && (
                  <p className="text-xs">
                    {sourceUrl ? <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">{assignmentLabel}</a> : assignmentLabel}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
