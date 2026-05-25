export const faqItemsByLang = {
  ro: [
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
  ],
  ru: [
    {
      question: "Что такое CatDai и какой результат вы получаете?",
      answers: [
        "CatDai — это информационный сервис, который дает рыночную аналитику и ориентировочную оценку цены для недвижимости.",
        "Результаты носят ориентировочный характер (оценки, диапазоны, сравнения) и не являются официальной банковской или нотариальной оценкой.",
      ],
    },
    {
      question: "На каких данных основан анализ?",
      answers: [
        "Анализ использует публичные объявления, данные, введенные пользователем, и рыночные сигналы, доступные на момент запроса.",
        "Внешние источники могут меняться со временем, поэтому доступность и точность данных могут отличаться.",
      ],
    },
    {
      question: "CatDai аффилирован с 999.md, Makler.md или другие платформы?",
      answers: [
        "Нет. CatDai не является аффилированным, спонсируемым или официальным партнером этих платформ, если это прямо не указано письменно.",
        "Названия используются только для обозначения публичных источников данных и рыночного контекста.",
      ],
    },
    {
      question: "Мои персональные данные продаются?",
      answers: [
        "Нет. CatDai указывает, что не продает персональные данные пользователей.",
        "Данные могут передаваться только в необходимом объеме для работы сервиса, выполнения юридических обязанностей или обеспечения безопасности.",
      ],
    },
    {
      question: "Какие данные могут обрабатываться при использовании платформы?",
      answers: [
        "Могут обрабатываться данные из форм, технические данные использования (например, IP, браузер, посещенные страницы), cookie и контактные данные, если вы отправляете запрос.",
        "Основные цели: работа платформы, формирование анализа, безопасность и улучшение сервиса.",
      ],
    },
    {
      question: "CatDai предоставляет юридические или финансовые консультации?",
      answers: [
        "Нет. CatDai не предоставляет юридические, налоговые, инвестиционные консультации и не заменяет лицензированного оценщика.",
        "Для решений с юридическими или банковскими последствиями нужно обращаться к профильному специалисту.",
      ],
    },
    {
      question: "Где посмотреть полные условия и политику конфиденциальности?",
      answers: [
        "Вы можете открыть отдельные страницы с условиями использования и защитой данных.",
      ],
      links: [
        { href: "/about", label: "О CatDai" },
        { href: "/terms", label: "Условия использования" },
        { href: "/privacy", label: "Политика конфиденциальности" },
      ],
    },
  ],
};

export function getFaqItems(lang) {
  return faqItemsByLang[lang] || faqItemsByLang.ro;
}

export const landingFaqItemsByLang = {
  ro: [
    {
      question: "Cum calculați prețul estimat?",
      answers: [
        "Pornim de la prețul median /m² al anunțurilor comparabile din același segment de piață, ca punct de referință pentru nivelul real al pieței.",
        "Filtrăm după oraș, sector, suprafață, camere și alte caracteristici relevante, apoi ajustăm rezultatul pentru diferențele proprietății, astfel încât estimarea să fie cât mai coerentă cu contextul local.",
      ],
    },
    {
      question: "Ce date intră în analiză?",
      answers: [
        "În calcul pot intra orașul, sectorul, suprafața, numărul de camere, tipul construcției, starea reparației, etajul, numărul de băi și balcoane, în funcție de datele disponibile pentru segmentul analizat.",
        "Dacă există date cadastrale, le afișăm separat ca informație oficială, fără să le confundăm cu estimarea de piață, pentru o delimitare mai clară între sursele de date.",
      ],
    },
    {
      question: "Ce vezi în rezultatul final?",
      answers: [
        "Rezultatul include vânzarea rapidă, prețul de piață și prețul țintă, ca să vezi intervalul de poziționare într-un mod mai clar.",
        "Când există suficiente comparabile, afișăm și diferența de preț după tipul vânzătorului: persoane fizice vs agenții / dezvoltatori, pentru o perspectivă mai nuanțată asupra pieței.",
      ],
    },
  ],
  ru: [
    {
      question: "Как рассчитывается ориентировочная цена?",
      answers: [
        "Мы начинаем с медианной цены /м² по сопоставимым объявлениям в том же рыночном сегменте, чтобы опираться на реальный уровень рынка.",
        "Дальше фильтруем по городу, району, площади, комнатам и другим важным характеристикам, а затем корректируем результат под конкретный объект, чтобы оценка лучше соответствовала локальному контексту.",
      ],
    },
    {
      question: "Какие данные входят в анализ?",
      answers: [
        "В расчет могут входить город, район, площадь, количество комнат, тип дома, состояние ремонта, этаж, количество санузлов и балконов, в зависимости от доступных данных по анализируемому сегменту.",
        "Если есть кадастровые данные, мы показываем их отдельно как официальную информацию, не смешивая с рыночной оценкой, чтобы источник каждого показателя оставался понятным.",
      ],
    },
    {
      question: "Что видно в итоговом результате?",
      answers: [
        "В результате вы видите быструю продажу, рыночную цену и целевую цену, чтобы лучше понимать диапазон позиционирования.",
        "Когда сопоставимых объявлений достаточно, мы также показываем разницу в цене по типу продавца: частные лица vs агентства / застройщики, чтобы дать более нюансированную картину рынка.",
      ],
    },
  ],
};

export function getLandingFaqItems(lang) {
  return landingFaqItemsByLang[lang] || landingFaqItemsByLang.ro;
}
