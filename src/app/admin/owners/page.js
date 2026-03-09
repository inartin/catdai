"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

const PAGE_SIZE = 25;

export default function OwnersPage() {
  const [owners, setOwners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    const timeout = setTimeout(() => setSearch(searchInput), 300);
    return () => clearTimeout(timeout);
  }, [searchInput]);

  const fetchOwners = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    params.set("page", String(page));

    const res = await fetch(`/api/admin/owners?${params}`);
    const json = await res.json();

    setOwners(json.data || []);
    setTotal(json.total || 0);
    setLoading(false);
  }, [search, page]);

  useEffect(() => {
    fetchOwners();
  }, [fetchOwners]);

  useEffect(() => {
    setPage(0);
  }, [search]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  function getListingCount(owner) {
    return owner.listing?.[0]?.count ?? 0;
  }

  function getPhones(owner) {
    if (!owner.phones) return "\u2014";
    if (Array.isArray(owner.phones)) return owner.phones.join(", ");
    return String(owner.phones);
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Owners</h1>

      <div className="flex flex-wrap gap-3">
        <input
          type="text"
          placeholder="Search by name or login..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary w-64"
        />
        <span className="self-center text-sm text-gray-500">
          {total.toLocaleString()} owners
        </span>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase">
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Login</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Phone</th>
                <th className="px-4 py-3">Verified</th>
                <th className="px-4 py-3 text-right">Listings</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-8 text-center text-gray-400"
                  >
                    Loading...
                  </td>
                </tr>
              ) : owners.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-8 text-center text-gray-400"
                  >
                    No owners found
                  </td>
                </tr>
              ) : (
                owners.map((o) => (
                  <tr key={o.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {o.display_name || "\u2014"}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {o.login || "\u2014"}
                    </td>
                    <td className="px-4 py-3">
                      {o.owner_type ? (
                        <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700">
                          {o.owner_type}
                        </span>
                      ) : (
                        "\u2014"
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-xs">
                      {getPhones(o)}
                    </td>
                    <td className="px-4 py-3">
                      {o.is_verified ? (
                        <span className="text-green-600 font-medium text-xs">
                          Yes
                        </span>
                      ) : (
                        <span className="text-gray-400 text-xs">No</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-medium">
                      {getListingCount(o)}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/owners/${o.id}`}
                        className="text-primary hover:underline text-xs font-medium"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            Page {page + 1} of {totalPages}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage(Math.max(0, page - 1))}
              disabled={page === 0}
              className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50"
            >
              Previous
            </button>
            <button
              onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
              disabled={page >= totalPages - 1}
              className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
