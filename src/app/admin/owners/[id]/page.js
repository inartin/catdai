"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
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

function InfoRow({ label, value }) {
  return (
    <div className="flex justify-between py-2.5 border-b border-gray-100 last:border-0">
      <span className="text-sm text-gray-500">{label}</span>
      <span className="text-sm font-medium text-gray-900 text-right max-w-[60%] wrap-break-word">
        {value || "\u2014"}
      </span>
    </div>
  );
}

export default function OwnerDetailPage() {
  const { id } = useParams();
  const [owner, setOwner] = useState(null);
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/admin/owners/${id}`)
      .then((res) => res.json())
      .then((data) => {
        setOwner(data.owner || null);
        setListings(data.listings || []);
        setLoading(false);
      });
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  if (!owner) {
    return (
      <div className="text-center py-16">
        <p className="text-gray-500">Owner not found</p>
        <Link
          href="/admin/owners"
          className="text-primary hover:underline text-sm mt-2 inline-block"
        >
          Back to owners
        </Link>
      </div>
    );
  }

  const phones = Array.isArray(owner.phones)
    ? owner.phones.join(", ")
    : owner.phones
      ? String(owner.phones)
      : null;

  const emails = Array.isArray(owner.emails)
    ? owner.emails.join(", ")
    : owner.emails
      ? String(owner.emails)
      : null;

  const activeCount = listings.filter((l) => l.is_active).length;
  const priced = listings.filter((l) => l.price_amount);
  const avgPrice =
    priced.length > 0
      ? priced.reduce((sum, l) => sum + Number(l.price_amount), 0) /
        priced.length
      : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href="/admin/owners"
          className="text-gray-400 hover:text-gray-600 text-sm"
        >
          &larr; Owners
        </Link>
        <span className="text-gray-300">/</span>
        <h1 className="text-2xl font-bold text-gray-900">
          {owner.display_name || owner.login || "Unknown"}
        </h1>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h2 className="font-semibold text-gray-900 mb-3">Owner Info</h2>
          <InfoRow label="Name" value={owner.display_name} />
          <InfoRow label="Login" value={owner.login} />
          <InfoRow label="Type" value={owner.owner_type} />
          <InfoRow label="Source" value={owner.source} />
          <InfoRow label="Phone" value={phones} />
          <InfoRow label="Email" value={emails} />
          <InfoRow
            label="Verified"
            value={owner.is_verified ? "Yes" : "No"}
          />
          <InfoRow label="Business Plan" value={owner.business_plan} />
          <InfoRow label="Joined" value={fmtDate(owner.created_at)} />
        </div>

        <div className="lg:col-span-2 grid grid-cols-3 gap-4 self-start">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <p className="text-xs font-medium text-gray-500 uppercase">
              Total Listings
            </p>
            <p className="mt-1 text-2xl font-semibold">{listings.length}</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <p className="text-xs font-medium text-gray-500 uppercase">
              Active
            </p>
            <p className="mt-1 text-2xl font-semibold text-green-600">
              {activeCount}
            </p>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <p className="text-xs font-medium text-gray-500 uppercase">
              Avg Price
            </p>
            <p className="mt-1 text-2xl font-semibold">
              {fmtPrice(avgPrice)}
            </p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">
            Listings ({listings.length})
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase">
                <th className="px-4 py-3">Title</th>
                <th className="px-4 py-3">Price</th>
                <th className="px-4 py-3">Area</th>
                <th className="px-4 py-3">Rooms</th>
                <th className="px-4 py-3">Floor</th>
                <th className="px-4 py-3">Location</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {listings.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-8 text-center text-gray-400"
                  >
                    No listings
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
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
