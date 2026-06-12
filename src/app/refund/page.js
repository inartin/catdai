import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

const sections = [
  {
    title: "1. Domeniu",
    paragraphs: [
      "Aceasta Politica de Rambursare se aplica produselor digitale CatDai, inclusiv accesului platit, creditelor de utilizare si rapoartelor sau analizelor generate in platforma.",
      "Platile sunt procesate prin Paddle.",
    ],
  },
  {
    title: "2. Produse digitale",
    paragraphs: [
      "Serviciile CatDai sunt livrate electronic. Dupa confirmarea platii, accesul sau creditele cumparate sunt adaugate in contul utilizatorului ori folosite pentru functia selectata.",
      "Pentru ca serviciul poate fi livrat imediat, rambursarea poate fi limitata dupa ce accesul a fost acordat, creditul a fost consumat sau raportul/analiza a fost generat(a), in masura permisa de lege.",
    ],
  },
  {
    title: "3. Cand putem aproba o rambursare",
    paragraphs: [
      "Putem analiza si aproba o rambursare in situatii precum plata dubla, plata efectuata din eroare, accesul platit neacordat dupa confirmarea tranzactiei, o eroare tehnica ce impiedica livrarea serviciului sau alte cazuri cerute de lege.",
      "Daca problema poate fi rezolvata prin acordarea accesului cumparat sau prin refacerea creditelor neutilizate, putem propune aceasta solutie inainte de rambursare.",
    ],
  },
  {
    title: "4. Cand rambursarea poate fi refuzata",
    paragraphs: [
      "Rambursarea poate fi refuzata daca produsul digital a fost deja livrat si utilizat, daca un credit a fost consumat pentru generarea unei analize sau daca solicitarea nu contine suficiente informatii pentru verificarea platii.",
      "Nu oferim rambursari pentru rezultate orientative cu care utilizatorul nu este de acord, deoarece estimarile CatDai sunt informative si depind de datele introduse si de semnalele de piata disponibile.",
    ],
  },
  {
    title: "5. Cum soliciti o rambursare",
    paragraphs: [
      "Pentru o solicitare de rambursare, scrie la info@catdai.md si include adresa de e-mail folosita la plata, data aproximativa a tranzactiei, produsul cumparat, suma platita si motivul solicitarii.",
      "Putem cere informatii suplimentare pentru a identifica tranzactia si pentru a verifica daca produsul a fost livrat sau utilizat.",
    ],
  },
  {
    title: "6. Timp de procesare",
    paragraphs: [
      "Vom incerca sa raspundem solicitarilor de rambursare in termen de 5 zile lucratoare.",
      "Daca rambursarea este aprobata, suma este returnata de regula prin aceeasi metoda de plata folosita la cumparare. Timpul pana la aparitia banilor in cont depinde de procesatorul de plati, banca emitenta si metoda de plata.",
    ],
  },
  {
    title: "7. Drepturi legale",
    paragraphs: [
      "Aceasta politica nu limiteaza drepturile obligatorii pe care utilizatorul le poate avea potrivit legislatiei aplicabile.",
      "Daca exista diferente intre aceasta politica si cerintele legale obligatorii, se aplica cerintele legale obligatorii.",
    ],
  },
  {
    title: "8. Contact",
    paragraphs: [
      "E-mail: info@catdai.md",
      "Program suport: Luni-Vineri, 09:00-18:00, ora Republicii Moldova.",
      "Data intrarii in vigoare: 11 Iunie 2026",
    ],
  },
];

export default function RefundPage() {
  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Navbar />
      <main className="flex-1">
        <section className="max-w-4xl mx-auto px-6 py-16 sm:py-20">
          <div className="rounded-3xl border border-gray-200 bg-white p-8 sm:p-10 shadow-sm">
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
              Politica de Rambursare
            </h1>
            <p className="mt-4 text-base sm:text-lg text-gray-600">
              Aceasta pagina explica regulile generale pentru rambursarea platilor
              efectuate pentru produsele digitale CatDai.
            </p>

            <div className="mt-10 space-y-8">
              {sections.map((section) => (
                <section key={section.title}>
                  <h2 className="text-xl font-semibold tracking-tight">
                    {section.title}
                  </h2>

                  <div className="mt-3 space-y-3 text-gray-600">
                    {section.paragraphs.map((paragraph) => (
                      <p key={paragraph}>{paragraph}</p>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
