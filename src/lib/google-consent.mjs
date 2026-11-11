export const COOKIE_CONSENT_KEY = 'cookie_consent';
export const COOKIE_SETTINGS_EVENT = 'catdai:cookie-settings';
export const ANALYTICS_CONSENT_EVENT = 'catdai:analytics-consent';

const denied = { analytics_storage: 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' };
const analyticsOnly = { ...denied, analytics_storage: 'granted' };

export const googleConsentByChoice = {
  denied,
  granted: analyticsOnly, // Legacy choice did not explicitly include ads measurement.
  analytics_only: analyticsOnly,
  analytics_and_ads: { ...analyticsOnly, ad_storage: 'granted', ad_user_data: 'granted' },
};

export function readCookieConsent() {
  try {
    const choice = localStorage.getItem(COOKIE_CONSENT_KEY);
    return Object.hasOwn(googleConsentByChoice, choice) ? choice : null;
  } catch { return 'denied'; }
}

export function readGoogleConsent() {
  return googleConsentByChoice[readCookieConsent()] ?? denied;
}
