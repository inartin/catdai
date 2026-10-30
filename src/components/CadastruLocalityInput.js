"use client";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { LOCALITIES, normalizeLocality } from "@/lib/cadastru-streets/locality-catalogue";

import { localityLabel, localitySearchNames } from "@/lib/cadastru-locality-labels";

const indexed = LOCALITIES.map(row => ({ ...row, search: normalizeLocality([...localitySearchNames(row), row.city, ...(row.id === '0100' ? ['Кишинев', 'Кишинёв', 'Kishinev'] : row.city === 'Bălți' ? ['Бельцы', 'Beltsy'] : []), ...row.ancestors.flatMap(localitySearchNames)].join(' ')) }));
const nameCounts = { ro: new Map(), ru: new Map() };
for (const row of LOCALITIES) {
  for (const lang of ['ro', 'ru']) {
    const key = normalizeLocality(localityLabel(row, lang));
    nameCounts[lang].set(key, (nameCounts[lang].get(key) || 0) + 1);
  }
}
function localityType(row, lang) {
  if (lang === 'en') return ['3','5'].includes(row.status) ? 'city' : 'village';
  return ['3','5'].includes(row.status) ? (lang === 'ru' ? 'город' : 'oraș') : (lang === 'ru' ? 'село' : 'sat');
}
function selectedLabel(row, lang) {
  const name = localityLabel(row, lang);
  if ((nameCounts[lang === 'ru' ? 'ru' : 'ro'].get(normalizeLocality(name)) || 0) < 2) return name;
  const context = row.ancestors.map(ancestor => localityLabel(ancestor, lang));
  if (row.city.includes('[')) context.unshift(localityType(row, lang));
  return context.length ? `${name} (${context.join(' · ')})` : name;
}

export default function CadastruLocalityInput({ value, onChange, lang }) {
  const id = useId();
  const inputRef = useRef(null);
  const [query, setQuery] = useState(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const selected = indexed.find(row => row.city === value);
  const label = row => localityLabel(row, lang);
  const text = query ?? (selected ? selectedLabel(selected, lang) : value);
  const options = useMemo(() => {
    // A selected value is not a search query: opening the field shows every locality.
    const search = normalizeLocality(query ?? '');
    const terms = search.split(' ').filter(Boolean);
    const localizedLabel = row => localityLabel(row, lang);
    return indexed.filter(row => terms.every(term => row.search.includes(term)))
      .sort((a, b) => {
        if (!search) return Number(b.city === value) - Number(a.city === value)
          || localizedLabel(a).localeCompare(localizedLabel(b), lang);
        return Number(normalizeLocality(localizedLabel(b)).startsWith(search))
          - Number(normalizeLocality(localizedLabel(a)).startsWith(search))
          || localizedLabel(a).localeCompare(localizedLabel(b), lang);
      });
  }, [query, value, lang]);
  useEffect(() => { if (open) document.getElementById(`${id}-${active}`)?.scrollIntoView({ block: 'nearest' }); }, [active, open, id]);
  const choose = row => { onChange(row.city); setQuery(null); setOpen(false); inputRef.current?.blur(); };
  return <div className="relative">
    <input ref={inputRef} id={id} aria-label={lang === 'en' ? 'Locality' : lang === 'ru' ? 'Населённый пункт' : 'Localitate'} role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={`${id}-list`} aria-activedescendant={open && options[active] ? `${id}-${active}` : undefined}
      autoComplete="off" maxLength={120} value={text}
      onFocus={event => { setActive(0); setOpen(true); event.target.select(); }}
      onClick={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      onChange={event => {setQuery(event.target.value);onChange('');setActive(0);setOpen(true);}}
      onKeyDown={event => {
        if (event.key === 'Escape') {setOpen(false);return;}
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {event.preventDefault();setOpen(true);setActive(current => Math.max(0,Math.min(options.length-1,current+(event.key === 'ArrowDown'?1:-1))));}
        if (event.key === 'Enter' && open) {event.preventDefault();if(options[active]) choose(options[active]);}
      }}
      placeholder={lang === 'en' ? 'Enter a city or village' : lang === 'ru' ? 'Введите город или село' : 'Scrie orașul sau satul'}
      className="mt-2 h-12 w-full rounded-xl border border-gray-200 bg-white px-4 text-base text-gray-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary-light" />
    {open && <ul id={`${id}-list`} role="listbox" className="absolute z-30 mt-1 max-h-72 w-full overflow-auto rounded-xl border border-gray-200 bg-white p-1 shadow-lg">
      {options.map((row,index) => <li key={row.id} id={`${id}-${index}`} role="option" aria-selected={index===active} onMouseDown={event => event.preventDefault()} onClick={event => { event.preventDefault(); event.stopPropagation(); choose(row); }} className={`cursor-pointer rounded-lg px-3 py-2 ${index===active?'bg-primary/10':'hover:bg-gray-50'}`}>
        <div className="font-medium text-gray-900">{label(row)} <span className="text-xs font-normal text-gray-500">{localityType(row, lang)}</span></div>
        <div className="text-xs text-gray-500">{row.ancestors.map(a => localityLabel(a, lang)).join(' · ')}</div>
      </li>)}
      {!options.length && <li className="px-3 py-2 text-sm text-gray-500">{lang==='en'?'Locality not found. Check the name.':lang==='ru'?'Населённый пункт не найден. Проверьте название.':'Localitatea nu a fost găsită. Verifică denumirea.'}</li>}
    </ul>}
  </div>;
}
