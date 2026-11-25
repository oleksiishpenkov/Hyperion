/* =========================================================
   Маршруты для грузовика по реальной дорожной сети.
   Провайдеры: openrouteservice (профиль driving-hgv) или HERE Routing v8 (transportMode=truck, с платными дорогами).
   Ответы кэшируются по паре точек и профилю машины, повторно сервис не спрашиваем.
   Без ключа или без сети — запасной расчёт по схеме трасс (assets/routing.js), помечается как approx.
   Ключ сейчас хранится в браузере; при переходе на Supabase запросы уйдут в серверную функцию.
   ========================================================= */
window.JTMS = window.JTMS || {};
JTMS.geo = (function () {
  var SKEY = 'jtms.geo.settings', CKEY = 'jtms.geo.cache.v1', GKEY = 'jtms.geo.places.v1';
  var DEF = {
    provider: 'none', key: '',
    truck: { weight: 40, height: 4.0, width: 2.55, length: 16.5, axleload: 11.5, axles: 5, adr: false }   // т, м
  };
  var listeners = [], queue = [], busy = false, inflight = {}, lastError = '', failed = {}, pauseUntil = 0;   // failed: не повторять 10 мин; pause: нет сети

  function read(k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
  function write(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
  var S = Object.assign({}, DEF, read(SKEY, {})); S.truck = Object.assign({}, DEF.truck, S.truck || {});
  var CACHE = read(CKEY, {}), PLACES = read(GKEY, {});

  function settings() { return JSON.parse(JSON.stringify(S)); }
  function save(n) {
    failed = {}; pauseUntil = 0;
    S = Object.assign({}, S, n); S.truck = Object.assign({}, DEF.truck, S.truck || {});
    write(SKEY, S); lastError = ''; notify();
  }
  function active() { return S.provider !== 'none' && !!S.key; }
  function profileKey() { var t = S.truck; return [S.provider, t.weight, t.height, t.width, t.length, t.axleload, t.axles, t.adr ? 1 : 0].join('/'); }
  function r5(n) { return Math.round(n * 1e4) / 1e4; }

  // Координаты площадки: свои, из справочника терминалов/портов, или найденные по адресу (геокодинг)
  function addrOf(l) { return [l.address, l.postal, l.city || l.place, l.country].filter(Boolean).join(', '); }
  function coords(l) {
    if (!l) return null;
    if (l.lat != null && l.lon != null) return { lat: +l.lat, lon: +l.lon };
    var a = addrOf(l); return a && PLACES[a] && PLACES[a].lat != null ? PLACES[a] : null;
  }
  function pairKey(a, b) { return profileKey() + '|' + r5(a.lat) + ',' + r5(a.lon) + '|' + r5(b.lat) + ',' + r5(b.lon); }

  // Синхронно: готовый ответ из кэша или null
  function cached(from, to) {
    if (!active()) return null;
    var a = coords(from), b = coords(to); if (!a || !b) return null;
    return CACHE[pairKey(a, b)] || null;
  }

  // ---------- запросы к провайдерам ----------
  function orsRoute(a, b) {
    var t = S.truck;
    return fetch('https://api.openrouteservice.org/v2/directions/driving-hgv', {
      method: 'POST',
      headers: { 'Authorization': S.key, 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({
        coordinates: [[a.lon, a.lat], [b.lon, b.lat]], units: 'km', instructions: false,
        options: { vehicle_type: 'hgv', profile_params: { restrictions: { weight: t.weight, height: t.height, width: t.width, length: t.length, axleload: t.axleload, hazmat: !!t.adr } } }
      })
    }).then(answer).then(function (j) {
      var r = j.routes && j.routes[0]; if (!r) throw new Error('No route found for a truck');
      return { km: Math.round(r.summary.distance * 10) / 10, h: r.summary.duration / 3600, toll: null, src: 'ors' };
    });
  }
  function hereRoute(a, b) {
    var t = S.truck;
    var q = ['transportMode=truck', 'origin=' + a.lat + ',' + a.lon, 'destination=' + b.lat + ',' + b.lon, 'return=summary,tolls', 'currency=EUR', 'departureTime=any',
      'vehicle[grossWeight]=' + Math.round(t.weight * 1000), 'vehicle[height]=' + Math.round(t.height * 100), 'vehicle[width]=' + Math.round(t.width * 100),
      'vehicle[length]=' + Math.round(t.length * 100), 'vehicle[weightPerAxle]=' + Math.round(t.axleload * 1000), 'vehicle[axleCount]=' + t.axles,
      'vehicle[type]=tractor', t.adr ? 'vehicle[shippedHazardousGoods]=flammable' : '', 'apiKey=' + encodeURIComponent(S.key)].filter(Boolean).join('&');
    return fetch('https://router.hereapi.com/v8/routes?' + q).then(answer).then(function (j) {
      var r = j.routes && j.routes[0]; if (!r) throw new Error('No route found for a truck');
      var m = 0, s = 0, toll = 0, hasToll = false;
      r.sections.forEach(function (sec) {
        m += sec.summary.length; s += sec.summary.duration;
        (sec.tolls || []).forEach(function (tl) {
          var f = (tl.fares || [])[0]; var p = f && (f.convertedPrice || f.price);
          if (p && p.value != null) { toll += +p.value; hasToll = true; }
        });
      });
      return { km: Math.round(m / 100) / 10, h: s / 3600, toll: hasToll ? Math.round(toll * 100) / 100 : 0, src: 'here' };
    });
  }
  function answer(res) {
    if (res.ok) return res.json();
    return res.text().then(function (t) {
      var msg = 'HTTP ' + res.status;
      try { var j = JSON.parse(t); msg += ': ' + ((j.error && (j.error.message || j.error)) || j.title || j.cause || j.message || ''); } catch (e) {}
      var err = new Error(msg); err.status = res.status; throw err;
    });
  }
  function netError(e) {
    if (e && e.status) return e.message;
    return 'Could not reach the routing service. Inside the claude.ai preview requests to other sites are blocked: open the downloaded Hyperion file in Chrome or Edge, or host it on your own site.';
  }

  // Геокодинг адреса без координат
  function geocode(addr) {
    var u = S.provider === 'here'
      ? 'https://geocode.search.hereapi.com/v1/geocode?q=' + encodeURIComponent(addr) + '&limit=1&apiKey=' + encodeURIComponent(S.key)
      : 'https://api.openrouteservice.org/geocode/search?size=1&text=' + encodeURIComponent(addr) + '&api_key=' + encodeURIComponent(S.key);
    return fetch(u).then(answer).then(function (j) {
      if (S.provider === 'here') { var it = j.items && j.items[0]; return it ? { lat: it.position.lat, lon: it.position.lng, label: it.title } : { lat: null }; }
      var f = j.features && j.features[0]; return f ? { lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0], label: f.properties.label } : { lat: null };
    });
  }

  // ---------- очередь: по одному запросу, с паузой, чтобы не упереться в лимит ----------
  function pump() {
    if (busy || !queue.length) return;
    busy = true;
    var job = queue.shift();
    job().then(function () { setTimeout(function () { busy = false; pump(); }, 1600); },
      function (e) {
        lastError = netError(e);
        if (e && e.status === 429) { queue.unshift(job); setTimeout(function () { busy = false; pump(); }, 20000); return; }   // лимит — ждём и повторяем
        if (!e || !e.status) { queue = []; inflight = {}; pauseUntil = Date.now() + 120e3; }   // нет сети — остальное тоже не пройдёт, пауза 2 мин
        busy = false; notify(); pump();
      });
  }
  // Попросить маршруты для списка [{from, to}]; по готовности вызываются подписчики onChange
  function ensure(pairs) {
    if (!active() || Date.now() < pauseUntil) return 0;
    var now = Date.now();
    var n = 0;
    pairs.forEach(function (p) {
      [p.from, p.to].forEach(function (l) {
        if (!l || coords(l)) return;
        var a = addrOf(l); if (!a || inflight['g:' + a] || (PLACES[a] && PLACES[a].miss) || failed['g:' + a] > now) return;
        inflight['g:' + a] = 1; n++;
        queue.push(function () {
          return geocode(a).then(function (g) {
            PLACES[a] = g.lat != null ? g : { miss: true }; write(GKEY, PLACES); delete inflight['g:' + a]; notify();
          }, function (e) { delete inflight['g:' + a]; failed['g:' + a] = Date.now() + 600e3; throw e; });
        });
      });
      var a = coords(p.from), b = coords(p.to); if (!a || !b) return;
      var k = pairKey(a, b); if (CACHE[k] || inflight[k] || failed[k] > now) return;
      inflight[k] = 1; n++;
      queue.push(function () {
        return (S.provider === 'here' ? hereRoute(a, b) : orsRoute(a, b)).then(function (r) {
          r.at = new Date().toISOString(); CACHE[k] = r; write(CKEY, CACHE); delete inflight[k]; lastError = ''; notify();
        }, function (e) { delete inflight[k]; if (e && e.status !== 429) failed[k] = Date.now() + 600e3; throw e; });
      });
    });
    pump();
    return n;
  }
  function test(a, b) { return (S.provider === 'here' ? hereRoute(a, b) : orsRoute(a, b)).catch(function (e) { throw new Error(netError(e)); }); }
  function onChange(fn) { listeners.push(fn); }
  var tmr = null;
  function notify() { clearTimeout(tmr); tmr = setTimeout(function () { listeners.forEach(function (f) { try { f(); } catch (e) {} }); }, 250); }
  function status() { return { active: active(), provider: S.provider, pending: queue.length + (busy ? 1 : 0), cached: Object.keys(CACHE).filter(function (k) { return k.indexOf(profileKey() + '|') === 0; }).length, error: lastError }; }
  function clear() { CACHE = {}; PLACES = {}; write(CKEY, CACHE); write(GKEY, PLACES); notify(); }
  var NAMES = { none: 'Approximate (built-in motorway schema)', ors: 'openrouteservice · truck profile', here: 'HERE · truck routing with tolls' };

  return { settings: settings, save: save, active: active, cached: cached, ensure: ensure, coords: coords, test: test, onChange: onChange, status: status, clear: clear, NAMES: NAMES };
})();
