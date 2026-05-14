# CatDai - Project Context

Real estate valuation app that estimates the real market value of properties (initially apartments) based on data automatically collected from 999.md and other sources.
More options besides Real Estate will be added later, like Auto and Gadgets, for now those are unavailable.

## Core Flow

User inputs property details (zone, m², rooms, floor, renovation, etc.) and receives:
- Recommended market price
- Fast sale / premium price scenarios
- Estimated price range + confidence level


## Monetization Model

- **Free tier**: limited estimates + Adsense ads
- **Paid tier**: full report / unlimited estimates
- **Business plan**: for agencies - fast evaluations + PDF export / history


# Roadmap
- [ ] Foloseste UTM tracking, de exemplu: 
      https://999.md/ro/1234567?utm_source=catdai_app&utm_medium=telegram_bot

- [ ] Some listings are in MDL, convert it to EUR
- [ ] Case pe pamant
- [ ] Loturi teren
- [x] Telegram/X/Blog news cu statistica pe piata, daily sau saptamanal
- [ ] AI specific recomandari bazanduse pe detalii aditionale de utilizator, nu din filtre.
- [ ] Cauta date cadastrale fara nr cadastral, dupa adresa fixa.
- [ ] Cadastru cache, store raw building info in db
- [ ] Cadastru fallback3 https://claude.ai/chat/d7f31468-c730-41db-b5f7-7d1f228ffc46
- [ ] Verify Google auth in Audience tab
- [ ] Verify Facebook auth in Audience tab
- [x] Compara
- [ ] Istoricul de prețuri favoritelor


- [ ] Freemium

    The summary card (2 camere · 50m² · Râșcani)
    The three prices (83k / 92k / 100k) but blurred
    Show the main big estimated price
    The market position slider — blurred
    Example: 
    ✅ €92.500 — the anchor
    ✅ That one line creating uncertainty: "Prețul tău real poate fi cu până la 15% mai mare sau mai mic în funcție de starea exactă, etaj, stradă și alți factori."
    🔒 The range (83k–100k) blurred
    🔒 Market position blurred
    🔒 Everything else blurred

    Cut everything else behind the paywall. The sector comparison, the methodology breakdown, the statistics — all paid.
    The psychological moment is perfect: they see there IS a number, they see there IS a range, they see where they sit on the spectrum — all blurred. That's the exact moment of maximum curiosity and willingness to pay.
    Why not blur earlier:
    If you blur before showing anything, they don't know if the tool even works. Showing the structure but not the values proves the product is real before asking for money.
    What the CTA should say at that point:
    Not "plătește €9" — instead something like:
    "Descoperă prețul exact — €9, raport complet"
    Or even softer: "Vezi estimarea completă →" and price appears only on the payment screen.
    One more thing — "Trimite analiza" at the bottom currently, what does it do exactly?