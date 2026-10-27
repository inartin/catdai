// Paid-result history belongs to the credit ledger, independently of analytics.
export function cadastruPaidHistoryMetadata({ payload, searchType, searchRequest, lookupId, city, district, resultType }) {
  const numbers = [payload?.cadastral_number,
    ...(Array.isArray(payload?.lands) ? payload.lands : []).map(item => item?.cadastral_number),
    ...(Array.isArray(payload?.buildings) ? payload.buildings : []).map(item => item?.cadastral_number)].filter(Boolean);
  const address = payload?.request_address || payload?.address || payload?.apartment?.address
    || payload?.building?.address || payload?.matched_address || null;
  return {
    search_type: searchType,
    search_request: searchRequest || null,
    lookup_id: lookupId || null,
    city: city || null,
    district: district || null,
    result_type: resultType || null,
    raw_address: address,
    result_value: searchType === 'address' ? [...new Set(numbers)].join(' · ') || null : address,
  };
}

export function normalizePaidCadastruHistoryRow(row) {
  if (row?.feature_key !== 'cadastru_lookup') return null;
  const metadata = row.metadata || {};
  const request = metadata.search_request;
  const number = metadata.cadastral_number || null;
  if (!number && !request?.street) return null;
  const searchType = metadata.search_type === 'address' || request?.street ? 'address' : 'number';
  return {
    id: `paid-cadastru-${row.id}`, type: 'cadastru', isPaidResult: true,
    searchType, city: metadata.city || request?.city || null, district: metadata.district || null,
    cadastralNumber: number, searchAddress: metadata.raw_address || null, searchRequest: request || null,
    resultValue: metadata.result_value || (searchType === 'address' ? number : null),
    resultType: metadata.result_type || 'full_data', lookupSource: metadata.lookup_source || null,
    createdAt: row.created_at, sourceLookupId: metadata.lookup_id || null,
  };
}
