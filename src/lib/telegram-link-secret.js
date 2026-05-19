const telegramLinkSecret = process.env.TELEGRAM_LINK_SECRET;

if (!telegramLinkSecret) {
  throw new Error("Missing TELEGRAM_LINK_SECRET");
}

export { telegramLinkSecret };
