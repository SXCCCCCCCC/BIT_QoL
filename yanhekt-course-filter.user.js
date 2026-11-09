// ==UserScript==
// @name         延河课堂 - 课程列表显示过滤
// @namespace    https://aita.yanhekt.cn/
// @version      2.1.0
// @description  在“我的课程”搜索按钮右侧嵌入开关：隐藏「大学物理实验」系列课程、隐藏任务数为 0 的课程；状态本地记忆，过滤结果跨页生效
// @author       SXCCCCCCCC
// @match        https://aita.yanhekt.cn/*
// @updateURL    https://raw.githubusercontent.com/SXCCCCCCCC/BIT_QoL/main/yanhekt-course-filter.user.js
// @downloadURL  https://raw.githubusercontent.com/SXCCCCCCCC/BIT_QoL/main/yanhekt-course-filter.user.js
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  // ===== 可改配置 =====
  const PHYSICS_PREFIX = '大学物理实验';      // 要隐藏的课程名前缀
  const STORAGE_KEY = 'yhkt.courseFilter.v1'; // localStorage 键名
  const PAGE_SIZE = 10;                        // 站点每页课程数
  const FETCH_SIZE = 100;                      // 过滤时一次取多少条

  // 默认开关状态：物理实验默认隐藏；任务数为 0 默认不隐藏
  const DEFAULTS = { hidePhysics: true, hideZeroTasks: false };

  // ===== 状态 =====
  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      return Object.assign({}, DEFAULTS, saved);
    } catch (e) {
      return Object.assign({}, DEFAULTS);
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) { /* 隐私模式等场景忽略 */ }
  }

  const state = loadState();
  const filtersActive = () => state.hidePhysics || state.hideZeroTasks;

  // ===== 样式 =====
  const STYLE_ID = 'yhkt-course-filter-style';
  const CONTROLS_ID = 'yhkt-cf-controls';

  const CSS = `
    #${CONTROLS_ID} {
      display: inline-block;
      vertical-align: top;
      margin-left: 4px;
    }
    #${CONTROLS_ID} .el-form-item__content {
      display: flex;
      align-items: center;
      height: 40px;
      gap: 18px;
    }
    #${CONTROLS_ID} .yhkt-cf-toggle {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      cursor: pointer;
      user-select: none;
      white-space: nowrap;
    }
    #${CONTROLS_ID} .yhkt-cf-toggle-label {
      font-size: 13px;
      line-height: 20px;
      color: #606266;
    }
    #${CONTROLS_ID} .yhkt-cf-switch {
      position: relative;
      display: inline-block;
      width: 36px;
      height: 20px;
      border-radius: 10px;
      background: #dcdfe6;
      transition: background-color .2s;
    }
    #${CONTROLS_ID} .yhkt-cf-switch::after {
      content: "";
      position: absolute;
      top: 2px;
      left: 2px;
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background: #fff;
      box-shadow: 0 1px 2px rgba(0, 0, 0, .18);
      transition: transform .2s;
    }
    #${CONTROLS_ID} .yhkt-cf-toggle:hover .yhkt-cf-switch {
      background: #c0c4cc;
    }
    #${CONTROLS_ID} .yhkt-cf-toggle.is-on .yhkt-cf-switch {
      background: #409eff;
    }
    #${CONTROLS_ID} .yhkt-cf-toggle.is-on .yhkt-cf-switch::after {
      transform: translateX(16px);
    }
    #${CONTROLS_ID} input {
      position: absolute;
      width: 1px;
      height: 1px;
      margin: 0;
      opacity: 0;
      pointer-events: none;
    }
  `;

  function ensureStyle(doc) {
    if (doc.getElementById(STYLE_ID)) return;
    const style = doc.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    (doc.head || doc.documentElement).appendChild(style);
  }

  // ===== 过滤判定 =====
  function getTaskCount(course) {
    const n = Number(course && course.progress && course.progress.subjectNum);
    return Number.isFinite(n) ? n : null;
  }

  function shouldHide(course) {
    const title = String((course && course.Title) || '').trim();
    const isPhysics = title.startsWith(PHYSICS_PREFIX);
    const tasks = getTaskCount(course);
    const isZero = tasks === 0;
    return (state.hidePhysics && isPhysics) || (state.hideZeroTasks && isZero);
  }

  // ===== 取数 =====
  const API_PATH = '/personal/courseapi/vlabpassportapi/v1/account-profile/course';
  const CACHE_TTL = 300000;      // 持久缓存 5 分钟
  const FRESH_MS = 60000;        // 超过 1 分钟的数据：先秒出，再后台刷新
  const PERSIST_PREFIX = 'yhkt.courseCache.v1:';
  const courseCache = new Map(); // key -> { data, ts }
  const inflight = new Map();    // key -> Promise，避免并发重复请求

  function searchKey(search) {
    const obj = search || {};
    // 空值参数等价于没传，保证预取和真实请求命中同一个缓存键
    const pairs = Object.keys(obj).sort()
      .filter(k => obj[k] !== undefined && obj[k] !== null && String(obj[k]) !== '')
      .map(k => [k, obj[k]]);
    return JSON.stringify(pairs);
  }

  function getCached(key) {
    const entry = courseCache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.ts > CACHE_TTL) {
      courseCache.delete(key);
      return null;
    }
    return entry;
  }

  function readPersisted(key) {
    try {
      const raw = sessionStorage.getItem(PERSIST_PREFIX + key);
      if (!raw) return null;
      const entry = JSON.parse(raw);
      if (!entry || !Array.isArray(entry.data) || !entry.ts) return null;
      if (Date.now() - entry.ts > CACHE_TTL) {
        sessionStorage.removeItem(PERSIST_PREFIX + key);
        return null;
      }
      return entry;
    } catch (e) {
      return null;
    }
  }

  function writePersisted(key, data) {
    try {
      sessionStorage.setItem(PERSIST_PREFIX + key, JSON.stringify({ data, ts: Date.now() }));
    } catch (e) { /* 存储满 / 隐私模式忽略 */ }
  }

  async function requestAll(search, key) {
    const all = [];
    let total = Infinity;
    let page = 1;

    while (all.length < total && page <= 20) {
      const params = new URLSearchParams();
      // 原样透传站点的搜索参数（model/search/course_type/force_mycourse…）
      for (const [k, v] of Object.entries(search || {})) {
        if (v === undefined || v === null) continue;
        params.set(k, String(v));
      }
      params.set('nowpage', String(page));
      params.set('per-page', String(FETCH_SIZE));
      const res = await fetch(API_PATH + '?' + params.toString(), {
        credentials: 'include',
        headers: { Accept: 'application/json' },
      });
      const json = await res.json();
      const result = json && json.params && json.params.result;
      if (!json || json.code !== 1000 || !result) {
        throw new Error('课程列表接口返回异常: ' + (json && json.message || res.status));
      }
      total = Number(result.total) || 0;
      const data = Array.isArray(result.data) ? result.data : [];
      all.push(...data);
      if (!data.length) break;
      page++;
    }

    const entry = { data: all, ts: Date.now() };
    courseCache.set(key, entry);
    writePersisted(key, all);
    return entry;
  }

  function startFetch(search, key) {
    if (inflight.has(key)) return inflight.get(key);
    const p = requestAll(search, key).finally(() => inflight.delete(key));
    inflight.set(key, p);
    return p;
  }

  function refreshInBackground(search, key) {
    startFetch(search, key).then(() => {
      const vm = getVm(document);
      if (vm && filtersActive() && searchKey(vm.courseSearch) === key) filteredLoad(vm);
    }).catch(() => {});
  }

  function fetchAllCourses(search) {
    const key = searchKey(search);
    const cached = getCached(key);
    if (cached) {
      if (Date.now() - cached.ts > FRESH_MS) refreshInBackground(search, key);
      return Promise.resolve(cached.data);
    }
    const persisted = readPersisted(key);
    if (persisted) {
      courseCache.set(key, persisted);
      if (Date.now() - persisted.ts > FRESH_MS) refreshInBackground(search, key);
      return Promise.resolve(persisted.data);
    }
    return startFetch(search, key).then(entry => entry.data);
  }

  // ===== Vue 实例接管 =====
  const PATCH_FLAG = '__yhktCourseFilterPatched';
  let reqSeq = 0;

  function getVm(doc) {
    const el = doc.querySelector('.my-course-wrapper');
    return el && el.__vue__ ? el.__vue__ : null;
  }

  async function filteredLoad(vm) {
    if (!vm || vm._isDestroyed) return;
    const seq = ++reqSeq;
    try {
      const courses = await fetchAllCourses(vm.courseSearch);
      if (seq !== reqSeq || !vm.coursePage) return;

      const visible = courses.filter(c => !shouldHide(c));
      vm.coursePage.total = visible.length;

      const pages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
      if (!vm.coursePage.page || vm.coursePage.page > pages) vm.coursePage.page = pages;
      if (vm.coursePage.page < 1) vm.coursePage.page = 1;

      const start = (vm.coursePage.page - 1) * PAGE_SIZE;
      vm.courseList = visible.slice(start, start + PAGE_SIZE);
    } catch (e) {
      // 接口失败时退回站点原始行为，至少不影响正常浏览
      console.warn('[yhkt-course-filter] 过滤数据获取失败，回退原始列表', e);
      if (seq === reqSeq && vm.__yhktOriginalGetCourseList) {
        vm.__yhktOriginalGetCourseList();
      }
    }
  }

  function ensurePatch(vm) {
    if (!vm || vm[PATCH_FLAG]) return;
    const original = vm.getCourseList.bind(vm);
    vm.__yhktOriginalGetCourseList = original;
    vm[PATCH_FLAG] = true;
    vm.getCourseList = function () {
      if (!filtersActive()) return original();
      return filteredLoad(vm);
    };
    // 脚本晚于组件挂载时，按当前开关状态重刷一次。
    // 再补两次延迟重刷：站点自己的首次列表请求可能在脚本接管前就已发出，
    // 如果它比我们的过滤结果晚返回，会把列表覆盖回未过滤状态。
    if (filtersActive()) {
      filteredLoad(vm);
      setTimeout(() => filtersActive() && filteredLoad(vm), 1000);
      setTimeout(() => filtersActive() && filteredLoad(vm), 3000);
    }
  }

  function reloadList() {
    const vm = getVm(document);
    if (!vm) return;
    if (vm.coursePage) vm.coursePage.page = 1;
    vm.getCourseList();
  }

  // ===== 嵌入搜索栏的开关 =====
  function syncControls(doc) {
    const box = doc.getElementById(CONTROLS_ID);
    if (!box) return;
    box.querySelectorAll('.yhkt-cf-toggle').forEach(toggle => {
      const key = toggle.dataset.key;
      const on = !!state[key];
      if (toggle.classList.contains('is-on') !== on) toggle.classList.toggle('is-on', on);
      toggle.setAttribute('aria-checked', String(on));
      const input = toggle.querySelector('input');
      if (input && input.checked !== on) input.checked = on;
    });
  }

  function ensureControls(doc) {
    if (doc.getElementById(CONTROLS_ID)) {
      syncControls(doc);
      return;
    }
    const form = doc.querySelector('.my-course-search form.el-form');
    if (!form) return;

    const items = [...form.querySelectorAll(':scope > .el-form-item')];
    const searchItem = items.find(item =>
      [...item.querySelectorAll('button')].some(btn => (btn.innerText || '').trim() === '搜索')
    );

    const box = doc.createElement('div');
    box.className = 'el-form-item';
    box.id = CONTROLS_ID;
    box.innerHTML = `
      <div class="el-form-item__content">
        <label class="yhkt-cf-toggle" data-key="hidePhysics"
               title="隐藏所有以「${PHYSICS_PREFIX}」开头的课程">
          <span class="yhkt-cf-toggle-label">隐藏物理实验</span>
          <span class="yhkt-cf-switch"></span>
          <input type="checkbox">
        </label>
        <label class="yhkt-cf-toggle" data-key="hideZeroTasks"
               title="隐藏任务数为 0 的课程">
          <span class="yhkt-cf-toggle-label">隐藏0任务</span>
          <span class="yhkt-cf-switch"></span>
          <input type="checkbox">
        </label>
      </div>
    `;

    box.querySelectorAll('.yhkt-cf-toggle').forEach(toggle => {
      toggle.addEventListener('click', e => {
        e.preventDefault();
        const key = toggle.dataset.key;
        state[key] = !state[key];
        syncControls(doc);
        saveState();
        reloadList();
      });
    });

    if (searchItem) searchItem.after(box);
    else form.appendChild(box);

    syncControls(doc);
  }

  // ===== 启动 & 监听 SPA 变化 =====
  let scheduled = false;
  let lastAssert = 0;

  function scheduleEnsure(doc) {
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => {
      scheduled = false;
      ensureStyle(doc);
      const vm = getVm(doc);
      if (!vm) return;
      ensureControls(doc);
      ensurePatch(vm);

      // 自校正：站点自己的列表响应可能晚于我们的过滤结果返回，
      // 把 courseList / total 覆盖回未过滤状态。发现遗漏就重新过滤。
      if (filtersActive() && vm[PATCH_FLAG]) {
        const key = searchKey(vm.courseSearch);
        const cached = getCached(key);
        const expected = cached ? cached.data.filter(c => !shouldHide(c)).length : null;
        const listBad = Array.isArray(vm.courseList) && vm.courseList.some(shouldHide);
        const totalBad = expected !== null &&
          Number(vm.coursePage && vm.coursePage.total) !== expected;
        if ((listBad || totalBad) && Date.now() - lastAssert > 500) {
          lastAssert = Date.now();
          filteredLoad(vm);
        }
      }
    }, 120);
  }

  function boot(doc) {
    if (!doc) return;

    // 课程页：趁站点自身启动，提前拉全量列表；与后续请求共用同一个 Promise
    if (doc.location && String(doc.location.hash).indexOf('myStudy/myCourse') !== -1) {
      fetchAllCourses({}).catch(() => {});
    }

    if (!doc.body) {
      if (doc.readyState === 'loading') {
        doc.addEventListener('DOMContentLoaded', () => boot(doc), { once: true });
      } else {
        setTimeout(() => boot(doc), 0);
      }
      return;
    }

    scheduleEnsure(doc);
    new MutationObserver(() => scheduleEnsure(doc)).observe(doc.body, {
      childList: true,
      subtree: true,
    });
  }

  boot(document);
})();
