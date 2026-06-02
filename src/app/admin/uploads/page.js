"use client";

import { useRef, useState } from "react";

function fmtImageSize(value) {
  if (!value) return "";
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.ceil(value / 1024)} KB`;
}

export default function AdminUploadsPage() {
  const fileInputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [copied, setCopied] = useState(false);

  const uploadImage = async (event) => {
    event.preventDefault();
    if (!file) {
      setError("Choose an image first.");
      return;
    }

    setUploading(true);
    setError("");
    setResult(null);
    setCopied(false);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/admin/uploads", {
        method: "POST",
        body: formData,
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || `HTTP ${response.status}`);
      }

      setResult(data);
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err) {
      setError(err.message || "Failed to upload image.");
    } finally {
      setUploading(false);
    }
  };

  const copyUrl = async () => {
    if (!result?.public_url) return;
    await navigator.clipboard.writeText(result.public_url);
    setCopied(true);
  };

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Image uploads</h1>
        <p className="mt-1 text-sm text-gray-500">Upload an image to Supabase Storage and copy its public URL.</p>
      </div>

      <form onSubmit={uploadImage} className="space-y-4 rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
        {error && (
          <div className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-600">
            {error}
          </div>
        )}

        <label className="block">
          <span className="text-sm font-medium text-gray-700">Image</span>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            onChange={(event) => {
              setFile(event.target.files?.[0] || null);
              setError("");
              setResult(null);
              setCopied(false);
            }}
            className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition-colors file:mr-3 file:rounded-md file:border-0 file:bg-primary-light file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-primary-dark focus:border-primary"
          />
        </label>

        {file && (
          <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-sm text-gray-600">
            {file.name} · {fmtImageSize(file.size)}
          </div>
        )}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={uploading}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-dark disabled:bg-gray-300"
          >
            {uploading ? "Uploading..." : "Upload image"}
          </button>
        </div>
      </form>

      {result?.public_url && (
        <div className="space-y-4 rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Public URL</h2>
            <p className="mt-1 text-sm text-gray-500">This uses the Supabase public bucket URL, not a signed expiring URL.</p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              readOnly
              value={result.public_url}
              className="min-w-0 flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 outline-none"
              onFocus={(event) => event.target.select()}
            />
            <button
              type="button"
              onClick={copyUrl}
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 transition-colors hover:border-primary/40 hover:text-primary"
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>

          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={result.public_url}
            alt="Uploaded image"
            className="max-h-80 w-full rounded-lg border border-gray-100 object-contain"
          />
        </div>
      )}
    </div>
  );
}
