"use client";

import { useTranslation } from "@/context/LanguageContext";
import { FEATURE_PURCHASE_CONTENT } from "@/lib/feature-purchase-content";

export default function FeaturePurchaseBenefits({ productKey, className = "" }) {
  const { t } = useTranslation();
  const content = FEATURE_PURCHASE_CONTENT[productKey];
  if (!content) return null;
  return (
    <ul className={`space-y-4 ${className}`}>
      {content.benefits.map((key) => (
        <li key={key} className="flex items-start gap-3 text-sm leading-6 text-gray-900 sm:text-base">
          <span aria-hidden="true" className="shrink-0 font-semibold text-emerald-700">✓</span>
          <span>{t(key)}</span>
        </li>
      ))}
    </ul>
  );
}
