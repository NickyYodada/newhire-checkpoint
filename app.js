/* app.js — 你的應用程式邏輯（擴充區，可自由修改；靜態畫面結構寫在 index.html 的 #appRoot 內）
 *
 * 契約：window.App = { mount(root, ctx) }，只透過 ctx 取得資料與使用者。
 *   ctx.session   { uid, key, name, role, email }；公開且未登入時為 null
 *   ctx.canWrite  是否顯示編輯功能（僅為 UI 提示；真正的權限由 rules 強制）
 *   ctx.Sync      資料層（見下），動態資料一律存在資料庫，不可寫死在 HTML 或 JS 裡
 *   ctx.cfg       APP_CONFIG（唯讀）
 *
 * ctx.Sync：
 *   newId()                      產生新的記錄 id
 *   list(col)                    讀一次，回傳 { id: record }
 *   save(col, id, rec)           新增或「合併更新」單筆；欄位設為 null 代表刪除該欄位
 *   remove(col, id)              刪除單筆
 *   subscribe(col, handlers)     handlers = { onChange(map), onError(err), onStatus(s) }
 *                                回傳 { refresh(), stop() }
 *     onChange(map)：資料載入後、遠端變更時、自己寫入成功後都會呼叫，map 為完整的 { id: record }。
 *                    它可能在任何時候到達，重繪時不要打斷使用者正在編輯的欄位。
 *     onStatus(s)：loading | live | offline | denied | auth（以它顯示連線狀態為主）
 *     onError(err)：載入或連線失敗時呼叫；暫時性斷線只會改變 status，不一定呼叫 onError
 *   錯誤物件的 err.kind：network | auth | denied | http
 *   資料形狀：欄位值用字串、數字、布林；清單請用「id → 物件」的 map，不要用陣列或空物件
 *            （RTDB 會改變它們的形狀）。欄位名稱不可含 . $ # [ ] /
 */
(function () {
  'use strict';
  var COL = 'notes';

  function h(tag, props) {
    var e = document.createElement(tag);
    Object.keys(props || {}).forEach(function (k) {
      if (k === 'text') e.textContent = props[k];
      else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), props[k]);
      else e.setAttribute(k, props[k]);
    });
    for (var i = 2; i < arguments.length; i++) {
      var c = arguments[i];
      if (c != null) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    }
    return e;
  }

  window.App = {
    mount: function (root, ctx) {
      var $ = function (id) { return root.querySelector('#' + id); };
      var sync = ctx.Sync;
      var realtime = sync.mode === 'realtime-sse';
      var STATUS = {
        loading: '載入中…',
        live: realtime ? '即時同步中' : '已載入',
        offline: '離線，重新連線中…',
        denied: '沒有權限讀取資料',
        auth: '登入已失效，請重新整理頁面'
      };
      var latest = {};
      var editing = false;

      var statusEl = $('statusText');
      var errEl = $('errBox');
      var list = $('noteList');
      var addForm = $('addForm');
      var noteInput = $('noteInput');
      var refreshBtn = $('refreshBtn');

      function showErr(e) {
        errEl.hidden = false;
        errEl.textContent = e && e.kind === 'denied' ? '沒有權限執行這個動作（角色不足或存取已被撤銷）' : (e && e.message) || String(e);
      }
      function run(promise) {
        errEl.hidden = true;
        promise.catch(showErr);
      }

      function render() {
        if (editing) return;
        list.textContent = '';
        var ids = Object.keys(latest).sort(function (a, b) { return (latest[b].createdAt || 0) - (latest[a].createdAt || 0); });
        if (!ids.length) {
          list.appendChild(h('li', { class: 'list-row text-base-content/60', text: '還沒有資料' }));
          return;
        }
        ids.forEach(function (id) {
          list.appendChild(row(id, latest[id]));
        });
      }

      function row(id, rec) {
        var text = h('div', { class: 'font-medium', text: rec.text || '' });
        var body = h('div', { class: 'list-col-grow min-w-0' }, text);
        if (rec.by) body.appendChild(h('div', { class: 'text-xs text-base-content/60 mt-0.5', text: rec.by }));
        var item = h('li', { class: 'list-row items-center' }, body);
        if (ctx.canWrite) {
          text.className = 'font-medium editable';
          text.addEventListener('click', function () { startEdit(id, rec, body, text); });
          item.appendChild(h('button', { type: 'button', class: 'btn btn-ghost btn-sm btn-square text-base-content/70 hover:text-error', 'aria-label': '刪除', title: '刪除', onclick: function () { run(sync.remove(COL, id)); } },
            h('i', { class: 'fa-regular fa-trash-can', 'aria-hidden': 'true' })));
        }
        return item;
      }

      function startEdit(id, rec, container, textEl) {
        editing = true;
        var input = h('input', { type: 'text', class: 'input input-sm w-full', value: rec.text || '' });
        container.replaceChild(input, textEl);
        input.focus();
        var done = false;
        function finish(save) {
          if (done) return;
          done = true;
          editing = false;
          var v = input.value.trim().slice(0, 500);
          if (save && v && v !== rec.text) run(sync.save(COL, id, { text: v }));
          render();
        }
        input.addEventListener('blur', function () { finish(true); });
        input.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') finish(true);
          else if (e.key === 'Escape') finish(false);
        });
      }

      if (ctx.canWrite) {
        addForm.hidden = false;
        addForm.addEventListener('submit', function (e) {
          e.preventDefault();
          var v = noteInput.value.trim().slice(0, 500);
          if (!v) return;
          noteInput.value = '';
          run(sync.save(COL, sync.newId(), { text: v, createdAt: Date.now(), by: ctx.session ? ctx.session.name : null }));
        });
      }

      refreshBtn.addEventListener('click', function () { sub.refresh(); });

      var sub = sync.subscribe(COL, {
        onChange: function (map) { latest = map; render(); },
        onError: showErr,
        onStatus: function (s) { statusEl.textContent = STATUS[s] || s; }
      });
    }
  };
})();
