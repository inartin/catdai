"use client";

import { Fragment, useCallback, useEffect, useId, useRef, useState } from "react";

const fmtNum = (value) => Number(value).toLocaleString("ro-RO");
const fmtDate = (value) => value ? new Date(value).toLocaleString("ro-RO", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Chisinau" }) : "-";

function Counts({ row }) {
  return <>
    {[row.searches, row.repeatUses, row.registeredUsers].map((value, index) => <td key={index} className="px-4 py-3 text-right tabular-nums text-gray-900">{fmtNum(value)}</td>)}
    <td className="whitespace-nowrap px-4 py-3 text-gray-600">{fmtDate(row.lastSearched)}</td>
  </>;
}

function Columns({ label, showApartmentCount = false }) {
  const names = [label, ...(showApartmentCount ? ["Apartments", "Land parcels"] : []), "Searches", "Repeat uses", "Registered users", "Last searched"];
  return <thead className="bg-gray-50 text-gray-500"><tr>
    {names.map((name, index) => <th key={name} scope="col" title={name === "Apartments" ? "All stored apartment/unit records, including collected references" : undefined}
      className={`whitespace-nowrap px-4 py-3 font-medium ${index > 0 && name !== "Last searched" ? "text-right" : "text-left"}`}>{name}</th>)}
  </tr></thead>;
}

export default function AdminCadastruAddressReuse({ city, query = "" }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [expandedBuilding, setExpandedBuilding] = useState(null);
  const controller = useRef(null);
  const tableId = useId();

  const load = useCallback(async (offset = 0) => {
    controller.current?.abort();
    const active = new AbortController();
    controller.current = active;
    setLoading(true);
    setError(false);
    try {
      const params = new URLSearchParams({ offset: String(offset) });
      if (city) params.set("city", city);
      if (query) params.set("q", query);
      if (!offset) params.set("fresh", "1");
      const response = await fetch(`/api/admin/cadastru-storage/address-reuse?${params}`, { signal: active.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const result = await response.json();
      if (!active.signal.aborted) {
        setData((previous) => ({ ...result, rows: offset ? [...previous.rows, ...result.rows] : result.rows }));
        if (!offset) setExpandedBuilding(query && result.total === 1 ? result.rows[0]?.key : null);
      }
    } catch {
      if (!active.signal.aborted) setError(true);
    } finally {
      if (!active.signal.aborted) setLoading(false);
    }
  }, [city, query]);

  useEffect(() => {
    load();
    return () => controller.current?.abort();
  }, [load]);

  return (
    <div className="space-y-4 p-5 sm:p-6">
      <div>
        <h3 className="font-semibold text-gray-900">{query ? `Results for “${query}”` : `Stored properties & searches · ${city}`}</h3>
        <p className="mt-1 text-xs leading-5 text-gray-500">All time · Most searched addresses first. Includes stored apartments, buildings and land parcels, even with zero searches. Expand an address to see its saved properties.</p>
        <p className="text-xs leading-5 text-gray-500">Search-only addresses are shown separately from stored properties. Repeat uses are searches after the first, for the address or property shown. Registered users count distinct accounts at each level.</p>
        <p className="text-xs leading-5 text-gray-500">Address searches only, including cached results and unsuccessful searches. Anonymous visitors are included in searches; registered users count distinct accounts. Searching again after login can create a separate event.</p>
        {data?.updatedAt && <p className="mt-1 text-xs text-gray-500">Updated {fmtDate(data.updatedAt)} · Refreshes when {query ? "searching" : "opening a city"} or using Hard refresh.</p>}
      </div>
      {data?.rows.length > 0 && <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <Columns label="Address" showApartmentCount />
          <tbody className="divide-y divide-gray-100">{data.rows.map((row, index) => <Fragment key={row.key}>
            <tr className={`cursor-pointer hover:bg-gray-50 ${expandedBuilding === row.key ? "bg-primary/5" : ""}`}
              onClick={() => setExpandedBuilding((current) => current === row.key ? null : row.key)}>
              <th scope="row" className="min-w-64 px-4 py-3 text-left font-medium text-gray-700">
                <button type="button" aria-expanded={expandedBuilding === row.key} aria-controls={`${tableId}-building-${index}`}
                  className="flex items-center gap-2 rounded text-left hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary">
                  <span aria-hidden="true" className={`text-xs transition-transform ${expandedBuilding === row.key ? "rotate-90" : ""}`}>▶</span>
                  <span>{!city && row.city ? `${row.city}, ` : ""}{row.address}</span>
                </button>
              </th>
              <td className="px-4 py-3 text-right tabular-nums text-gray-900">{fmtNum(row.apartmentCount)}</td>
              <td className="px-4 py-3 text-right tabular-nums text-gray-900">{fmtNum(row.landCount)}</td>
              <Counts row={row} />
            </tr>
            {expandedBuilding === row.key && <tr id={`${tableId}-building-${index}`}><td colSpan={7} className="bg-gray-50 p-4">
              <h4 className="mb-3 text-sm font-semibold text-gray-900">Properties · {row.address}</h4>
              <table className="w-full text-sm" aria-label={`Properties and searches at ${row.address}`}>
                <Columns label="Property / apartment" />
                <tbody className="divide-y divide-gray-100">{row.properties.map((property) => <tr key={property.key}>
                  <th scope="row" className="px-4 py-3 text-left font-medium text-gray-700">
                    {property.propertyType === "land" ? "Land parcel" : property.propertyType === "building" ? "Building" : property.propertyType === "property" ? "Property" : property.apartmentNumber ? `Apartment ${property.apartmentNumber}` : property.stored ? "Apartment number unavailable" : "Without apartment"}
                    {property.cadastralNumber && <span className="mt-1 block text-xs font-normal text-gray-500">{property.cadastralNumber}</span>}
                    {!property.stored && property.apartmentNumber && <span className="mt-1 block text-xs font-normal text-gray-500">Search only · no stored unit</span>}
                  </th>
                  <Counts row={property} />
                </tr>)}</tbody>
              </table>
            </td></tr>}
          </Fragment>)}</tbody>
        </table>
      </div>}
      {loading && <p role="status" className="text-sm text-gray-500">Loading stored properties and searches…</p>}
      {error && <p role="alert" className="text-sm text-gray-600">Stored properties and search statistics are temporarily unavailable. <button type="button" className="font-medium text-primary underline" onClick={() => load(data?.rows.length || 0)}>Retry</button></p>}
      {!loading && !error && data?.total === 0 && <p className="text-sm text-gray-500">{query ? "No stored properties or address search history match this search." : "No stored properties or address search history available for this city."}</p>}
      {data && <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-gray-500">
        <p>{fmtNum(data.rows.length)} of {fmtNum(data.total)} addresses{data.excluded > 0 ? ` · ${fmtNum(data.excluded)} searches without usable address data excluded` : ""}</p>
        {data.hasMore && !error && <button type="button" disabled={loading} onClick={() => load(data.rows.length)} className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:text-primary disabled:text-gray-400">Load more</button>}
      </div>}
    </div>
  );
}
