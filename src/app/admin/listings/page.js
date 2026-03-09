"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

function fmtNum(n) {
  if (n == null) return "\u2014";
  return Number(n).toLocaleString("ro-RO", { maximumFractionDigits: 0 });
}

function fmtPrice(amount, currency) {
  if (amount == null) return "\u2014";
  return `${fmtNum(amount)} ${currency || "\u20AC"}`;
}

function fmtDate(d) {
  if (!d) return "\u2014";
  return new Date(d).toLocaleDateString("ro-RO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function SortHeader({ col, sortBy, sortAsc, onSort, children }) {
  return (
    <th
      className="px-4 py-3 cursor-pointer select-none hover:text-gray-700"
      onClick={() => onSort(col)}
    >
      {children}
      {sortBy === col && (
        <span className="ml-1">{sortAsc ? "\u2191" : "\u2193"}</span>
      )}
    </th>
  );
}

export default function ListingsPage() {
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState("all");
  const [roomsFilter, setRoomsFilter] = useState("");
  const [sortBy, setSortBy] = useState("created_at");
  const [sortAsc, setSortAsc] = useState(false);

  useEffect(() => {
    const timeout = setTimeout(() => setSearch(searchInput), 300);
    return () => clearTimeout(timeout);
  }, [searchInput]);

  const fetchListings = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (activeFilter !== "all") params.set("active", activeFilter);
    if (roomsFilter) params.set("rooms", roomsFilter);
    params.set("sortBy", sortBy);
    params.set("sortAsc", String(sortAsc));
    params.set("page", String(page));

    const res = await fetch(`/api/admin/listings?${params}`);
    const json = await res.json();

    setListings(json.data || []);
    setTotal(json.total || 0);
    setLoading(false);
  }, [search, activeFilter, roomsFilter, page, sortBy, sortAsc]);

  useEffect(() => {
    fetchListings();
  }, [fetchListings]);

  useEffect(() => {
    setPage(0);
  }, [search, activeFilter, roomsFilter]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  function handleSort(col) {
    if (sortBy === col) {
      setSortAsc(!sortAsc);
    } else {
      setSortBy(col);
      setSortAsc(false);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Listings</h1>

      <div className="flex flex-wrap gap-3">
        <input
          type="text"
          placeholder="Search by title..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary w-64"
        />
        <select
          value={activeFilter}
          onChange={(e) => setActiveFilter(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white"
        >
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
        <select
          value={roomsFilter}
          onChange={(e) => setRoomsFilter(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white"
        >
          <option value="">All Rooms</option>
          {[1, 2, 3, 4, 5].map((r) => (
            <option key={r} value={r}>
              {r} room{r > 1 ? "s" : ""}
            </option>
          ))}
        </select>
        <span className="self-center text-sm text-gray-500">
          {fmtNum(total)} results
        </span>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase">
                <SortHeader col="title" sortBy={sortBy} sortAsc={sortAsc} onSort={handleSort}>
                  Title
                </SortHeader>
                <SortHeader col="price_amount" sortBy={sortBy} sortAsc={sortAsc} onSort={handleSort}>
                  Price
                </SortHeader>
                <SortHeader col="area_m2" sortBy={sortBy} sortAsc={sortAsc} onSort={handleSort}>
                  Area
                </SortHeader>
                <SortHeader col="rooms_count" sortBy={sortBy} sortAsc={sortAsc} onSort={handleSort}>
                  Rooms
                </SortHeader>
                <th className="px-4 py-3">Floor</th>
                <th className="px-4 py-3">Location</th>
                <th className="px-4 py-3">Status</th>
                <SortHeader col="created_at" sortBy={sortBy} sortAsc={sortAsc} onSort={handleSort}>
                  Date
                </SortHeader>
                <th className="px-4 py-3">Owner</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-gray-400">
                    Loading...
                  </td>
                </tr>
              ) : listings.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-gray-400">
                    No listings found
                  </td>
                </tr>
              ) : (
                listings.map((l) => (
                  <tr key={l.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 max-w-xs truncate">
                      <Link
                        href={`/admin/listings/${l.id}`}
                        className="text-primary hover:underline"
                      >
                        {l.title}
                      </Link>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {fmtPrice(l.price_amount, l.price_currency)}
                    </td>
                    <td className="px-4 py-3">
                      {l.area_m2 ? `${l.area_m2} m\u00B2` : "\u2014"}
                    </td>
                    <td className="px-4 py-3">{l.rooms_count ?? "\u2014"}</td>
                    <td className="px-4 py-3">
                      {l.floor != null
                        ? `${l.floor}/${l.total_floors || "?"}`
                        : "\u2014"}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {[l.district, l.sector].filter(Boolean).join(", ") ||
                        "\u2014"}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                          l.is_active
                            ? "bg-green-100 text-green-700"
                            : "bg-gray-100 text-gray-500"
                        }`}
                      >
                        {l.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-500">
                      {fmtDate(l.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      {l.owner_id ? (
                        <Link
                          href={`/admin/owners/${l.owner_id}`}
                          className="text-primary hover:underline text-xs"
                        >
                          View
                        </Link>
                      ) : (
                        "\u2014"
                      )}
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

const PAGE_SIZE = 25;
