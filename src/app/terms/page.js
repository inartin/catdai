import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

const sections = [
  {
    title: "1. Despre serviciu",
    paragraphs: [
      "CatDai este un serviciu informativ care oferă analiză de piață și estimări orientative de preț pentru proprietăți și alte categorii care pot fi disponibile în platformă la un moment dat.",
      "CatDai nu este agenție imobiliară, broker, evaluator autorizat, consultant financiar sau consultant juridic.",
    ],
  },
  {
    title: "2. Acceptarea termenilor",
    paragraphs: [
      "Prin accesarea sau utilizarea platformei CatDai, accepți acești Termeni și Condiții. Dacă nu ești de acord cu ei, nu trebuie să folosești serviciul.",
      "Dacă folosești CatDai în numele unei companii sau altei entități juridice, declari că ai dreptul de a obliga acea entitate prin acești termeni.",
    ],
  },
  {
    title: "3. Natura informațiilor oferite",
    paragraphs: [
      "Toate estimările, intervalele, scorurile, comparațiile și analizele afișate de CatDai au caracter exclusiv informativ și orientativ.",
      "CatDai nu garantează că un rezultat reflectă prețul final de vânzare, prețul de listare, prețul de evaluare bancară sau o evaluare oficială. Deciziile comerciale, financiare sau juridice îți aparțin în totalitate.",
    ],
  },
  {
    title: "4. Surse de date și limitele serviciului",
    paragraphs: [
      "CatDai poate analiza informații derivate din anunțuri publice, date introduse de utilizatori, modele interne și alte surse terțe disponibile în mod legal pentru analiză.",
      "CatDai nu republică anunțurile sursă ca anunțuri proprii și nu reproduce integral textele, imaginile sau materialele vizuale ale acestora în scopul prezentării lor către utilizatori ca listări originale.",
      "Platforma oferă rezultate agregate și estimări orientative bazate pe criteriile selectate și pe semnale de piață disponibile la momentul analizei.",
      "Disponibilitatea, structura și calitatea surselor terțe se pot modifica oricând, fără notificare prealabilă.",
    ],
  },
  {
    title: "5. Neafiliere cu platforme terțe",
    paragraphs: [
      "CatDai nu este afiliat, sponsorizat, aprobat sau partener oficial al platformelor terțe menționate în site, inclusiv 999.md sau Makler.md, cu excepția cazului în care acest lucru este indicat expres în scris.",
      "Orice denumiri comerciale, mărci sau nume aparțin titularilor lor de drept și sunt menționate exclusiv pentru identificarea surselor publice de date sau a contextului de piață.",
    ],
  },
  {
    title: "6. Utilizare permisă",
    paragraphs: [
      "Poți folosi CatDai numai în scopuri legale, legitime și pentru uz intern, personal sau profesional conform legii aplicabile.",
    ],
    bullets: [
      "să folosești serviciul într-un mod care încalcă legea sau drepturile altor persoane;",
      "să încerci acces neautorizat la sisteme, conturi, API-uri sau date;",
      "să copiezi, reproduci, redistribui, vinzi sau exploatezi comercial conținutul, interfața, modelele sau rezultatele CatDai fără acordul nostru scris;",
      "să folosești roboți, scripturi, crawlere sau alte mijloace automate pentru a extrage date din CatDai fără permisiune scrisă;",
      "să prezinți rezultatele CatDai drept evaluări oficiale, bancare sau notariale.",
    ],
  },
  {
    title: "7. Date introduse de utilizator",
    paragraphs: [
      "Ești responsabil pentru corectitudinea datelor pe care le introduci în platformă, inclusiv detaliile despre proprietate, preferințe și alte informații furnizate de tine.",
      "Declari că datele furnizate nu încalcă legea și nu aduc atingere drepturilor unor terți.",
    ],
  },
  {
    title: "8. Fără consultanță profesională",
    paragraphs: [
      "CatDai nu oferă evaluări oficiale, consultanță juridică, consultanță fiscală, consultanță investițională, servicii de intermediere sau servicii de reprezentare în tranzacții.",
      "Dacă ai nevoie de o evaluare oficială, de opinie juridică sau de o analiză profesională cu efecte legale ori bancare, trebuie să consulți un specialist autorizat.",
    ],
  },
  {
    title: "9. Proprietate intelectuală",
    paragraphs: [
      "Software-ul, designul, interfața, marca CatDai, elementele vizuale, baza noastră de prezentare și conținutul original creat de CatDai sunt protejate de legislația aplicabilă privind proprietatea intelectuală.",
      "CatDai nu revendică drepturi asupra mărcilor, logourilor sau conținutului care aparțin platformelor terțe sau autorilor originali ai anunțurilor.",
    ],
  },
  {
    title: "10. Conturi, produse plătite și plată",
    paragraphs: [
      "Anumite funcții CatDai pot fi disponibile gratuit, iar altele pot necesita autentificare și plată. Produsele plătite sunt cumpărate ca acces sau credite de utilizare unică pentru funcțiile indicate pe pagina de prețuri sau în ecranul de plată.",
      "Prețul, moneda, produsul ales și beneficiile incluse sunt afișate înainte de inițierea plății. Plata este procesată prin Paynet sau prin alt procesator de plăți indicat în interfață.",
      "CatDai nu colectează și nu stochează datele cardului bancar. Datele de card și autorizarea plății sunt gestionate de procesatorul de plăți.",
      "Accesul plătit sau creditele sunt activate numai după confirmarea plății de către procesatorul de plăți și verificarea tranzacției de către sistemele CatDai.",
      "Înainte de plată, utilizatorul trebuie să confirme că acceptă acești Termeni și Condiții și că a verificat produsul, prețul și datele afișate în ecranul de confirmare.",
    ],
  },
  {
    title: "11. Anulare, returnări și rambursări",
    paragraphs: [
      "Dacă plata este anulată, respinsă, expirată sau neconfirmată, accesul plătit ori creditele aferente nu sunt acordate.",
      "Produsele digitale CatDai sunt livrate electronic. După confirmarea plății și acordarea accesului sau a creditelor, rambursarea poate fi limitată atunci când serviciul a fost deja furnizat sau creditul a fost consumat, în măsura permisă de lege.",
      "Dacă a fost efectuată o plată eronată, dublă sau dacă accesul plătit nu a fost acordat după confirmarea tranzacției, ne poți contacta la info@catdai.md cu detaliile plății pentru verificare.",
      "Orice rambursare aprobată se face, de regulă, prin aceeași metodă de plată folosită la cumpărare, conform regulilor procesatorului de plăți și legislației aplicabile.",
    ],
  },
  {
    title: "12. Confirmări, suport și evidența tranzacțiilor",
    paragraphs: [
      "După inițierea sau finalizarea unei plăți, CatDai poate afișa o pagină de confirmare, anulare sau status al tranzacției. Redirecționarea către o pagină de succes nu reprezintă singură confirmarea definitivă a plății.",
      "Pentru întrebări privind plățile, accesul plătit, anulările sau rambursările, ne poți contacta la info@catdai.md. Program suport: Luni-Vineri, 09:00-18:00, ora Republicii Moldova.",
      "Datele minime despre tranzacție pot fi păstrate pentru reconciliere, suport, prevenirea fraudelor, contabilitate și obligații legale.",
    ],
  },
  {
    title: "13. Excluderea garanțiilor",
    paragraphs: [
      "În măsura maximă permisă de lege, serviciul este oferit în forma disponibilă, fără garanții exprese sau implicite privind exactitatea, caracterul complet, disponibilitatea continuă sau potrivirea pentru un anumit scop.",
      "Nu garantăm că platforma va funcționa fără întreruperi, fără erori sau fără întârzieri și nu garantăm că toate datele externe vor rămâne disponibile.",
    ],
  },
  {
    title: "14. Limitarea răspunderii",
    paragraphs: [
      "În măsura maximă permisă de lege, CatDai nu răspunde pentru pierderi indirecte, pierderi de profit, pierderi de oportunitate, pierderi comerciale, decizii de investiții, decizii de cumpărare sau vânzare, ori alte consecințe rezultate din utilizarea serviciului.",
      "Utilizarea estimărilor și a analizelor oferite de CatDai se face pe propriul tău risc.",
    ],
  },
  {
    title: "15. Suspendare sau încetare",
    paragraphs: [
      "Ne rezervăm dreptul de a limita, suspenda sau înceta accesul la serviciu în orice moment, inclusiv atunci când considerăm că utilizarea platformei creează un risc legal, operațional sau de securitate ori încalcă acești termeni.",
    ],
  },
  {
    title: "16. Modificarea serviciului și a termenilor",
    paragraphs: [
      "Putem modifica, suspenda sau întrerupe parțial ori total serviciul, precum și acești Termeni și Condiții, în orice moment.",
      "Versiunea actualizată produce efecte din momentul publicării pe site, dacă nu este prevăzut altfel.",
    ],
  },
  {
    title: "17. Reclamații și notificări privind drepturile",
    paragraphs: [
      "Dacă consideri că anumite materiale, referințe sau utilizări din cadrul CatDai îți încalcă drepturile, ne poți contacta la adresa indicată mai jos, cu suficiente detalii pentru analiză.",
      "Ne rezervăm dreptul de a investiga și de a elimina ori restricționa anumite materiale atunci când acest lucru este justificat.",
    ],
  },
  {
    title: "18. Legea aplicabilă",
    paragraphs: [
      "Acești Termeni și Condiții sunt guvernați de legislația Republicii Moldova, în măsura permisă de lege.",
      "Orice litigiu care decurge din utilizarea serviciului va fi soluționat de instanțele competente din Republica Moldova, cu excepția cazului în care legea aplicabilă prevede altfel.",
    ],
  },
  {
    title: "19. Datele operatorului",
    paragraphs: [
      "Operator: CatDai",
      "E-mail de contact: info@catdai.md",
      "Program suport: Luni-Vineri, 09:00-18:00, ora Republicii Moldova.",
      "Data intrării în vigoare: 10 Iunie 2026",
    ],
  },
];

export default function TermsPage() {
  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Navbar />
      <main className="flex-1">
        <section className="max-w-4xl mx-auto px-6 py-16 sm:py-20">
          <div className="rounded-3xl border border-gray-200 bg-white p-8 sm:p-10 shadow-sm">
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
              Termeni și Condiții
            </h1>
            <p className="mt-4 text-base sm:text-lg text-gray-600">
              Această pagină descrie condițiile generale de utilizare ale serviciului
              CatDai. Textul de mai jos are rol informativ și operațional pentru
              utilizatorii platformei.
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

                  {section.bullets ? (
                    <ul className="mt-4 list-disc pl-5 space-y-2 text-gray-600">
                      {section.bullets.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  ) : null}
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
