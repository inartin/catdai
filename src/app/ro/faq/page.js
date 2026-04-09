import FaqPage from "@/components/FaqPage";

const items = [
  {
    question: "Ce este CatDai și ce tip de rezultat oferă?",
    answers: [
      "CatDai este un serviciu informativ care oferă analiză de piață și estimări orientative de preț pentru proprietăți.",
      "Rezultatele sunt orientative (estimări, intervale, comparații), nu evaluări oficiale bancare sau notariale.",
    ],
  },
  {
    question: "Pe ce date se bazează analiza?",
    answers: [
      "Analiza folosește anunțuri publice, date introduse de utilizator și semnale de piață disponibile la momentul căutării, actualizate zilnic.",
      "Sursele terțe se pot modifica în timp, deci disponibilitatea și acuratețea datelor pot varia.",
    ],
  },
  {
    question: "Este CatDai afiliat cu 999.md, Makler.md sau alte platforme?",
    answers: [
      "Nu. CatDai nu este afiliat, sponsorizat sau partener oficial al acestor platforme, decât dacă este indicat explicit în scris.",
      "Denumirile sunt menționate doar pentru identificarea surselor publice de date și contextului de piață.",
    ],
  },
  {
    question: "Datele mele personale sunt vândute?",
    answers: [
      "Nu. CatDai declară că nu vinde datele personale ale utilizatorilor.",
      "Datele pot fi divulgate doar în măsura necesară pentru operarea serviciului, obligații legale sau securitate.",
    ],
  },
  {
    question: "Ce date pot fi prelucrate când folosesc platforma?",
    answers: [
      "Pot fi prelucrate datele introduse în formulare, date tehnice de utilizare (ex: IP, browser, pagini accesate), cookie-uri și eventual date de contact dacă trimiți solicitări.",
      "Scopurile principale sunt funcționarea platformei, generarea analizei, securitatea și îmbunătățirea serviciului.",
    ],
  },
  {
    question: "CatDai oferă consultanță juridică sau financiară?",
    answers: [
      "Nu. CatDai nu oferă consultanță juridică, fiscală, investițională și nu înlocuiește un evaluator autorizat.",
      "Pentru decizii cu efect legal sau bancar, este necesar să consulți un specialist autorizat.",
    ],
  },
  {
    question: "Unde găsesc detalii complete despre termeni și confidențialitate?",
    answers: [
      "Poți citi paginile dedicate pentru condițiile de utilizare și protecția datelor.",
    ],
    links: [
      { href: "/about", label: "Despre CatDai" },
      { href: "/terms", label: "Termeni și Condiții" },
      { href: "/privacy", label: "Politica de Confidențialitate" },
    ],
  },
];

export default function RoFaqPage() {
  return (
    <FaqPage
      title="Întrebări frecvente"
      subtitle="Răspunsuri rapide despre cum funcționează CatDai, cum sunt folosite datele și ce limite are serviciul."
      items={items}
    />
  );
}
