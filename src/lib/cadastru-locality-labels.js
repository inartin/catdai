// UI-only Russian exonyms. Keep CUATM names and canonical request values intact.
// Reviewed sources are recorded in docs/cadastral.md.
const RUSSIAN_LABELS = new Map([
  ['Chișinău', 'Кишинёв'],
  ['Bălți', 'Бельцы'],
  ['Orhei', 'Оргеев'],
  ['Durlești', 'Дурлешты'],
  ['Cricova', 'Криково'],
]);

export function localityLabel(locality, lang) {
  return lang === 'ru' ? RUSSIAN_LABELS.get(locality.ro) || locality.ru : locality.ro;
}

export function localitySearchNames(locality) {
  return [locality.ro, locality.ru, localityLabel(locality, 'ru')];
}
