/* theme.js 【鎖定檔，禁止修改】：套用 DaisyUI 主題（深淺色＋16 套配色）、提供頁首外觀設定按鈕，並依 config.js 負責登入、管理面板與啟動流程。 */
(function () {
  'use strict';
  var cfg = window.APP_CONFIG;
  var KEY = 'mws:' + cfg.appId + ':ui:appearance';
  var LIGHT_THEMES = [
    ['light', '預設亮色', '#570df8'], ['cupcake', '粉彩圓潤', '#65c3c8'], ['emerald', '翡翠綠', '#66cc8a'], ['winter', '冬日藍', '#047aff'],
    ['nord', '北歐藍', '#5e81ac'], ['pastel', '柔和紫', '#d1c1d7'], ['fantasy', '幻想紫', '#6e0b75'], ['valentine', '玫瑰粉', '#e96d7b'],
    ['garden', '花園綠', '#5c7f67'], ['autumn', '秋楓紅', '#8c0327'], ['corporate', '商務藍', '#4b6bfb'], ['lofi', '極簡黑白', '#0d0d0d']
  ];
  var DARK_THEMES = [
    ['dark', '預設深色', '#793ef9'], ['night', '夜幕藍', '#38bdf8'], ['dracula', '德古拉紫', '#ff79c6'], ['sunset', '日落橘', '#ff865b'],
    ['dim', '柔和深灰', '#9fe88d'], ['business', '商務深色', '#1c4ed8'], ['forest', '森林綠', '#1eb854'], ['coffee', '咖啡棕', '#db924b']
  ];
  var ALL_THEMES = LIGHT_THEMES.concat(DARK_THEMES);
  var DARK_SET = new Set(DARK_THEMES.map(function (t) { return t[0]; }));

  var sysDark = matchMedia('(prefers-color-scheme: dark)').matches;
  var pref = { theme: sysDark ? 'dark' : 'light', lastLight: 'light', lastDark: 'dark' };
  try {
    var saved = JSON.parse(localStorage.getItem(KEY));
    if (saved && ALL_THEMES.some(function (t) { return t[0] === saved.theme; })) Object.assign(pref, saved);
  } catch (e) { /* 沒有偏好就用預設 */ }

  function applyTheme(name) {
    pref.theme = name;
    if (DARK_SET.has(name)) pref.lastDark = name; else pref.lastLight = name;
    document.documentElement.setAttribute('data-theme', name);
    try { localStorage.setItem(KEY, JSON.stringify(pref)); } catch (e) { /* 儲存被停用時略過 */ }
  }
  applyTheme(pref.theme);

  function h(tag, props) {
    var e = document.createElement(tag);
    Object.keys(props || {}).forEach(function (k) {
      if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), props[k]); else if (k === 'text') e.textContent = props[k]; else e.setAttribute(k, props[k]);
    });
    for (var i = 2; i < arguments.length; i++) if (arguments[i] != null) e.appendChild(typeof arguments[i] === 'string' ? document.createTextNode(arguments[i]) : arguments[i]);
    return e;
  }
  function icon(name) { return h('i', { class: 'fa-solid fa-' + name, 'aria-hidden': 'true' }); }

  function loadScripts(list) {
    return list.reduce(function (chain, src) {
      return chain.then(function () {
        return new Promise(function (resolve, reject) {
          var s = document.createElement('script');
          s.src = src;
          s.onload = resolve;
          s.onerror = function () { reject(new Error('無法載入 ' + src)); };
          document.body.appendChild(s);
        });
      });
    }, Promise.resolve());
  }

  // 本機模式：以 localStorage 實作與雲端完全相同的 Sync 契約
  function makeLocalSync() {
    var DATA_KEY = 'mws:' + cfg.appId + ':data';
    var KEY_RE = /^[^.$#\[\]\/\u0000-\u001f\u007f]{1,128}$/;
    var clone = function (o) { return JSON.parse(JSON.stringify(o)); };
    var call = function (fn, arg) { try { if (fn) fn(arg); } catch (e) { console.error(e); } };
    function checkKey(k, what) {
      if (typeof k !== 'string' || !KEY_RE.test(k)) {
        throw new Error(what + ' 不合法（不可含 . $ # [ ] / 或控制字元，長度 1–128）：' + k);
      }
    }
    function storageError(cause) {
      var err = new Error('儲存失敗（瀏覽器的儲存空間已滿或被停用）');
      err.kind = 'storage';
      err.cause = cause;
      return err;
    }
    function read() {
      var raw;
      try { raw = localStorage.getItem(DATA_KEY); } catch (e) { throw storageError(e); }
      try {
        var v = JSON.parse(raw || '{}');
        return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
      } catch (e) { return {}; }
    }
    function write(db) {
      try { localStorage.setItem(DATA_KEY, JSON.stringify(db)); } catch (e) { throw storageError(e); }
    }
    var subs = {};
    function deliver(col, h) {
      var map;
      try { map = clone(read()[col] || {}); } catch (e) { call(h.onStatus, 'offline'); call(h.onError, e); return; }
      call(h.onStatus, 'live');
      call(h.onChange, map);
    }
    function emit(col) {
      if (subs[col]) Array.from(subs[col]).forEach(function (h) { deliver(col, h); });
    }
    window.addEventListener('storage', function (e) {
      if (e.key === DATA_KEY || e.key === null) Object.keys(subs).forEach(emit);
    });
    read();
    return {
      mode: 'local',
      newId: function () { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); },
      list: async function (col) {
        checkKey(col, 'collection');
        return clone(read()[col] || {});
      },
      save: async function (col, id, rec) {
        checkKey(col, 'collection');
        checkKey(id, 'id');
        if (!rec || typeof rec !== 'object' || Array.isArray(rec)) throw new Error('record 必須是物件');
        Object.keys(rec).forEach(function (k) { checkKey(k, '欄位名稱'); });
        var db = read();
        var map = db[col] || (db[col] = {});
        var next = Object.assign({}, map[id] || {});
        var sent = clone(rec);
        Object.keys(sent).forEach(function (k) { if (sent[k] === null) delete next[k]; else next[k] = sent[k]; });
        if (Object.keys(next).length) map[id] = next; else delete map[id];
        if (!Object.keys(map).length) delete db[col];
        write(db);
        emit(col);
      },
      remove: async function (col, id) {
        checkKey(col, 'collection');
        checkKey(id, 'id');
        var db = read();
        if (db[col] && db[col][id] !== undefined) {
          delete db[col][id];
          if (!Object.keys(db[col]).length) delete db[col];
          write(db);
        }
        emit(col);
      },
      subscribe: function (col, h) {
        checkKey(col, 'collection');
        h = h || {};
        (subs[col] || (subs[col] = new Set())).add(h);
        Promise.resolve().then(function () { if (subs[col] && subs[col].has(h)) deliver(col, h); });
        return {
          refresh: function () { return Promise.resolve().then(function () { if (subs[col] && subs[col].has(h)) deliver(col, h); }); },
          stop: function () { if (subs[col]) subs[col].delete(h); }
        };
      }
    };
  }

  document.addEventListener('DOMContentLoaded', function () {
    var $ = function (id) { return document.getElementById(id); };
    document.title = cfg.appName;
    if ($('brand')) $('brand').textContent = cfg.appName;

    var buttons = [];
    function paint() {
      buttons.forEach(function (b) {
        var active = b.dataset.themeChoice === pref.theme;
        b.setAttribute('aria-pressed', String(active));
        b.className = 'btn btn-sm justify-start gap-2 ' + (active ? 'btn-primary' : '');
      });
    }
    function makeGrid(list) {
      var g = h('div', { class: 'grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2 mb-4' });
      list.forEach(function (t) {
        var dot = h('span', { class: 'inline-block w-3 h-3 rounded-full shrink-0', style: 'background:' + t[2] });
        var b = h('button', { type: 'button', 'data-theme-choice': t[0], onclick: function () { applyTheme(t[0]); paint(); } }, dot, t[1]);
        buttons.push(b);
        g.appendChild(b);
      });
      return g;
    }

    var modeBtn = h('button', { type: 'button', class: 'btn btn-ghost btn-sm btn-square', 'aria-label': '切換深色／淺色', title: '切換深色／淺色', onclick: function () {
      applyTheme(DARK_SET.has(pref.theme) ? pref.lastLight : pref.lastDark);
      paint();
    } }, icon('circle-half-stroke'));
    var gearBtn = h('button', { type: 'button', class: 'btn btn-ghost btn-sm btn-square', 'aria-label': '外觀設定', title: '外觀設定', onclick: function () { dialog.showModal(); } }, icon('gear'));

    var dialog = h('dialog', { class: 'modal' },
      h('div', { class: 'modal-box max-w-lg' },
        h('h3', { class: 'text-lg font-semibold flex items-center gap-2 mb-3' }, icon('palette'), '外觀設定'),
        h('div', { class: 'text-xs font-medium text-base-content/70' }, '淺色主題'),
        makeGrid(LIGHT_THEMES),
        h('div', { class: 'text-xs font-medium text-base-content/70' }, '深色主題'),
        makeGrid(DARK_THEMES),
        h('div', { class: 'modal-action' }, h('button', { type: 'button', class: 'btn btn-ghost', text: '關閉', onclick: function () { dialog.close(); } }))),
      h('form', { method: 'dialog', class: 'modal-backdrop' }, h('button', { 'aria-label': '關閉', text: '關閉' })));
    paint();

    var bar = $('mwsTheme');
    if (bar) { bar.appendChild(modeBtn); bar.appendChild(gearBtn); }
    document.body.appendChild(dialog);

    var appRoot = $('appRoot');
    if (cfg.syncMode === 'local') {
      var localbar = $('localbar'), fatalBox = $('fatal');
      function localFatal(err) {
        if (appRoot) appRoot.hidden = true;
        if (localbar) localbar.hidden = true;
        if (fatalBox) { fatalBox.hidden = false; fatalBox.textContent = '發生錯誤：' + (err && err.message ? err.message : err); }
      }
      try { window.Sync = makeLocalSync(); } catch (e) { localFatal(e); return; }
      loadScripts(cfg.scripts).then(function () {
        if (localbar) localbar.hidden = false;
        window.App.mount(appRoot, {
          session: { uid: 'local', key: null, name: '本機使用者', role: 'admin', email: null },
          Sync: window.Sync, cfg: cfg, canWrite: true
        });
      }).catch(localFatal);
      return;
    }

    var ROLE_LABEL = { admin: '管理員', editor: '編輯者', viewer: '檢視者' };
    var gate = $('gate'), gateMsg = $('gateMsg'), gateClose = $('gateClose'), authRoot = $('authRoot');
    var userbar = $('userbar'), adminOverlay = $('adminOverlay'), adminRoot = $('adminRoot');
    var adminMounted = false;

    if (gateClose) gateClose.addEventListener('click', function () { gate.hidden = true; appRoot.hidden = false; });
    if ($('adminClose')) $('adminClose').addEventListener('click', function () { adminOverlay.close(); });

    function fatal(err) {
      gate.hidden = false;
      appRoot.hidden = true;
      gateMsg.textContent = err && err.kind === 'network' ? '無法連線，請檢查網路後重試。' : '發生錯誤：' + (err && err.message ? err.message : err);
      authRoot.textContent = '';
      authRoot.appendChild(h('button', { type: 'button', class: 'btn btn-primary', text: '重試', onclick: function () { location.reload(); } }));
    }

    function showLogin(closable) {
      var Auth = window.Auth;
      gateMsg.textContent = Auth.notice || '請先登入';
      gate.hidden = false;
      appRoot.hidden = true;
      gateClose.hidden = !closable;
      authRoot.textContent = '';
      Auth.render(authRoot, function () { location.reload(); });
    }

    function renderUserbar(session, ctx) {
      userbar.textContent = '';
      userbar.hidden = false;
      var Auth = window.Auth;
      if (session) {
        userbar.appendChild(h('span', { class: 'text-sm text-base-content/70', text: session.name + '（' + (ROLE_LABEL[session.role] || session.role) + '）' }));
        if (session.role === 'admin' && window.Admin) {
          userbar.appendChild(h('button', { type: 'button', class: 'btn btn-ghost btn-sm', text: '管理', onclick: function () {
            if (!adminMounted) { adminMounted = true; window.Admin.mount(adminRoot, ctx); }
            adminOverlay.showModal();
          } }));
        }
        userbar.appendChild(h('button', { type: 'button', class: 'btn btn-ghost btn-sm', text: '登出', onclick: function () {
          Promise.resolve(Auth.signOut()).then(function () { location.reload(); });
        } }));
      } else {
        if (Auth.notice) userbar.appendChild(h('span', { class: 'text-sm text-error', text: Auth.notice }));
        userbar.appendChild(h('button', { type: 'button', class: 'btn btn-ghost btn-sm', text: '登入', onclick: function () { showLogin(true); } }));
      }
    }

    function start(session) {
      var hasAuth = cfg.authMode !== 'none';
      var role = session ? session.role : null;
      var ctx = {
        session: session, Sync: window.Sync, cfg: cfg,
        canWrite: hasAuth ? (role === 'admin' || role === 'editor') : !!cfg.publicWrite
      };
      gate.hidden = true;
      appRoot.hidden = false;
      if (hasAuth) renderUserbar(session, ctx);
      window.App.mount(appRoot, ctx);
    }

    loadScripts(cfg.scripts).then(function () {
      if (cfg.authMode === 'none') return start(null);
      return window.Auth.init().then(function (session) {
        if (!session && !cfg.publicRead) return showLogin(false);
        start(session);
      });
    }).catch(fatal);
  });
})();
