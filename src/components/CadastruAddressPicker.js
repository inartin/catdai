"use client";
import { useEffect, useRef, useState } from 'react';
import { addressSuggestions } from '@/lib/cadastru-address-suggestions-client';
const text = {
  ro: { manual:'Introduc manual', numbers:'Numere cunoscute', loading:'Se încarcă…' },
  ru: { manual:'Ввести вручную', numbers:'Известные номера домов', loading:'Загрузка…' },
  en: { manual:'Enter manually', numbers:'Known house numbers', loading:'Loading…' },
};
const inputClass = 'mt-2 h-12 w-full rounded-xl border border-gray-200 bg-white px-4 text-base outline-none focus:border-primary focus:ring-2 focus:ring-primary-light';
export default function CadastruAddressPicker({ value, onChange, onReady, lang, t }) {
  const copy = text[lang] || text.ro;
  const [savedOptions,setOptions] = useState([]);
  const [selected,setSelected] = useState(null);
  const [manual,setManual] = useState(false);
  const [numbers,setNumbers] = useState([]);
  const [loading,setLoading] = useState(false);
  const [,setUnavailable] = useState(false);
  const [active,setActive] = useState(-1);
  const [open,setOpen] = useState(false);
  const [numbersOpen,setNumbersOpen] = useState(false);
  const [catalogue,setCatalogue] = useState(null);
  const [numbersAttribution,setNumbersAttribution] = useState('');
  const [optionsCity,setOptionsCity] = useState(value.city);
  const suggestions = useRef({controller:null});
  const prefetchTimer = useRef(null);
  const inputRef = useRef(null);
  const ready = manual || Boolean(selected && selected.street === value.street && selected.city === value.city);
  const options = manual || ready || value.street.trim().length < 2 ? []
    : addressSuggestions.getStreetOptions(value.city,value.street) || savedOptions;
  if (optionsCity !== value.city) {
    setOptionsCity(value.city);
    setSelected(null); setManual(false); setNumbers([]); setNumbersOpen(false); setOptions([]); setLoading(false); setActive(-1);
  }
  useEffect(() => { if (open && active >= 0) document.getElementById(`street-option-${active}`)?.scrollIntoView({block:'nearest'}); }, [open,active]);
  useEffect(() => { onReady(ready); }, [ready,onReady]);
  useEffect(() => {
    let current = true;
    addressSuggestions.preloadCatalogue(value.city).then(data => { if (current) setCatalogue(data); });
    return () => { current = false; clearTimeout(prefetchTimer.current); };
  }, [value.city]);
  useEffect(() => () => clearTimeout(prefetchTimer.current), []);
  useEffect(() => {
    if (manual || ready || value.street.trim().length < 2 || !value.city) return;
    const search=suggestions.current;
    const cached=addressSuggestions.getStreetOptions(value.city,value.street);
    if(cached) return;
    const controller = new AbortController();
    search.controller=controller;
    const timer = setTimeout(async () => {
      try {
        const next = await addressSuggestions.fetchStreetOptions(value.city,value.street,controller.signal);
        if (!controller.signal.aborted && search.controller===controller) {
          setOptions(next);setActive(0);
        }
      } catch { /* Keep the previous suggestions during transient failures. */ }
    },80);
    return () => { clearTimeout(timer); controller.abort(); };
  },[value.city,value.street,manual,ready,catalogue]);
  useEffect(() => {
    if (!selected || selected.city !== value.city || manual) return;
    let current = true;
    addressSuggestions.loadHouseNumbers(value.city,selected).then(data => {
      if (!current) return;
      setNumbers(data.numbers || []); setNumbersAttribution(data.attribution || '');
      setUnavailable(Boolean(data.unavailable)); setLoading(false);
    });
    return () => { current = false; };
  },[selected,value.city,manual,catalogue]);
  function prefetchHouses(option) {
    clearTimeout(prefetchTimer.current);
    prefetchTimer.current = setTimeout(() => { void addressSuggestions.loadHouseNumbers(value.city,option,{prefetch:true}); },120);
  }
  function choose(option) {
    clearTimeout(prefetchTimer.current);
    suggestions.current.controller?.abort();
    setSelected({...option, label: option.house_number ? option.label.slice(0,-option.house_number.length).trim() : option.label, city:value.city}); setOptions([]); setManual(false); setOpen(false); inputRef.current?.blur();
    const cached = addressSuggestions.getHouseNumbers(value.city,option);
    setNumbers(cached?.numbers || []); setNumbersAttribution(cached?.attribution || ''); setNumbersOpen(false);
    setLoading(!cached?.numbers?.length); setUnavailable(false);
    onChange({...value,street:option.street,roadType:option.road_type,...(option.house_number ? {houseNumber:option.house_number} : {})});
  }
  const filtered = numbers.filter(number => number.toUpperCase().startsWith(value.houseNumber.toUpperCase()));
  return <div className="space-y-4">
    <div className="relative">
      <label htmlFor="address-street" className="text-sm font-semibold text-gray-700">{t('cadastru.street')}</label>
      <input ref={inputRef} type="text" autoComplete="off" name="lookup-road-query" spellCheck={false} id="address-street" className={inputClass} value={value.street} maxLength={80} placeholder="Dacia, Eminescu…"
        role="combobox" aria-autocomplete="list" aria-expanded={open && !manual && options.length>0} aria-controls="street-options" aria-activedescendant={open && options[active] && active>=0 ? `street-option-${active}` : undefined}
        onFocus={e => {setOpen(true);setActive(0);e.target.select();}}
        onClick={() => setOpen(true)}
        onBlur={() => {setOpen(false);clearTimeout(prefetchTimer.current);}}
        onChange={e => {
          clearTimeout(prefetchTimer.current);
          suggestions.current.controller?.abort();
          const street=e.target.value;
          const cached=addressSuggestions.getStreetOptions(value.city,street);
          if(street.trim().length<2)setOptions([]);
          else if(cached)setOptions(cached);
          else setOptions(options);
          setOpen(true);setManual(false);setSelected(null);setNumbers([]);setNumbersOpen(false);setLoading(false);setActive(0);
          onChange({...value,street,roadType:'strada'});
        }}
        onKeyDown={e => {
          if (e.key==='Escape') {setOpen(false);clearTimeout(prefetchTimer.current);}
          if (e.key==='ArrowDown' && options.length) {e.preventDefault();const next=Math.min(options.length-1,active+1);setOpen(true);setActive(next);prefetchHouses(options[next]);}
          if (e.key==='ArrowUp' && options.length) {e.preventDefault();const next=Math.max(0,active-1);setOpen(true);setActive(next);prefetchHouses(options[next]);}
          if (e.key==='Enter' && open && options[active]) {e.preventDefault();choose(options[active]);}
        }} />
      {open && !manual && options.length > 0 && <ul id="street-options" role="listbox" className="absolute z-30 mt-1 max-h-72 w-full overflow-auto rounded-xl border border-gray-200 bg-white p-1 shadow-lg">
        {options.map((option,i) => <li key={`${option.road_type}:${option.street}`} id={`street-option-${i}`} role="option" aria-selected={active===i}
          onMouseEnter={() => {setActive(i);prefetchHouses(option);}} onMouseLeave={() => clearTimeout(prefetchTimer.current)}
          onMouseDown={e => e.preventDefault()} onClick={e => {e.preventDefault();e.stopPropagation();choose(option);}}
          className={`cursor-pointer rounded-lg px-3 py-2 ${active===i?'bg-primary/10':'hover:bg-gray-50'}`}>
          <div className="font-medium text-gray-900">{option.label}</div>
          <div className="text-xs text-gray-500">{value.city}</div>
        </li>)}
      </ul>}
      {manual && <label className="mt-3 block text-sm">{t('cadastru.roadType')}<select className={inputClass} value={value.roadType} onChange={e => onChange({...value,roadType:e.target.value})}>
        {[['strada','cadastru.roadTypeStreetFull'],['str-la','cadastru.roadTypeLaneFull'],['bulevard','cadastru.roadTypeBoulevardFull'],['sos','cadastru.roadTypeHighwayFull']].map(([key,label]) => <option key={key} value={key}>{t(label)}</option>)}
      </select></label>}
    </div>
    <div className="grid grid-cols-2 gap-4">
      <label className="text-sm font-semibold text-gray-700">{t('cadastru.houseNumber')}<input type="text" autoComplete="off" name="lookup-building-query" spellCheck={false} className={inputClass} value={value.houseNumber} maxLength={10} placeholder="18/2, 45A"
        onFocus={() => setNumbersOpen(true)} onClick={() => setNumbersOpen(true)}
        onBlur={e => {if (!e.relatedTarget?.closest('[data-house-suggestions]')) setNumbersOpen(false);}}
        onKeyDown={e => {if (e.key === 'Escape') setNumbersOpen(false);}}
        onChange={e => {setNumbersOpen(true);onChange({...value,houseNumber:e.target.value.replace(/[^\da-z/]/gi,'').toUpperCase()});}} /></label>
      <label className="text-sm font-semibold text-gray-700">{t('cadastru.apartmentNumber')}<input type="text" autoComplete="off" name="lookup-unit-query" className={inputClass} inputMode="numeric" value={value.apartmentNumber} placeholder={t('cadastru.apartmentPlaceholder')} onChange={e => onChange({...value,apartmentNumber:e.target.value.replace(/\D/g,'').slice(0,4)})} /></label>
    </div>
    <div aria-live="polite" data-house-suggestions onBlurCapture={e => {
      if (!e.currentTarget.contains(e.relatedTarget)) setNumbersOpen(false);
    }}>
      {numbersOpen && loading && <p className="text-sm text-gray-500">{copy.loading}</p>}

      {numbersOpen && filtered.length>0 && <>
        <p className="mb-2 text-sm text-gray-600">{copy.numbers}</p>
        <div className="grid max-h-64 grid-cols-4 gap-2 overflow-y-auto rounded-2xl bg-gray-100 p-3 sm:grid-cols-6" role="group" aria-label={copy.numbers}>
          {filtered.map(number => <button type="button" key={number} aria-pressed={value.houseNumber===number} onMouseDown={e => e.preventDefault()} onClick={() => {onChange({...value,houseNumber:number});setNumbersOpen(false);}} className={`min-h-12 rounded-xl px-2 py-3 text-base font-semibold focus-visible:ring-2 focus-visible:ring-primary ${value.houseNumber===number?'bg-primary text-white':'bg-white text-gray-800 hover:bg-gray-50'}`}>{number}</button>)}
        </div><p className="mt-1 text-xs text-gray-500">{numbersAttribution}</p>
      </>}

    </div>
  </div>;
}
