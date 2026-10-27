/* app.js — 你的應用程式邏輯（擴充區，可自由修改；靜態畫面結構寫在 index.html 的 #appRoot 內）
 *
 * 契約：window.App = { mount(root, ctx) }，只透過 ctx 取得資料與使用者。
 */
(function () {
  'use strict';

  var COL_HIRES = 'hires';
  var COL_TASKS = 'tasks';
  var COL_REVIEWS = 'reviews';
  var UI_PREF_HIRE = 'mws:newhire-checkpoint-app:ui:selectedHire';

  var EVAL_META = {
    on_track: { label: '符合預期 (On Track)', badge: 'badge-success', icon: 'fa-circle-check' },
    ahead: { label: '進度超前 (Ahead)', badge: 'badge-info', icon: 'fa-rocket' },
    attention: { label: '需加強關注 (Needs Attention)', badge: 'badge-warning', icon: 'fa-triangle-exclamation' },
    behind: { label: '進度落後 (Behind)', badge: 'badge-error', icon: 'fa-circle-exclamation' }
  };

  var TASK_STATUS_META = {
    todo: { label: '未開始', badge: 'badge-ghost', next: 'in_progress' },
    in_progress: { label: '進行中', badge: 'badge-warning badge-soft', next: 'done' },
    done: { label: '已完成', badge: 'badge-success badge-soft', next: 'todo' }
  };

  function h(tag, props) {
    var e = document.createElement(tag);
    Object.keys(props || {}).forEach(function (k) {
      if (k === 'text') e.textContent = props[k];
      else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), props[k]);
      else if (props[k] != null) e.setAttribute(k, props[k]);
    });
    for (var i = 2; i < arguments.length; i++) {
      var c = arguments[i];
      if (c != null) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    }
    return e;
  }

  function safeUrl(raw) {
    if (!raw) return null;
    try {
      var u = new URL(String(raw).trim());
      if (u.protocol === 'http:' || u.protocol === 'https:') return u.href;
    } catch (_) {}
    return null;
  }

  window.App = {
    mount: function (root, ctx) {
      var $ = function (id) { return root.querySelector('#' + id); };
      var sync = ctx.Sync;
      var canWrite = !!ctx.canWrite;

      var STATUS_LABELS = {
        loading: '載入中…',
        live: '已同步',
        offline: '離線，重連中…',
        denied: '無讀取權限',
        auth: '登入已失效'
      };

      var hiresMap = {};
      var tasksMap = {};
      var reviewsMap = {};

      var selectedHireId = '';
      try {
        selectedHireId = localStorage.getItem(UI_PREF_HIRE) || '';
      } catch (_) {}

      var selectedWeek = 1;
      var maxCustomWeek = 4;
      var editingHireId = null;
      var editingTaskId = null;
      var isEditingReview = false;

      var statusEl = $('statusText');
      var errEl = $('errBox');
      var refreshBtn = $('refreshBtn');
      var addHireBtn = $('addHireBtn');
      var hireSelect = $('hireSelect');
      var hireActions = $('hireActions');
      var editHireBtn = $('editHireBtn');
      var deleteHireBtn = $('deleteHireBtn');
      var hireSummary = $('hireSummary');
      var emptyHireState = $('emptyHireState');
      var workspace = $('workspace');

      var infoHireName = $('infoHireName');
      var infoHireRole = $('infoHireRole');
      var infoMentor = $('infoMentor');
      var infoStartDate = $('infoStartDate');
      var infoTaskRate = $('infoTaskRate');
      var infoTaskCount = $('infoTaskCount');
      var infoLatestEval = $('infoLatestEval');
      var infoLatestWeek = $('infoLatestWeek');

      var weekTabs = $('weekTabs');
      var addWeekBtn = $('addWeekBtn');
      var addTaskBtn = $('addTaskBtn');
      var weekTaskTitle = $('weekTaskTitle');
      var weekProgressBadge = $('weekProgressBadge');
      var taskList = $('taskList');

      var weekReviewTitle = $('weekReviewTitle');
      var reviewCurrentBadge = $('reviewCurrentBadge');
      var editReviewBtn = $('editReviewBtn');
      var reviewDisplay = $('reviewDisplay');
      var reviewForm = $('reviewForm');
      var reviewStatusInput = $('reviewStatusInput');
      var reviewMentorInput = $('reviewMentorInput');
      var reviewCommentInput = $('reviewCommentInput');
      var reviewSummaryInput = $('reviewSummaryInput');
      var cancelReviewBtn = $('cancelReviewBtn');

      var hireModal = $('hireModal');
      var hireModalTitle = $('hireModalTitle');
      var hireForm = $('hireForm');
      var hireNameInput = $('hireNameInput');
      var hireMentorInput = $('hireMentorInput');
      var hireRoleInput = $('hireRoleInput');
      var hireDateInput = $('hireDateInput');
      var hireModalCancel = $('hireModalCancel');

      var taskModal = $('taskModal');
      var taskModalTitle = $('taskModalTitle');
      var taskForm = $('taskForm');
      var taskWeekInput = $('taskWeekInput');
      var taskStatusInput = $('taskStatusInput');
      var taskTitleInput = $('taskTitleInput');
      var taskResourceInput = $('taskResourceInput');
      var taskNoteInput = $('taskNoteInput');
      var taskModalCancel = $('taskModalCancel');

      function showErr(e) {
        errEl.hidden = false;
        errEl.textContent = e && e.kind === 'denied'
          ? '沒有權限執行這個動作（角色不足或存取已被撤銷）'
          : (e && e.message) || String(e);
      }

      function run(promise) {
        errEl.hidden = true;
        return promise.catch(showErr);
      }

      function saveSelectedHirePref(id) {
        try {
          if (id) localStorage.setItem(UI_PREF_HIRE, id);
          else localStorage.removeItem(UI_PREF_HIRE);
        } catch (_) {}
      }

      function getSortedHireIds() {
        return Object.keys(hiresMap).sort(function (a, b) {
          return (hiresMap[a].createdAt || 0) - (hiresMap[b].createdAt || 0);
        });
      }

      function getHireTasks(hireId) {
        var list = [];
        Object.keys(tasksMap).forEach(function (id) {
          var t = tasksMap[id];
          if (t && t.hireId === hireId) {
            list.push({ id: id, data: t });
          }
        });
        list.sort(function (a, b) {
          return (a.data.createdAt || 0) - (b.data.createdAt || 0);
        });
        return list;
      }

      function getHireReviews(hireId) {
        var mapByWeek = {};
        Object.keys(reviewsMap).forEach(function (id) {
          var r = reviewsMap[id];
          if (r && r.hireId === hireId && r.week) {
            mapByWeek[Number(r.week)] = { id: id, data: r };
          }
        });
        return mapByWeek;
      }

      function getMaxWeekForHire(hireId) {
        var m = maxCustomWeek;
        var hire = hiresMap[hireId];
        if (hire && hire.maxWeek && Number(hire.maxWeek) > m) {
          m = Number(hire.maxWeek);
        }
        getHireTasks(hireId).forEach(function (item) {
          var w = Number(item.data.week) || 1;
          if (w > m) m = w;
        });
        var revs = getHireReviews(hireId);
        Object.keys(revs).forEach(function (w) {
          var wn = Number(w) || 1;
          if (wn > m) m = wn;
        });
        return m;
      }

      function makeEvalBadge(statusKey) {
        var meta = EVAL_META[statusKey] || EVAL_META.on_track;
        return h('span', { class: 'badge badge-sm gap-1 ' + meta.badge },
          h('i', { class: 'fa-solid ' + meta.icon, 'aria-hidden': 'true' }),
          meta.label
        );
      }

      function renderAll() {
        var hireIds = getSortedHireIds();
        if (!selectedHireId || !hiresMap[selectedHireId]) {
          selectedHireId = hireIds[0] || '';
          saveSelectedHirePref(selectedHireId);
        }

        // 渲染新人下拉選單
        hireSelect.textContent = '';
        if (!hireIds.length) {
          hireSelect.appendChild(h('option', { value: '', text: '尚無新人資料' }));
          hireSelect.disabled = true;
          hireActions.hidden = true;
          hireSummary.hidden = true;
          emptyHireState.hidden = false;
          workspace.hidden = true;
          return;
        }

        hireSelect.disabled = false;
        emptyHireState.hidden = true;
        workspace.hidden = false;
        hireSummary.hidden = false;
        hireActions.hidden = !canWrite;

        hireIds.forEach(function (id) {
          var hr = hiresMap[id];
          var label = (hr.name || '未命名') + (hr.mentor ? '（Mentor: ' + hr.mentor + '）' : '');
          var opt = h('option', { value: id, text: label });
          if (id === selectedHireId) opt.selected = true;
          hireSelect.appendChild(opt);
        });

        var currentHire = hiresMap[selectedHireId];
        var allTasks = getHireTasks(selectedHireId);
        var reviewsByWeek = getHireReviews(selectedHireId);

        // 統計資訊
        infoHireName.textContent = currentHire.name || '-';
        infoHireRole.textContent = currentHire.roleTitle || '未填寫部門職稱';
        infoMentor.textContent = currentHire.mentor || '-';
        infoStartDate.textContent = currentHire.startDate ? '到職日：' + currentHire.startDate : '未設定到職日';

        var totalCount = allTasks.length;
        var doneCount = allTasks.filter(function (t) { return t.data.status === 'done'; }).length;
        var rate = totalCount ? Math.round((doneCount / totalCount) * 100) : 0;
        infoTaskRate.textContent = rate + '%';
        infoTaskCount.textContent = doneCount + ' / ' + totalCount + ' 項完成';

        var reviewedWeeks = Object.keys(reviewsByWeek).map(Number).sort(function (a, b) { return b - a; });
        infoLatestEval.textContent = '';
        if (reviewedWeeks.length > 0) {
          var latestW = reviewedWeeks[0];
          var latestRev = reviewsByWeek[latestW].data;
          infoLatestEval.appendChild(makeEvalBadge(latestRev.status));
          infoLatestWeek.textContent = 'Week ' + latestW + (latestRev.updatedBy ? ' · ' + latestRev.updatedBy : '');
        } else {
          infoLatestEval.textContent = '尚未評估';
          infoLatestWeek.textContent = '尚無評估紀錄';
        }

        // 渲染週次 Tabs
        var totalWeeks = getMaxWeekForHire(selectedHireId);
        if (selectedWeek > totalWeeks) selectedWeek = totalWeeks;
        if (selectedWeek < 1) selectedWeek = 1;

        weekTabs.textContent = '';
        for (var w = 1; w <= totalWeeks; w++) {
          (function (wk) {
            var wkRev = reviewsByWeek[wk];
            var wkTasks = allTasks.filter(function (t) { return Number(t.data.week) === wk; });
            var wkDone = wkTasks.filter(function (t) { return t.data.status === 'done'; }).length;

            var btnClass = 'tab gap-1.5 ' + (wk === selectedWeek ? 'tab-active font-semibold' : '');
            var tabBtn = h('button', {
              type: 'button',
              role: 'tab',
              class: btnClass,
              onclick: function () {
                if (selectedWeek !== wk) {
                  selectedWeek = wk;
                  isEditingReview = false;
                  renderAll();
                }
              }
            }, 'Week ' + wk);

            if (wkRev && EVAL_META[wkRev.data.status]) {
              var dotIcon = EVAL_META[wkRev.data.status].icon;
              tabBtn.appendChild(h('i', { class: 'fa-solid ' + dotIcon + ' text-xs', 'aria-hidden': 'true' }));
            } else if (wkTasks.length > 0) {
              tabBtn.appendChild(h('span', { class: 'text-xs opacity-70', text: '(' + wkDone + '/' + wkTasks.length + ')' }));
            }
            weekTabs.appendChild(tabBtn);
          })(w);
        }

        // 渲染本週讀書任務
        renderWeekTasks(allTasks);

        // 渲染本週 Mentor 評估（若正在編輯表單則不打斷）
        if (!isEditingReview) {
          renderWeekReview(reviewsByWeek[selectedWeek], currentHire);
        }
      }

      function renderWeekTasks(allTasks) {
        var weekTasks = allTasks.filter(function (t) { return Number(t.data.week) === selectedWeek; });
        var doneTasks = weekTasks.filter(function (t) { return t.data.status === 'done'; });

        weekTaskTitle.textContent = '';
        weekTaskTitle.appendChild(h('i', { class: 'fa-solid fa-list-check text-primary', 'aria-hidden': 'true' }));
        weekTaskTitle.appendChild(h('span', { text: 'Week ' + selectedWeek + ' 讀書計畫清單' }));
        weekProgressBadge.textContent = doneTasks.length + ' / ' + weekTasks.length + ' 完成';

        taskList.textContent = '';
        if (!weekTasks.length) {
          taskList.appendChild(
            h('div', { class: 'text-sm text-base-content/60 py-6 text-center bg-base-200/40 rounded-box' },
              '本週（Week ' + selectedWeek + '）尚未安排讀書任務。' + (canWrite ? '點選右上角「新增本週讀書任務」開始新增！' : '')
            )
          );
          return;
        }

        weekTasks.forEach(function (item) {
          var id = item.id;
          var t = item.data;
          var stMeta = TASK_STATUS_META[t.status] || TASK_STATUS_META.todo;

          var statusBadge = h('button', {
            type: 'button',
            class: 'badge badge-sm ' + stMeta.badge + (canWrite ? ' cursor-pointer hover:opacity-80' : ''),
            title: canWrite ? '點擊快速切換進度狀態' : '',
            onclick: function () {
              if (!canWrite) return;
              run(sync.save(COL_TASKS, id, { status: stMeta.next, updatedAt: Date.now() }));
            }
          }, stMeta.label);

          var titleText = h('span', {
            class: 'font-medium text-sm ' + (t.status === 'done' ? 'line-through text-base-content/60' : ''),
            text: t.title || '未命名主題'
          });

          var headerRow = h('div', { class: 'flex items-center gap-2 flex-wrap' }, statusBadge, titleText);

          var validHref = safeUrl(t.resourceUrl);
          if (validHref) {
            headerRow.appendChild(
              h('a', {
                href: validHref,
                target: '_blank',
                rel: 'noopener noreferrer',
                class: 'link link-primary text-xs inline-flex items-center gap-1'
              },
                h('i', { class: 'fa-solid fa-arrow-up-right-from-square', 'aria-hidden': 'true' }),
                '開啟教材'
              )
            );
          }

          var leftCol = h('div', { class: 'flex-1 min-w-0 space-y-1' }, headerRow);
          if (t.traineeNote) {
            leftCol.appendChild(h('p', { class: 'text-xs text-base-content/75 whitespace-pre-wrap pl-1', text: t.traineeNote }));
          }

          var cardRow = h('div', { class: 'flex items-start justify-between gap-2 p-3 rounded-box bg-base-200/50 border border-base-200' }, leftCol);

          if (canWrite) {
            var actions = h('div', { class: 'flex items-center gap-1 shrink-0' },
              h('button', {
                type: 'button',
                class: 'btn btn-ghost btn-xs btn-square',
                'aria-label': '編輯任務',
                title: '編輯任務',
                onclick: function () { openTaskModal(id, t); }
              }, h('i', { class: 'fa-regular fa-pen-to-square', 'aria-hidden': 'true' })),
              h('button', {
                type: 'button',
                class: 'btn btn-ghost btn-xs btn-square text-base-content/70 hover:text-error',
                'aria-label': '刪除任務',
                title: '刪除任務',
                onclick: function () {
                  if (confirm('確定要刪除讀書任務「' + (t.title || '') + '」嗎？')) {
                    run(sync.remove(COL_TASKS, id));
                  }
                }
              }, h('i', { class: 'fa-regular fa-trash-can', 'aria-hidden': 'true' }))
            );
            cardRow.appendChild(actions);
          }

          taskList.appendChild(cardRow);
        });
      }

      function renderWeekReview(reviewEntry, currentHire) {
        weekReviewTitle.textContent = '';
        weekReviewTitle.appendChild(h('i', { class: 'fa-solid fa-clipboard-check text-secondary', 'aria-hidden': 'true' }));
        weekReviewTitle.appendChild(h('span', { text: 'Week ' + selectedWeek + ' Mentor 進度評估 (Checkpoint)' }));

        reviewCurrentBadge.textContent = '';
        reviewDisplay.textContent = '';
        reviewForm.hidden = true;
        reviewDisplay.hidden = false;
        editReviewBtn.hidden = !canWrite;

        if (!reviewEntry) {
          reviewDisplay.appendChild(
            h('div', { class: 'text-sm text-base-content/60 py-4 text-center bg-base-200/40 rounded-box' },
              'Week ' + selectedWeek + ' 尚未填寫 Mentor 進度評估。' + (canWrite ? '請點選右上角「填寫 / 更新週評估」進行記錄。' : '')
            )
          );
          return;
        }

        var rev = reviewEntry.data;
        reviewCurrentBadge.appendChild(makeEvalBadge(rev.status));

        var grid = h('div', { class: 'grid grid-cols-1 sm:grid-cols-2 gap-3 mt-1' },
          h('div', { class: 'p-3 rounded-box bg-base-200/50 space-y-1' },
            h('div', { class: 'text-xs font-semibold text-base-content/60', text: 'Mentor 週評語與回饋' }),
            h('div', { class: 'text-sm whitespace-pre-wrap', text: rev.mentorComment || '（無評語）' })
          ),
          h('div', { class: 'p-3 rounded-box bg-base-200/50 space-y-1' },
            h('div', { class: 'text-xs font-semibold text-base-content/60', text: '新人本週心得與提問' }),
            h('div', { class: 'text-sm whitespace-pre-wrap', text: rev.traineeSummary || '（尚無填寫心得）' })
          )
        );
        reviewDisplay.appendChild(grid);

        var footerText = '評估人：' + (rev.mentorName || currentHire.mentor || '-') +
          (rev.updatedAt ? ' · 更新時間：' + new Date(rev.updatedAt).toLocaleString('zh-TW') : '');
        reviewDisplay.appendChild(h('div', { class: 'text-xs text-base-content/60 text-right pt-1', text: footerText }));
      }

      function openHireModal(hireId, hireData) {
        editingHireId = hireId || null;
        hireModalTitle.textContent = editingHireId ? '編輯新人資料' : '新增新人';
        hireNameInput.value = (hireData && hireData.name) || '';
        hireMentorInput.value = (hireData && hireData.mentor) || (ctx.session && ctx.session.name) || '';
        hireRoleInput.value = (hireData && hireData.roleTitle) || '';
        hireDateInput.value = (hireData && hireData.startDate) || new Date().toISOString().slice(0, 10);
        hireModal.showModal();
      }

      function openTaskModal(taskId, taskData) {
        editingTaskId = taskId || null;
        taskModalTitle.textContent = editingTaskId ? '編輯讀書任務' : '新增讀書任務';
        taskWeekInput.value = (taskData && taskData.week) || selectedWeek;
        taskStatusInput.value = (taskData && taskData.status) || 'todo';
        taskTitleInput.value = (taskData && taskData.title) || '';
        taskResourceInput.value = (taskData && taskData.resourceUrl) || '';
        taskNoteInput.value = (taskData && taskData.traineeNote) || '';
        taskModal.showModal();
      }

      // 事件綁定
      if (canWrite) {
        addHireBtn.hidden = false;
        addTaskBtn.hidden = false;

        addHireBtn.addEventListener('click', function () {
          openHireModal(null, null);
        });

        editHireBtn.addEventListener('click', function () {
          if (!selectedHireId || !hiresMap[selectedHireId]) return;
          openHireModal(selectedHireId, hiresMap[selectedHireId]);
        });

        deleteHireBtn.addEventListener('click', function () {
          if (!selectedHireId || !hiresMap[selectedHireId]) return;
          var hr = hiresMap[selectedHireId];
          if (!confirm('確定要刪除新人「' + (hr.name || '') + '」及其所有讀書任務與評估紀錄嗎？')) return;
          var targetHireId = selectedHireId;
          var promises = [sync.remove(COL_HIRES, targetHireId)];
          getHireTasks(targetHireId).forEach(function (t) {
            promises.push(sync.remove(COL_TASKS, t.id));
          });
          var revs = getHireReviews(targetHireId);
          Object.keys(revs).forEach(function (w) {
            promises.push(sync.remove(COL_REVIEWS, revs[w].id));
          });
          selectedHireId = '';
          saveSelectedHirePref('');
          run(Promise.all(promises));
        });

        hireModalCancel.addEventListener('click', function () {
          hireModal.close();
        });

        hireForm.addEventListener('submit', function (e) {
          e.preventDefault();
          var name = hireNameInput.value.trim().slice(0, 100);
          var mentor = hireMentorInput.value.trim().slice(0, 100);
          var roleTitle = hireRoleInput.value.trim().slice(0, 100);
          var startDate = hireDateInput.value.trim().slice(0, 30);
          if (!name || !mentor) return;

          var id = editingHireId || sync.newId();
          var payload = {
            name: name,
            mentor: mentor,
            roleTitle: roleTitle,
            startDate: startDate,
            updatedAt: Date.now()
          };
          if (!editingHireId) {
            payload.createdAt = Date.now();
            payload.maxWeek = 4;
            selectedHireId = id;
            saveSelectedHirePref(id);
          }
          hireModal.close();
          run(sync.save(COL_HIRES, id, payload));
        });

        addTaskBtn.addEventListener('click', function () {
          if (!selectedHireId) return;
          openTaskModal(null, null);
        });

        taskModalCancel.addEventListener('click', function () {
          taskModal.close();
        });

        taskForm.addEventListener('submit', function (e) {
          e.preventDefault();
          if (!selectedHireId) return;
          var wk = Math.max(1, Math.min(52, Number(taskWeekInput.value) || selectedWeek));
          var st = taskStatusInput.value || 'todo';
          var title = taskTitleInput.value.trim().slice(0, 200);
          var resUrl = taskResourceInput.value.trim().slice(0, 500);
          var note = taskNoteInput.value.trim().slice(0, 2000);
          if (!title) return;

          var id = editingTaskId || sync.newId();
          var payload = {
            hireId: selectedHireId,
            week: wk,
            status: st,
            title: title,
            resourceUrl: resUrl,
            traineeNote: note,
            updatedAt: Date.now(),
            updatedBy: (ctx.session && ctx.session.name) || ''
          };
          if (!editingTaskId) {
            payload.createdAt = Date.now();
          }
          selectedWeek = wk;
          taskModal.close();
          run(sync.save(COL_TASKS, id, payload));
        });

        editReviewBtn.addEventListener('click', function () {
          if (!selectedHireId) return;
          var revs = getHireReviews(selectedHireId);
          var curr = revs[selectedWeek] ? revs[selectedWeek].data : null;
          var hr = hiresMap[selectedHireId] || {};
          isEditingReview = true;
          reviewStatusInput.value = (curr && curr.status) || 'on_track';
          reviewMentorInput.value = (curr && curr.mentorName) || hr.mentor || (ctx.session && ctx.session.name) || '';
          reviewCommentInput.value = (curr && curr.mentorComment) || '';
          reviewSummaryInput.value = (curr && curr.traineeSummary) || '';
          reviewDisplay.hidden = true;
          reviewForm.hidden = false;
          editReviewBtn.hidden = true;
        });

        cancelReviewBtn.addEventListener('click', function () {
          isEditingReview = false;
          renderAll();
        });

        reviewForm.addEventListener('submit', function (e) {
          e.preventDefault();
          if (!selectedHireId) return;
          var revs = getHireReviews(selectedHireId);
          var existing = revs[selectedWeek];
          var id = existing ? existing.id : (selectedHireId + '_w' + selectedWeek);
          var payload = {
            hireId: selectedHireId,
            week: selectedWeek,
            status: reviewStatusInput.value || 'on_track',
            mentorName: reviewMentorInput.value.trim().slice(0, 100),
            mentorComment: reviewCommentInput.value.trim().slice(0, 3000),
            traineeSummary: reviewSummaryInput.value.trim().slice(0, 3000),
            updatedAt: Date.now(),
            updatedBy: (ctx.session && ctx.session.name) || ''
          };
          isEditingReview = false;
          run(sync.save(COL_REVIEWS, id, payload));
        });
      }

      hireSelect.addEventListener('change', function () {
        selectedHireId = hireSelect.value;
        saveSelectedHirePref(selectedHireId);
        selectedWeek = 1;
        isEditingReview = false;
        renderAll();
      });

      addWeekBtn.addEventListener('click', function () {
        if (!selectedHireId) return;
        var nextW = getMaxWeekForHire(selectedHireId) + 1;
        if (nextW > 52) return;
        maxCustomWeek = nextW;
        selectedWeek = nextW;
        isEditingReview = false;
        if (canWrite && hiresMap[selectedHireId]) {
          run(sync.save(COL_HIRES, selectedHireId, { maxWeek: nextW }));
        }
        renderAll();
      });

      refreshBtn.addEventListener('click', function () {
        subHires.refresh();
        subTasks.refresh();
        subReviews.refresh();
      });

      var subHires = sync.subscribe(COL_HIRES, {
        onChange: function (map) { hiresMap = map || {}; renderAll(); },
        onError: showErr,
        onStatus: function (s) { statusEl.textContent = STATUS_LABELS[s] || s; }
      });

      var subTasks = sync.subscribe(COL_TASKS, {
        onChange: function (map) { tasksMap = map || {}; renderAll(); },
        onError: showErr,
        onStatus: function () {}
      });

      var subReviews = sync.subscribe(COL_REVIEWS, {
        onChange: function (map) { reviewsMap = map || {}; renderAll(); },
        onError: showErr,
        onStatus: function () {}
      });
    }
  };
})();

