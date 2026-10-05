export function getPaymentProvider() {
  const provider = process.env.PAYMENT_PROVIDER || "maib";
  if (!["maib", "paddle"].includes(provider)) throw new Error("Invalid PAYMENT_PROVIDER");
  return provider;
}
