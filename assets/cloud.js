/* =========================================================
   Облако (Supabase): вход, общая база ордеров, живые обновления, файлы.
   Работает поверх JTMS.store: страницы читают ордера из локальной копии как раньше,
   а все изменения уходят в базу через очередь (если связи нет — отправятся позже).
   Без настроек в assets/config.js модуль выключен, и всё хранится только в браузере.
   ========================================================= */
window.JTMS = window.JTMS || {};
JTMS.cloud = (function () {
  var cfg = JTMS.config || {};
  var OFF = { on: false, guard: function () { return Promise.resolve(null); }, me: function () { return null; }, fileUrl: function () { return ''; }, client: null, pending: function () { return 0; } };
  if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) return OFF;
  if (!window.supabase || !window.supabase.createClient) {
    console.error('Hyperion: Supabase library did not load, working offline in this browser');
    return OFF;
  }

  var sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: true } });
  var ref = (/^https?:\/\/([^.]+)/.exec(cfg.supabaseUrl) || [])[1] || 'cloud';
  var KEY = 'jtms.cloud.' + ref + '.orders', OUT = 'jtms.cloud.' + ref + '.outbox';
  var me = null, flushing = false, lastError = '', dirty = false;

  // локальная копия базы — отдельно от «офлайн»-данных этого браузера
  JTMS.store._setKey(KEY);

  function read(k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
  function write(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
  // страницы уже слушают событие storage (изменения из других вкладок) — им же сообщаем о приходе данных
  function emit() {
    try { window.dispatchEvent(new StorageEvent('storage', { key: KEY })); } catch (e) { var ev = document.createEvent('Event'); ev.initEvent('storage', false, false); window.dispatchEvent(ev); }
    badge();
  }
  function page() { return location.pathname.split('/').pop() || 'index.html'; }

  // ---------- очередь изменений ----------
  function queue(op) { op.qid = Date.now().toString(36) + Math.random().toString(36).slice(2, 6); var q = read(OUT, []); q.push(op); write(OUT, q); badge(); flush(); }
  // одна вкладка отправляет очередь, остальные ждут (очередь у вкладок общая)
  var TAB = Math.random().toString(36).slice(2), LOCK = OUT + '.lock';
  function lock() {
    var l = read(LOCK, null);
    if (l && l.tab !== TAB && Date.now() - l.t < 20000) return false;
    write(LOCK, { tab: TAB, t: Date.now() }); return read(LOCK, {}).tab === TAB;
  }
  function unlock() { var l = read(LOCK, null); if (l && l.tab === TAB) localStorage.removeItem(LOCK); }
  function dataToBlob(url) {
    var b = atob(url.split(',')[1]), a = new Uint8Array(b.length);
    for (var i = 0; i < b.length; i++) a[i] = b.charCodeAt(i);
    return new Blob([a], { type: 'image/jpeg' });
  }
  function run(op) {
    if (op.t === 'insert') return sb.from('orders').upsert(op.rows.map(function (o) { return { id: o.id, data: o }; }), { onConflict: 'id', ignoreDuplicates: true });
    if (op.t === 'delete') return sb.from('orders').delete().eq('id', op.id);
    if (op.t === 'rpc') return sb.rpc(op.fn, op.args);
    if (op.t === 'upload') return sb.storage.from('files').upload(op.path, dataToBlob(op.data), { contentType: 'image/jpeg', upsert: true });
    if (op.t === 'unlink') return sb.storage.from('files').remove([op.path]);
    return Promise.resolve({});
  }
  function isNetwork(err) { var m = String((err && (err.message || err)) || ''); return /fetch|network|Failed to|timeout|offline|JWT|token/i.test(m) && !/not allowed|permission|violates/i.test(m); }
  function flush() {
    if (flushing || !me) return;
    var q = read(OUT, []); if (!q.length) { badge(); if (dirty) { dirty = false; pull().catch(function () {}); } return; }
    dirty = true;
    if (!lock()) { setTimeout(flush, 5000); return; }
    flushing = true;
    var op = q[0];
    run(op).then(function (res) {
      var err = res && res.error;
      if (err && isNetwork(err)) throw err;
      write(OUT, read(OUT, []).filter(function (x) { return x.qid !== op.qid; })); write(LOCK, { tab: TAB, t: Date.now() });
      if (err) { lastError = err.message || String(err); console.error('Hyperion sync:', err); toast('Not saved in the shared base: ' + lastError); pull().catch(function () {}); }   // вернуть как в базе
      else lastError = '';
      flushing = false; badge();
      if (read(OUT, []).length) flush(); else { unlock(); flush(); }
    }).catch(function (err) {   // нет связи — попробуем позже
      flushing = false; lastError = 'offline'; badge(); unlock();
      setTimeout(flush, 15000);
    });
  }
  window.addEventListener('online', flush);
  setInterval(flush, 30000);

  // ---------- что store отдаёт в базу ----------
  JTMS.store._setHook({
    insert: function (rows) { queue({ t: 'insert', rows: rows }); },
    merge: function (id, patch) { queue({ t: 'rpc', fn: 'order_merge', args: { oid: id, patch: patch } }); },
    plan: function (id, seq, patch, top) { queue({ t: 'rpc', fn: 'order_plan', args: { oid: id, seq: String(seq), patch: patch, top: top || {} } }); },
    remove: function (id) { queue({ t: 'delete', id: id }); }
  });

  // ---------- файлы: загрузка в хранилище, ссылки на просмотр ----------
  var urls = {}, want = {}, pendingData = {}, urlTimer = null;
  function fileAdd(orderId, f, dataUrl) {
    pendingData[f.path] = dataUrl;   // показываем сразу, пока файл уходит в облако
    queue({ t: 'upload', path: f.path, data: dataUrl });
    queue({ t: 'rpc', fn: 'order_file_add', args: { oid: orderId, f: f } });
  }
  function fileRemove(orderId, f) {
    queue({ t: 'rpc', fn: 'order_file_remove', args: { oid: orderId, fid: f.id } });
    if (f.path) queue({ t: 'unlink', path: f.path });
  }
  var PIXEL = 'data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==';
  function fileUrl(path) {
    if (!path) return '';
    if (pendingData[path]) return pendingData[path];
    var u = urls[path]; if (u && u.exp > Date.now()) return u.url;
    want[path] = 1; clearTimeout(urlTimer); urlTimer = setTimeout(signUrls, 50);
    return PIXEL;
  }
  function signUrls() {
    var paths = Object.keys(want); want = {}; if (!paths.length) return;
    sb.storage.from('files').createSignedUrls(paths, 3600).then(function (res) {
      (res.data || []).forEach(function (x) { if (x.signedUrl) urls[x.path] = { url: x.signedUrl, exp: Date.now() + 50 * 60e3 }; });
      emit();
    });
  }

  // ---------- база → эта страница ----------
  function busyIds() {
    var m = {};
    read(OUT, []).forEach(function (op) {
      if (op.t === 'insert') op.rows.forEach(function (o) { m[o.id] = 1; });
      else if (op.t === 'delete') m[op.id] = 1;
      else if (op.t === 'rpc' && op.args && op.args.oid) m[op.args.oid] = 1;
    });
    return m;
  }
  function pull() {
    return sb.from('orders').select('id,data').order('updated_at', { ascending: false }).limit(3000).then(function (res) {
      if (res.error) throw res.error;
      // ордера, изменения которых ещё ждут отправки, оставляем как в этом браузере
      var busy = busyIds(), mine = {};
      read(KEY, []).forEach(function (o) { if (busy[o.id]) mine[o.id] = o; });
      var list = (res.data || []).map(function (r) { return mine[r.id] || JTMS.store.derive(r.data); });
      var ids = {}; list.forEach(function (o) { ids[o.id] = 1; });
      Object.keys(mine).forEach(function (id) { if (!ids[id]) list.unshift(mine[id]); });
      write(KEY, list);
      emit();
    });
  }
  function live() {
    sb.channel('orders-live').on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, function (p) {
      var list = read(KEY, []);
      var pid = (p.new && p.new.id) || (p.old && p.old.id);
      if (busyIds()[pid]) return;   // своё ещё не дошло — дождёмся и перечитаем
      if (p.eventType === 'DELETE') list = list.filter(function (o) { return o.id !== (p.old && p.old.id); });
      else {
        var o = p.new && p.new.data; if (!o) return; JTMS.store.derive(o);
        var i = list.findIndex(function (x) { return x.id === o.id; });
        if (i >= 0) list[i] = o; else list.unshift(o);
      }
      write(KEY, list); emit();
    }).subscribe();
  }

  // ---------- вход и роль ----------
  // need: 'office' | 'driver' | 'any'
  function guard(need) {
    return sb.auth.getSession().then(function (r) {
      var s = r.data && r.data.session;
      if (!s) { location.replace('login.html?next=' + encodeURIComponent(page() + location.hash)); return new Promise(function () {}); }
      return sb.from('profiles').select('*').eq('id', s.user.id).maybeSingle().then(function (p) {
        me = p.data || { id: s.user.id, email: s.user.email, role: 'none' };
        if (me.role === 'none') { wall('Your account is waiting for access. Ask the office to give you a role in Hyperion → Settings → Team.'); return new Promise(function () {}); }
        if (need === 'office' && me.role !== 'office') { location.replace('driver.html'); return new Promise(function () {}); }
        if (need === 'driver' && me.role === 'driver' && !me.truck) { wall('Your account has no truck yet. Ask the office to set your truck in Settings → Team.'); return new Promise(function () {}); }
        header();
        live(); flush();
        // работу могли снять с машины водителя — такие изменения до него не доходят, поэтому иногда перечитываем всё
        setInterval(function () { if (!document.hidden) pull().catch(function () {}); }, 120e3);
        document.addEventListener('visibilitychange', function () { if (!document.hidden) { pull().catch(function () {}); flush(); } });
        return pull().then(function () { return me; }, function (e) { toast('Could not load the shared base: ' + (e.message || e)); return me; });
      });
    });
  }
  function signOut() { return sb.auth.signOut().then(function () { location.replace('login.html'); }); }

  // ---------- мелочи интерфейса ----------
  function toast(m) {
    var box = document.getElementById('toasts'); if (!box) return;
    var t = document.createElement('div'); t.className = 'toast'; t.textContent = m; box.appendChild(t); setTimeout(function () { t.remove(); }, 4000);
  }
  function wall(msg) {
    document.body.innerHTML = '<div style="max-width:440px;margin:80px auto;padding:24px;font:16px/1.5 Inter,system-ui,sans-serif;color:#0B1733">' +
      '<h1 style="font-size:22px;margin:0 0 10px">Hyperion TMS</h1><p></p><p style="margin-top:16px"><button type="button" id="so" style="height:40px;padding:0 16px;border-radius:8px;border:1px solid #D5DCE8;background:#fff;font:inherit;font-weight:600">Sign out</button></p></div>';
    document.querySelector('p').textContent = msg;
    document.getElementById('so').onclick = signOut;
  }
  function header() {
    var bar = document.querySelector('.top__in'); if (!bar || document.getElementById('cloud-who')) return;
    var w = document.createElement('div'); w.id = 'cloud-who';
    w.style.cssText = 'margin-left:auto;padding-left:12px;display:flex;align-items:center;gap:10px;font-size:13px;color:var(--ink-2);white-space:nowrap;flex:none';
    w.innerHTML = '<span id="cloud-sync"></span><span class="em"></span><button type="button" class="btn" style="height:30px;padding:0 10px;border-radius:7px;font:inherit;font-weight:600;cursor:pointer">Sign out</button>';
    var em = w.querySelector('.em'); em.textContent = me.name || String(me.email || '').split('@')[0]; em.title = me.email || '';
    w.querySelector('button').onclick = signOut;
    bar.appendChild(w); badge();
  }
  function badge() {
    var el = document.getElementById('cloud-sync'); if (!el) return;
    var n = read(OUT, []).length;
    el.textContent = n ? (lastError === 'offline' ? '● offline, ' + n + ' waiting' : '● saving ' + n + '…') : '● synced';
    el.style.color = n ? (lastError === 'offline' ? '#B45309' : '#1D4ED8') : '#15803D';
  }

  return {
    on: true, client: sb, guard: guard, signOut: signOut, me: function () { return me; },
    fileAdd: fileAdd, fileRemove: fileRemove, fileUrl: fileUrl, refresh: pull,
    pending: function () { return read(OUT, []).length; }
  };
})();
