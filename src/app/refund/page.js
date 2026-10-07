import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { MERCHANT } from "@/lib/merchant.mjs";

const sections = [
  {
    title: "1. Domeniu",
    paragraphs: [
      "Aceasta Politica de Rambursare se aplica produselor digitale CatDai, inclusiv accesului platit, creditelor de utilizare si rapoartelor sau analizelor generate in platforma.",
      "Plățile noi sunt procesate prin maib. Tranzacțiile și abonamentele Paddle existente sunt gestionate în continuare prin Paddle.",
    ],
  },
  {
    title: "2. Produse digitale",
    paragraphs: [
      "Serviciile CatDai sunt livrate electronic. Dupa confirmarea platii, accesul sau creditele cumparate sunt adaugate in contul utilizatorului ori folosite pentru functia selectata.",
      "Simpla activare a accesului sau adăugarea creditelor în cont nu reprezintă renunțarea la dreptul legal de retragere. Orice limitare a rambursării pentru servicii deja prestate se aplică numai în condițiile prevăzute de lege; acceptarea Termenilor și Condițiilor nu este un acord separat de renunțare la acest drept.",
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
      "În măsura permisă de lege, putem refuza cererile discreționare de rambursare pentru servicii deja prestate și utilizate. Consumul unui credit nu anulează automat drepturile obligatorii ale consumatorului. Dacă informațiile nu permit identificarea plății, vom solicita detalii suplimentare.",
      "Dezacordul cu o estimare orientativă nu constituie, singur, un motiv comercial de rambursare. Aceasta nu limitează dreptul legal de retragere sau remediile pentru un serviciu neconform.",
    ],
  },
  {
    title: "5. Cum soliciti o rambursare",
    paragraphs: [
      "Pentru o solicitare de rambursare sau notificarea retragerii din contract, scrie la info@catdai.md și include numărul comenzii, adresa de e-mail folosită la plată, data aproximativă a tranzacției, produsul cumpărat și suma. Poți preciza motivul, dacă este relevant; nu solicităm justificarea exercitării unui drept legal de retragere.",
      "Putem cere informatii suplimentare pentru a identifica tranzactia si pentru a verifica daca produsul a fost livrat sau utilizat.",
    ],
  },
  {
    title: "6. Timp de procesare",
    paragraphs: [
      "Ne propunem să răspundem solicitărilor de rambursare în 5 zile lucrătoare, fără a prelungi termenele legale obligatorii.",
      "Rambursările pentru plățile maib se efectuează pe același card folosit la achitare. Rambursările tranzacțiilor Paddle sunt gestionate conform regulilor Paddle. Timpul până la apariția banilor în cont depinde de procesator și de banca emitentă.",
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
      `Comerciant: ${MERCHANT.legalName}`,
      `IDNO: ${MERCHANT.idno}`,
      `Adresă: ${MERCHANT.address}`,
      `E-mail: ${MERCHANT.email}`,
      "Program suport: Luni-Vineri, 09:00-18:00, ora Republicii Moldova.",
      "Data ultimei actualizări: 5 Octombrie 2026",
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
