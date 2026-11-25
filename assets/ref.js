/* =========================================================
   Справочники (позже — таблицы Supabase). Коды — как в BPA.
   ========================================================= */
window.JTMS = window.JTMS || {};

JTMS.ref = {
  customers: [
    'JAS FORWARDING GmbH', 'DSV Road', 'DHL Global Forwarding', 'Kuehne+Nagel', 'DB Schenker',
    'CEVA Logistics', 'Geodis', 'Rhenus Logistics', 'Ewals Cargo Care', 'Raben Group'
  ],
  employees: ['wiktoria', 'katrin', 'pieter', 'marek'],
  shippingLines: ['MSC', 'MAERSK', 'CMA CGM', 'HAPAG-LLOYD', 'ONE', 'EVERGREEN', 'COSCO', 'ZIM', 'YANG MING', 'HMM'],
  docLocations: ['Terminal', 'Office', 'Driver', 'Customer', 'Electronic'],
  groups: ['', 'GENSET', 'OOG', 'FLAT', 'OPEN TOP'],
  planGroups: ['G01', 'G02', 'G03', 'G04', 'G05', 'G06', 'G07', 'G08', 'G09', 'G10', 'G11', 'G12', 'G13'],   // группы BPA для сортировки ордеров
  vents: ['CLOSED', 'OPEN 10%', 'OPEN 25%', 'OPEN 50%', 'OPEN 100%'],
  reeferChecklist: ['', 'GTS LIST', 'PTI', 'STANDARD'],
  areas: ['ANL', 'ANR', 'RTM', 'BE', 'NL', 'DE', 'FR'],
  countries: ['BE', 'NL', 'DE', 'FR', 'LU', 'PL', 'CZ', 'AT', 'CH', 'IT', 'ES'],
  stopTypes: [['LADEN', 'LADEN — loading'], ['LOSSEN', 'LOSSEN — unloading'], ['STOP', 'STOP']],
  destinations: ['JEDDAH', 'DAMMAM', 'JEBEL ALI', 'SHANGHAI', 'NINGBO', 'SINGAPORE', 'NEW YORK', 'SANTOS', 'LAGOS', 'MUMBAI'],

  // Тягачи: fleet number (код в BPA) и номерной знак. Позже — таблица trucks в Supabase.
  trucks: [
    { fleet: 'JEN0103', plate: 'PZ 4R821', driver: 'Piotr Kowalski' }, { fleet: 'JEN0106', plate: 'PZ 7H214', driver: 'Jan Nowak' }, { fleet: 'JEN0111', plate: 'PZ 2N881', driver: 'Tomasz Wiśniewski' },
    { fleet: 'JEN0118', plate: 'PZ 5K390', driver: 'Krzysztof Wójcik' }, { fleet: 'JEN0122', plate: 'PZ 9C117', driver: 'Marek Kamiński' }, { fleet: 'JEN0129', plate: 'PZ 3T877', driver: 'Paweł Lewandowski' },
    { fleet: 'JEN0133', plate: 'PZ 1W290', driver: 'Adam Zieliński' }, { fleet: 'JEN0137', plate: 'PZ 6M448', driver: 'Michał Szymański' }, { fleet: 'JEN0142', plate: 'PZ 8E502', driver: 'Łukasz Woźniak' },
    { fleet: 'JEN0148', plate: 'PZ 4V763', driver: 'Grzegorz Dąbrowski' }, { fleet: 'JEN0156', plate: 'PZ 2A935', driver: 'Dariusz Kozłowski' }, { fleet: 'JEN0164', plate: 'PZ 7R146', driver: 'Rafał Jankowski' },
  ],

  // ISO 6346 size-type
  containerTypes: [
    { id: '22G1', label: "22G1 · 20' DV", maxGrossKg: 30480 },
    { id: '42G1', label: "42G1 · 40' DV", maxGrossKg: 30480 },
    { id: '45G1', label: "45G1 · 40' HC", maxGrossKg: 30480 },
    { id: 'L5G1', label: "L5G1 · 45' HC", maxGrossKg: 32500 },
    { id: '22R1', label: "22R1 · 20' RF", maxGrossKg: 30480, reefer: true },
    { id: '45R1', label: "45R1 · 40' RH", maxGrossKg: 32500, reefer: true },
    { id: '22T1', label: "22T1 · 20' TK", maxGrossKg: 36000 },
    { id: '45U1', label: "45U1 · 40' OT", maxGrossKg: 30480 },
  ],

  // Площадки: терминалы, депо, клиенты. Ввод кода в PickUp / Deliver / в строку погрузки заполняет адрес.
  locations: [
    { code: '1742ANTW', smdg: 'BEANR-K1742', name: '1742', address: 'SINT ANTONIUSWEG', postal: '9132', city: 'ANTWERPEN', country: 'BE', area: 'ANL', kind: 'terminal' },
    { code: '1700ANTW', smdg: 'BEANR-1700', name: '1700 ANTWERP GATEWAY', address: 'SCHELDELAAN 410', postal: '2040', city: 'ANTWERPEN', country: 'BE', area: 'ANR', kind: 'terminal' },
    { code: '869ANTW', smdg: 'BEANR-K869', name: '869 EUROPA TERMINAL', address: 'SCHELDELAAN 200', postal: '2030', city: 'ANTWERPEN', country: 'BE', area: 'ANR', kind: 'terminal' },
    { code: '913ANTW', smdg: 'BEANR-K913', name: '913 NOORDZEE TERMINAL', address: 'NOORDLAAN 913', postal: '2030', city: 'ANTWERPEN', country: 'BE', area: 'ANR', kind: 'terminal' },
    { code: 'ECTDELTA', smdg: 'NLRTM-DCD', name: 'ECT DELTA', address: 'EUROPAWEG 875', postal: '3199 LD', city: 'ROTTERDAM', country: 'NL', area: 'RTM', kind: 'terminal' },
    { code: 'RWGMV2', smdg: 'NLRTM-RWG', name: 'RWG MAASVLAKTE II', address: 'AMALIAHAVENWEG 50', postal: '3199 KD', city: 'ROTTERDAM', country: 'NL', area: 'RTM', kind: 'terminal' },
    { code: 'MEDRANTW', name: 'MEDREP S11', address: 'SINT ANTONIUSWEG HAVEN 1624', postal: '9130', city: 'ANTWERPEN', country: 'BE', area: 'ANL', kind: 'depot', lat: 51.268, lon: 4.255, approx: true },
    { code: 'VOLGTANTW', name: 'VOLGT DEPOT', address: 'HAVEN 1200', postal: '9130', city: 'ANTWERPEN', country: 'BE', area: 'ANL', kind: 'depot', lat: 51.256, lon: 4.28, approx: true },
    { code: 'FRESGERN', name: 'FRESENIUS MEDICAL CARE', address: 'MARIE CURIE STRASSE 1A', postal: '64579', city: 'GERNSHEIM', country: 'DE', area: 'DE', kind: 'client', lat: 49.755, lon: 8.49, approx: true },
    { code: 'DSVVENLO', name: 'DSV TRADE PORT NOORD', address: 'ARCHIMEDESWEG 2', postal: '5928 PP', city: 'VENLO', country: 'NL', area: 'NL', kind: 'client', lat: 51.405, lon: 6.155, approx: true },
    { code: 'KNTILB', name: 'KUEHNE+NAGEL VOSSENBERG', address: 'VOSSENBERGSELAAN 11', postal: '5047 SK', city: 'TILBURG', country: 'NL', area: 'NL', kind: 'client', lat: 51.59, lon: 5.01, approx: true },
  ],

  location: function (code) {
    code = String(code || '').trim().toUpperCase();
    var own = JTMS.ref.locations.find(function (l) { return l.code === code; });
    if (own) {   // свой код BPA: координаты берём у соответствующего терминала SMDG
      var st = own.smdg && JTMS.terminals && JTMS.terminals.get(own.smdg);
      return st ? Object.assign({}, own, { lat: st.lat, lon: st.lon, operator: st.operator }) : own;
    }
    var t = JTMS.terminals && JTMS.terminals.get(code);   // терминал SMDG (assets/terminals.js)
    if (t) return { code: t.code, name: t.name, address: t.address, postal: '', city: t.city, country: t.cc, area: '', kind: 'terminal', lat: t.lat, lon: t.lon, operator: t.operator, approx: t.source !== 'SMDG' };
    var p = JTMS.ports && JTMS.ports.get(code);   // порт по UN/LOCODE (assets/ports.js)
    return p ? { code: p.code, name: p.name, address: '', postal: '', city: p.name, country: p.cc, area: '', kind: 'port', lat: p.lat, lon: p.lon } : null;
  },
  isPortLike: function (kind) { return kind === 'terminal' || kind === 'port'; },
  truck: function (fleet) { return JTMS.ref.trucks.find(function (t) { return t.fleet === fleet; }) || null; },
  ctype: function (id) { return JTMS.ref.containerTypes.find(function (t) { return t.id === id; }) || null; },
};
