"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getActiveAdSource, trackAdSourceEvent } from "@/lib/tracking";

const AuthContext = createContext(null);
const ACTIVITY_PING_INTERVAL_MS = 5 * 60 * 1000;
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
  "type",
  "error",
  "error_code",
  "error_description",
];

function buildRedirectTo() {
  if (typeof window === "undefined") return undefined;
  return `${window.location.origin}${window.location.pathname}${window.location.search}`;
}

function normalizeProviders(items) {
  const providers = [];
  const seen = new Set();

  for (const item of items) {
    const provider = String(item || "").trim();
    if (!provider || seen.has(provider)) continue;
    seen.add(provider);
    providers.push(provider);
  }

  return providers;
}

function stripOAuthParamsFromUrl() {
  if (typeof window === "undefined") return;

  const url = new URL(window.location.href);
  let changed = false;

  for (const key of OAUTH_URL_KEYS) {
    if (url.searchParams.has(key)) {
      url.searchParams.delete(key);
      changed = true;
    }
  }

  const hash = url.hash.startsWith("#") ? url.hash.slice(1) : "";
  if (hash) {
    const hashParams = new URLSearchParams(hash);
    let hashChanged = false;

    for (const key of OAUTH_URL_KEYS) {
      if (hashParams.has(key)) {
        hashParams.delete(key);
        hashChanged = true;
      }
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
      stripOAuthParamsFromUrl();
    };

    initSession();

    const { data } = supabase.auth.onAuthStateChange(async (_event, nextSession) => {
      await syncAuthState(nextSession ?? null);
      setLoading(false);
      if (nextSession) stripOAuthParamsFromUrl();
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

    const redirectTo = buildRedirectTo();
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

  const signInWithFacebook = useCallback(async () => {
    return signInWithProviders("facebook", ["facebook"]);
  }, [signInWithProviders]);

  const signInWithTelegram = useCallback(async () => {
    const configured = process.env.NEXT_PUBLIC_SUPABASE_TELEGRAM_PROVIDER;
    const providers = normalizeProviders([configured, "telegram", "custom:telegram"]);
    return signInWithProviders("telegram", providers);
  }, [signInWithProviders]);

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
      signInWithFacebook,
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
      signInWithFacebook,
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
