/* app.js — 你的應用程式邏輯（擴充區，可自由修改；靜態畫面結構寫在 index.html 的 #appRoot 內）
 *
 * 契約：window.App = { mount(root, ctx) }，只透過 ctx 取得資料與使用者。
 */
(function () {
  'use strict';

  var COL_HIRES = 'hires';
  var COL_TASKS = 'tasks';
  var COL_REVIEWS = 'reviews';
  var COL_TEMPLATES = 'templates';
  var UI_PREF_HIRE = 'mws:newhire-checkpoint-app:ui:selectedHire';

  var EVAL_META = {
    on_track: { labelZh: '符合預期 (On Track)', labelEn: 'On Track', badge: 'badge-success', icon: 'fa-circle-check' },
    ahead: { labelZh: '進度超前 (Ahead)', labelEn: 'Ahead', badge: 'badge-info', icon: 'fa-rocket' },
    attention: { labelZh: '需加強關注 (Needs Attention)', labelEn: 'Needs Attention', badge: 'badge-warning', icon: 'fa-triangle-exclamation' },
    behind: { labelZh: '進度落後 (Behind)', labelEn: 'Behind', badge: 'badge-error', icon: 'fa-circle-exclamation' }
  };

  var TASK_STATUS_META = {
    pending: { label: '⏳ Pending', badge: 'badge-warning badge-soft', next: 'completed', isDone: false },
    completed: { label: '✅ Completed', badge: 'badge-success badge-soft', next: 'pending', isDone: true },
    final_eval: { label: '🏁 Final Evaluation', badge: 'badge-primary badge-soft', next: 'completed', isDone: false },
    todo: { label: '⏳ Pending', badge: 'badge-warning badge-soft', next: 'completed', isDone: false },
    in_progress: { label: '⏳ Pending', badge: 'badge-warning badge-soft', next: 'completed', isDone: false },
    done: { label: '✅ Completed', badge: 'badge-success badge-soft', next: 'pending', isDone: true }
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
      var i18n = ctx.I18n || { lang: 'zh', t: function (z) { return z; }, onChange: function () {} };
      var canWrite = !!ctx.canWrite;
      var curSyncStatus = 'loading';

      function getStatusLabel(s) {
        var map = {
          loading: i18n.t('載入中…', 'Loading…'),
          live: i18n.t('已同步', 'Synced'),
          offline: i18n.t('離線，重連中…', 'Offline, reconnecting…'),
          denied: i18n.t('無讀取權限', 'Permission denied'),
          auth: i18n.t('登入已失效', 'Session expired')
        };
        return map[s] || s;
      }

      var hiresMap = {};
      var tasksMap = {};
      var reviewsMap = {};
      var templatesMap = {};

      var selectedHireId = '';
      try {
        selectedHireId = localStorage.getItem(UI_PREF_HIRE) || '';
      } catch (_) {}

      // selectedFilter: 'all' 或數字週次/階段 (1..N)
      var selectedFilter = 'all';
      var selectedReviewWeek = 1;
      var editingHireId = null;
      var editingTaskId = null;
      var isEditingReview = false;

      var statusEl = $('statusText');
      var errEl = $('errBox');
      var refreshBtn = $('refreshBtn');
      var addHireBtn = $('addHireBtn');
      var hireSelect = $('hireSelect');
      var hireActions = $('hireActions');
      var applyTemplateBtn = $('applyTemplateBtn');
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
      var addTaskBtn = $('addTaskBtn');
      var weekTaskTitle = $('weekTaskTitle');
      var weekProgressBadge = $('weekProgressBadge');
      var emptyTaskState = $('emptyTaskState');
      var tableWrap = $('tableWrap');
      var taskTableBody = $('taskTableBody');

      var weekReviewTitle = $('weekReviewTitle');
      var reviewStageSelect = $('reviewStageSelect');
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
      var hireSeedWrap = $('hireSeedWrap');
      var hireSeedCheckbox = $('hireSeedCheckbox');
      var hireModalCancel = $('hireModalCancel');

      var taskModal = $('taskModal');
      var taskModalTitle = $('taskModalTitle');
      var taskForm = $('taskForm');
      var taskWeekInput = $('taskWeekInput');
      var taskTimelineInput = $('taskTimelineInput');
      var taskStatusInput = $('taskStatusInput');
      var taskTitleInput = $('taskTitleInput');
      var taskTopicsInput = $('taskTopicsInput');
      var taskResourceTextInput = $('taskResourceTextInput');
      var taskResourceInput = $('taskResourceInput');
      var taskNoteInput = $('taskNoteInput');
      var taskModalCancel = $('taskModalCancel');

      function showErr(e) {
        errEl.hidden = false;
        errEl.textContent = e && e.kind === 'denied'
          ? i18n.t('沒有權限執行這個動作（角色不足或存取已被撤銷）', 'Permission denied (insufficient role or access revoked)')
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

      function getSortedTemplates() {
        return Object.keys(templatesMap).map(function (k) {
          return templatesMap[k];
        }).filter(Boolean).sort(function (a, b) {
          return (Number(a.order) || Number(a.week) || 0) - (Number(b.order) || Number(b.week) || 0);
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
          var wa = Number(a.data.week) || 1;
          var wb = Number(b.data.week) || 1;
          if (wa !== wb) return wa - wb;
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

      function getStageListForHire(hireId, allTasks, reviewsByWeek) {
        var stageMap = {};
        allTasks.forEach(function (item) {
          var w = Number(item.data.week) || 1;
          if (!stageMap[w]) {
            var firstLine = String(item.data.timeline || ('Week ' + w)).split('\n')[0].trim();
            stageMap[w] = {
              week: w,
              shortLabel: firstLine || ('Stage ' + w),
              phase: item.data.phase || item.data.title || ''
            };
          }
        });
        Object.keys(reviewsByWeek).forEach(function (wKey) {
          var w = Number(wKey) || 1;
          if (!stageMap[w]) {
            stageMap[w] = { week: w, shortLabel: 'Stage ' + w, phase: '' };
          }
        });
        var weeks = Object.keys(stageMap).map(Number).sort(function (a, b) { return a - b; });
        if (!weeks.length) {
          for (var i = 1; i <= 5; i++) {
            stageMap[i] = { week: i, shortLabel: i === 5 ? 'Wrap-up' : ('Week ' + i), phase: '' };
            weeks.push(i);
          }
        }
        return weeks.map(function (w) { return stageMap[w]; });
      }

      function applyCurriculumTemplateToHire(hireId) {
        var tpls = getSortedTemplates();
        if (!tpls.length) {
          showErr(new Error(i18n.t('目前資料庫中尚無預設課綱範本（/data/templates）', 'No default curriculum template found in database (/data/templates)')));
          return Promise.resolve();
        }
        var now = Date.now();
        var promises = tpls.map(function (tpl, idx) {
          var taskId = sync.newId();
          var wk = Number(tpl.week) || (idx + 1);
          return sync.save(COL_TASKS, taskId, {
            hireId: hireId,
            week: wk,
            timeline: tpl.timeline || ('Week ' + wk),
            phase: tpl.phase || '',
            title: tpl.phase || '',
            keyTopics: tpl.keyTopics || '',
            resources: tpl.resources || '',
            resourceUrl: tpl.resourceUrl || '',
            remarks: tpl.remarks || '',
            traineeNote: tpl.remarks || '',
            status: tpl.defaultStatus || 'pending',
            createdAt: now + idx,
            updatedAt: now + idx,
            updatedBy: (ctx.session && ctx.session.name) || ''
          });
        });
        return Promise.all(promises);
      }

      function makeEvalBadge(statusKey) {
        var meta = EVAL_META[statusKey] || EVAL_META.on_track;
        return h('span', { class: 'badge badge-sm gap-1 ' + meta.badge },
          h('i', { class: 'fa-solid ' + meta.icon, 'aria-hidden': 'true' }),
          i18n.t(meta.labelZh, meta.labelEn)
        );
      }

      function isTaskDone(st) {
        var meta = TASK_STATUS_META[st];
        return meta ? meta.isDone : false;
      }

      function renderAll() {
        statusEl.textContent = getStatusLabel(curSyncStatus);
        var hireIds = getSortedHireIds();
        if (!selectedHireId || !hiresMap[selectedHireId]) {
          selectedHireId = hireIds[0] || '';
          saveSelectedHirePref(selectedHireId);
        }

        hireSelect.textContent = '';
        if (!hireIds.length) {
          hireSelect.appendChild(h('option', { value: '', text: i18n.t('尚無新人資料', 'No new hires yet') }));
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
          var label = (hr.name || i18n.t('未命名', 'Unnamed')) + (hr.mentor ? ' (Mentor: ' + hr.mentor + ')' : '');
          var opt = h('option', { value: id, text: label });
          if (id === selectedHireId) opt.selected = true;
          hireSelect.appendChild(opt);
        });

        var currentHire = hiresMap[selectedHireId];
        var allTasks = getHireTasks(selectedHireId);
        var reviewsByWeek = getHireReviews(selectedHireId);
        var stages = getStageListForHire(selectedHireId, allTasks, reviewsByWeek);

        // 統計資訊
        infoHireName.textContent = currentHire.name || '-';
        infoHireRole.textContent = currentHire.roleTitle || i18n.t('未填寫部門職稱', 'Role not specified');
        infoMentor.textContent = currentHire.mentor || '-';
        infoStartDate.textContent = currentHire.startDate
          ? (i18n.t('到職日：', 'Start: ') + currentHire.startDate)
          : i18n.t('未設定到職日', 'Start date not set');

        var totalCount = allTasks.length;
        var doneCount = allTasks.filter(function (t) { return isTaskDone(t.data.status); }).length;
        var rate = totalCount ? Math.round((doneCount / totalCount) * 100) : 0;
        infoTaskRate.textContent = rate + '%';
        infoTaskCount.textContent = doneCount + ' / ' + totalCount + i18n.t(' 階段完成', ' stages done');

        var reviewedWeeks = Object.keys(reviewsByWeek).map(Number).sort(function (a, b) { return b - a; });
        infoLatestEval.textContent = '';
        if (reviewedWeeks.length > 0) {
          var latestW = reviewedWeeks[0];
          var latestRev = reviewsByWeek[latestW].data;
          infoLatestEval.appendChild(makeEvalBadge(latestRev.status));
          var matchedStage = stages.find(function (s) { return s.week === latestW; });
          var stageLabel = matchedStage ? matchedStage.shortLabel : ('Stage ' + latestW);
          infoLatestWeek.textContent = stageLabel + (latestRev.updatedBy ? ' · ' + latestRev.updatedBy : '');
        } else {
          infoLatestEval.textContent = i18n.t('尚未評估', 'Not evaluated');
          infoLatestWeek.textContent = i18n.t('尚無評估紀錄', 'No checkpoint yet');
        }

        // 渲染上方篩選 Tabs（全部總覽 + 各階段）
        weekTabs.textContent = '';
        var allTabBtn = h('button', {
          type: 'button',
          role: 'tab',
          class: 'tab gap-1.5 ' + (selectedFilter === 'all' ? 'tab-active font-semibold' : ''),
          onclick: function () {
            selectedFilter = 'all';
            renderAll();
          }
        }, i18n.t('全部階段總覽', 'All Stages') + ' (' + doneCount + '/' + totalCount + ')');
        weekTabs.appendChild(allTabBtn);

        stages.forEach(function (stObj) {
          var wk = stObj.week;
          var wkRev = reviewsByWeek[wk];
          var btnClass = 'tab gap-1.5 ' + (selectedFilter === wk ? 'tab-active font-semibold' : '');
          var tabBtn = h('button', {
            type: 'button',
            role: 'tab',
            class: btnClass,
            onclick: function () {
              selectedFilter = wk;
              selectedReviewWeek = wk;
              isEditingReview = false;
              renderAll();
            }
          }, stObj.shortLabel);

          if (wkRev && EVAL_META[wkRev.data.status]) {
            tabBtn.appendChild(h('i', { class: 'fa-solid ' + EVAL_META[wkRev.data.status].icon + ' text-xs', 'aria-hidden': 'true' }));
          }
          weekTabs.appendChild(tabBtn);
        });

        // 渲染 6 欄讀書計畫表格
        renderStudyPlanTable(allTasks, reviewsByWeek);

        // 同步下方 Mentor 階段選擇器
        var validStageWeeks = stages.map(function (s) { return s.week; });
        if (validStageWeeks.indexOf(selectedReviewWeek) === -1) {
          selectedReviewWeek = validStageWeeks[0] || 1;
        }
        reviewStageSelect.textContent = '';
        stages.forEach(function (stObj) {
          var titleSuffix = stObj.phase ? (' — ' + stObj.phase) : '';
          var opt = h('option', { value: String(stObj.week), text: stObj.shortLabel + titleSuffix });
          if (stObj.week === selectedReviewWeek) opt.selected = true;
          reviewStageSelect.appendChild(opt);
        });

        if (!isEditingReview) {
          var activeStageObj = stages.find(function (s) { return s.week === selectedReviewWeek; }) || { week: selectedReviewWeek, shortLabel: 'Stage ' + selectedReviewWeek };
          renderWeekReview(reviewsByWeek[selectedReviewWeek], currentHire, activeStageObj);
        }
      }

      function renderStudyPlanTable(allTasks, reviewsByWeek) {
        var filtered = selectedFilter === 'all'
          ? allTasks
          : allTasks.filter(function (t) { return Number(t.data.week) === Number(selectedFilter); });

        var doneTasks = filtered.filter(function (t) { return isTaskDone(t.data.status); });
        weekProgressBadge.textContent = doneTasks.length + ' / ' + filtered.length + i18n.t(' 完成', ' Done');

        taskTableBody.textContent = '';
        if (!filtered.length) {
          tableWrap.hidden = true;
          emptyTaskState.hidden = false;
          emptyTaskState.textContent = i18n.t(
            '目前尚無讀書計畫階段項目。' + (canWrite ? '可點選上方「套用預設課綱範本」一鍵匯入 5 個階段課綱，或點選「新增讀書階段項目」自行新增！' : ''),
            'No study stages yet. ' + (canWrite ? 'Click "Apply Default Curriculum" above to import the 5 stages, or click "Add Study Stage".' : '')
          );
          return;
        }

        tableWrap.hidden = false;
        emptyTaskState.hidden = true;

        filtered.forEach(function (item) {
          var id = item.id;
          var t = item.data;
          var wk = Number(t.week) || 1;
          var stKey = TASK_STATUS_META[t.status] ? t.status : 'pending';
          var stMeta = TASK_STATUS_META[stKey];

          // 1. Timeline
          var timelineText = t.timeline || ('Week ' + wk);
          var tdTimeline = h('td', { class: 'font-semibold text-xs whitespace-pre-line align-top' }, timelineText);

          // 2. Phase / Domain
          var phaseText = t.phase || t.title || i18n.t('未命名階段', 'Untitled Stage');
          var tdPhase = h('td', { class: 'font-semibold text-sm align-top' }, phaseText);

          // 3. Key Topics & Hands-on Tasks
          var topicsText = t.keyTopics || t.traineeNote || '';
          var tdTopics = h('td', { class: 'text-xs leading-relaxed whitespace-pre-wrap align-top' }, topicsText);

          // 4. Resources & Format
          var tdResources = h('td', { class: 'text-xs align-top space-y-1' });
          if (t.resources) {
            tdResources.appendChild(h('div', { class: 'whitespace-pre-wrap', text: t.resources }));
          }
          var validHref = safeUrl(t.resourceUrl);
          if (validHref) {
            tdResources.appendChild(
              h('a', {
                href: validHref,
                target: '_blank',
                rel: 'noopener noreferrer',
                class: 'link link-primary inline-flex items-center gap-1'
              },
                h('i', { class: 'fa-solid fa-arrow-up-right-from-square', 'aria-hidden': 'true' }),
                i18n.t('開啟連結', 'Open Link')
              )
            );
          }
          if (!t.resources && !validHref) {
            tdResources.appendChild(h('span', { class: 'text-base-content/40', text: '-' }));
          }

          // 5. Remarks / Milestones
          var remarksText = t.remarks !== undefined ? t.remarks : '';
          var tdRemarks = h('td', { class: 'text-xs whitespace-pre-wrap align-top text-base-content/80' }, remarksText || '-');

          // 6. Status + 操作
          var tdStatus = h('td', { class: 'align-top text-center space-y-1.5' });
          var statusBtn = h('button', {
            type: 'button',
            class: 'badge badge-sm whitespace-nowrap ' + stMeta.badge + (canWrite ? ' cursor-pointer hover:opacity-80' : ''),
            title: canWrite ? i18n.t('點擊快速切換完成狀態 (Completed / Pending)', 'Click to toggle status (Completed / Pending)') : '',
            onclick: function () {
              if (!canWrite) return;
              run(sync.save(COL_TASKS, id, { status: stMeta.next, updatedAt: Date.now() }));
            }
          }, stMeta.label);
          tdStatus.appendChild(h('div', {}, statusBtn));

          // 顯示該階段是否已有 Mentor Checkpoint 評估
          var wkRev = reviewsByWeek[wk];
          if (wkRev && EVAL_META[wkRev.data.status]) {
            var evalBtn = h('button', {
              type: 'button',
              class: 'btn btn-ghost btn-xs text-xs gap-1',
              title: i18n.t('點此查看下方 Mentor 評估', 'Click to view Mentor checkpoint below'),
              onclick: function () {
                selectedReviewWeek = wk;
                isEditingReview = false;
                renderAll();
                weekReviewTitle.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }
            },
              h('i', { class: 'fa-solid ' + EVAL_META[wkRev.data.status].icon, 'aria-hidden': 'true' }),
              i18n.t('Mentor 已評', 'Evaluated')
            );
            tdStatus.appendChild(h('div', {}, evalBtn));
          }

          if (canWrite) {
            var editLbl = i18n.t('編輯階段項目', 'Edit Stage');
            var delLbl = i18n.t('刪除階段項目', 'Delete Stage');
            var rowActions = h('div', { class: 'flex items-center justify-center gap-1 pt-0.5' },
              h('button', {
                type: 'button',
                class: 'btn btn-ghost btn-xs btn-square',
                'aria-label': editLbl,
                title: editLbl,
                onclick: function () { openTaskModal(id, t); }
              }, h('i', { class: 'fa-regular fa-pen-to-square', 'aria-hidden': 'true' })),
              h('button', {
                type: 'button',
                class: 'btn btn-ghost btn-xs btn-square text-base-content/60 hover:text-error',
                'aria-label': delLbl,
                title: delLbl,
                onclick: function () {
                  if (confirm(i18n.t('確定要刪除「' + phaseText + '」嗎？', 'Delete stage "' + phaseText + '"?'))) {
                    run(sync.remove(COL_TASKS, id));
                  }
                }
              }, h('i', { class: 'fa-regular fa-trash-can', 'aria-hidden': 'true' }))
            );
            tdStatus.appendChild(rowActions);
          }

          var tr = h('tr', { class: 'hover:bg-base-200/40' }, tdTimeline, tdPhase, tdTopics, tdResources, tdRemarks, tdStatus);
          taskTableBody.appendChild(tr);
        });
      }

      function renderWeekReview(reviewEntry, currentHire, stageObj) {
        reviewCurrentBadge.textContent = '';
        reviewDisplay.textContent = '';
        reviewForm.hidden = true;
        reviewDisplay.hidden = false;
        editReviewBtn.hidden = !canWrite;

        var stageTitle = stageObj.shortLabel + (stageObj.phase ? (' (' + stageObj.phase + ')') : '');

        if (!reviewEntry) {
          reviewDisplay.appendChild(
            h('div', { class: 'text-sm text-base-content/60 py-4 text-center bg-base-200/40 rounded-box' },
              i18n.t(
                '「' + stageTitle + '」尚未填寫 Mentor 進度評估。' + (canWrite ? '請點選右方「填寫 / 更新本階段評估」進行記錄。' : ''),
                'No Mentor checkpoint recorded for "' + stageTitle + '" yet. ' + (canWrite ? 'Click "Write / Update Evaluation" on the right to add one.' : '')
              )
            )
          );
          return;
        }

        var rev = reviewEntry.data;
        reviewCurrentBadge.appendChild(makeEvalBadge(rev.status));

        var grid = h('div', { class: 'grid grid-cols-1 sm:grid-cols-2 gap-3 mt-1' },
          h('div', { class: 'p-3 rounded-box bg-base-200/50 space-y-1' },
            h('div', { class: 'text-xs font-semibold text-base-content/60', text: i18n.t('Mentor 週評語與回饋 (Feedback & Action Items)', 'Mentor Feedback & Action Items') }),
            h('div', { class: 'text-sm whitespace-pre-wrap', text: rev.mentorComment || i18n.t('（無評語）', '(No comments)') })
          ),
          h('div', { class: 'p-3 rounded-box bg-base-200/50 space-y-1' },
            h('div', { class: 'text-xs font-semibold text-base-content/60', text: i18n.t('新人本階段心得與提問 (New Hire Reflection)', 'New Hire Reflection & Questions') }),
            h('div', { class: 'text-sm whitespace-pre-wrap', text: rev.traineeSummary || i18n.t('（尚無填寫心得）', '(No reflection yet)') })
          )
        );
        reviewDisplay.appendChild(grid);

        var footerText = i18n.t('評估人：', 'Reviewed by: ') + (rev.mentorName || currentHire.mentor || '-') +
          (rev.updatedAt ? ' · ' + i18n.t('更新時間：', 'Updated: ') + new Date(rev.updatedAt).toLocaleString(i18n.lang === 'en' ? 'en-US' : 'zh-TW') : '');
        reviewDisplay.appendChild(h('div', { class: 'text-xs text-base-content/60 text-right pt-1', text: footerText }));
      }

      function openHireModal(hireId, hireData) {
        editingHireId = hireId || null;
        hireModalTitle.textContent = editingHireId
          ? i18n.t('編輯新人資料', 'Edit New Hire')
          : i18n.t('新增新人', 'Add New Hire');
        hireNameInput.value = (hireData && hireData.name) || '';
        hireMentorInput.value = (hireData && hireData.mentor) || (ctx.session && ctx.session.name) || '';
        hireRoleInput.value = (hireData && hireData.roleTitle) || '';
        hireDateInput.value = (hireData && hireData.startDate) || new Date().toISOString().slice(0, 10);
        hireSeedWrap.hidden = !!editingHireId;
        hireSeedCheckbox.checked = !editingHireId;
        hireModal.showModal();
      }

      function openTaskModal(taskId, taskData) {
        editingTaskId = taskId || null;
        taskModalTitle.textContent = editingTaskId
          ? i18n.t('編輯讀書階段項目', 'Edit Study Stage')
          : i18n.t('新增讀書階段項目', 'Add Study Stage');
        var defaultWk = selectedFilter === 'all'
          ? (getHireTasks(selectedHireId).length + 1)
          : Number(selectedFilter);
        taskWeekInput.value = (taskData && taskData.week) || defaultWk;
        taskTimelineInput.value = (taskData && taskData.timeline) || ('Week ' + defaultWk);
        taskStatusInput.value = (taskData && TASK_STATUS_META[taskData.status] ? taskData.status : 'pending');
        taskTitleInput.value = (taskData && (taskData.phase || taskData.title)) || '';
        taskTopicsInput.value = (taskData && (taskData.keyTopics || taskData.traineeNote)) || '';
        taskResourceTextInput.value = (taskData && taskData.resources) || '';
        taskResourceInput.value = (taskData && taskData.resourceUrl) || '';
        taskNoteInput.value = (taskData && taskData.remarks) || '';
        taskModal.showModal();
      }

      if (canWrite) {
        addHireBtn.hidden = false;
        addTaskBtn.hidden = false;

        addHireBtn.addEventListener('click', function () {
          openHireModal(null, null);
        });

        applyTemplateBtn.addEventListener('click', function () {
          if (!selectedHireId || !hiresMap[selectedHireId]) return;
          var existingCount = getHireTasks(selectedHireId).length;
          var msg = existingCount > 0
            ? i18n.t('此新人已有 ' + existingCount + ' 筆階段項目，確定要額外匯入預設的 5 階段課綱範本嗎？', 'This new hire already has ' + existingCount + ' stages. Import the default 5-stage curriculum anyway?')
            : i18n.t('確定要為此新人匯入預設的 5 階段課綱範本嗎？', 'Import the default 5-stage curriculum template for this new hire?');
          if (!confirm(msg)) return;
          run(applyCurriculumTemplateToHire(selectedHireId));
        });

        editHireBtn.addEventListener('click', function () {
          if (!selectedHireId || !hiresMap[selectedHireId]) return;
          openHireModal(selectedHireId, hiresMap[selectedHireId]);
        });

        deleteHireBtn.addEventListener('click', function () {
          if (!selectedHireId || !hiresMap[selectedHireId]) return;
          var hr = hiresMap[selectedHireId];
          if (!confirm(i18n.t('確定要刪除新人「' + (hr.name || '') + '」及其所有讀書計畫與評估紀錄嗎？', 'Delete new hire "' + (hr.name || '') + '" and all their study stages and evaluations?'))) return;
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

          var isNew = !editingHireId;
          var shouldSeed = isNew && hireSeedCheckbox.checked;
          var id = editingHireId || sync.newId();
          var payload = {
            name: name,
            mentor: mentor,
            roleTitle: roleTitle,
            startDate: startDate,
            updatedAt: Date.now()
          };
          if (isNew) {
            payload.createdAt = Date.now();
            selectedHireId = id;
            saveSelectedHirePref(id);
          }
          hireModal.close();
          run(
            sync.save(COL_HIRES, id, payload).then(function () {
              if (shouldSeed) {
                return applyCurriculumTemplateToHire(id);
              }
            })
          );
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
          var wk = Math.max(1, Math.min(52, Number(taskWeekInput.value) || 1));
          var timeline = taskTimelineInput.value.trim().slice(0, 120);
          var st = taskStatusInput.value || 'pending';
          var phase = taskTitleInput.value.trim().slice(0, 200);
          var topics = taskTopicsInput.value.trim().slice(0, 4000);
          var resources = taskResourceTextInput.value.trim().slice(0, 500);
          var resUrl = taskResourceInput.value.trim().slice(0, 500);
          var remarks = taskNoteInput.value.trim().slice(0, 2000);
          if (!phase || !timeline) return;

          var id = editingTaskId || sync.newId();
          var payload = {
            hireId: selectedHireId,
            week: wk,
            timeline: timeline,
            phase: phase,
            title: phase,
            keyTopics: topics,
            resources: resources,
            resourceUrl: resUrl,
            remarks: remarks,
            status: st,
            updatedAt: Date.now(),
            updatedBy: (ctx.session && ctx.session.name) || ''
          };
          if (!editingTaskId) {
            payload.createdAt = Date.now();
          }
          taskModal.close();
          run(sync.save(COL_TASKS, id, payload));
        });

        editReviewBtn.addEventListener('click', function () {
          if (!selectedHireId) return;
          var revs = getHireReviews(selectedHireId);
          var curr = revs[selectedReviewWeek] ? revs[selectedReviewWeek].data : null;
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
          var existing = revs[selectedReviewWeek];
          var id = existing ? existing.id : (selectedHireId + '_w' + selectedReviewWeek);
          var payload = {
            hireId: selectedHireId,
            week: selectedReviewWeek,
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
        selectedFilter = 'all';
        selectedReviewWeek = 1;
        isEditingReview = false;
        renderAll();
      });

      reviewStageSelect.addEventListener('change', function () {
        selectedReviewWeek = Number(reviewStageSelect.value) || 1;
        isEditingReview = false;
        renderAll();
      });

      refreshBtn.addEventListener('click', function () {
        subHires.refresh();
        subTasks.refresh();
        subReviews.refresh();
        subTemplates.refresh();
      });

      i18n.onChange(function () {
        renderAll();
      });

      var subHires = sync.subscribe(COL_HIRES, {
        onChange: function (map) { hiresMap = map || {}; renderAll(); },
        onError: showErr,
        onStatus: function (s) { curSyncStatus = s; statusEl.textContent = getStatusLabel(s); }
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

      var subTemplates = sync.subscribe(COL_TEMPLATES, {
        onChange: function (map) { templatesMap = map || {}; renderAll(); },
        onError: showErr,
        onStatus: function () {}
      });
    }
  };
})();


