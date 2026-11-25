/* =========================================================
   Связь офиса с водителем: выдача работы на телефон и файлы ордера.
   Используют Orders, Dispatch и приложение водителя.
   ========================================================= */
window.JTMS = window.JTMS || {};

// ---------- Выдача работы: на телефоне видна версия на момент отправки (машина + время) ----------
JTMS.send = (function () {
  var TXT = { none: 'Not sent', sent: 'Sent', ack: 'Accepted', changed: 'Changed', unplanned: 'Not planned' };
  var TIP = { none: 'Not on the driver\'s phone yet', sent: 'On the driver\'s phone, not accepted yet', ack: 'Driver accepted the job',
    changed: 'Changed after sending: the phone shows the old version', unplanned: 'Plan a truck and a time first' };
  function pad(n) { return String(n).padStart(2, '0'); }
  function hm(s) { var d = new Date(s); return pad(d.getHours()) + ':' + pad(d.getMinutes()); }

  function leg(l) {
    if (!l.truck || !l.start || l.status === 'done') return l.sent ? 'ack' : 'none';
    if (!l.sent) return 'none';
    if (l.sentTruck !== l.truck || l.sentStart !== l.start) return 'changed';
    return l.ack && l.ack >= l.sent ? 'ack' : 'sent';
  }
  function state(legs) {
    var st = legs.map(leg);
    if (!st.length) return 'unplanned';
    if (st.indexOf('changed') >= 0) return 'changed';
    if (st.indexOf('none') >= 0) return st.every(function (x) { return x === 'none'; }) ? 'none' : 'changed';
    return st.indexOf('sent') >= 0 ? 'sent' : 'ack';
  }
  // Состояние ордера целиком: по открытым плечам, у которых есть машина
  function ofOrder(o) {
    var ls = JTMS.store.buildLegs(o).filter(function (l) { return l.status !== 'done'; });
    if (!ls.length) return o.status === 'done' ? 'ack' : 'unplanned';
    var planned = ls.filter(function (l) { return l.truck && l.start; });
    if (!planned.length) return 'unplanned';
    if (planned.length < ls.length) return state(planned) === 'ack' || state(planned) === 'sent' ? 'changed' : state(planned);
    return state(planned);
  }
  // Отправить открытые запланированные плечи (каждое — на свою машину). note === undefined — без смены заметки, уже отправленное не трогаем
  function job(orderId, seqs, note) {
    var o = JTMS.store.get(orderId); if (!o) return 0;
    var now = new Date().toISOString(), n = 0;
    JTMS.store.buildLegs(o).forEach(function (l) {
      if (!l.truck || !l.start || l.status === 'done' || (seqs && seqs.indexOf(l.seq) < 0)) return;
      var st = leg(l);
      if ((st === 'sent' || st === 'ack') && note === undefined) return;
      var patch = { sent: now, sentTruck: l.truck, sentStart: l.start };
      if (note !== undefined) patch.note = note;
      JTMS.store.legEvent(orderId, l.seq, 'sent', l.truck + ', ' + hm(l.start), patch); n++;
    });
    return n;
  }
  function recall(orderId) {
    var o = JTMS.store.get(orderId); if (!o) return 0;
    var n = 0;
    JTMS.store.buildLegs(o).forEach(function (l) {
      if (l.sent && l.status !== 'done') { JTMS.store.legEvent(orderId, l.seq, 'recall', l.sentTruck, { sent: '', sentTruck: '', sentStart: '', ack: '' }); n++; }
    });
    return n;
  }
  function note(o) { var l = JTMS.store.buildLegs(o).find(function (x) { return x.note; }); return l ? l.note : ''; }
  return { TXT: TXT, TIP: TIP, leg: leg, state: state, ofOrder: ofOrder, job: job, recall: recall, note: note };
})();

// ---------- Файлы ордера: CMR, чек-листы, фото — от водителя или из офиса ----------
JTMS.files = (function () {
  var TYPES = { CMR: 'CMR', CHECKLIST: 'Checklist', PIC: 'Picture' };
  var MAX = 1400, Q = 0.68;   // документ должен читаться, но помещаться в хранилище браузера
  function pad(n) { return String(n).padStart(2, '0'); }
  function uid() { return 'f' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  // Все файлы ордера, включая старые фото из плана (до появления типов — это PIC)
  function list(o) {
    var out = (o.files || []).slice();
    Object.keys(o.plan || {}).forEach(function (seq) {
      (o.plan[seq].photos || []).forEach(function (src, i) {
        out.push({ id: 'old' + seq + '_' + i, type: 'PIC', data: src, seq: +seq, t: o.updated_at || o.created_at, by: 'driver', truck: o.plan[seq].truck || '', legacy: true });
      });
    });
    out.sort(function (a, b) { return a.t < b.t ? -1 : 1; });
    // подпись: тип + номер по порядку внутри типа
    var cnt = {};
    out.forEach(function (f) { cnt[f.type] = (cnt[f.type] || 0) + 1; f.n = cnt[f.type]; f.name = name(o, f); });
    return out;
  }
  function name(o, f) {
    var d = new Date(f.t);
    return f.type + '_' + (o.container_no || o.file_nr || o.booking || 'order') + '_' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '-' + pad(d.getHours()) + pad(d.getMinutes()) + '_' + pad(f.n) + '.jpg';
  }
  function who(f) {
    if (f.by === 'office') return 'Office';
    var t = JTMS.ref.trucks.find(function (x) { return x.fleet === f.truck; });
    return (t && t.driver ? t.driver + ' · ' : '') + (f.truck || 'Driver');
  }
  // Сжать картинку из input[type=file] → dataURL JPEG
  function read(file) {
    return new Promise(function (res, rej) {
      if (!file || !/^image\//.test(file.type)) { rej(new Error('Choose a photo or a scanned image (JPG, PNG)')); return; }
      var rd = new FileReader(), img = new Image();
      rd.onerror = function () { rej(new Error('Could not read the file')); };
      rd.onload = function () { img.src = rd.result; };
      img.onerror = function () { rej(new Error('This image format is not supported')); };
      img.onload = function () {
        var k = Math.min(1, MAX / Math.max(img.width, img.height)), c = document.createElement('canvas');
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        var g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
        res(c.toDataURL('image/jpeg', Q));
      };
      rd.readAsDataURL(file);
    });
  }
  // Добавить файл к ордеру; meta: { type, seq, truck, by: 'driver'|'office' }
  function add(orderId, file, meta) {
    return read(file).then(function (data) {
      var o = JTMS.store.get(orderId); if (!o) throw new Error('Order not found');
      var f = Object.assign({ id: uid(), t: new Date().toISOString(), data: data, orig: file.name || '' }, meta);
      try { JTMS.store.update(orderId, { files: (o.files || []).concat([f]) }); }
      catch (e) { throw new Error('Not enough space in this browser for more files. Delete old ones, or wait for the server version.'); }
      if (f.seq && meta.by === 'driver') { try { JTMS.store.legEvent(orderId, f.seq, 'photo', TYPES[f.type] || f.type); } catch (e) {} }
      return f;
    });
  }
  function remove(orderId, fileId) {
    var o = JTMS.store.get(orderId); if (!o) return;
    if (/^old/.test(fileId)) {   // старое фото из плана
      var m = /^old(\d+)_(\d+)$/.exec(fileId), plan = Object.assign({}, o.plan);
      plan[m[1]] = Object.assign({}, plan[m[1]], { photos: (plan[m[1]].photos || []).filter(function (x, i) { return i !== +m[2]; }) });
      JTMS.store.update(orderId, { plan: plan }); return;
    }
    JTMS.store.update(orderId, { files: (o.files || []).filter(function (f) { return f.id !== fileId; }) });
  }
  return { TYPES: TYPES, list: list, who: who, add: add, remove: remove };
})();
