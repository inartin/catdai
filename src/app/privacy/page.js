import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

const sections = [
  {
    title: "1. Introducere",
    paragraphs: [
      "Această Politică de Confidențialitate explică modul în care CatDai poate colecta, utiliza, stoca și proteja datele în legătură cu utilizarea platformei.",
      "Ne angajăm să tratăm datele cu grijă, transparență și în conformitate cu legislația aplicabilă din Republica Moldova și, după caz, cu alte reguli aplicabile protecției datelor.",
    ],
  },
  {
    title: "2. Cine este operatorul",
    paragraphs: [
      "E-mail de contact: info@catdai.md",
    ],
  },
  {
    title: "3. Ce date putem prelucra",
    paragraphs: [
      "În funcție de modul în care folosești platforma, CatDai poate prelucra anumite categorii de date.",
    ],
    bullets: [
      "date introduse direct de utilizator, cum ar fi criteriile proprietății, preferințele de filtrare și alte informații furnizate în formulare;",
      "date de cont, cum ar fi identificatorul de utilizator, numele, adresa de e-mail sau datele furnizate de serviciile de autentificare folosite;",
      "date necesare pentru plăți și acces plătit, cum ar fi produsul cumpărat, suma, moneda, numărul intern al facturii/comenzii, statusul tranzacției, identificatorul tranzacției primit de la procesatorul de plăți și informații de contact necesare pentru confirmare sau suport;",
      "date tehnice, cum ar fi adresa IP, tipul browserului, sistemul de operare, limba browserului, paginile accesate, data și ora accesării;",
      "date privind utilizarea serviciului, inclusiv interacțiunea cu paginile, funcțiile folosite și erorile tehnice;",
      "date de contact, dacă ne scrii sau ne trimiți o solicitare;",
      "cookie-uri sau tehnologii similare, dacă acestea sunt folosite în platformă.",
    ],
  },
  {
    title: "4. Scopurile prelucrării",
    paragraphs: [
      "Putem prelucra datele pentru următoarele scopuri legitime și operaționale:",
    ],
    bullets: [
      "funcționarea, menținerea și securizarea platformei;",
      "generarea estimărilor și a analizelor solicitate de utilizator;",
      "crearea comenzilor, procesarea plăților, confirmarea tranzacțiilor, acordarea accesului plătit sau a creditelor cumpărate și soluționarea solicitărilor legate de plată;",
      "îmbunătățirea performanței, calității și relevanței serviciului;",
      "diagnosticarea erorilor tehnice și prevenirea utilizării abuzive;",
      "comunicarea cu utilizatorii în legătură cu solicitări, reclamații sau notificări;",
      "respectarea obligațiilor legale și apărarea drepturilor sau intereselor legitime ale CatDai.",
    ],
  },
  {
    title: "5. Temeiul prelucrării",
    paragraphs: [
      "În funcție de context, prelucrarea datelor poate avea loc pentru executarea serviciului solicitat de utilizator, inclusiv pentru crearea contului, livrarea funcțiilor plătite și procesarea comenzilor, pentru respectarea obligațiilor legale, în baza interesului legitim al operatorului sau, acolo unde este necesar, în baza consimțământului utilizatorului.",
    ],
  },
  {
    title: "6. Surse de date",
    paragraphs: [
      "Datele pot proveni direct de la utilizator, din interacțiunea tehnică cu platforma sau din surse publice și terțe utilizate pentru analiză de piață.",
      "CatDai poate utiliza date derivate din anunțuri publice și alte surse externe pentru a genera analize agregate, însă nu tratează platformele terțe ca fiind afiliate sau partenere oficiale, dacă acest lucru nu este indicat expres.",
    ],
  },
  {
    title: "7. Cui putem divulga datele",
    paragraphs: [
      "Nu vindem datele personale ale utilizatorilor.",
      "Datele pot fi divulgate numai în măsura necesară către următoarele categorii de destinatari:",
    ],
    bullets: [
      "furnizori de servicii tehnice, găzduire, infrastructură, analiză, monitorizare sau suport;",
      "procesatori de plăți, cum ar fi Paynet, pentru inițierea, autorizarea, confirmarea și reconcilierea plăților;",
      "furnizori de autentificare, atunci când alegi să te conectezi printr-un serviciu terț;",
      "consultanți, contabili, avocați sau auditori, dacă este necesar;",
      "autorități publice sau instituții competente, atunci când există o obligație legală;",
      "alte părți, în măsura în care acest lucru este necesar pentru apărarea unui drept, prevenirea fraudei sau asigurarea securității platformei.",
    ],
  },
  {
    title: "8. Plăți și date de card",
    paragraphs: [
      "Plățile sunt procesate prin Paynet sau prin alt procesator de plăți indicat în platformă. CatDai nu colectează și nu stochează numărul complet al cardului, codul CVV/CVC sau alte date sensibile ale instrumentului de plată.",
      "Pentru verificarea și suportul tranzacțiilor, CatDai poate primi și păstra date limitate despre plată, cum ar fi identificatorul tranzacției, numărul intern al comenzii, suma, moneda, statusul plății, data plății și răspunsurile tehnice ale procesatorului.",
      "Procesatorul de plăți prelucrează datele de plată conform propriilor reguli și obligații legale aplicabile.",
    ],
  },
  {
    title: "9. Stocarea și securitatea datelor",
    paragraphs: [
      "Păstrăm datele doar atât timp cât este necesar pentru scopurile pentru care au fost colectate, pentru respectarea obligațiilor legale sau pentru apărarea intereselor legitime ale CatDai.",
      "Datele privind conturile, comenzile, plățile, creditele acordate și utilizarea funcțiilor plătite pot fi păstrate pe durata necesară pentru livrarea serviciului, suport, audit, prevenirea fraudei, evidențe contabile și obligații legale.",
      "Aplicăm măsuri tehnice și organizatorice rezonabile pentru a proteja datele împotriva accesului neautorizat, pierderii, distrugerii sau modificării nepermise.",
      "Totuși, nicio metodă de transmitere sau stocare electronică nu poate fi garantată ca fiind complet sigură.",
    ],
  },
  {
    title: "10. Cookie-uri și tehnologii similare",
    paragraphs: [
      "Platforma poate utiliza cookie-uri sau tehnologii similare pentru funcționare, preferințe, analiză de utilizare și îmbunătățirea experienței.",
      "În măsura în care anumite cookie-uri neesențiale sunt utilizate, acestea ar trebui gestionate în conformitate cu regulile aplicabile și, după caz, cu opțiunile de consimțământ oferite utilizatorului.",
    ],
  },
  {
    title: "11. Drepturile tale",
    paragraphs: [
      "În condițiile prevăzute de lege, poți avea următoarele drepturi în legătură cu datele tale personale:",
    ],
    bullets: [
      "dreptul de acces la datele prelucrate;",
      "dreptul de rectificare a datelor inexacte sau incomplete;",
      "dreptul de ștergere, atunci când sunt îndeplinite condițiile legale;",
      "dreptul de restricționare a prelucrării;",
      "dreptul de opoziție, în măsura permisă de lege;",
      "dreptul de a retrage consimțământul, atunci când prelucrarea se bazează pe consimțământ;",
      "dreptul de a depune o plângere la autoritatea competentă sau de a te adresa instanței competente.",
    ],
  },
  {
    title: "12. Date ale minorilor",
    paragraphs: [
      "CatDai nu este destinat în mod intenționat minorilor, iar dacă observăm că au fost colectate date personale ale unui minor cu încălcarea legii aplicabile, putem lua măsuri rezonabile pentru ștergerea acestora.",
    ],
  },
  {
    title: "13. Transferuri și servicii terțe",
    paragraphs: [
      "Anumite servicii tehnice sau furnizori terți folosiți de platformă pot implica prelucrarea datelor în afara infrastructurii directe a CatDai.",
      "În măsura în care au loc asemenea transferuri, acestea trebuie gestionate prin măsuri rezonabile și în conformitate cu cerințele legale aplicabile.",
    ],
  },
  {
    title: "14. Modificarea politicii",
    paragraphs: [
      "Putem actualiza această Politică de Confidențialitate din când în când. Versiunea actualizată produce efecte de la data publicării pe site, dacă nu este menționat altfel.",
    ],
  },
  {
    title: "15. Contact",
    paragraphs: [
      "Pentru întrebări, solicitări sau reclamații privind protecția datelor, ne poți contacta la:",
      "info@catdai.md",
      "Program suport: Luni-Vineri, 09:00-18:00, ora Republicii Moldova.",
      "Data intrării în vigoare: 10 Iunie 2026",
    ],
  },
];

export default function PrivacyPage() {
  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Navbar />
      <main className="flex-1">
        <section className="max-w-4xl mx-auto px-6 py-16 sm:py-20">
          <div className="rounded-3xl border border-gray-200 bg-white p-8 sm:p-10 shadow-sm">
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
              Politica de Confidențialitate
            </h1>
            <p className="mt-4 text-base sm:text-lg text-gray-600">
              Această pagină explică, în linii generale, ce date pot fi prelucrate
              atunci când folosești CatDai, de ce pot fi prelucrate și care sunt
              drepturile tale.
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
