/* =========================================================
   Хранилище ордеров (букингов контейнеров).
   Локальная копия в localStorage; если подключено облако (cloud.js),
   каждое изменение ещё и уходит в общую базу через hook.
   Ордер = один контейнер (File Nr). Маршрут:
   PickUp → строки «Погрузка/Выгрузка» → Deliver → из них плечи.
   ========================================================= */
window.JTMS = window.JTMS || {};

JTMS.store = (function () {
  var KEY = 'jtms.orders.v2';
  var hook = null;   // облако: insert / merge / plan / remove
  function send(fn) { if (hook && hook[fn]) try { hook[fn].apply(null, [].slice.call(arguments, 1)); } catch (e) { console.error(e); } }
  var FILE_NR_START = 30000001;   // своя нумерация, чтобы не пересекаться с File Nr из BPA

  function load() { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) { return []; } }
  function save(list) { try { localStorage.setItem(KEY, JSON.stringify(list)); return true; } catch (e) { return false; } }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  function nextFileNr() {
    return load().reduce(function (m, o) { return Math.max(m, +o.file_nr + 1); }, FILE_NR_START);
  }

  // Плечи: PickUp → stop1 → … → Deliver
  function buildLegs(o) {
    var pts = [{ code: o.pickup.code, name: o.pickup.name }]
      .concat(o.stops.map(function (s) { return { code: s.code, name: s.name, stop: s }; }))
      .concat([{ code: o.deliver.code, name: o.deliver.name }]);
    var loaded = false, legs = [];
    for (var i = 0; i < pts.length - 1; i++) {
      var to = pts[i + 1];
      var pl = (o.plan || {})[i + 1] || {};   // план диспетчера: машина, начало, статус
      legs.push({ id: o.id + ':' + (i + 1), order_id: o.id, seq: i + 1, from_code: pts[i].code, to_code: to.code, load: loaded ? 'full' : 'empty',
                  stop_type: to.stop ? to.stop.type : null, last: i === pts.length - 2,
                  window_from: to.stop ? to.stop.date + (to.stop.hour ? 'T' + to.stop.hour : '') : null,
                  truck: pl.truck || '', start: pl.start || '', status: pl.truck ? (pl.status || 'planned') : 'new',
                  arrived: pl.arrived || '', picked: pl.picked || '', events: pl.events || [], issue: pl.issue || null, photos: pl.photos || [],
                  sent: pl.sent || '', sentTruck: pl.sentTruck || '', sentStart: pl.sentStart || '', ack: pl.ack || '', note: pl.note || '' });   // выдача водителю: снимок машины и времени на момент отправки
      if (to.stop && to.stop.type === 'LADEN') loaded = true;
      if (to.stop && to.stop.type === 'LOSSEN') loaded = false;
    }
    // импорт: забор полного с терминала — первое плечо гружёное
    var pick = JTMS.ref && JTMS.ref.location(o.pickup.code);
    if (pick && (pick.kind === 'terminal' || pick.kind === 'port') && legs.length) { legs[0].load = 'full'; }
    return legs;
  }

  // Производные поля из плана: плечи, машина, статус ордера
  function derive(o) {
    o.legs = buildLegs(o);
    var used = o.legs.filter(function (l) { return l.truck; });
    if (used.length) o.truck = used[0].truck;
    if (o.status !== 'cancelled' && o.status !== 'closed') {
      if (o.legs.length && o.legs.every(function (l) { return l.status === 'done'; })) o.status = 'done';
      else if (o.legs.some(function (l) { return l.status === 'driving' || l.status === 'done'; })) o.status = 'in_progress';
      else if (used.length) o.status = 'planned';
      else if (o.status === 'planned') o.status = 'new';
    }
    return o;
  }

  function create(data) {
    var list = load();
    var o = Object.assign({}, data, { id: uid(), file_nr: String(nextFileNr()), status: 'new', created_at: new Date().toISOString() });
    o.legs = buildLegs(o);
    list.unshift(o);
    if (!save(list)) throw new Error('Could not save: browser storage is not available');
    send('insert', [o]);
    return o;
  }

  function get(id) { return load().find(function (o) { return o.id === id; }) || null; }

  function update(id, data) {
    var list = load(), i = list.findIndex(function (o) { return o.id === id; });
    if (i < 0) throw new Error('Order not found');
    var o = Object.assign({}, list[i], data, { id: list[i].id, file_nr: list[i].file_nr, created_at: list[i].created_at, updated_at: new Date().toISOString() });
    o.legs = buildLegs(o);
    list[i] = o;
    if (!save(list)) throw new Error('Could not save: browser storage is not available');
    // в базу — только изменённые поля (план и файлы меняются своими функциями)
    var patch = Object.assign({}, data, { legs: o.legs, updated_at: o.updated_at });
    delete patch.id; delete patch.file_nr; delete patch.created_at; delete patch.plan; delete patch.files;
    send('merge', id, patch);
    return o;
  }

  function remove(id) { save(load().filter(function (o) { return o.id !== id; })); send('remove', id); }

  // Добавить готовые ордера пачкой (примеры)
  function addMany(arr) {
    var list = load(), nr = nextFileNr(), added = [];
    arr.forEach(function (d) {
      var o = Object.assign({ status: 'new' }, d, { id: uid(), file_nr: String(nr++), created_at: d.created_at || new Date().toISOString() });
      o.legs = buildLegs(o); list.unshift(o); added.push(o);
    });
    save(list);
    if (added.length) send('insert', added);
  }

  // Диспетчер: назначить плечо seq ордера на машину и время, сменить статус или снять (patch = null)
  function plan(orderId, seq, patch) {
    var list = load(), i = list.findIndex(function (o) { return o.id === orderId; });
    if (i < 0) throw new Error('Order not found');
    var o = list[i]; o.plan = Object.assign({}, o.plan);
    var fresh = !o.plan[seq];
    if (patch === null) delete o.plan[seq]; else o.plan[seq] = Object.assign({ status: 'planned' }, o.plan[seq], patch);
    derive(o);
    o.updated_at = new Date().toISOString();
    list[i] = o;
    if (!save(list)) throw new Error('Could not save: browser storage is not available');
    // в базу — только изменённые ключи плеча, база сливает их с тем, что уже есть (водитель и офис не затирают друг друга)
    var p = patch === null ? null : Object.assign(fresh && !patch.status ? { status: 'planned' } : {}, patch);
    send('plan', orderId, seq, p, { status: o.status, legs: o.legs, updated_at: o.updated_at });
    return o;
  }
  // Водитель: событие по плечу (старт, прибытие, готово, проблема, фото) + изменения плана
  function legEvent(orderId, seq, type, text, patch) {
    var o = get(orderId); if (!o) throw new Error('Order not found');
    var cur = (o.plan || {})[seq] || {};
    var ev = { t: new Date().toISOString(), type: type, text: text || '' };
    return plan(orderId, seq, Object.assign({ events: (cur.events || []).concat([ev]) }, patch || {}));
  }
  function openContainers(exceptId) {
    var map = {};
    load().forEach(function (o) { if (o.id !== exceptId && o.container_no && o.status !== 'closed') map[o.container_no] = o.file_nr; });
    return map;
  }

  // для облака: своя копия базы и куда отправлять изменения
  function _setKey(k) { KEY = k; }
  function _setHook(h) { hook = h; }
  // заменить ордер в локальной копии без отправки в базу (пришло из облака)
  function _putLocal(o) {
    var list = load(), i = list.findIndex(function (x) { return x.id === o.id; });
    derive(o); if (i >= 0) list[i] = o; else list.unshift(o); save(list);
  }

  return { list: load, get: get, derive: derive, _setKey: _setKey, _setHook: _setHook, _putLocal: _putLocal, create: create, update: update, remove: remove, addMany: addMany,
           nextFileNr: nextFileNr, openContainers: openContainers, buildLegs: buildLegs, plan: plan, legEvent: legEvent };
})();

/* ISO 6346: формат и контрольная цифра номера контейнера */
JTMS.iso6346 = (function () {
  var V = {}, v = 10;
  'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').forEach(function (ch) { if (v % 11 === 0) v++; V[ch] = v++; });
  function clean(s) { return String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }
  function check(s10) { var sum = 0; for (var i = 0; i < 10; i++) { var ch = s10[i]; sum += (/[A-Z]/.test(ch) ? V[ch] : +ch) * Math.pow(2, i); } return sum % 11 % 10; }
  function validate(raw) {
    var s = clean(raw);
    if (!s) return { ok: false, code: 'empty', msg: 'Number is required' };
    if (!/^[A-Z]{3}[UJZ]\d{7}$/.test(s)) return { ok: false, code: 'format', msg: 'Format: 4 letters + 7 digits' };
    var cd = check(s.slice(0, 10));
    if (cd !== +s[10]) return { ok: false, code: 'check', msg: 'Wrong check digit (should be ' + cd + ')' };
    return { ok: true, value: s };
  }
  // Собрать валидный номер: префикс + 6 цифр → с контрольной цифрой
  function make(owner, serial) { var s10 = (owner + serial).toUpperCase(); return s10 + check(s10); }
  function format(s) { s = clean(s); return s.length === 11 ? s.slice(0, 4) + ' ' + s.slice(4, 10) + ' ' + s[10] : s; }
  return { validate: validate, clean: clean, make: make, format: format };
})();
