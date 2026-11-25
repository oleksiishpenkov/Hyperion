/* =========================================================
   assets/routing.js — модуль маршрутов и дистанций Jenson TMS
   ---------------------------------------------------------
   Встроенный граф магистралей BE / NL / DE / FR / LU / PL:
   города, развязки, погранпереходы, контейнерные терминалы.
   Кратчайший путь по км (Дейкстра). Без сети и без ключей API.

   JTMS.route.resolve(location)   → { id, extraKm } или null
   JTMS.route.path(a, b)          → { ids, edges, km }
   JTMS.route.route([a, b, …])    → { ids, km, byCountry, roads, borders }
   JTMS.route.forLeg(leg)         → маршрут плеча (from → to) или null
   JTMS.route.svg(route, opts)    → SVG-схема маршрута (строка)
   JTMS.route.name(id)            → название узла

   Позже движок можно заменить на OSRM / GraphHopper через
   Supabase Edge Function — формат ответа тот же.
   ========================================================= */
(function () {
  window.JTMS = window.JTMS || {};

  var DETOUR = 1.25;   // «дорога / прямая» для подъезда от точной координаты до узла графа

  // id: [название, латиницей, страна, широта, долгота, тип]
  // тип: c — город, j — развязка, x — погранпереход (страна «A|B»), t — терминал
  var NODES = {
    ANR: ["Антверпен", "Antwerpen", "BE", 51.26, 4.4, "c"],
    ZEE: ["Зебрюгге", "Zeebrugge", "BE", 51.3, 3.21, "c"],
    GNT: ["Гент", "Gent", "BE", 51.05, 3.72, "c"],
    BRU: ["Брюссель", "Brussel", "BE", 50.85, 4.35, "c"],
    LGG: ["Льеж", "Liège", "BE", 50.63, 5.57, "c"],
    RTM: ["Роттердам", "Rotterdam", "NL", 51.93, 4.25, "c"],
    AMS: ["Амстердам", "Amsterdam", "NL", 52.37, 4.9, "c"],
    TIL: ["Тилбург", "Tilburg", "NL", 51.56, 5.09, "c"],
    EIN: ["Эйндховен", "Eindhoven", "NL", 51.44, 5.47, "c"],
    VNL: ["Венло", "Venlo", "NL", 51.37, 6.17, "c"],
    DUI: ["Дуйсбург", "Duisburg", "DE", 51.43, 6.76, "c"],
    CGN: ["Кёльн", "Köln", "DE", 50.94, 6.96, "c"],
    DTM: ["Дортмунд", "Dortmund", "DE", 51.51, 7.47, "c"],
    FRA: ["Франкфурт", "Frankfurt", "DE", 50.11, 8.68, "c"],
    MHG: ["Мангейм", "Mannheim", "DE", 49.49, 8.47, "c"],
    STR: ["Штутгарт", "Stuttgart", "DE", 48.78, 9.18, "c"],
    NUE: ["Нюрнберг", "Nürnberg", "DE", 49.45, 11.08, "c"],
    MUC: ["Мюнхен", "München", "DE", 48.14, 11.58, "c"],
    BRE: ["Бремен", "Bremen", "DE", 53.08, 8.8, "c"],
    HAM: ["Гамбург", "Hamburg", "DE", 53.55, 9.99, "c"],
    HAJ: ["Ганновер", "Hannover", "DE", 52.37, 9.73, "c"],
    LEJ: ["Лейпциг", "Leipzig", "DE", 51.34, 12.37, "c"],
    BER: ["Берлин", "Berlin", "DE", 52.52, 13.4, "c"],
    POZ: ["Познань", "Poznań", "PL", 52.41, 16.93, "c"],
    WRO: ["Вроцлав", "Wrocław", "PL", 51.11, 17.03, "c"],
    LCJ: ["Лодзь", "Łódź", "PL", 51.76, 19.46, "c"],
    WAW: ["Варшава", "Warszawa", "PL", 52.23, 21.01, "c"],
    DKK: ["Дюнкерк", "Dunkerque", "FR", 51.02, 2.37, "c"],
    LIL: ["Лилль", "Lille", "FR", 50.63, 3.06, "c"],
    PAR: ["Париж", "Paris", "FR", 48.86, 2.35, "c"],
    RHE: ["Реймс", "Reims", "FR", 49.26, 4.03, "c"],
    ETZ: ["Мец", "Metz", "FR", 49.12, 6.18, "c"],
    SXB: ["Страсбург", "Strasbourg", "FR", 48.57, 7.75, "c"],
    LYS: ["Лион", "Lyon", "FR", 45.76, 4.84, "c"],
    LUX: ["Люксембург", "Luxembourg", "LU", 49.61, 6.13, "c"],
    KRT: ["Кортрейк", "Kortrijk", "BE", 50.82, 3.27, "j"],
    MON: ["Монс", "Mons", "BE", 50.45, 3.95, "j"],
    NAM: ["Намюр", "Namur", "BE", 50.47, 4.87, "j"],
    ARL: ["Арлон", "Arlon", "BE", 49.68, 5.81, "j"],
    HAS: ["Хасселт", "Hasselt", "BE", 50.93, 5.34, "j"],
    BRD: ["Бреда", "Breda", "NL", 51.59, 4.78, "j"],
    UTR: ["Утрехт", "Utrecht", "NL", 52.09, 5.12, "j"],
    ARN: ["Арнем", "Arnhem", "NL", 51.98, 5.91, "j"],
    HEN: ["Хенгело", "Hengelo", "NL", 52.27, 6.79, "j"],
    MST: ["Маастрихт", "Maastricht", "NL", 50.85, 5.69, "j"],
    AAC: ["Ахен", "Aachen", "DE", 50.78, 6.08, "j"],
    OBH: ["Оберхаузен", "Oberhausen", "DE", 51.5, 6.86, "j"],
    MUN: ["Мюнстер", "Münster", "DE", 51.96, 7.63, "j"],
    OSN: ["Оснабрюк", "Osnabrück", "DE", 52.28, 8.05, "j"],
    KSL: ["Кассель", "Kassel", "DE", 51.31, 9.48, "j"],
    WUE: ["Вюрцбург", "Würzburg", "DE", 49.79, 9.95, "j"],
    KAE: ["Карлсруэ", "Karlsruhe", "DE", 49.01, 8.4, "j"],
    SCN: ["Саарбрюккен", "Saarbrücken", "DE", 49.23, 7, "j"],
    ERF: ["Эрфурт", "Erfurt", "DE", 50.98, 11.03, "j"],
    DRS: ["Дрезден", "Dresden", "DE", 51.05, 13.74, "j"],
    MAG: ["Магдебург", "Magdeburg", "DE", 52.13, 11.63, "j"],
    KOB: ["Кобленц", "Koblenz", "DE", 50.36, 7.59, "j"],
    ARR: ["Аррас", "Arras", "FR", 50.29, 2.78, "j"],
    VAL: ["Валансьен", "Valenciennes", "FR", 50.36, 3.52, "j"],
    TRO: ["Труа", "Troyes", "FR", 48.3, 4.08, "j"],
    NCY: ["Нанси", "Nancy", "FR", 48.69, 6.18, "j"],
    DIJ: ["Дижон", "Dijon", "FR", 47.32, 5.04, "j"],
    LEG: ["Легница", "Legnica", "PL", 51.21, 16.16, "j"],
    X_HAZ: ["Хазелдонк", "Hazeldonk", "BE|NL", 51.47, 4.74, "x"],
    X_POP: ["Поппел", "Poppel", "BE|NL", 51.36, 5.12, "x"],
    X_VIS: ["Визе", "Visé", "BE|NL", 50.76, 5.69, "x"],
    X_LIC: ["Лихтенбуш", "Lichtenbusch", "BE|DE", 50.71, 6.13, "x"],
    X_REK: ["Реккем", "Rekkem", "BE|FR", 50.78, 3.15, "x"],
    X_TOU: ["Турне", "Tournai", "BE|FR", 50.58, 3.3, "x"],
    X_QUI: ["Кьеврен", "Quiévrain", "BE|FR", 50.41, 3.68, "x"],
    X_ADK: ["Адинкерке", "Adinkerke", "BE|FR", 51.07, 2.58, "x"],
    X_STP: ["Стерпених", "Sterpenich", "BE|LU", 49.65, 5.89, "x"],
    X_EMM: ["Эммерих", "Emmerich", "NL|DE", 51.86, 6.17, "x"],
    X_VNL: ["Венло/Штрален", "Straelen", "NL|DE", 51.4, 6.22, "x"],
    X_BEN: ["Бад-Бентхайм", "Bad Bentheim", "NL|DE", 52.3, 7.05, "x"],
    X_GBR: ["Гольдене-Бремм", "Goldene Bremm", "FR|DE", 49.21, 6.98, "x"],
    X_KEH: ["Кель", "Kehl", "FR|DE", 48.57, 7.79, "x"],
    X_SCG: ["Шенген", "Schengen", "LU|DE", 49.47, 6.37, "x"],
    X_ZOU: ["Зуфтген", "Zoufftgen", "FR|LU", 49.46, 6.13, "x"],
    X_SWI: ["Свецко", "Świecko", "DE|PL", 52.32, 14.6, "x"],
    X_JED: ["Енджиховице", "Jędrzychowice", "DE|PL", 51.14, 15.04, "x"],
    T_MPET: ["MPET, каи 1742", "MPET 1742", "BE", 51.285, 4.255, "t"],
    T_AGW: ["Antwerp Gateway, каи 1700", "Antwerp Gateway 1700", "BE", 51.29, 4.26, "t"],
    T_EUR: ["Europa Terminal, каи 869", "Europa Terminal 869", "BE", 51.31, 4.33, "t"],
    T_ECT: ["ECT Delta, Маасвлакте", "ECT Delta", "NL", 51.96, 4.05, "t"],
    T_RWG: ["RWG, Маасвлакте II", "RWG", "NL", 51.975, 3.99, "t"]
  };

  // [узел, узел, дорога, км]
  var EDGES = [
    ["T_MPET", "ANR", "R2 · Deurganck", 16], ["T_AGW", "ANR", "R2 · Deurganck", 17], ["T_EUR", "ANR", "R1 · Scheldelanen", 11], ["T_ECT", "RTM", "A15", 32],
    ["T_RWG", "RTM", "A15", 36], ["ANR", "BRU", "E19", 45], ["ANR", "GNT", "E17", 60], ["ANR", "X_HAZ", "E19", 38],
    ["ANR", "X_POP", "E34", 55], ["ANR", "HAS", "E313", 78], ["GNT", "ZEE", "E40 · N31", 52], ["ZEE", "X_ADK", "E40", 58],
    ["GNT", "BRU", "E40", 56], ["GNT", "KRT", "E17", 45], ["KRT", "X_REK", "E17", 11], ["BRU", "MON", "E19", 67],
    ["MON", "X_QUI", "E19", 23], ["BRU", "X_TOU", "E429 · A8", 82], ["BRU", "LGG", "E40", 97], ["BRU", "NAM", "E411", 65],
    ["NAM", "ARL", "E411", 125], ["ARL", "X_STP", "E25", 8], ["NAM", "LGG", "E42", 62], ["HAS", "LGG", "E313", 45],
    ["LGG", "X_LIC", "E40", 42], ["LGG", "X_VIS", "E25", 19], ["LGG", "ARL", "E25", 125], ["X_HAZ", "BRD", "A16", 16],
    ["BRD", "RTM", "A16", 50], ["RTM", "UTR", "A20 · A12", 66], ["RTM", "AMS", "A4", 72], ["AMS", "UTR", "A2", 45],
    ["UTR", "ARN", "A12", 64], ["RTM", "ARN", "A15", 118], ["ARN", "X_EMM", "A12", 30], ["UTR", "EIN", "A2", 90],
    ["BRD", "TIL", "A58", 30], ["TIL", "EIN", "A58", 36], ["X_POP", "EIN", "A67", 30], ["EIN", "VNL", "A67", 58],
    ["VNL", "X_VNL", "A67", 6], ["UTR", "HEN", "A1", 125], ["HEN", "X_BEN", "A1", 21], ["EIN", "MST", "A2", 86],
    ["MST", "X_VIS", "A2", 12], ["X_EMM", "OBH", "A3", 55], ["X_VNL", "DUI", "A40", 45], ["X_VNL", "CGN", "A61", 85],
    ["OBH", "DUI", "A3", 12], ["OBH", "DTM", "A2", 50], ["DUI", "CGN", "A3", 62], ["X_LIC", "AAC", "A44", 9],
    ["AAC", "CGN", "A4", 70], ["CGN", "FRA", "A3", 190], ["CGN", "KOB", "A61", 95], ["KOB", "MHG", "A61", 150],
    ["KOB", "FRA", "A3", 115], ["DTM", "KSL", "A44", 160], ["DTM", "MUN", "A1", 68], ["DUI", "MUN", "A43", 95],
    ["MUN", "OSN", "A1", 56], ["X_BEN", "OSN", "A30", 62], ["OSN", "BRE", "A1", 115], ["BRE", "HAM", "A1", 118],
    ["OSN", "HAJ", "A30 · A2", 145], ["DTM", "HAJ", "A2", 205], ["HAJ", "HAM", "A7", 155], ["HAJ", "MAG", "A2", 140],
    ["MAG", "BER", "A2 · A10", 140], ["BER", "X_SWI", "A10 · A12", 95], ["KSL", "HAJ", "A7", 166], ["KSL", "FRA", "A5", 190],
    ["KSL", "ERF", "A44 · A4", 150], ["ERF", "LEJ", "A4 · A9", 140], ["ERF", "DRS", "A4", 215], ["LEJ", "BER", "A9", 190],
    ["LEJ", "DRS", "A14", 112], ["DRS", "X_JED", "A4", 105], ["LEJ", "MAG", "A14", 125], ["FRA", "WUE", "A3", 120],
    ["WUE", "NUE", "A3", 110], ["NUE", "MUC", "A9", 168], ["FRA", "MHG", "A5 · A67", 80], ["MHG", "KAE", "A5", 70],
    ["KAE", "STR", "A8", 80], ["STR", "MUC", "A8", 230], ["MHG", "SCN", "A6", 130], ["SCN", "X_GBR", "A6", 6],
    ["X_SCG", "SCN", "A8", 72], ["KAE", "X_KEH", "A5", 75], ["NUE", "LEJ", "A9", 280], ["HAM", "BER", "A24", 288],
    ["WUE", "ERF", "A71", 210], ["LUX", "X_STP", "A6", 26], ["LUX", "X_SCG", "A13", 35], ["LUX", "X_ZOU", "A3", 20],
    ["X_REK", "LIL", "A22", 18], ["X_TOU", "LIL", "A27", 25], ["X_ADK", "DKK", "A16", 20], ["DKK", "LIL", "A25", 75],
    ["LIL", "ARR", "A1", 50], ["ARR", "PAR", "A1", 180], ["X_QUI", "VAL", "A2", 15], ["VAL", "PAR", "A2 · A1", 210],
    ["VAL", "ARR", "A2 · A1", 70], ["ARR", "RHE", "A26", 165], ["RHE", "PAR", "A4", 145], ["RHE", "ETZ", "A4", 188],
    ["RHE", "TRO", "A26", 125], ["TRO", "DIJ", "A5 · A31", 182], ["DIJ", "LYS", "A6", 195], ["PAR", "DIJ", "A6", 315],
    ["X_ZOU", "ETZ", "A31", 32], ["ETZ", "NCY", "A31", 57], ["NCY", "DIJ", "A31", 215], ["ETZ", "X_GBR", "A4 · A320", 66],
    ["ETZ", "SXB", "A4", 163], ["SXB", "X_KEH", "A35", 6], ["PAR", "TRO", "A5", 175], ["X_SWI", "POZ", "A2", 178],
    ["POZ", "LCJ", "A2", 200], ["LCJ", "WAW", "A2", 125], ["X_JED", "LEG", "A4", 95], ["LEG", "WRO", "A4", 72],
    ["WRO", "LCJ", "S8", 215], ["WRO", "POZ", "S5", 175]
  ];

  // Контур карты для схемы: море, Британия, Балтика, озёра, границы — [широта, долгота]
  var GEO = {
    sea: [[49.25, 0], [49.45, 0.1], [49.7, 0.25], [49.86, 0.65], [49.95, 1.1], [50.1, 1.45], [50.4, 1.58], [50.75, 1.6], [50.96, 1.85], [51.05, 2.4], [51.2, 2.85], [51.35, 3.25], [51.45, 3.55], [51.6, 3.65], [51.75, 3.85], [51.95, 4.05], [52.1, 4.28], [52.47, 4.58], [52.95, 4.72], [53.2, 5.3], [53.42, 6.1], [53.45, 6.9], [53.35, 7.2], [53.55, 7.6], [53.7, 8.1], [53.5, 8.2], [53.88, 8.65], [54.1, 8.85], [54.5, 8.95], [54.9, 8.65], [55.2, 8.6], [55.2, 0]],
    gb: [[53.6, 0], [53.58, 0.12], [53.3, 0.35], [53, 0.3], [52.95, 0.55], [52.95, 1], [52.93, 1.3], [52.75, 1.65], [52.6, 1.73], [52.48, 1.75], [52.33, 1.68], [52.1, 1.55], [51.95, 1.29], [51.79, 1.15], [51.6, 0.95], [51.53, 0.7], [51.47, 0.5], [51.42, 0.85], [51.39, 1.38], [51.33, 1.42], [51.22, 1.4], [51.12, 1.32], [51.08, 1.18], [50.91, 0.98], [50.85, 0.58], [50.76, 0.29], [50.78, 0]],
    baltic: [[55.2, 10], [54.8, 9.9], [54.47, 10.2], [54.35, 10.15], [54.4, 10.6], [54.3, 11], [54.1, 10.85], [53.95, 10.88], [54, 11.3], [53.9, 11.45], [54.15, 11.8], [54.18, 12.1], [54.42, 12.5], [54.45, 12.95], [54.6, 13.25], [54.68, 13.4], [54.5, 13.65], [54.25, 13.75], [54.05, 14], [53.92, 14.25], [54, 14.8], [54.18, 15.58], [54.43, 16.4], [54.58, 16.86], [54.76, 17.55], [54.83, 18.33], [54.6, 18.8], [54.52, 18.55], [54.37, 18.67], [54.35, 19.3], [54.55, 19.7], [54.95, 20.1], [54.95, 20.55], [55.2, 20.95]],
    lakes: [[[53.08, 5.15], [53, 5.55], [52.85, 5.75], [52.7, 5.6], [52.55, 5.2], [52.42, 5.1], [52.6, 5], [52.85, 5.08], [52.95, 5]], [[51.45, 3.55], [51.42, 3.75], [51.37, 4.05], [51.35, 4.25], [51.39, 4.25], [51.43, 4.05], [51.47, 3.75], [51.5, 3.58]], [[46.46, 6.22], [46.52, 6.6], [46.46, 6.9], [46.38, 6.8], [46.4, 6.4], [46.2, 6.15]], [[47.78, 9], [47.65, 9.55], [47.5, 9.72], [47.62, 9.2]]],
    borders: [[[51.09, 2.55], [50.81, 2.95], [50.72, 3.24], [50.5, 3.62], [50.33, 4.07], [49.98, 4.18], [50.13, 4.83], [49.8, 4.87], [49.8, 5.32], [49.55, 5.82]], [[51.37, 3.37], [51.27, 3.87], [51.32, 4.24], [51.44, 4.38], [51.45, 4.8], [51.42, 5.06], [51.27, 5.24], [51.2, 5.55], [51.05, 5.76], [50.85, 5.64], [50.76, 5.7], [50.75, 6.02]], [[50.75, 6.02], [50.5, 6.2], [50.32, 6.4], [50.13, 6.13]], [[50.13, 6.13], [49.9, 5.75], [49.55, 5.82]], [[50.13, 6.13], [49.8, 6.52], [49.47, 6.37]], [[49.55, 5.82], [49.47, 6.37]], [[49.47, 6.37], [49.2, 6.8], [49.15, 7.1], [49.05, 7.6], [48.97, 8.2], [48.6, 7.8], [48.1, 7.58], [47.59, 7.59]], [[50.75, 6.02], [50.95, 6.03], [51.1, 6.1], [51.22, 6.2], [51.37, 6.22], [51.6, 6.1], [51.85, 5.95], [51.83, 6.4], [51.95, 6.72], [52.2, 7.05], [52.45, 7], [52.65, 6.72], [52.85, 7.05], [53.2, 7.2], [53.32, 7.2]], [[54.9, 8.65], [54.82, 9.45], [54.8, 9.9]], [[53.93, 14.22], [53.4, 14.42], [53, 14.15], [52.6, 14.62], [52.35, 14.55], [52, 14.72], [51.6, 14.75], [51.3, 15.02], [50.87, 14.82]], [[50.87, 14.82], [50.8, 14.4], [50.7, 13.5], [50.4, 12.9], [50.32, 12.1], [50.1, 12.3], [49.8, 12.5], [49.4, 12.8], [48.77, 13.84]], [[48.77, 13.84], [48.6, 13.45], [48.25, 13], [47.75, 13], [47.6, 12.2], [47.6, 11.1], [47.4, 10.3], [47.55, 9.62]], [[47.55, 9.62], [47.66, 9.2], [47.6, 8.6], [47.59, 7.59]], [[47.59, 7.59], [47.45, 7], [47.05, 6.7], [46.6, 6.15], [46.3, 5.98], [46.14, 5.98], [46.14, 6.25], [46.35, 6.3], [46.4, 6.82], [46.1, 6.85], [45.92, 7.04], [45.6, 7], [45.2, 6.85]], [[45.92, 7.04], [46.1, 7.9], [46.45, 8.45], [46, 8.75], [45.83, 9.05], [46.3, 9.3], [46.5, 10.05], [46.85, 10.47]], [[47.55, 9.62], [47.27, 9.55], [47.05, 9.6], [46.9, 10.15], [46.85, 10.47]], [[46.85, 10.47], [46.95, 11.1], [47.08, 12.2], [46.65, 13.7]], [[46.65, 13.7], [46.45, 14.6], [46.6, 15.4], [46.85, 16.1]], [[46.65, 13.7], [46.2, 13.6], [45.6, 13.75]], [[48.77, 13.84], [48.6, 14.7], [49, 15], [48.8, 16], [48.6, 16.9]], [[48.6, 16.9], [48.1, 17.1], [47.75, 16.9], [47.5, 16.6], [46.85, 16.1]], [[50.87, 14.82], [50.8, 15.4], [50.5, 16.2], [50.65, 16.5], [50.4, 16.9], [50.2, 17.7], [50, 18.3], [49.9, 18.6], [49.52, 18.85]], [[48.6, 16.9], [49, 17.5], [49.52, 18.85]], [[49.52, 18.85], [49.4, 19.5], [49.2, 20.1], [49.4, 21], [49.4, 21.8]], [[48.1, 17.1], [47.75, 18.8], [48.1, 19.5], [48.3, 20.3], [48.55, 21.8]], [[54.36, 19.6], [54.38, 21.8]]]
  };

  // Терминалы и коды из BPA → узел графа (дописывайте сюда новые коды)
  var CODES = [
    [/\b1742\b|MPET/i, 'T_MPET'],
    [/\b1700\b|GATEWAY/i, 'T_AGW'],
    [/\b869\b|EUROPA/i, 'T_EUR'],
    [/\bECT\b|DELTA/i, 'T_ECT'],
    [/\bRWG\b/i, 'T_RWG']
  ];

  // Другие написания городов → узел
  var ALIASES = {
    antwerp: 'ANR', anvers: 'ANR', antwerpen: 'ANR', 'антверпен': 'ANR',
    brussels: 'BRU', bruxelles: 'BRU', brussel: 'BRU',
    ghent: 'GNT', gand: 'GNT', luik: 'LGG', luttich: 'LGG', liege: 'LGG',
    cologne: 'CGN', koeln: 'CGN', koln: 'CGN', munich: 'MUC', muenchen: 'MUC', munchen: 'MUC',
    nuremberg: 'NUE', nuernberg: 'NUE', warsaw: 'WAW', varsovie: 'WAW', lodz: 'LCJ',
    breslau: 'WRO', posen: 'POZ', dunkirk: 'DKK', duinkerke: 'DKK', rijsel: 'LIL', parijs: 'PAR',
    luxemburg: 'LUX', maasvlakte: 'T_ECT', aken: 'AAC', aix: 'AAC'
  };

  // ---------- граф ----------
  var adj = {}, cache = {}, id;
  for (id in NODES) adj[id] = [];
  EDGES.forEach(function (e) {
    var cc = countryOf(e[0], e[1]);
    adj[e[0]].push({ to: e[1], km: e[3], road: e[2], cc: cc });
    adj[e[1]].push({ to: e[0], km: e[3], road: e[2], cc: cc });
  });

  function countryOf(a, b) {
    var A = NODES[a][2], B = NODES[b][2];
    if (A.indexOf('|') < 0) return A;
    if (B.indexOf('|') < 0) return B;
    return A.split('|')[0];
  }

  function haversine(lat1, lon1, lat2, lon2) {
    var r = Math.PI / 180, dLat = (lat2 - lat1) * r, dLon = (lon2 - lon1) * r;
    var x = Math.pow(Math.sin(dLat / 2), 2) + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.pow(Math.sin(dLon / 2), 2);
    return 2 * 6371 * Math.asin(Math.sqrt(x));
  }

  function norm(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l').trim();
  }

  // ---------- кратчайший путь ----------
  function path(a, b) {
    if (a === b) return { ids: [a], edges: [], km: 0 };
    var key = a + '>' + b;
    if (cache[key]) return cache[key];
    var dist = {}, prev = {}, done = {}, open = {}, u, v, e, i, nd;
    dist[a] = 0; open[a] = true;
    while (true) {
      u = null;
      for (v in open) if (u === null || dist[v] < dist[u]) u = v;
      if (u === null || u === b) break;
      delete open[u]; done[u] = true;
      for (i = 0; i < adj[u].length; i++) {
        e = adj[u][i];
        if (done[e.to]) continue;
        nd = dist[u] + e.km;
        if (dist[e.to] === undefined || nd < dist[e.to]) { dist[e.to] = nd; prev[e.to] = { from: u, e: e }; open[e.to] = true; }
      }
    }
    if (!prev[b]) return null;
    var edges = [];
    for (v = b; v !== a; v = prev[v].from) {
      edges.unshift({ from: prev[v].from, to: v, km: prev[v].e.km, road: prev[v].e.road, cc: prev[v].e.cc });
    }
    var res = { ids: [a].concat(edges.map(function (x) { return x.to; })), edges: edges, km: sum(edges) };
    cache[key] = res;
    return res;
  }

  function sum(edges) { return edges.reduce(function (s, e) { return s + e.km; }, 0); }

  // ---------- точка (location) → узел графа ----------
  function nearest(lat, lon) {
    var best = null, bd = Infinity, k, n, d;
    for (k in NODES) {
      n = NODES[k];
      if (n[5] === 'x') continue;
      d = haversine(lat, lon, n[3], n[4]);
      if (d < bd) { bd = d; best = k; }
    }
    return { id: best, km: Math.round(bd * DETOUR) };
  }

  // Возвращает { id, extraKm } или null. Порядок: код терминала → координаты → город/название.
  function resolve(loc) {
    if (!loc) return null;
    if (typeof loc === 'string') loc = { name: loc };
    var text = [loc.code, loc.name].filter(Boolean).join(' '), i, k;
    for (i = 0; i < CODES.length; i++) if (CODES[i][0].test(text)) return { id: CODES[i][1], extraKm: 0 };
    var lat = num(loc.lat != null ? loc.lat : loc.latitude);
    var lon = num(loc.lng != null ? loc.lng : (loc.lon != null ? loc.lon : loc.longitude));
    if (lat != null && lon != null) { var n = nearest(lat, lon); return { id: n.id, extraKm: n.km }; }
    var words = [loc.city, loc.name, loc.code].filter(Boolean).map(norm);
    for (i = 0; i < words.length; i++) {
      for (k in ALIASES) if (words[i].indexOf(k) >= 0) return { id: ALIASES[k], extraKm: 0 };
      for (k in NODES) {
        if (NODES[k][5] === 'x') continue;
        var ru = norm(NODES[k][0]), la = norm(NODES[k][1]);
        if (words[i] === ru || words[i] === la || words[i].indexOf(la) >= 0 || words[i].indexOf(ru) >= 0) return { id: k, extraKm: 0 };
      }
    }
    return null;
  }
  function num(v) { var n = parseFloat(v); return isFinite(n) ? n : null; }

  // ---------- маршрут через несколько точек ----------
  function route(points) {
    var ids = [points[0]], edges = [], i, p;
    for (i = 0; i < points.length - 1; i++) {
      p = path(points[i], points[i + 1]);
      if (!p) return null;
      edges = edges.concat(p.edges);
      ids = ids.concat(p.ids.slice(1));
    }
    var roads = [], byCountry = {};
    edges.forEach(function (e) {
      e.road.split(' · ').forEach(function (rd) { if (roads.indexOf(rd) < 0) roads.push(rd); });
      byCountry[e.cc] = (byCountry[e.cc] || 0) + e.km;
    });
    return {
      ids: ids, edges: edges, km: sum(edges), roads: roads, byCountry: byCountry,
      borders: ids.filter(function (x) { return NODES[x][5] === 'x'; })
    };
  }

  // Маршрут плеча: from → to (+ подъезд от точных координат, если они есть)
  var legCache = {};
  function forLeg(leg) {
    if (!leg) return null;
    var a = resolve(leg.from), b = resolve(leg.to);
    if (!a || !b) return null;
    var key = a.id + '|' + a.extraKm + '|' + b.id + '|' + b.extraKm;
    if (legCache[key]) return legCache[key];
    var r = route([a.id, b.id]);
    if (r) { r.extraKm = a.extraKm + b.extraKm; r.km += r.extraKm; }
    legCache[key] = r;
    return r;
  }

  // ---------- SVG-схема ----------
  var KX = Math.cos(51 * Math.PI / 180) * 100;
  function proj(lat, lon) { return [lon * KX, -lat * 100]; }
  function pts(arr) { return arr.map(function (p) { var q = proj(p[0], p[1]); return q[0].toFixed(1) + ',' + q[1].toFixed(1); }).join(' '); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function posAlong(r, frac) {
    var target = r.km * Math.max(0, Math.min(1, frac)), acc = 0, i, e, A, B, k;
    for (i = 0; i < r.edges.length; i++) {
      e = r.edges[i];
      if (acc + e.km >= target) {
        A = NODES[e.from]; B = NODES[e.to]; k = e.km ? (target - acc) / e.km : 0;
        return proj(A[3] + (B[3] - A[3]) * k, A[4] + (B[4] - A[4]) * k);
      }
      acc += e.km;
    }
    var z = NODES[r.ids[r.ids.length - 1]];
    return proj(z[3], z[4]);
  }

  // opts: { width, height, progress (0…1 или null), marker: CSS-цвет машины }
  function svg(r, opts) {
    opts = opts || {};
    var W = opts.width || 360, H = opts.height || 200;
    var P = r.ids.map(function (x) { return proj(NODES[x][3], NODES[x][4]); });
    var xs = P.map(function (p) { return p[0]; }), ys = P.map(function (p) { return p[1]; });
    var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs), y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
    var pad = Math.max(x1 - x0, y1 - y0) * 0.18 + 25;
    x0 -= pad * 1.6; x1 += pad * 1.6; y0 -= pad; y1 += pad;
    var w = x1 - x0, h = y1 - y0;
    if (w / h < W / H) { var nw = h * W / H; x0 -= (nw - w) / 2; w = nw; } else { var nh = w * H / W; y0 -= (nh - h) / 2; h = nh; }
    var u = w / W, f = function (v) { return v.toFixed(1); };
    var line = P.map(function (p) { return f(p[0]) + ',' + f(p[1]); }).join(' ');
    var prog = opts.progress, out = [];

    out.push('<svg class="route-map" viewBox="' + [x0, y0, w, h].map(f).join(' ') + '" role="img" aria-label="Route map">');
    out.push('<rect class="route-map__land" x="' + f(x0) + '" y="' + f(y0) + '" width="' + f(w) + '" height="' + f(h) + '"/>');
    [GEO.sea, GEO.baltic].concat(GEO.lakes).forEach(function (p) { out.push('<polygon class="route-map__sea" points="' + pts(p) + '"/>'); });
    out.push('<polygon class="route-map__isle" points="' + pts(GEO.gb) + '"/>');
    GEO.borders.forEach(function (p) { out.push('<polyline class="route-map__border" points="' + pts(p) + '"/>'); });

    out.push('<polyline class="route-map__line" points="' + line + '" stroke-width="' + f(2 * u) + '" stroke-dasharray="' + f(5 * u) + ' ' + f(4 * u) + '"/>');
    if (prog > 0) {
      var target = r.km * Math.min(prog, 1), acc = 0, done = [P[0]];
      r.edges.forEach(function (e) {
        if (acc !== Infinity && acc + e.km <= target) { done.push(proj(NODES[e.to][3], NODES[e.to][4])); acc += e.km; } else acc = Infinity;
      });
      done.push(posAlong(r, prog));
      out.push('<polyline class="route-map__done" points="' + done.map(function (p) { return f(p[0]) + ',' + f(p[1]); }).join(' ') + '" stroke-width="' + f(3 * u) + '"/>');
    }
    r.ids.forEach(function (x) {
      var p = proj(NODES[x][3], NODES[x][4]), n = NODES[x];
      if (n[5] === 'x') {
        out.push('<rect class="route-map__border-node" x="' + f(p[0] - 3.5 * u) + '" y="' + f(p[1] - 3.5 * u) + '" width="' + f(7 * u) + '" height="' + f(7 * u) +
          '" transform="rotate(45 ' + f(p[0]) + ' ' + f(p[1]) + ')" stroke-width="' + f(1.3 * u) + '"><title>Border crossing ' + esc(n[0]) + ' (' + n[2].replace('|', ' → ') + ')</title></rect>');
      } else {
        out.push('<circle class="route-map__node" cx="' + f(p[0]) + '" cy="' + f(p[1]) + '" r="' + f(2.6 * u) + '" stroke-width="' + f(1.4 * u) + '"><title>' + esc(n[0]) + '</title></circle>');
      }
    });
    [r.ids[0], r.ids[r.ids.length - 1]].forEach(function (x) {
      var p = proj(NODES[x][3], NODES[x][4]);
      out.push('<text class="route-map__label" x="' + f(p[0]) + '" y="' + f(p[1] - 8 * u) + '" font-size="' + f(11 * u) + '" stroke-width="' + f(3 * u) + '">' + esc(NODES[x][1]) + '</text>');
    });
    if (prog != null) {
      var m = posAlong(r, prog);
      out.push('<circle class="route-map__truck" cx="' + f(m[0]) + '" cy="' + f(m[1]) + '" r="' + f(7 * u) + '" stroke-width="' + f(2.5 * u) + '"' +
        (opts.marker ? ' style="fill:' + opts.marker + '"' : '') + '><title>Current position</title></circle>');
    }
    out.push('</svg>');
    return out.join('');
  }

  function name(x) { return NODES[x] ? NODES[x][1] : x; }
  function isBorder(x) { return !!NODES[x] && NODES[x][5] === 'x'; }
  function countryPair(x) { return NODES[x] ? NODES[x][2].replace('|', '→') : ''; }

  JTMS.route = {
    resolve: resolve, path: path, route: route, forLeg: forLeg, svg: svg,
    name: name, isBorder: isBorder, countryPair: countryPair,
    distance: function (a, b) { var p = path(a, b); return p ? p.km : null; }
  };
})();
