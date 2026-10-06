import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import Link from "next/link";
import { MERCHANT } from "@/lib/merchant.mjs";

const sections = [
  {
    title: "1. Despre serviciu",
    paragraphs: [
      `Serviciul CatDai (catdai.md) este operat de ${MERCHANT.legalName}, IDNO ${MERCHANT.idno}, adresă: ${MERCHANT.address}.`,
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
      "Informațiile din CatDai nu reprezintă consultanță financiară și nu trebuie folosite ca recomandare de investiție, credit ipotecar, tranzacționare sau cumpărare ori vânzare a unei proprietăți.",
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
      "Prețul, moneda, produsul ales și beneficiile incluse sunt afișate înainte de inițierea plății. Plățile noi sunt procesate prin maib; tranzacțiile Paddle existente rămân gestionate prin Paddle.",
      "Pentru o comandă maib, te autentifici în CatDai, alegi produsul, verifici utilizările incluse și suma în MDL, furnizezi o adresă reală de e-mail pentru confirmare și bifezi acceptarea acestor termeni. Continui apoi pe pagina securizată maib pentru plata cu cardul bancar acceptat de procesator.",
      "Pachetele maib sunt achitate o singură dată, nu creează abonamente și adaugă credite fără expirare. Standard include câte 2 utilizări pentru fiecare funcție, Pro câte 10, iar Extra câte 50. Produsele individuale includ o utilizare a funcției indicate. Beneficiile și prețul exact sunt afișate înainte de plată.",
      "CatDai nu colectează și nu stochează datele cardului bancar. Datele de card și autorizarea plății sunt gestionate de procesatorul de plăți.",
      "Plățile maib sunt efectuate în MDL. Dacă moneda contului de card diferă, conversia și eventualele comisioane sunt stabilite de banca emitentă a cardului.",
      "Accesul plătit sau creditele sunt activate numai după confirmarea plății de către procesatorul de plăți și verificarea tranzacției de către sistemele CatDai.",
      "Înainte de plată, utilizatorul trebuie să confirme că acceptă acești Termeni și Condiții și că a verificat produsul, prețul și datele afișate în ecranul de confirmare.",
    ],
  },
  {
    title: "10.1. Prestarea și livrarea serviciilor digitale",
    paragraphs: [
      "Serviciile sunt prestate online, fără livrare fizică și fără costuri de transport. Ai nevoie de un cont CatDai, conexiune la internet și un browser actualizat (Chrome, Safari, Firefox sau Edge), cu JavaScript activat. Nu este necesară instalarea unui program.",
      "După verificarea confirmării maib, creditele sunt adăugate în cont, de regulă în câteva minute. Activarea nu depinde numai de redirecționarea de la bancă. Rezultatele analizelor sunt afișate în platformă la utilizarea funcțiilor cumpărate; rapoartele PDF se descarcă din CatDai. Creditele disponibile pot fi verificate în profil.",
      "Generarea unei analize și descărcarea raportului PDF aferent sunt funcții distincte și pot consuma fiecare utilizarea corespunzătoare. Timpul de generare și conținutul rezultatelor depind de datele introduse și de disponibilitatea surselor externe. Dacă plata este confirmată, dar accesul lipsește, contactează info@catdai.md cu numărul comenzii.",
    ],
  },
  {
    title: "10.2. Protecția datelor personale și confidențialitatea",
    paragraphs: [
      "Pentru comenzi prelucrăm datele de cont, adresa de e-mail pentru confirmarea plății, produsul, suma, moneda, identificatorii și statusul tranzacției, precum și versiunea termenilor și data acceptării lor. Aceste date sunt folosite pentru executarea comenzii, confirmare, suport, reconciliere și obligații legale.",
      "Datele necesare inițierii și confirmării plății sunt transmise către maib; informațiile necesare expedierii confirmării sunt prelucrate de furnizorul serviciului de e-mail. CatDai nu colectează datele sensibile ale cardului. Detaliile privind prelucrarea, păstrarea și drepturile tale sunt descrise în Politica de Confidențialitate.",
    ],
    links: [{ href: '/privacy', label: 'Politica de Confidențialitate' }],
  },
  {
    title: "11. Anulare, returnări și rambursări",
    paragraphs: [
      "Dacă plata este anulată, respinsă, expirată sau neconfirmată, accesul plătit ori creditele aferente nu sunt acordate.",
      "Produsele digitale CatDai sunt livrate electronic. Simpla activare a accesului sau adăugarea creditelor în cont nu reprezintă renunțarea la dreptul legal de retragere. Orice limitare a rambursării pentru servicii deja prestate se aplică numai în condițiile prevăzute de lege; acceptarea generală a acestor termeni nu este un acord separat de renunțare la acest drept.",
      "Dacă a fost efectuată o plată eronată, dublă sau dacă accesul plătit nu a fost acordat după confirmarea tranzacției, ne poți contacta la info@catdai.md cu detaliile plății pentru verificare.",
      "Rambursările pentru plățile maib se efectuează pe același card folosit la achitare. Rambursările tranzacțiilor Paddle sunt gestionate conform regulilor Paddle și legislației aplicabile.",
      "Pentru solicitare, trimite numărul comenzii, adresa de e-mail folosită la plată, produsul, suma, data aproximativă a plății și motivul, dacă este relevant, la info@catdai.md. Ne propunem să răspundem în 5 zile lucrătoare, fără a prelungi termenele legale obligatorii. După aprobarea rambursării, timpul de creditare a cardului depinde de procesator și de banca emitentă.",
      "Regulile generale privind eligibilitatea, procesul și termenele de rambursare sunt descrise și în pagina separată /refund.",
    ],
    links: [{ href: '/refund', label: 'Politica de Rambursare' }],
  },
  {
    title: "12. Confirmări, suport și evidența tranzacțiilor",
    paragraphs: [
      "După inițierea sau finalizarea unei plăți, CatDai poate afișa o pagină de confirmare, anulare sau status al tranzacției. Redirecționarea către o pagină de succes nu reprezintă singură confirmarea definitivă a plății.",
      "Pagina de revenire afișează numărul comenzii, produsul, cantitatea, utilizările incluse, suma, moneda și, după confirmare, data achitării. Confirmarea plății este expediată la adresa de e-mail furnizată în checkout.",
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
      `Operator / comerciant: ${MERCHANT.legalName}`,
      `IDNO: ${MERCHANT.idno}`,
      `Adresă: ${MERCHANT.address}`,
      `Website: catdai.md. E-mail de contact: ${MERCHANT.email}`,
      "Program suport: Luni-Vineri, 09:00-18:00, ora Republicii Moldova.",
      "Data ultimei actualizări: 5 Octombrie 2026",
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
              Acești Termeni și Condiții reglementează utilizarea serviciului
              CatDai și comenzile pentru serviciile digitale cumpărate prin catdai.md.
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

                  {section.links?.map(link => <p key={link.href} className="mt-3"><Link href={link.href} className="text-primary underline">{link.label}</Link></p>)}

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
