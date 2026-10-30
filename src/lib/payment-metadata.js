import { getRequestLanguage } from "@/lib/request-language";
import { purchaseMessages } from "@/lib/maib/purchase.mjs";

export async function paymentMetadata(result = false) {
  const copy = purchaseMessages(await getRequestLanguage());
  return {
    title: `${copy[result ? "payment.statusEyebrow" : "payment.checkoutTitle"]} | CatDai`,
    description: copy[result ? "payment.statusCheckingMessage" : "payment.checkoutSubtitle"],
    robots: { index: false, follow: false },
  };
}
