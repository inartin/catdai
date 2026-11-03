// Small client-safe parser: the street catalogue remains on the server.
const markers = 'stradela|strădela|str-la|переулок|strada|str|улица|ул|bulevardul|bulevard|bd|bul|бульвар|бул|проспект|пр|[șşs]oseaua|[șşs]os|шоссе|street|lane|boulevard|highway';
function roadType(marker) {
  const word=marker.normalize('NFD').replace(/\p{M}/gu,'').toLowerCase();
  if(/^(stradela|str-la|переулок|lane)$/.test(word))return 'str-la';
  if(/^(bulevardul|bulevard|bd|bul|бульвар|бул|проспект|пр|boulevard)$/.test(word))return 'bulevard';
  if(/^(soseaua|sos|шоссе|highway)$/.test(word))return 'sos';
  return 'strada';
}
export function parseStreetInput(value) {
  const street=String(value||'').replace(/\s+/g,' ').trim();
  const prefix=street.match(new RegExp(`^(${markers})(?:[.,]\\s*|\\s+)(.+)$`,'iu'));
  const suffix=prefix ? null : street.match(new RegExp(`^(.+?)\\s+(${markers})[.]?$`,'iu'));
  return {street:prefix?.[2]?.trim()||suffix?.[1]?.trim()||street,road_type:prefix?roadType(prefix[1]):suffix?roadType(suffix[2]):null};
}
