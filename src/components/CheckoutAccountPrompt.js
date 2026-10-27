"use client";

import { useTranslation } from "@/context/LanguageContext";
import LoginButton from "@/components/LoginButton";

export default function CheckoutAccountPrompt() {
  const { t } = useTranslation();

  return (
    <aside className="mb-5 rounded-xl border border-gray-200 bg-white p-3 text-sm">
      <p className="leading-6 text-gray-600">{t("payment.checkoutAccountNotice")}</p>
      <div className="mt-2 flex items-center justify-between gap-3">
        <p className="font-medium text-gray-950">{t("payment.checkoutExistingAccount")}</p>
        <LoginButton
          loginLabel={t("payment.checkoutSignIn")}
          className="rounded-full border border-gray-300 bg-white px-3 py-1 text-gray-950 hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700"
        />
      </div>
    </aside>
  );
}
