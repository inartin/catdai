"use client";

import { useState, useEffect } from "react";

export default function CookieBanner() {
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    // Check if consent has already been given or denied
    const consent = localStorage.getItem("cookie_consent");
    if (!consent) {
      setShowBanner(true);
    }
  }, []);

  const handleAccept = () => {
    localStorage.setItem("cookie_consent", "granted");
    setShowBanner(false);
    
    // Update GA consent
    if (typeof window !== "undefined" && typeof window.gtag === "function") {
      window.gtag("consent", "update", {
        analytics_storage: "granted",
        ad_storage: "granted",
        ad_user_data: "granted",
        ad_personalization: "granted",
      });
    }
  };

  const handleDecline = () => {
    localStorage.setItem("cookie_consent", "denied");
    setShowBanner(false);
  };

  if (!showBanner) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 md:left-auto md:w-96 bg-white p-4 rounded-lg shadow-lg border border-gray-200 z-50 text-sm">
      <p className="text-gray-700 mb-3">
        We use cookies to improve your experience and analyze traffic.
      </p>
      <div className="flex justify-end gap-2">
        <button
          onClick={handleDecline}
          className="px-3 py-1.5 text-gray-600 hover:bg-gray-100 rounded transition-colors"
        >
          Decline
        </button>
        <button
          onClick={handleAccept}
          className="px-3 py-1.5 bg-blue-600 text-white hover:bg-blue-700 rounded transition-colors"
        >
          Accept
        </button>
      </div>
    </div>
  );
}
