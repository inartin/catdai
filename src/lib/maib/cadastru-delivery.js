import { featureResultPath } from '@/lib/guest-checkout.mjs';
import { getSavedCadastruAddress } from '@/lib/cadastru-favorites';
import { getCadastruRecordByAddress, getCadastruRecordByNumber } from '@/lib/cadastru-records';
import { cleanCadastruPayload } from '@/lib/cadastru-cache';
import { makePaidFeatureUsageKey } from '@/lib/paid-feature-usage';
import { cadastruPaidHistoryMetadata } from '@/lib/cadastru-paid-history';
import { resolveCadastruShareSearch } from '@/lib/cadastru-share-statistics';
import { resolveCadastruSupportedCity } from '@/lib/cadastru-supported-cities';
import { inspectStreetAddress, resolveStreet } from '@/lib/cadastru-streets/street-resolver';
import { validateCadastralNumber } from '@/lib/validation';

const clean = value => String(value || '').replace(/\s+/g, ' ').trim();

// Freeze the existing official result before leaving for the bank. No provider
// request, public link or credit consumption happens during checkout.
export async function buildMaibCadastruDelivery({ productKey, returnTo, checkoutSource, user }) {
  const path = featureResultPath(returnTo);
  if (productKey !== 'cadastru_lookup_single' || checkoutSource === 'pricing' || !path) return null;
  const url = new URL(path, 'https://catdai.local');
  if (!/^\/(?:ro\/|ru\/|en\/)?cadastru\/rezultat\/?$/.test(url.pathname) || url.searchParams.has('share_slug')) return null;

  const number = validateCadastralNumber(url.searchParams.get('cadastral_number') || '');
  const address = getSavedCadastruAddress(url.searchParams);
  let lookupAddress = '', searchLabel = '', searchRequest = null;
  if (address) {
    const city = resolveCadastruSupportedCity(address.city) || clean(address.city);
    const road = address.road_type === 'bulevard' ? 'bd' : address.road_type === 'str-la' ? 'str-la' : address.road_type === 'sos' ? 'sos' : 'str';
    const street = clean(address.street), house = clean(address.house_number).replace(/\s*\/\s*/g, '/').toUpperCase();
    const apartmentInput = clean(address.apartment_number);
    if (street.length > 80 || !/^\d{1,4}(?:\/(?:\d{1,4}|[a-z]))?$/i.test(house)
      || (apartmentInput && (!/^\d{1,4}$/.test(apartmentInput) || Number(apartmentInput) < 1))) return null;
    const apartment = apartmentInput ? String(Number(apartmentInput)) : '';
    const inspected = inspectStreetAddress({ city, roadType: road, street, houseNumber: house });
    if (['conflict', 'road_type_conflict'].includes(inspected.status)) return null;
    const resolution = inspected.status === 'cleaned' ? inspected : resolveStreet({ city, roadType: road, street });
    if (resolution.status === 'ambiguous') return null;
    searchLabel = clean(`${city}, ${road} ${street} ${house}${apartment ? ` ap ${apartment}` : ''}`);
    lookupAddress = clean(`${city}, ${road} ${resolution.street} ${house}${apartment ? ` ap ${apartment}` : ''}`);
    searchRequest = { ...address, city, street: resolution.street, house_number: house, apartment_number: apartment };
  }
  if (!number.valid && !lookupAddress) return null;
  const entry = number.valid
    ? await getCadastruRecordByNumber(number.value, { allowExpired: true })
    : await getCadastruRecordByAddress(lookupAddress, { allowExpired: true, requireUnitDetails: true });
  const payload = entry?.payload;
  if (!payload || payload.error || payload.registry_unavailable || payload.unit_list_entry
    || payload.locked_sections?.cadastru_details || (payload.status && payload.status !== 'success')) return null;

  const usageNumber = number.valid ? number.value : payload.cadastral_number;
  const usageKey = makePaidFeatureUsageKey('cadastru_lookup', usageNumber
    ? { cadastral_number: usageNumber } : { address: lookupAddress.toLowerCase() });
  const snapshot = cleanCadastruPayload(payload);
  delete snapshot.cadastru_evaluation_token;
  snapshot.locked_sections = {};
  const searchType = address ? 'address' : 'number';
  return {
    payload: snapshot, usage_key: usageKey, search_type: searchType,
    search_label: searchLabel || number.value,
    collect_statistics: process.env.NODE_ENV !== 'development' && user.app_metadata?.catdai_is_admin !== true,
    search_event_id: await resolveCadastruShareSearch(url.searchParams.get('cadastru_evaluation'), user.id, usageNumber, lookupAddress, payload),
    metadata: {
      ...cadastruPaidHistoryMetadata({ payload, searchType, searchRequest,
        lookupId: url.searchParams.get('lookup_id'), city: searchRequest?.city || payload.city || payload.form_fields?.city,
        district: payload.district || payload.form_fields?.district, resultType: entry.resultType }),
      feature: 'cadastru_lookup', cadastral_number: usageNumber || null,
      search_context: 'cadastru', lookup_source: entry.lookupSource || null,
      ...(address ? { raw_address: searchLabel } : {}),
    },
  };
}
