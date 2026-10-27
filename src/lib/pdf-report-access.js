import { getPaidFeatureUsageEvent, makePaidFeatureUsageKey } from '@/lib/paid-feature-usage';

export function stablePdfReportKey(reportKey) {
  const { estimate_log_id: _logId, ...key } = reportKey;
  return key;
}

// Paid guest reports use criteria, rather than a changing analytics log ID.
export async function getStablePdfUsage(userId, reportKey) {
  return getPaidFeatureUsageEvent({ userId, featureKey: 'pdf_report',
    idempotencyKey: makePaidFeatureUsageKey('pdf_report', stablePdfReportKey(reportKey)) });
}

export async function authorizedPdfEvaluation({ userId, reportKey, estimateType, params }) {
  if (!reportKey?.input || (reportKey.estimate_type || 'sale') !== estimateType) return false;
  const input = reportKey.input;
  const expected = Object.fromEntries(['city','rooms_count','area_m2','floor','total_floors','renovation','bathrooms_count','balconies_count']
    .map(key => [`p_${key}`, input[key] ?? null]));
  if (input.first_floor) expected.p_first_floor = true;
  if (input.last_floor) expected.p_last_floor = true;
  if (estimateType === 'rent') {
    expected.p_districts = input.districts || (input.district ? [input.district] : []);
    expected.p_building_types = input.building_types || (input.building_type ? [input.building_type] : []);
  } else {
    expected.p_district = input.district ?? null;
    expected.p_building_type = input.building_type ?? null;
  }
  if (makePaidFeatureUsageKey('pdf_input', expected) !== makePaidFeatureUsageKey('pdf_input', params)) return false;
  const usage = await getStablePdfUsage(userId, reportKey) || await getPaidFeatureUsageEvent({ userId,
    featureKey: 'pdf_report', idempotencyKey: makePaidFeatureUsageKey('pdf_report', reportKey) });
  return Boolean(usage);
}
