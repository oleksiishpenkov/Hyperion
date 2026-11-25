/* =========================================================
   Примеры ордеров для пустого списка (кнопка «Load sample orders»).
   Даты — относительно сегодняшнего дня.
   ========================================================= */
window.JTMS = window.JTMS || {};

JTMS.samples = function () {
  var ref = JTMS.ref, iso = JTMS.iso6346;
  function day(n) { var d = new Date(); d.setDate(d.getDate() + n); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function loc(code, extra) {
    var l = ref.location(code);
    return Object.assign({ code: l.code, name: l.name, address: l.address, address2: '', postal: l.postal, city: l.city, country: l.country, area: l.area }, extra || {});
  }
  function stop(type, code, d, hour, extra) {
    var l = ref.location(code);
    return Object.assign({ type: type, fix: false, disc: '', reference: '', date: day(d), hour: hour, until: '', code: l.code, name: l.name,
      address: l.address, postal: l.postal, place: l.city, country: l.country, instructions: '', remarks: '' }, extra || {});
  }
  function order(o) {
    return Object.assign({
      customer: '', booking: '', truck: '', employee: 'wiktoria', shipping_line: 'MSC', client_ref: '', combi_id: '', km: null, tare_kg: null,
      reuse_order: '', reuse_id: '', inc_diesel: false, sb: false, move: false, container_no: '', container_ok: false,
      ct: { type: '45G1', group: '', seal: '', bl: '' }, f: {}, rf: {}, remarks: '', doc_location: '', articles: [], status: 'new'
    }, o);
  }
  var hoursAgo = function (h) { return new Date(Date.now() - h * 3600e3).toISOString(); };
  function at(d, hm) { return day(d) + 'T' + hm; }

  return JTMS.samples.base(order, loc, stop, day, hoursAgo, at, iso).concat(JTMS.samples.dayOrders(order, loc, stop, day, hoursAgo, at, iso)).map(JTMS.timing.fillPlan).map(JTMS.samples.markSent).map(JTMS.samples.group);
};

JTMS.samples.base = function (order, loc, stop, day, hoursAgo, at, iso) {
  return [
    order({ customer: 'JAS FORWARDING GmbH', booking: '42697773', truck: 'JEN0142', client_ref: 'S610514380', km: 872.82, status: 'planned',
      ct: { type: '45R1', group: 'GENSET', seal: '', bl: '' }, f: { genset: true, gdp: true }, rf: { temp: 20, vents: 'CLOSED', drains: 'CLOSED', precooled: true },
      pickup: loc('MEDRANTW', { ref: '459IHA1708569' }), deliver: loc('1742ANTW', { ref: '459IHA1708569', closing_date: day(4), closing_time: '04:00', vessel: 'MSC MARIA SAVERIA', destination: 'JEDDAH' }),
      stops: [stop('LADEN', 'FRESGERN', 3, '10:00', { fix: true, reference: '60298702', instructions: 'Container must be clean, dry and odourless' })],
      articles: [{ code: 'PHAGOODS', description: 'PHARMA GOODS', gross: 10000 }], created_at: hoursAgo(30) }),
    order({ customer: 'DSV Road', booking: 'MEDUAN771204', truck: 'JEN0118', container_no: iso.make('MSCU', '482193'), container_ok: true, km: 412, employee: 'katrin', status: 'in_progress',
      pickup: loc('1742ANTW', { ref: 'PIN 88412', f_dem_start: day(2) }), deliver: loc('MEDRANTW'),
      stops: [stop('LOSSEN', 'DSVVENLO', 0, '13:00', { reference: 'DSV-558120' })], created_at: hoursAgo(52),
      plan: { 1: { truck: 'JEN0118', start: at(0, '08:30'), status: 'driving' }, 2: { truck: 'JEN0118' } }, _send: 'ack' }),
    order({ customer: 'Kuehne+Nagel', booking: 'MAEU262118845', shipping_line: 'MAERSK', container_no: iso.make('MSKU', '903544'), km: 318, status: 'new',
      ct: { type: '42G1', group: '', seal: 'ML-4471823', bl: '' }, pickup: loc('ECTDELTA', { f_dem_start: day(1) }), deliver: loc('ECTDELTA'),
      stops: [stop('LOSSEN', 'KNTILB', 1, '08:00', { reference: 'KN-TIL-40412' })], created_at: hoursAgo(3) }),
    order({ customer: 'DHL Global Forwarding', booking: 'HLCUANR251133', shipping_line: 'HAPAG-LLOYD', km: 664, status: 'new',
      ct: { type: '45G1', group: '', seal: '', bl: '' }, f: { adr: true }, pickup: loc('VOLGTANTW'),
      deliver: loc('1700ANTW', { closing_date: day(2), closing_time: '18:00', vessel: 'BERLIN EXPRESS', destination: 'NEW YORK' }),
      stops: [stop('LADEN', 'FRESGERN', 1, '07:30', { reference: 'DGF-4472110' })],
      articles: [{ amount: 18, colli: 'IBC', code: 'CHEM', description: 'Paint, flammable', gross: 16200, un: '1263', adr: '3', pack: 'III' }], created_at: hoursAgo(6) }),
    order({ customer: 'Rhenus Logistics', booking: 'CMAU8812204', truck: 'JEN0106', shipping_line: 'CMA CGM', container_no: iso.make('CMAU', '391846'), km: 96, status: 'done',
      pickup: loc('869ANTW'), deliver: loc('MEDRANTW'),
      stops: [stop('LOSSEN', 'DSVVENLO', -1, '09:00')], created_at: hoursAgo(80) }),
    order({ customer: 'Geodis', booking: 'ONEYANR4419', shipping_line: 'ONE', km: 0, status: 'new',
      ct: { type: '22G1', group: '', seal: '', bl: '' }, pickup: loc('MEDRANTW'),
      deliver: loc('913ANTW', { closing_date: day(1), closing_time: '12:00', vessel: 'ONE APUS', destination: 'SINGAPORE' }),
      stops: [stop('LADEN', 'KNTILB', 0, '15:00')], created_at: hoursAgo(1) }),
    order({ customer: 'Ewals Cargo Care', booking: 'EGLV1452290', truck: 'JEN0129', shipping_line: 'EVERGREEN', container_no: iso.make('EGHU', '220913'), km: 540, status: 'planned',
      ct: { type: 'L5G1', group: '', seal: '', bl: '' }, pickup: loc('RWGMV2', { f_dem_start: day(5) }), deliver: loc('RWGMV2'),
      stops: [stop('LOSSEN', 'FRESGERN', 2, '11:00'), stop('LOSSEN', 'DSVVENLO', 3, '08:00')], created_at: hoursAgo(20) }),
    order({ customer: 'CEVA Logistics', booking: 'MEDUAN771380', container_no: iso.make('MEDU', '774190'), km: 210, status: 'cancelled',
      ct: { type: '22R1', group: '', seal: '', bl: '' }, rf: { temp: -18 }, pickup: loc('1742ANTW'), deliver: loc('MEDRANTW'),
      stops: [stop('LOSSEN', 'KNTILB', -2, '10:00')], created_at: hoursAgo(120) }),
  ];
};

// Рабочий день для вкладки Dispatch: ордера с машинами и временем на сегодня
JTMS.samples.dayOrders = function (order, loc, stop, day, hoursAgo, at, iso) {
  return [
    order({ customer: 'Kuehne+Nagel', booking: 'MEDUAN880412', container_no: iso.make('MSDU', '711830'), container_ok: true, km: 190, status: 'done',
      ct: { type: '45G1', group: '', seal: '', bl: '' }, pickup: loc('1742ANTW', { ref: 'PIN 90311' }), deliver: loc('MEDRANTW'),
      stops: [stop('LOSSEN', 'KNTILB', 0, '09:00', { reference: 'KN-TIL-40790' })], created_at: hoursAgo(26),
      plan: { 1: { truck: 'JEN0103', start: at(0, '06:45'), status: 'done' }, 2: { truck: 'JEN0103', status: 'done' } }, _send: 'ack' }),
    order({ customer: 'DSV Road', booking: 'HLCUANR260077', shipping_line: 'HAPAG-LLOYD', km: 300, status: 'planned',
      ct: { type: '42G1', group: '', seal: '', bl: '' }, pickup: loc('VOLGTANTW'),
      deliver: loc('1700ANTW', { closing_date: day(1), closing_time: '06:00', vessel: 'HAMBURG EXPRESS', destination: 'SHANGHAI' }),
      stops: [stop('LADEN', 'DSVVENLO', 0, '15:30', { reference: 'DSV-560114' })], created_at: hoursAgo(9),
      plan: { 1: { truck: 'JEN0106', start: at(0, '11:00') }, 2: { truck: 'JEN0106' } } }),
    order({ customer: 'Fresenius Medical Care', booking: 'MAEU262119920', shipping_line: 'MAERSK', container_no: iso.make('MRKU', '518204'), container_ok: true, km: 960, status: 'in_progress',
      ct: { type: '45G1', group: '', seal: 'ML-4480112', bl: '' }, pickup: loc('ECTDELTA', { f_dem_start: day(2) }), deliver: loc('ECTDELTA'),
      stops: [stop('LOSSEN', 'FRESGERN', 0, '16:00', { reference: 'FMC-7712', fix: true })], created_at: hoursAgo(30),
      plan: { 1: { truck: 'JEN0111', start: at(0, '05:00'), status: 'driving' }, 2: { truck: 'JEN0111' } }, _send: 'ack' }),
    order({ customer: 'Geodis', booking: 'ONEYANR4502', shipping_line: 'ONE', km: 140, status: 'in_progress',
      ct: { type: '22G1', group: '', seal: '', bl: '' }, pickup: loc('MEDRANTW'),
      deliver: loc('913ANTW', { closing_date: day(0), closing_time: '20:00', vessel: 'ONE COSMOS', destination: 'SINGAPORE' }),
      stops: [stop('LADEN', 'KNTILB', 0, '10:30', { reference: 'GEO-22871' })], created_at: hoursAgo(20),
      plan: { 1: { truck: 'JEN0122', start: at(0, '06:00'), status: 'done' }, 2: { truck: 'JEN0122', status: 'driving' } }, _send: 'ack' }),
    order({ customer: 'Ewals Cargo Care', booking: 'EGLV1452318', shipping_line: 'EVERGREEN', container_no: iso.make('EGHU', '233071'), container_ok: true, km: 250, status: 'in_progress',
      ct: { type: 'L5G1', group: '', seal: '', bl: '' }, pickup: loc('RWGMV2', { f_dem_start: day(3) }), deliver: loc('RWGMV2'),
      stops: [stop('LOSSEN', 'DSVVENLO', 0, '09:30', { reference: 'EW-88120' })], created_at: hoursAgo(28),
      plan: { 1: { truck: 'JEN0133', start: at(0, '05:00'), status: 'done' }, 2: { truck: 'JEN0133' } }, _send: 'ack' }),
    order({ customer: 'Rhenus Logistics', booking: 'CMAU8813371', shipping_line: 'CMA CGM', container_no: iso.make('CMAU', '402215'), container_ok: true, km: 120, status: 'planned',
      ct: { type: '42G1', group: '', seal: '', bl: '' }, pickup: loc('869ANTW', { ref: 'PIN 44120' }), deliver: loc('VOLGTANTW'),
      stops: [stop('LOSSEN', 'KNTILB', 0, '16:00', { reference: 'RH-55012' })], created_at: hoursAgo(5),
      plan: { 1: { truck: 'JEN0137', start: at(0, '12:00') }, 2: { truck: 'JEN0137' } }, _send: 'sent' }),
  ];
};

// Для кнопки «Load demo day» на вкладке Dispatch
JTMS.samples.day = function () {
  var ref = JTMS.ref, iso = JTMS.iso6346;
  function day(n) { var d = new Date(); d.setDate(d.getDate() + n); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function loc(code, extra) { var l = ref.location(code); return Object.assign({ code: l.code, name: l.name, address: l.address, address2: '', postal: l.postal, city: l.city, country: l.country, area: l.area }, extra || {}); }
  function stop(type, code, d, hour, extra) { var l = ref.location(code);
    return Object.assign({ type: type, fix: false, disc: '', reference: '', date: day(d), hour: hour, until: '', code: l.code, name: l.name, address: l.address, postal: l.postal, place: l.city, country: l.country, instructions: '', remarks: '' }, extra || {}); }
  function order(o) { return Object.assign({ customer: '', booking: '', truck: '', employee: 'wiktoria', shipping_line: 'MSC', client_ref: '', combi_id: '', km: null, tare_kg: null, reuse_order: '', reuse_id: '',
      inc_diesel: false, sb: false, move: false, container_no: '', container_ok: false, ct: { type: '45G1', group: '', seal: '', bl: '' }, f: {}, rf: {}, remarks: '', doc_location: '', articles: [], status: 'new' }, o); }
  return JTMS.samples.dayOrders(order, loc, stop, day, function (h) { return new Date(Date.now() - h * 3600e3).toISOString(); }, function (d, hm) { return day(d) + 'T' + hm; }, iso).map(JTMS.timing.fillPlan).map(JTMS.samples.markSent).map(JTMS.samples.group);
};

// Образцы: работа уже отправлена водителю (_send: 'sent') или ещё и принята им ('ack')
JTMS.samples.markSent = function (o) {
  var how = o._send; delete o._send;
  if (!how || !o.plan) return o;
  var t = new Date(Date.now() - 14 * 3600e3).toISOString(), a = new Date(Date.now() - 13 * 3600e3).toISOString();
  Object.keys(o.plan).forEach(function (k) {
    var p = o.plan[k]; if (!p.truck || !p.start) return;
    p.sent = t; p.sentTruck = p.truck; p.sentStart = p.start; if (how === 'ack') p.ack = a;
  });
  return o;
};

// Образцы: группа планирования G01–G13
JTMS.samples.group = function (o, i) { if (!o.pgroup) o.pgroup = JTMS.ref.planGroups[(i * 5 + 2) % 13]; return o; };
