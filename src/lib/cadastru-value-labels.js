// Display-only translations of registry categories. Preserve addresses, numbers,
// free text and unrecognized values exactly as supplied by the official source.
const normalize = (value) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
const ENGLISH = new Map(Object.entries({
  "Da": "Yes", "Nu": "No", "Există": "Present", "Lipsă": "None", "Nu sunt": "None",
  "Nu există": "None", "Nu are": "None", "Fără": "None", "Necunoscut": "Unknown",
  "Apartament": "Apartment", "Încăpere": "Unit", "Încăpere izolată": "Separate unit",
  "Încăpere locativă": "Residential unit", "Locativ": "Residential", "Locativă": "Residential",
  "Locuință": "Dwelling", "Locuințe": "Housing", "Fond locativ": "Housing stock",
  "Bloc cu apartamente": "Apartment building", "Bloc locativ": "Apartment building",
  "Casă individuală": "Detached house", "Casă de locuit individuală": "Detached house",
  "Construcție": "Building", "Teren": "Land", "Teren pentru construcții": "Building land",
  "Teren aferent": "Appurtenant land", "Agricol": "Agricultural",
  "Grădină": "Garden", "Garaj": "Garage", "Comercial": "Commercial",
  "Privată": "Private", "Privat": "Private", "Publică": "Public", "De stat": "State-owned",
  "Proprietate privată": "Private ownership", "Proprietate publică": "Public ownership",
  "Determinată": "Determined", "Nedeterminată": "Undetermined",
  "Generale": "General", "Fixe": "Fixed", "General": "General", "Fix": "Fixed",
  "Bună": "Good", "Satisfăcătoare": "Satisfactory", "Nesatisfăcătoare": "Unsatisfactory",
  "Avariată": "Damaged", "Finalizată": "Completed", "Nefinalizată": "Unfinished",
  "Cărămidă": "Brick", "Piatră": "Stone", "Beton": "Concrete", "Beton armat": "Reinforced concrete",
  "Panouri": "Panels", "Blocuri de beton": "Concrete blocks", "Lemn": "Timber",
  "Centralizată": "Centralized", "Centralizat": "Centralized", "Autonomă": "Independent",
  "Autonom": "Independent", "Locală": "Local", "Local": "Local",
}).map(([source, label]) => [normalize(source), label]));

const CATEGORY_FIELDS = new Set(["toilet", "bathroom", "is_last_floor", "object_type", "type",
  "destination", "room_usage", "use_mode", "boundary_type", "land_use", "building_use",
  "ownership_type", "real_rights", "notes", "restrictions", "classifier", "condition", "wall_material", "water", "sewage", "gas", "electricity"]);

export function cadastruValueLabel(value, field, lang) {
  if (lang !== "en" || !CATEGORY_FIELDS.has(field) || typeof value !== "string") return value;
  return ENGLISH.get(normalize(value)) || value;
}
