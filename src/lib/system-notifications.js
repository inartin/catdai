import { supabaseAdmin } from "@/lib/supabase-admin";
import { formatLocalizedDate } from "@/lib/localized-date";

const DEFAULT_LANG = "ro";

const SYSTEM_NOTIFICATION_COPY = {
  extra_subscription_started: {
    ro: {
      title: "Abonamentul Extra este activ",
      body: (date) => `Creditele Extra au fost activate: 50 de credite pentru fiecare funcție, valabile până la ${date}.`,
    },
    ru: {
      title: "Подписка Extra активна",
      body: (date) => `Кредиты Extra активированы: 50 кредитов для каждой функции, действуют до ${date}.`,
    },
  },
  extra_subscription_extended: {
    ro: {
      title: "Abonamentul Extra a fost reînnoit",
      body: (date) => `Creditele Extra au fost resetate la 50 pentru noua perioadă, până la ${date}.`,
    },
    ru: {
      title: "Подписка Extra продлена",
      body: (date) => `Кредиты Extra сброшены до 50 на новый период, до ${date}.`,
    },
  },
  extra_subscription_cancel_scheduled: {
    ro: {
      title: "Anularea abonamentului Extra este programată",
      body: (date) => `Abonamentul rămâne activ până la ${date}. După această dată creditele Extra nu se vor reînnoi.`,
    },
    ru: {
      title: "Отмена подписки Extra запланирована",
      body: (date) => `Подписка остается активной до ${date}. После этой даты кредиты Extra не обновятся.`,
    },
  },
  extra_subscription_canceled: {
    ro: {
      title: "Abonamentul Extra a fost anulat",
      body: () => "Abonamentul Extra nu mai este activ. Creditele Extra au fost oprite.",
    },
    ru: {
      title: "Подписка Extra отменена",
      body: () => "Подписка Extra больше не активна. Кредиты Extra отключены.",
    },
  },
  extra_subscription_failed: {
    ro: {
      title: "Plata abonamentului Extra a eșuat",
      body: () => "Nu am putut reînnoi abonamentul Extra. Creditele Extra au fost oprite până la o plată reușită.",
    },
    ru: {
      title: "Платеж за подписку Extra не прошел",
      body: () => "Не удалось продлить подписку Extra. Кредиты Extra отключены до успешной оплаты.",
    },
  },
};

export function normalizeSystemNotificationLang(lang) {
  return String(lang || "").trim().toLowerCase() === "ru" ? "ru" : DEFAULT_LANG;
}

function formatNotificationDate(value, lang) {
  if (!value) return lang === "ru" ? "конца оплаченного периода" : "sfârșitul perioadei plătite";

  return formatLocalizedDate(value, lang, {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }) || (lang === "ru" ? "конца оплаченного периода" : "sfârșitul perioadei plătite");
}

export async function createSystemNotification({ userId, type, lang, periodEnd }) {
  const notificationLang = normalizeSystemNotificationLang(lang);
  const copy = SYSTEM_NOTIFICATION_COPY[type]?.[notificationLang];
  if (!userId || !copy) return null;

  const date = formatNotificationDate(periodEnd, notificationLang);
  const { data, error } = await supabaseAdmin
    .from("user_notifications")
    .insert({
      user_id: userId,
      title: copy.title,
      body: copy.body(date),
      source: "system",
    })
    .select("id")
    .single();

  if (error) {
    console.error("[system-notifications] insert failed:", error.message);
    return null;
  }

  return data || null;
}
