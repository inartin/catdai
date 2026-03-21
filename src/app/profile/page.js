"use client";

import { useTranslation } from "@/context/LanguageContext";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import ConfigIcon from "@/components/icons/ConfigIcon";
import { ArrowLeft } from "@/components/icons/ArrowsIcons";
import BookmarkIcon from "@/components/icons/BookmarkIcon";

export default function ProfilePage() {
  const { t } = useTranslation();
  const { user, session, signOut, isAuthenticated, loading } = useAuth();
  const router = useRouter();
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [favorites, setFavorites] = useState([]);
  const [favoritesLoading, setFavoritesLoading] = useState(true);

  const handleDeleteProfile = async () => {
    try {
      setIsDeleting(true);
      const res = await fetch('/api/profile/delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`
        }
      });

      if (res.ok) {
        await signOut();
        router.push("/");
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to delete profile');
        setIsDeleting(false);
      }
    } catch (err) {
      console.error(err);
      alert('Error connecting to server');
      setIsDeleting(false);
    }
  };

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      router.push("/");
    }
  }, [loading, isAuthenticated, router]);

  useEffect(() => {
    if (!session?.access_token) return;
    setFavoritesLoading(true);
    fetch("/api/favorites", {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
      .then((res) => res.json())
      .then((data) => setFavorites(data.favorites || []))
      .catch(() => {})
      .finally(() => setFavoritesLoading(false));
  }, [session?.access_token]);

  const handleRemoveFavorite = async (urlPath) => {
    setFavorites((prev) => prev.filter((f) => f.url_path !== urlPath));
    try {
      await fetch("/api/favorites", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ url_path: urlPath }),
      });
    } catch {
      // Silently fail — the item is already removed from UI
    }
  };

  if (loading || !isAuthenticated) {
    return (
      <div className="min-h-screen flex flex-col bg-gray-50">
        <Navbar />
        <main className="flex-1 flex justify-center flex-col gap-4 items-center min-h-[60vh]">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900"></div>
          <p className="text-gray-600 text-sm">{t("auth.loading", "Loading...")}</p>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Navbar />
      <main className="flex-1">
        <div className="max-w-4xl mx-auto px-4 py-12 sm:px-6 lg:px-8 min-h-[60vh]">
          <h1 className="text-3xl font-bold text-gray-900 mb-8">{t("nav.profile")}</h1>
          <div className="bg-white shadow rounded-lg p-8 border border-gray-100 relative">
            <div 
              className="absolute top-6 right-6 cursor-pointer text-gray-400 hover:text-gray-600 transition-colors"
              onClick={() => setIsConfigOpen(!isConfigOpen)}
            >
              {isConfigOpen ? <ArrowLeft size={24} /> : <ConfigIcon size={24} />}
            </div>
            <div className="flex flex-col md:flex-row items-start md:items-center gap-6">
              {user?.user_metadata?.avatar_url || user?.user_metadata?.picture ? (
                <img 
                  src={user.user_metadata.avatar_url || user.user_metadata.picture} 
                  alt="Profile" 
                  className="h-20 w-20 rounded-full object-cover border border-gray-200 shadow-sm"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="h-20 w-20 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-2xl shadow-sm">
                  {user?.user_metadata?.full_name?.charAt(0).toUpperCase() || user?.user_metadata?.name?.charAt(0).toUpperCase() || user?.email?.charAt(0).toUpperCase() || "U"}
                </div>
              )}
              <div>
                <h2 className="text-xl font-semibold text-gray-900">{user?.user_metadata?.full_name || user?.user_metadata?.name || user?.name || "User"}</h2>
                <p className="text-gray-600 mb-4">{user?.email}</p>
                <button
                  type="button"
                  onClick={async () => {
                    await signOut();
                    router.push("/");
                  }}
                  className="px-4 py-2 bg-gray-100 text-gray-700 hover:bg-gray-200 rounded-md text-sm font-medium transition-colors border border-gray-200"
                >
                  {t("profile.logout", "Logout")}
                </button>
              </div>
            </div>
            {isConfigOpen && (
              <div className="mt-8 pt-8 border-t border-gray-100">
                <h3 className="text-lg font-medium text-gray-900 mb-4">{t("profile.config")}</h3>
                <button 
                  type="button"
                  className="px-4 py-2 bg-red-50 text-red-600 hover:bg-red-100 rounded-md text-sm font-medium transition-colors border border-red-200"
                  onClick={() => setIsDeleteModalOpen(true)}
                >
                  {t("profile.delete")}
                </button>
              </div>
            )}
          </div>

          {/* Favorites Section */}
          <div className="mt-8">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">{t("profile.favorites")}</h3>
            {favoritesLoading ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-gray-400" />
              </div>
            ) : favorites.length === 0 ? (
              <p className="text-sm text-gray-400 py-6 text-center">{t("profile.noFavorites")}</p>
            ) : (
              <div className="space-y-2">
                {favorites.map((fav) => (
                  <div
                    key={fav.id}
                    className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 bg-gray-50 hover:bg-gray-100 transition-colors group"
                  >
                    <a
                      href={fav.url_path}
                      className="flex-1 min-w-0 text-sm font-medium text-gray-700 truncate hover:text-primary transition-colors"
                    >
                      {fav.label || fav.url_path}
                    </a>
                    <button
                      type="button"
                      onClick={() => handleRemoveFavorite(fav.url_path)}
                      className="shrink-0 p-1.5 rounded-lg text-primary hover:bg-red-50 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                      title={t("result.removeFavorite")}
                    >
                      <BookmarkIcon size={16} filled />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Delete Confirmation Modal */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-2">
              {t("profile.delete")}
            </h3>
            <p className="text-sm text-gray-600 mb-6">
              {t("profile.confirmDelete")}
            </p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                onClick={() => setIsDeleteModalOpen(false)}
                disabled={isDeleting}
              >
                {t("form.back")}
              </button>
              <button
                type="button"
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors flex items-center justify-center gap-2"
                onClick={handleDeleteProfile}
                disabled={isDeleting}
              >
                {isDeleting && (
                  <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                )}
                {t("profile.delete")}
              </button>
            </div>
          </div>
        </div>
      )}

      <Footer />
    </div>
  );
}
