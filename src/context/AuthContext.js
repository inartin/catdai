"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getActiveAdSource, trackAdSourceEvent } from "@/lib/tracking";

const AuthContext = createContext(null);
const ACTIVITY_PING_INTERVAL_MS = 5 * 60 * 1000;
const TELEGRAM_LOGIN_SCRIPT_SRC = "https://oauth.telegram.org/js/telegram-login.js?5";
const AUTH_RETURN_TO_KEY = "catdai:auth-return-to";
const OAUTH_URL_KEYS = [
  "access_token",
  "refresh_token",
  "expires_in",
  "expires_at",
  "token_type",
  "provider_token",
  "provider_refresh_token",
  "code",
  "state",
  "error",
  "error_code",
  "error_description",
];

const OAUTH_TYPE_COMPANION_KEYS = [
  "access_token",
  "refresh_token",
  "expires_in",
  "expires_at",
  "token_type",
  "provider_token",
  "provider_refresh_token",
  "code",
  "error",
  "error_code",
  "error_description",
];

function hasOAuthTypeCompanionParam(params) {
  return OAUTH_TYPE_COMPANION_KEYS.some((key) => params.has(key));
}

function buildRedirectTo() {
  if (typeof window === "undefined") return undefined;
  return `${window.location.origin}${window.location.pathname}${window.location.search}`;
}

function persistAuthReturnTo() {
  if (typeof window === "undefined") return undefined;
  const returnTo = buildRedirectTo();
  try {
    localStorage.setItem(AUTH_RETURN_TO_KEY, returnTo);
  } catch {
    // OAuth redirect still uses returnTo when storage is unavailable.
  }
  return returnTo;
}

function restoreAuthReturnTo() {
  if (typeof window === "undefined") return false;

  let storedReturnTo;
  try {
    storedReturnTo = localStorage.getItem(AUTH_RETURN_TO_KEY);
    localStorage.removeItem(AUTH_RETURN_TO_KEY);
  } catch {
    return false;
  }

  if (!storedReturnTo) return false;

  let target;
  try {
    target = new URL(storedReturnTo, window.location.origin);
  } catch {
    return false;
  }

  if (target.origin !== window.location.origin) return false;

  const targetPath = `${target.pathname}${target.search}${target.hash}`;
  const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (targetPath && targetPath !== currentPath) {
    window.location.replace(targetPath);
  }
  return true;
}

function getTelegramClientId() {
  return String(process.env.NEXT_PUBLIC_TELEGRAM_LOGIN_CLIENT_ID || "").trim();
}

function loadTelegramLoginScript() {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Telegram login is only available in the browser."));
  }

  if (window.Telegram?.Login && !window.Telegram.Login.widgetsOrigin) return Promise.resolve(window.Telegram.Login);

  return new Promise((resolve, reject) => {
    const existingScript = document.querySelector(`script[src="${TELEGRAM_LOGIN_SCRIPT_SRC}"]`);

    const onLoad = () => {
      if (window.Telegram?.Login && !window.Telegram.Login.widgetsOrigin) {
        resolve(window.Telegram.Login);
      } else {
        reject(new Error("Telegram login did not initialize."));
      }
    };

    if (existingScript) {
      existingScript.addEventListener("load", onLoad, { once: true });
      existingScript.addEventListener("error", () => reject(new Error("Failed to load Telegram login.")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.async = true;
    script.src = TELEGRAM_LOGIN_SCRIPT_SRC;
    script.onload = onLoad;
    script.onerror = () => reject(new Error("Failed to load Telegram login."));
    document.head.appendChild(script);
  });
}

function stripOAuthParamsFromUrl() {
  if (typeof window === "undefined") return;

  const url = new URL(window.location.href);
  let changed = false;
  const shouldStripSearchType = hasOAuthTypeCompanionParam(url.searchParams);

  for (const key of OAUTH_URL_KEYS) {
    if (url.searchParams.has(key)) {
      url.searchParams.delete(key);
      changed = true;
    }
  }

  if (shouldStripSearchType && url.searchParams.has("type")) {
    url.searchParams.delete("type");
    changed = true;
  }

  const hash = url.hash.startsWith("#") ? url.hash.slice(1) : "";
  if (hash) {
    const hashParams = new URLSearchParams(hash);
    let hashChanged = false;
    const shouldStripHashType = hasOAuthTypeCompanionParam(hashParams);

    for (const key of OAUTH_URL_KEYS) {
      if (hashParams.has(key)) {
        hashParams.delete(key);
        hashChanged = true;
      }
    }

    if (shouldStripHashType && hashParams.has("type")) {
      hashParams.delete("type");
      hashChanged = true;
    }

    if (hashChanged) {
      changed = true;
      const nextHash = hashParams.toString();
      url.hash = nextHash ? `#${nextHash}` : "";
    }
  }

  if (changed) {
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }
}

function pingUserActivity(accessToken) {
  if (!accessToken) return;

  fetch("/api/activity/ping", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    keepalive: true,
  }).catch(() => {
    // Activity ping is best-effort and should never block UI/auth flows.
  });
}

function trackAdSourceLogin(accessToken) {
  if (!accessToken || !getActiveAdSource()) return;
  trackAdSourceEvent("signed_in", { accessToken });
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeProvider, setActiveProvider] = useState(null);

  useEffect(() => {
    let isMounted = true;

    const syncAuthState = async (nextSession) => {
      setSession(nextSession ?? null);

      if (!nextSession) {
        setUser(null);
        return;
      }

      if (nextSession.user) {
        setUser(nextSession.user);
        return;
      }

      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (!isMounted) return;
      if (userError) {
        setError(userError.message || "Failed to fetch user.");
        return;
      }
      setUser(userData?.user ?? null);
    };

    const initSession = async () => {
      if (typeof window !== "undefined") {
        const code = new URL(window.location.href).searchParams.get("code");
        if (code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
          if (!isMounted) return;
          if (exchangeError) {
            setError(exchangeError.message || "Failed to complete sign-in.");
          }
        }
      }

      const { data, error: sessionError } = await supabase.auth.getSession();
      if (!isMounted) return;
      if (sessionError) setError(sessionError.message || "Failed to initialize auth.");

      await syncAuthState(data?.session ?? null);
      setLoading(false);
      if (data?.session && restoreAuthReturnTo()) {
        return;
      }
      stripOAuthParamsFromUrl();
    };

    initSession();

    const { data } = supabase.auth.onAuthStateChange(async (_event, nextSession) => {
      await syncAuthState(nextSession ?? null);
      setLoading(false);
      if (nextSession) {
        if (!restoreAuthReturnTo()) stripOAuthParamsFromUrl();
      }
    });

    return () => {
      isMounted = false;
      data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const accessToken = session?.access_token;
    if (!accessToken) return;

    pingUserActivity(accessToken);
    trackAdSourceLogin(accessToken);

    const intervalId = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        pingUserActivity(accessToken);
      }
    }, ACTIVITY_PING_INTERVAL_MS);

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        pingUserActivity(accessToken);
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [session?.access_token]);

  const signInWithProviders = useCallback(async (providerKey, providers) => {
    setActiveProvider(providerKey);
    setError(null);

    const redirectTo = persistAuthReturnTo();
    let lastError = null;

    try {
      for (const provider of providers) {
        const { data, error: signInError } = await supabase.auth.signInWithOAuth({
          provider,
          options: {
            redirectTo,
            skipBrowserRedirect: true,
          },
        });

        if (signInError) {
          lastError = signInError;
          continue;
        }

        if (data?.url) {
          window.location.assign(data.url);
          return { error: null };
        }
      }
    } catch (signInError) {
      lastError = signInError;
    } finally {
      setActiveProvider(null);
    }

    const message = lastError?.message || "Authentication failed.";
    setError(message);
    return { error: lastError };
  }, []);

  const signInWithGoogle = useCallback(async () => {
    return signInWithProviders("google", ["google"]);
  }, [signInWithProviders]);

  const signInWithTelegram = useCallback(async () => {
    const clientId = getTelegramClientId();

    if (!clientId) {
      const telegramError = new Error("Telegram login is not configured.");
      setError(telegramError.message);
      return { error: telegramError };
    }

    setActiveProvider("telegram");
    setError(null);
    persistAuthReturnTo();

    try {
      const telegramLogin = await loadTelegramLoginScript();
      return await new Promise((resolve) => {
        telegramLogin.auth(
          {
            client_id: clientId,
          },
          async (authData) => {
            if (!authData || authData.error || !authData.id_token) {
              const telegramError = new Error(authData?.error || "Telegram authentication failed.");
              setError(telegramError.message);
              setActiveProvider(null);
              resolve({ error: telegramError });
              return;
            }

            const response = await fetch("/api/auth/telegram", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ id_token: authData.id_token }),
            });
            const payload = await response.json().catch(() => ({}));

            if (!response.ok || !payload?.session?.access_token || !payload?.session?.refresh_token) {
              const telegramError = new Error(payload?.error || "Telegram authentication failed.");
              setError(telegramError.message);
              setActiveProvider(null);
              resolve({ error: telegramError });
              return;
            }

            const { error: setSessionError } = await supabase.auth.setSession({
              access_token: payload.session.access_token,
              refresh_token: payload.session.refresh_token,
            });

            if (setSessionError) {
              setError(setSessionError.message || "Telegram authentication failed.");
              setActiveProvider(null);
              resolve({ error: setSessionError });
              return;
            }

            setActiveProvider(null);
            resolve({ error: null });
          }
        );
      });
    } catch (telegramError) {
      const message = telegramError?.message || "Telegram authentication failed.";
      setError(message);
      setActiveProvider(null);
      return { error: telegramError };
    }
  }, []);

  const signOut = useCallback(async () => {
    setError(null);
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) {
      setError(signOutError.message || "Failed to sign out.");
      return { error: signOutError };
    }
    return { error: null };
  }, []);

  const value = useMemo(
    () => ({
      session,
      user,
      loading,
      error,
      activeProvider,
      isAuthenticated: !!session,
      signInWithGoogle,
      signInWithTelegram,
      signOut,
      clearAuthError: () => setError(null),
    }),
    [
      session,
      user,
      loading,
      error,
      activeProvider,
      signInWithGoogle,
      signInWithTelegram,
      signOut,
    ]
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
