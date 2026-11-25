/* =========================================================
   Время работы: из чего состоит блок на доске диспетчера.
   Работа (один контейнер) = Pick-up → дорога → погрузка/выгрузка → дорога → … → сдача.
   Нормы — здесь, в одном месте.
   ========================================================= */
window.JTMS = window.JTMS || {};
JTMS.timing = (function () {
  var C = {
    SPEED: 70,      // средняя скорость водителя, км/ч (по опыту Jenson)
    PICKUP_H: 1.5,  // забор контейнера на терминале или депо
    STOP_H: 3,      // погрузка или выгрузка у клиента
    DROP_H: 1.5,    // сдача контейнера на терминал или депо
    DRIVE_BLOCK: 4.5, BREAK_H: 0.75,   // ЕС 561/2006: после 4,5 ч за рулём — перерыв 45 мин
    DAY_DRIVE: 9, DAY_DRIVE_EXT: 10, DRIVE_EXT_PER_WEEK: 2,   // за рулём за смену: 9 ч, до 10 ч — не больше 2 раз в неделю
    SHIFT_MAX: 13, SHIFT_EXT: 15, SHIFT_EXT_PER_WEEK: 3,      // смена: 13 ч, до 15 ч — не больше 3 раз в неделю
    REST_MIN: 9, WEEK_DRIVE: 56,                              // отдых между сменами от 9 ч; за неделю не больше 56 ч за рулём
    PLAN_DRIVE: 10, PLAN_SHIFT: 15, REST_H: 9,                // при планировании: смена до 15 ч и до 10 ч за рулём, потом отдых 9 ч
    REST_AT_STOP: true                 // водитель не участвует в погрузке/выгрузке, отдыхает в кабине — это перерыв
  };
  try { Object.assign(C, JSON.parse(localStorage.getItem('jtms.timing.norms') || '{}')); } catch (e) {}   // нормы из Settings
  var LABEL = { pickup: 'Pick-up', drive: 'Drive', load: 'Loading', unload: 'Unloading', stop: 'Stop', drop: 'Drop-off', brk: 'Break', rest: 'Daily rest' };

  function parse(s) { if (!s) return null; var d = new Date(s.length <= 10 ? s + 'T00:00' : s); return isNaN(d) ? null : d; }
  function pad(n) { return String(n).padStart(2, '0'); }
  function local(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function locOf(code, fb) {
    var l = JTMS.ref.location(code); if (l) return l;
    return { code: code || '', name: (fb && fb.name) || code || 'No location', address: fb && fb.address, city: fb && (fb.city || fb.place), country: fb && fb.country };
  }

  // Плечи ордера с площадками, км и отрезками времени
  function legs(o) {
    if (!o || !o.pickup || !o.deliver) return [];
    var pts = [o.pickup].concat(o.stops || []).concat([o.deliver]);
    var G = JTMS.geo;
    var out = JTMS.store.buildLegs(o).map(function (l, i) {
      l.order = o; l.fromStop = pts[i]; l.toStop = pts[i + 1];
      l.from = locOf(l.from_code, pts[i]); l.to = locOf(l.to_code, pts[i + 1]);
      // 1) маршрут грузовика от сервиса (кэш), 2) иначе — схема трасс
      var real = G && G.cached(l.from, l.to);
      if (real) { l.km = Math.round(real.km); l.driveH = real.km / C.SPEED; l.toll = real.toll; l.src = real.src; l.r = null; }   // км — от сервиса, время — по средней скорости водителя
      else {
        var gf = G && G.coords(l.from), gt = G && G.coords(l.to);
        var r = JTMS.route ? JTMS.route.forLeg({ from: Object.assign({}, l.from, gf || {}), to: Object.assign({}, l.to, gt || {}) }) : null;
        l.r = r; l.km = r ? Math.round(r.km) : null; l.driveH = l.km != null ? l.km / C.SPEED : 1; l.toll = null; l.src = r ? 'schema' : 'none';
      }
      l.preH = l.seq === 1 ? C.PICKUP_H : 0;
      l.postKind = l.stop_type === 'LADEN' ? 'load' : l.stop_type === 'LOSSEN' ? 'unload' : l.stop_type ? 'stop' : 'drop';
      l.postH = l.stop_type ? C.STOP_H : C.DROP_H;
      l.win = parse(l.window_from);
      l.closing = l.last && o.deliver.closing_date ? parse(o.deliver.closing_date + 'T' + (o.deliver.closing_time || '23:59')) : null;
      l.s = parse(l.start);
      return l;
    });
    // отрезки: забор → дорога → погрузка/выгрузка → дорога → сдача. В дорогу встают:
    //  перерыв 45 мин после 4,5 ч за рулём подряд;
    //  отдых 9 ч, когда за смену набралось 10 ч за рулём или смена дошла до 15 ч — потом новая смена.
    // t — часы от начала работы; sh0 — начало текущей смены; shD — за рулём в текущей смене; acc — за рулём подряд
    var acc = 0, shD = 0, sh0 = 0, t = 0;
    out.forEach(function (l, i) {
      var prev = out[i - 1];
      if (!prev || prev.truck !== l.truck) { acc = 0; shD = 0; sh0 = t; }   // другая машина — другой водитель, своя смена
      l.segs = [];
      function push(g) { g.h = Math.max(0, g.h); l.segs.push(g); t += g.h; }
      if (l.preH) push({ kind: 'pickup', h: l.preH, at: l.from });
      var left = l.driveH, first = true, guard = 0;
      while (left > 0.005 && guard++ < 50) {
        var chunk = Math.min(left, C.DRIVE_BLOCK - acc, C.PLAN_DRIVE - shD, C.PLAN_SHIFT - (t - sh0));
        if (chunk > 0.005) {
          push({ kind: 'drive', h: chunk, km: first ? l.km : null, part: !first, at: l.to });
          first = false; left -= chunk; acc += chunk; shD += chunk;
          if (left <= 0.005) break;
        }
        if (shD >= C.PLAN_DRIVE - 0.005 || t - sh0 >= C.PLAN_SHIFT - 0.005) {   // смена закончилась — ночной/суточный отдых
          push({ kind: 'rest', h: C.REST_H, at: l.to, rest: true });
          acc = 0; shD = 0; sh0 = t;
        } else { push({ kind: 'brk', h: C.BREAK_H, at: l.to }); acc = 0; }
      }
      if (first) push({ kind: 'drive', h: 0, km: l.km, at: l.to });   // дороги нет (та же площадка)
      var rest = C.REST_AT_STOP && !!l.stop_type && l.postH >= C.BREAK_H;   // пока грузят/выгружают, водитель на спальнике
      push({ kind: l.postKind, h: l.postH, at: l.to, rest: rest });
      if (rest) acc = 0;   // 45 мин и больше без работы — счётчик 4,5 ч начинается заново
      l.shiftLeft = { drive: C.PLAN_DRIVE - shD, shift: C.PLAN_SHIFT - (t - sh0) };   // остаток после этого плеча
      l.breaks = l.segs.filter(function (g) { return g.kind === 'brk'; }).length;
      l.totalH = l.segs.reduce(function (a, g) { return a + g.h; }, 0);
      if (l.s) {
        var tt = +l.s;   // не t: та — общий счётчик часов работы
        l.segs.forEach(function (g) { g.s = new Date(tt); tt += g.h * 3600e3; g.e = new Date(tt); });
        l.e = new Date(tt);
        l.arrive = l.segs.filter(function (g) { return g.kind === 'drive'; }).pop().e;   // конец последней дороги = приезд к месту назначения
      }
    });
    return out;
  }

  // Начала следующих плеч той же машины — сразу после предыдущего (для образцов и миграции)
  function fillPlan(o) {
    if (!o.plan || !o.plan[1] || !o.plan[1].start) return o;
    var ls = legs(o), t = +parse(o.plan[1].start), truck = o.plan[1].truck;
    if (!o.truck && truck) o.truck = truck;
    ls.forEach(function (l) {
      var p = o.plan[l.seq];
      if (!p || p.truck !== truck) { t = NaN; return; }
      if (l.seq > 1 && !isNaN(t)) p.start = local(new Date(t));
      if (!isNaN(t)) t = +parse(p.start) + l.totalH * 3600e3;
    });
    return o;
  }

  // Запланировать работу целиком: все незавершённые плечи подряд на одну машину
  function planJob(orderId, truck, start, seqs) {
    var o = JTMS.store.get(orderId); if (!o) throw new Error('Order not found');
    var ls = legs(o).filter(function (l) { return l.status !== 'done' && (!seqs || seqs.indexOf(l.seq) >= 0); });
    var t = +parse(start);
    ls.forEach(function (l) {
      JTMS.store.plan(orderId, l.seq, { truck: truck, start: local(new Date(t)) });
      t += l.totalH * 3600e3;
    });
    return JTMS.store.get(orderId);
  }

  // Один раз пересчитать старые планы под новые нормы времени
  function migrate() {
    try { if (localStorage.getItem('jtms.timing.v3')) return; } catch (e) { return; }
    rechain();
    try { localStorage.setItem('jtms.timing.v3', '1'); } catch (e) {}
  }
  // Плечи одной работы на одной машине снова встают подряд (после смены норм)
  function rechain() {
    JTMS.store.list().forEach(function (o) {
      if (!o.plan) return;
      var first = Object.keys(o.plan).map(Number).sort(function (a, b) { return a - b; })[0];
      var p = o.plan[first]; if (!p || !p.start) return;
      var ls = legs(o).filter(function (l) { return l.seq >= first && l.truck === p.truck; });
      var t = +parse(p.start);
      ls.forEach(function (l, i) {
        if (i > 0 && l.seq !== ls[i - 1].seq + 1) t = NaN;
        if (isNaN(t)) return;
        if (l.start !== local(new Date(t))) JTMS.store.plan(o.id, l.seq, { start: local(new Date(t)) });
        t += l.totalH * 3600e3;
      });
    });
  }

  // Смены водителя (машины): работы подряд, между которыми отдых меньше 9 ч, — одна смена.
  // Считаем длину смены, часы за рулём и сколько раз за неделю (пн–вс) смена была длинной и вождение — больше 9 ч.
  function weekKey(d) { var x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - (x.getDay() + 6) % 7); return x.getFullYear() + '-' + pad(x.getMonth() + 1) + '-' + pad(x.getDate()); }
  function shifts(all) {
    var by = {}, out = [];
    all.forEach(function (l) { if (l.truck && l.s && l.e) l.segs.forEach(function (g) { (by[l.truck] = by[l.truck] || []).push({ g: g, l: l }); }); });
    Object.keys(by).forEach(function (tr) {
      var cur = null;
      by[tr].sort(function (a, b) { return a.g.s - b.g.s; }).forEach(function (x) {
        var g = x.g;
        if (g.kind === 'rest' && g.h >= C.REST_MIN) { cur = null; return; }
        if (cur && g.s - cur.e >= C.REST_MIN * 3600e3) cur = null;
        if (!cur) { cur = { truck: tr, legs: [], s: g.s, e: g.e, drive: 0 }; out.push(cur); }
        if (cur.legs.indexOf(x.l) < 0) cur.legs.push(x.l);
        if (g.e > cur.e) cur.e = g.e;
        if (g.kind === 'drive') cur.drive += g.h;
      });
    });
    var cnt = {};
    out.sort(function (a, b) { return a.s - b.s; }).forEach(function (sh) {
      sh.h = (sh.e - sh.s) / 3600e3;
      sh.week = weekKey(sh.s);
      var c = cnt[sh.truck + '|' + sh.week] = cnt[sh.truck + '|' + sh.week] || { ext: 0, drv: 0, drive: 0 };
      if (sh.h > C.SHIFT_MAX + 0.01) sh.extN = ++c.ext;
      if (sh.drive > C.DAY_DRIVE + 0.01) sh.drvN = ++c.drv;
      c.drive += sh.drive; sh.weekDrive = c.drive; sh.wk = c;
    });
    return out;
  }

  return { C: C, LABEL: LABEL, shifts: shifts, legs: legs, fillPlan: fillPlan, planJob: planJob, migrate: migrate, rechain: rechain, local: local, parse: parse };
})();
