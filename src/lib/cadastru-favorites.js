const ADDRESS_FIELDS = ["city", "road_type", "street", "house_number", "apartment_number"];

export function getSavedCadastruAddress(searchParams) {
  if (searchParams.get("source") !== "address") return null;
  const address = Object.fromEntries(ADDRESS_FIELDS.map((field) => [field, searchParams.get(field) || ""]));
  if (!address.city || !address.road_type || !address.street || !address.house_number) return null;
  return address;
}

export function getCadastruFavoritePath({ lang, cadastralNumber, cadastral, addressRequest, savedAddress }) {
  // A masked address result contains a fake number; only use the submitted
  // number or an unmasked official result as a bookmark identity.
  const number = cadastralNumber || (!cadastral?.locked_sections?.cadastru_details && cadastral?.cadastral_number);
  if (number && !savedAddress) {
    return `/${lang}/cadastru/rezultat?${new URLSearchParams({ cadastral_number: number })}`;
  }

  const address = savedAddress || addressRequest;
  if (!address) return null;
  const params = new URLSearchParams({ source: "address" });
  for (const field of ADDRESS_FIELDS) {
    if (address[field]) params.set(field, address[field]);
  }
  if (!getSavedCadastruAddress(params)) return null;
  return `/${lang}/cadastru/rezultat?${params}`;
}
