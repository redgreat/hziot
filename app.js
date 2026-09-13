/* ==== js/config.js ==== */
/* config.js — 全局配置（域名值只允许出现在本文件常量定义处）
 * PetTrack · 合宙IoT-运动传感器 WEB 平台
 * 域名划分（v11 强制）：
 *   接口请求（XHR/fetch，含 OAuth）一律 API_HOST（https://api-iot.luatos.com）
 *   页面跳转 / OAuth return_to 一律 PAGE_BASE（https://iot.luatos.com）前缀完整绝对 URL
 */
(function () {
  'use strict';

  var API_HOST = 'https://api-iot.luatos.com';
  var PAGE_BASE = 'https://iot.luatos.com';

  var CFG = {
    APP_NAME: 'PetTrack',
    BRAND: '合宙IoT-运动传感器',
    VERSION: 'V0.3',
    BUILD_DATE: '2026-09-03',

    // ---- 域名（只在此处定义）----
    API_HOST: API_HOST,
    PAGE_BASE: PAGE_BASE,
    GATEWAY: API_HOST + '/iot/open_api',
    OAUTH_AUTHORIZE: API_HOST + '/iam/luat_oauth/authorize',
    OAUTH_LOGIN: API_HOST + '/iam/luat_oauth/v2/login',

    // ---- 页面跳转（生产拼 PAGE_BASE 绝对 URL，本地开发回退相对路径）----
    pageUrl: function (file) {
      try {
        var loc = window.location;
        var isLocal = loc && (loc.protocol === 'file:' || /^(localhost|127\.0\.0\.1|\[::1\])$/.test(loc.hostname || ''));
        if (isLocal) return file; // 本地开发允许相对路径
        var path = loc && loc.pathname ? String(loc.pathname) : '/';
        // 以当前页面文件所在目录为基准，推算同级目录下的目标文件
        var dir = path.replace(/[^/]*$/, '');
        return PAGE_BASE + dir + file;
      } catch (e) {
        return file;
      }
    },
    // 判断给定地址是否已是 PAGE_BASE 开头的绝对地址
    isPageBaseAbs: function (u) {
      return typeof u === 'string' && u.indexOf(PAGE_BASE + '/') === 0;
    },

    // ---- appId（从 URL /ai_app/luatos/<appId>/ 提取）----
    getAppId: function () {
      try {
        var u = window.location.href;
        var m = /\/ai_app\/luatos\/([^/]+)/.exec(u);
        return m ? decodeURIComponent(m[1]) : '';
      } catch (e) { return ''; }
    },

    // ---- 请求参数 ----
    TIMEOUT_MS: 15000,
    POLL_HOME_MS: 10000,        // 首页常规轮询
    POLL_TURBO_MS: 500,         // 实时追踪轮询
    TURBO_DURATION_MS: 60000,   // 实时追踪持续 60s
    TURBO_CMD_TAG: 21,          // iRTU 下行指令 tag（fast_report）

    // ---- Tag 体系（官方清单 + 设备实测权威映射，禁止编造）----
    DEFAULT_STATUS_TAGS: [513, 512, 799, 782, 519, 256],
    TRACK_TAGS: [513, 512],
    TAG_GNSS_LNG: 512,   // GNSS 经度（勿与 513 反）
    TAG_GNSS_LAT: 513,   // GNSS 纬度
    TAG_VBAT: 799,       // 电压 mV（上报电压，勿用 771）
    TAG_SAT: 517,        // 可见卫星数
    TAG_SIGNAL: 782,     // 4G 信号强度
    TAG_LOC_FLAG: 519,   // 定位标识（2=GPS 成功）
    TAG_TEMP: 256,       // 温度
    TAG_SEARCH_TOTAL: 516, // 搜星总数
    TAG_TOP4_CN: 515,    // 最强 4 星 CN 值
    TAG_REBOOT: 777,     // 开机原因/重启
    TAG_GNSS_BIN: 1294,  // GNSS BINARY 5×int16 大端差分
    TAG_GSENSOR: 1293,   // gsensor IMU 12bit 三轴（私有 tag，走 allowCustom）

    // 官方 TAG_LIST（设备实测权威口径；私有 1293 用 allowCustom 查询）
    TAG_LIST: [21, 22, 25, 28, 256, 512, 513, 515, 516, 517, 519, 777, 782, 799, 1281, 1293, 1294],
    // 指令 UI 预设 tag
    CMD_TAGS: [
      { tag: 21, name: 'iRTU 下行指令', hint: '如 {"cmd":"fast_report"}' },
      { tag: 22, name: '通知设备上传日志', hint: '' },
      { tag: 25, name: 'iRTU 上行回复', hint: '' },
      { tag: 28, name: 'SMS 短信', hint: '' },
      { tag: 1281, name: '自定义下行消息', hint: '' }
    ],

    // val_<tag>（平台已解析值，定位为 GCJ02）优先；false 取数字 key（设备原始值，WGS84）
    USE_PLATFORM_VAL: true,

    // ---- 云端设备名称同步（common KV）----
    DEVNAME_CLS: 10,          // 数据分类
    DEVNAME_PREFIX: 'pt_'     // 业务缓存前缀（登录成功后清空防多账号污染）
  };

  window.CFG = CFG;
})();

/* ==== js/utils.js ==== */
/* utils.js — 通用工具（时间一律 v48：平台数据时间已是 UTC+8 字面，本地钟面直出，不做任何 ±8 运算） */
(function () {
  'use strict';

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  // 无时区字面 "YYYY-MM-DD HH:mm:ss" 按本地钟面解析（不做 ±8）；含时区标记才原生解析
  function parseLocal(s) {
    if (s instanceof Date) return s;
    if (typeof s === 'number') return new Date(s);
    if (typeof s !== 'string') return null;
    s = s.trim();
    if (/(Z|[+\-]\d{2}:?\d{2})$/.test(s)) {
      var t = Date.parse(s);
      return isNaN(t) ? null : new Date(t);
    }
    var m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/.exec(s);
    if (!m) return null;
    return new Date(
      +m[1], +m[2] - 1, +m[3],
      m[4] ? +m[4] : 0,
      m[5] ? +m[5] : 0,
      m[6] ? +m[6] : 0
    );
  }

  // 本地钟面直出（getFullYear/getHours…），与平台字面 roundtrip 恒等
  function fmtTime(d) {
    d = parseLocal(d);
    if (!d || isNaN(d.getTime())) return '-';
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) +
      ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds());
  }
  function fmtDate(d) {
    d = parseLocal(d);
    if (!d || isNaN(d.getTime())) return '-';
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }
  function fmtShort(d) {
    d = parseLocal(d);
    if (!d || isNaN(d.getTime())) return '-';
    return pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds());
  }
  function fmtMinute(d) {
    d = parseLocal(d);
    if (!d || isNaN(d.getTime())) return '-';
    return pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }
  // 今天本地日期字面
  function todayStr() { return fmtDate(new Date()); }
  function monthStartStr() { var d = new Date(); return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-01'; }

  // 相对量 = 物理 epoch 差（与时区无关）
  function agoText(d) {
    var t = parseLocal(d);
    if (!t || isNaN(t.getTime())) return '-';
    var sec = Math.max(0, Math.round((Date.now() - t.getTime()) / 1000));
    if (sec < 60) return sec + ' 秒前';
    if (sec < 3600) return Math.floor(sec / 60) + ' 分钟前';
    if (sec < 86400) return Math.floor(sec / 3600) + ' 小时前';
    return Math.floor(sec / 86400) + ' 天前';
  }
  function spanText(sec) {
    sec = Math.max(0, Math.round(sec));
    if (sec < 60) return sec + ' 秒';
    if (sec < 3600) return Math.floor(sec / 60) + ' 分' + pad2(sec % 60) + ' 秒';
    return Math.floor(sec / 3600) + ' 时' + pad2(Math.floor((sec % 3600) / 60)) + ' 分';
  }

  function esc(s) {
    if (s === null || s === undefined) return '';
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function byId(id) { return document.getElementById(id); }

  // localStorage 安全封装（遍历用 key(i)，Object.keys 在某些实现拿不到键）
  var store = {
    get: function (k, def) {
      try {
        var v = window.localStorage.getItem(k);
        if (v === null || v === undefined || v === '') return def;
        try { return JSON.parse(v); } catch (e) { return v; }
      } catch (e) { return def; }
    },
    set: function (k, v) {
      try { window.localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; }
    },
    remove: function (k) {
      try { window.localStorage.removeItem(k); } catch (e) { /* 忽略 */ }
    },
    keysWithPrefix: function (prefix) {
      var out = [];
      try {
        var ls = window.localStorage;
        for (var i = 0; i < ls.length; i++) {
          var k = ls.key(i);
          if (k && (!prefix || k.indexOf(prefix) === 0)) out.push(k);
        }
      } catch (e) { /* 忽略 */ }
      return out;
    },
    clearPrefix: function (prefix) {
      var ks = this.keysWithPrefix(prefix);
      for (var i = 0; i < ks.length; i++) this.remove(ks[i]);
    }
  };

  function debounce(fn, ms) {
    var t = null;
    return function () {
      var args = arguments, self = this;
      if (t) clearTimeout(t);
      t = setTimeout(function () { t = null; fn.apply(self, args); }, ms);
    };
  }

  // 电压 mV → 电量 %（(v-3000)/(4200-3000)，799 口径）
  function vbatToPercent(mv) {
    var v = Number(mv);
    if (!isFinite(v) || v <= 0) return null;
    var p = (v - 3000) / (4200 - 3000);
    p = Math.round(p * 100);
    if (p < 0) p = 0; if (p > 100) p = 100;
    return p;
  }
  var VBAT_LOW = 3400; // ≤3400mV 视为低电

  function signalText(v) {
    var n = Number(v);
    if (!isFinite(n) || n <= 0) return '无信号';
    if (n >= 25) return '信号优(' + n + ')';
    if (n >= 15) return '信号良(' + n + ')';
    if (n >= 5) return '信号弱(' + n + ')';
    return '极弱(' + n + ')';
  }

  // 两点球面距离（米），输入 GCJ02 原值即可
  function distance(lng1, lat1, lng2, lat2) {
    var R = 6371000, rad = Math.PI / 180;
    var dLat = (lat2 - lat1) * rad, dLng = (lng2 - lng1) * rad;
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function fmtDist(m) {
    m = Number(m) || 0;
    if (m < 1000) return Math.round(m) + ' m';
    return (m / 1000).toFixed(2) + ' km';
  }

  function fmtSpeed(ms) {
    var v = Number(ms) || 0;
    return (v * 3.6).toFixed(1) + ' km/h';
  }

  function toast(msg, type) {
    var box = byId('toast-box');
    if (!box) {
      box = document.createElement('div');
      box.id = 'toast-box';
      document.body.appendChild(box);
    }
    var el = document.createElement('div');
    el.className = 'toast ' + (type === 'err' ? 'toast-err' : type === 'ok' ? 'toast-ok' : '');
    el.textContent = String(msg || '');
    box.appendChild(el);
    setTimeout(function () { el.classList.add('show'); }, 10);
    setTimeout(function () {
      el.classList.remove('show');
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 300);
    }, 2600);
  }

  function copyText(text) {
    try {
      var ta = document.createElement('textarea');
      ta.value = String(text || '');
      ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      var ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch (e) { return false; }
  }

  // 简易模态框
  function openModal(title, bodyHtml, opts) {
    opts = opts || {};
    closeModal();
    var wrap = document.createElement('div');
    wrap.id = 'modal-wrap';
    wrap.className = 'modal-wrap';
    var inner = document.createElement('div');
    inner.className = 'modal ' + (opts.cls || '');
    var head = document.createElement('div');
    head.className = 'modal-head';
    var h = document.createElement('div');
    h.className = 'modal-title';
    h.textContent = title || '';
    var close = document.createElement('button');
    close.className = 'modal-close';
    close.type = 'button';
    close.textContent = '✕';
    close.addEventListener('click', closeModal);
    head.appendChild(h); head.appendChild(close);
    var body = document.createElement('div');
    body.className = 'modal-body';
    body.innerHTML = bodyHtml || '';
    inner.appendChild(head); inner.appendChild(body);
    wrap.appendChild(inner);
    wrap.addEventListener('click', function (e) { if (e.target === wrap && !opts.lock) closeModal(); });
    document.body.appendChild(wrap);
    return body;
  }
  function closeModal() {
    var w = byId('modal-wrap');
    if (w && w.parentNode) w.parentNode.removeChild(w);
  }

  // 时间窗口选择组（半小时/1小时/6小时/当自然天/当自然月）
  var RANGES = [
    { key: '30m', label: '半小时', ms: 30 * 60 * 1000 },
    { key: '1h', label: '1小时', ms: 60 * 60 * 1000 },
    { key: '6h', label: '6小时', ms: 6 * 60 * 60 * 1000 },
    { key: 'day', label: '当自然天' },
    { key: 'month', label: '当自然月' }
  ];
  function rangeWindow(key) {
    var now = new Date();
    var endStr = fmtTime(now);
    var start;
    if (key === '30m') start = new Date(now.getTime() - 30 * 60 * 1000);
    else if (key === '1h') start = new Date(now.getTime() - 60 * 60 * 1000);
    else if (key === '6h') start = new Date(now.getTime() - 6 * 60 * 60 * 1000);
    else if (key === 'day') start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    else start = new Date(now.getFullYear(), now.getMonth(), 1);
    return { start: fmtTime(start), end: endStr };
  }

  window.U = {
    pad2: pad2,
    parseLocal: parseLocal,
    fmtTime: fmtTime,
    fmtDate: fmtDate,
    fmtShort: fmtShort,
    fmtMinute: fmtMinute,
    todayStr: todayStr,
    monthStartStr: monthStartStr,
    agoText: agoText,
    spanText: spanText,
    esc: esc,
    $: $, $$: $$, byId: byId,
    store: store,
    debounce: debounce,
    vbatToPercent: vbatToPercent,
    VBAT_LOW: VBAT_LOW,
    signalText: signalText,
    distance: distance,
    fmtDist: fmtDist,
    fmtSpeed: fmtSpeed,
    toast: toast,
    copyText: copyText,
    openModal: openModal,
    closeModal: closeModal,
    RANGES: RANGES,
    rangeWindow: rangeWindow
  };
})();

/* ==== js/pet-store.js ==== */
/* pet-store.js — 设备档案（自动建档，云端名称为权威，本地待传名 pending 保护） */
(function () {
  'use strict';

  var K_PROFILES = 'pt_profiles';        // {imei:{imei,name,note,auto,updated}}
  var K_HIDDEN = 'pt_hidden_devices';    // [imei,...] 删除自动设备黑名单防重建
  var K_PENDING = 'pt_pending_names';    // {imei:{name,ts}} 上传失败待重试
  var K_STATUS = 'pt_status_cache';      // {imei:{...最近一次实时状态}}（内存+持久）

  var U = window.U;

  var profiles = U.store.get(K_PROFILES) || {};
  var hidden = U.store.get(K_HIDDEN) || [];
  var pending = U.store.get(K_PENDING) || {};
  var statuses = {}; // imei → 最新 getPetStatus 结果（内存）

  function saveProfiles() { U.store.set(K_PROFILES, profiles); }
  function saveHidden() { U.store.set(K_HIDDEN, hidden); }
  function savePending() { U.store.set(K_PENDING, pending); }

  function isHidden(imei) { return hidden.indexOf(imei) >= 0; }

  // 平台设备列表合并：平台有而本地无档案 → 自动建档“未命名设备”（黑名单除外）
  function mergeDevices(imeis) {
    var changed = false;
    for (var i = 0; i < imeis.length; i++) {
      var imei = imeis[i];
      if (!imei) continue;
      if (!profiles[imei] && !isHidden(imei)) {
        profiles[imei] = { imei: imei, name: '未命名设备', note: '', auto: true, updated: U.fmtTime(new Date()) };
        changed = true;
      }
    }
    if (changed) saveProfiles();
    return changed;
  }

  function list() {
    var out = [];
    for (var imei in profiles) {
      if (Object.prototype.hasOwnProperty.call(profiles, imei)) out.push(profiles[imei]);
    }
    out.sort(function (a, b) {
      if (a.auto !== b.auto) return a.auto ? 1 : -1;
      return String(a.imei).localeCompare(String(b.imei));
    });
    return out;
  }

  function get(imei) { return profiles[imei] || null; }

  function getName(imei) {
    var p = profiles[imei];
    return p && p.name ? p.name : imei;
  }

  function upsert(imei, fields) {
    if (!imei) return null;
    var p = profiles[imei];
    if (!p) p = profiles[imei] = { imei: imei, auto: false };
    if (fields) {
      if (fields.name !== undefined) p.name = String(fields.name).trim() || p.name;
      if (fields.note !== undefined) p.note = String(fields.note || '');
      if (fields.auto !== undefined) p.auto = !!fields.auto;
    }
    p.updated = U.fmtTime(new Date());
    saveProfiles();
    return p;
  }

  // 删除设备：本地档案删 + 黑名单防自动重建；返回是否在黑名单中新增
  function remove(imei) {
    var isNewHide = false;
    if (profiles[imei]) { delete profiles[imei]; saveProfiles(); }
    if (!isHidden(imei)) { hidden.push(imei); saveHidden(); isNewHide = true; }
    delete pending[imei]; savePending();
    delete statuses[imei];
    return isNewHide;
  }

  function restore(imei) {
    var i = hidden.indexOf(imei);
    if (i >= 0) { hidden.splice(i, 1); saveHidden(); }
  }
  function hiddenList() { return hidden.slice(); }

  // ---- 云端名称（v52，权威覆盖；本地待传名 pending 保护不被旧名回盖）----
  function hasPending(imei) { return !!pending[imei]; }
  function pendingNames() {
    var out = [];
    for (var imei in pending) {
      if (Object.prototype.hasOwnProperty.call(pending, imei)) out.push({ imei: imei, name: pending[imei].name });
    }
    return out;
  }
  function markPending(imei, name) {
    pending[imei] = { name: name, ts: Date.now() };
    savePending();
    // 本地立即生效（云端待重试；云端旧名不得回盖）
    var p = profiles[imei];
    if (p && p.name !== name) { p.name = name; p.updated = U.fmtTime(new Date()); saveProfiles(); }
  }
  function clearPending(imei) {
    if (pending[imei]) { delete pending[imei]; savePending(); }
  }

  // records: common/list 记录 [{id,uni_key,s1,...}] → 云端权威覆盖本地名
  function applyCloudNames(records) {
    var changed = false;
    for (var i = 0; i < (records || []).length; i++) {
      var rec = records[i];
      var imei = rec && rec.uni_key;
      var name = rec && rec.s1;
      if (!imei || !name) continue;
      if (pending[imei]) continue; // 待上传名优先，防回盖
      var p = profiles[imei];
      if (!p) {
        profiles[imei] = { imei: imei, name: name, note: '', auto: true, updated: U.fmtTime(new Date()) };
        changed = true;
      } else if (p.name !== name) {
        p.name = name;
        p.updated = U.fmtTime(new Date());
        changed = true;
      }
    }
    if (changed) saveProfiles();
    return changed;
  }

  // ---- 实时状态缓存（内存）----
  function setStatus(imei, st) { statuses[imei] = st; }
  function getStatus(imei) { return statuses[imei] || null; }
  function statusList() {
    var out = [];
    for (var imei in statuses) {
      if (Object.prototype.hasOwnProperty.call(statuses, imei)) out.push(statuses[imei]);
    }
    return out;
  }

  // 登录成功后清空业务缓存（pt_* 防多账号污染）——由 AC/登录页调用
  function clearAllBusinessCache() {
    U.store.clearPrefix('pt_');
  }

  window.PetStore = {
    mergeDevices: mergeDevices,
    list: list,
    get: get,
    getName: getName,
    upsert: upsert,
    remove: remove,
    restore: restore,
    hiddenList: hiddenList,
    isHidden: isHidden,
    hasPending: hasPending,
    pendingNames: pendingNames,
    markPending: markPending,
    clearPending: clearPending,
    applyCloudNames: applyCloudNames,
    setStatus: setStatus,
    getStatus: getStatus,
    statusList: statusList,
    clearAllBusinessCache: clearAllBusinessCache,
    K_PROFILES: K_PROFILES,
    K_HIDDEN: K_HIDDEN
  };
})();

/* ==== js/fence.js ==== */
/* fence.js — 电子围栏存储与越界判定（统一 GCJ02，不可再 toMapCoord） */
(function () {
  'use strict';

  var K_FENCES = 'pt_fences';
  var K_ALERTS = 'pt_fences_alerts';
  var DEBOUNCE_MS = 5 * 60 * 1000; // 同一设备+围栏 5 分钟去抖

  var U = window.U;

  var fences = U.store.get(K_FENCES) || [];
  var alerts = U.store.get(K_ALERTS) || [];
  var lastAlertAt = {}; // imei|fenceId → ts

  function save() { U.store.set(K_FENCES, fences); }
  function saveAlerts() { U.store.set(K_ALERTS, alerts); }

  function list() { return fences.slice(); }
  function get(id) {
    for (var i = 0; i < fences.length; i++) if (fences[i].id === id) return fences[i];
    return null;
  }

  function add(f) {
    var rec = {
      id: 'f' + Date.now() + Math.floor(Math.random() * 1000),
      type: f.type === 'polygon' ? 'polygon' : 'circle',
      name: String(f.name || ('围栏 ' + (fences.length + 1))),
      enabled: f.enabled !== false,
      created: U.fmtTime(new Date())
    };
    if (rec.type === 'circle') {
      rec.center = { lng: f.center.lng, lat: f.center.lat };
      rec.radius = Math.max(20, Number(f.radius) || 20); // 半径 ≥20m
    } else {
      rec.points = (f.points || []).map(function (p) { return { lng: p.lng, lat: p.lat }; });
    }
    fences.push(rec);
    save();
    return rec;
  }

  function update(id, fields) {
    var f = get(id);
    if (!f) return null;
    if (fields && fields.name !== undefined) f.name = String(fields.name);
    if (fields && fields.enabled !== undefined) f.enabled = !!fields.enabled;
    save();
    return f;
  }

  function remove(id) {
    for (var i = 0; i < fences.length; i++) {
      if (fences[i].id === id) { fences.splice(i, 1); save(); return true; }
    }
    return false;
  }

  // 点是否在圆内
  function inCircle(lng, lat, c) {
    return U.distance(lng, lat, c.center.lng, c.center.lat) <= c.radius;
  }

  // 射线法：点是否在多边形内
  function inPolygon(lng, lat, c) {
    var pts = c.points || [];
    var inside = false;
    for (var i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      var xi = pts[i].lng, yi = pts[i].lat, xj = pts[j].lng, yj = pts[j].lat;
      var intersect = ((yi > lat) !== (yj > lat)) &&
        (lng < (xj - xi) * (lat - yi) / ((yj - yi) || 1e-12) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  // 越界判定（GCJ02 原值，不做坐标二次转换）
  function isPointInFence(lng, lat, fence) {
    if (!fence || !fence.enabled) return false;
    try {
      if (fence.type === 'circle') return inCircle(lng, lat, fence);
      if (fence.type === 'polygon' && (fence.points || []).length >= 3) return inPolygon(lng, lat, fence);
    } catch (e) { /* 忽略 */ }
    return false;
  }

  function firstFenceContaining(lng, lat) {
    for (var i = 0; i < fences.length; i++) {
      if (isPointInFence(lng, lat, fences[i])) return fences[i];
    }
    return null;
  }

  // 越界报警（5 分钟去抖）——进入即报警口径
  function checkAlert(imei, lng, lat, timeStr) {
    var hit = firstFenceContaining(lng, lat);
    if (!hit) return null;
    var key = imei + '|' + hit.id;
    var now = Date.now();
    if (lastAlertAt[key] && now - lastAlertAt[key] < DEBOUNCE_MS) return null;
    lastAlertAt[key] = now;
    var rec = {
      id: 'a' + now,
      imei: imei,
      fenceId: hit.id,
      fenceName: hit.name,
      time: timeStr || U.fmtTime(new Date()),
      lng: lng,
      lat: lat
    };
    alerts.unshift(rec);
    if (alerts.length > 500) alerts.length = 500;
    saveAlerts();
    return rec;
  }

  function alertList() { return alerts.slice(); }
  function clearAlerts() { alerts.length = 0; saveAlerts(); }
  function markAlertRead(id) {
    for (var i = 0; i < alerts.length; i++) {
      if (alerts[i].id === id) { alerts[i].read = true; saveAlerts(); return; }
    }
  }

  window.FenceStore = {
    list: list,
    get: get,
    add: add,
    update: update,
    remove: remove,
    isPointInFence: isPointInFence,
    firstFenceContaining: firstFenceContaining,
    checkAlert: checkAlert,
    alertList: alertList,
    clearAlerts: clearAlerts,
    markAlertRead: markAlertRead,
    K_FENCES: K_FENCES,
    K_ALERTS: K_ALERTS
  };
})();

/* ==== js/algo/imufilter.js ==== */
/* algo/imufilter.js — IMU 姿态滤波（1293 gsensor 12bit 三轴，无陀螺仪 → 重力方向低通平滑 + 倾角估计） */
(function () {
  'use strict';

  /**
   * 构造一个滤波器实例。
   * @param opts.alpha 低通系数（0~1，越小越平滑，默认 0.15）
   */
  function IMUFilter(opts) {
    opts = opts || {};
    this.alpha = typeof opts.alpha === 'number' ? opts.alpha : 0.15;
    this.reset();
  }

  IMUFilter.prototype.reset = function () {
    this.sx = null; this.sy = null; this.sz = null;
    this.pitch = 0; this.roll = 0;
    this.samples = 0;
  };

  // 喂入一个三轴样本（单位 g），返回平滑后的姿态 {pitch, roll, gx, gy, gz}
  IMUFilter.prototype.update = function (x, y, z) {
    if (this.sx === null) { this.sx = x; this.sy = y; this.sz = z; }
    else {
      var a = this.alpha;
      this.sx += a * (x - this.sx);
      this.sy += a * (y - this.sy);
      this.sz += a * (z - this.sz);
    }
    var gx = this.sx, gy = this.sy, gz = this.sz;
    var norm = Math.sqrt(gx * gx + gy * gy + gz * gz) || 1e-9;
    // 俯仰/横滚：由重力方向估计（弧度 → 度）
    var pitch = Math.asin(Math.max(-1, Math.min(1, -gx / norm))) * 180 / Math.PI;
    var roll = Math.atan2(gy, gz) * 180 / Math.PI;
    this.pitch = pitch; this.roll = roll;
    this.samples++;
    return { pitch: pitch, roll: roll, gx: gx, gy: gy, gz: gz };
  };

  window.IMUFilter = IMUFilter;
})();

/* ==== js/algo/stepcount.js ==== */
/* algo/stepcount.js — 步数计（1293 三轴合加速度峰值检测，自适应阈值 + 最小步间隔） */
(function () {
  'use strict';

  var MIN_STEP_MS = 250;   // 最小步间隔（~240 步/分上限）
  var MIN_MAG = 1.05;      // 最小幅度阈值（g）
  var MAX_MAG = 2.2;       // 上限截断防跌落冲击误计

  /**
   * 对 gsensor 样本序列计步。
   * @param samples [{t(ms可选), x, y, z}] 三轴单位 g
   * @returns {steps, stepsPerMin, distance(米), duration(秒)}
   */
  function countSteps(samples) {
    if (!samples || samples.length < 2) return { steps: 0, stepsPerMin: 0, distance: 0, duration: 0 };
    var lastPeakT = -1e9;
    var wasAbove = false;
    var steps = 0;
    var t0 = samples[0].t || 0;
    var tEnd = samples[samples.length - 1].t || t0 + samples.length * 10;
    var dynamicMin = MIN_MAG;

    // 预估动态阈值：先取合加速度均方差
    var sum = 0, sum2 = 0, n = 0;
    for (var i = 0; i < samples.length; i++) {
      var s = samples[i];
      var mag = Math.sqrt(s.x * s.x + s.y * s.y + s.z * s.z);
      sum += mag; sum2 += mag * mag; n++;
    }
    var mean = sum / n;
    var variance = Math.max(0, sum2 / n - mean * mean);
    var sd = Math.sqrt(variance);
    if (sd > 0.04) dynamicMin = Math.max(MIN_MAG, mean + sd * 0.6);

    for (var i2 = 0; i2 < samples.length; i2++) {
      var s2 = samples[i2];
      var m2 = Math.sqrt(s2.x * s2.x + s2.y * s2.y + s2.z * s2.z);
      var above = m2 >= Math.min(dynamicMin, MAX_MAG);
      var t = s2.t || (t0 + i2 * 10);
      if (above && !wasAbove && t - lastPeakT >= MIN_STEP_MS) {
        steps++;
        lastPeakT = t;
      }
      wasAbove = above;
    }

    var dur = Math.max(0, (tEnd - t0) / 1000);
    return {
      steps: steps,
      stepsPerMin: dur > 0 ? Math.round(steps * 60 / dur) : 0,
      distance: Math.round(steps * 0.7), // 步长经验值 0.7m
      duration: Math.round(dur)
    };
  }

  window.StepCounter = { countSteps: countSteps, MIN_STEP_MS: MIN_STEP_MS };
})();

/* ==== js/algo/attitude.js ==== */
/* algo/attitude.js — 运动姿态判定（静止/活动/剧烈）与跌倒检测（1293 三轴统计特征） */
(function () {
  'use strict';

  /**
   * 姿态判定：基于合加速度方差。
   * @param samples [{x,y,z}] 单位 g
   * @param imu 可选 {pitch,roll} 来自 IMUFilter
   */
  function classify(samples, imu) {
    var n = samples ? samples.length : 0;
    if (!n) return { state: '无数据', level: -1, variance: 0, tilt: imu ? Math.abs(imu.pitch) : 0 };
    var sum = 0, sum2 = 0;
    for (var i = 0; i < n; i++) {
      var s = samples[i];
      var mag = Math.sqrt(s.x * s.x + s.y * s.y + s.z * s.z);
      sum += mag; sum2 += mag * mag;
    }
    var mean = sum / n;
    var variance = Math.max(0, sum2 / n - mean * mean);
    var tilt = imu ? Math.sqrt(imu.pitch * imu.pitch + imu.roll * imu.roll) : 0;

    var state, level;
    if (variance < 0.0025) { state = '静止'; level = 0; }
    else if (variance < 0.02) { state = '活动'; level = 1; }
    else { state = '剧烈'; level = 2; }
    return { state: state, level: level, variance: variance, mean: mean, tilt: tilt };
  }

  /**
   * 跌倒检测：冲击峰（>2.2g）后紧随静止（方差极小）。
   * @returns {falls, indices:[...样本下标]}
   */
  function detectFalls(samples) {
    var falls = [], indices = [];
    var n = samples ? samples.length : 0;
    var WINDOW = 30; // 冲击后 30 个样本内检测静止
    for (var i = 1; i < n; i++) {
      var m1 = mag(samples[i - 1]), m2 = mag(samples[i]);
      if (m1 > 2.2 && m2 > 2.2) { // 合并连续冲击段
        var lowVar = true;
        var end = Math.min(n, i + WINDOW);
        var prev = m2, sum = 0, cnt = 0;
        for (var j = i; j < end; j++) {
          var mj = mag(samples[j]);
          sum += Math.abs(mj - prev); prev = mj; cnt++;
        }
        if (cnt && sum / cnt < 0.03) { lowVar = true; i = end; }
        if (lowVar) { falls.push(i); indices.push(i); }
      }
    }
    return { falls: falls.length, indices: indices };
  }

  function mag(s) { return Math.sqrt(s.x * s.x + s.y * s.y + s.z * s.z); }

  window.Attitude = { classify: classify, detectFalls: detectFalls };
})();

/* ==== js/algo/wgs2gcj.js ==== */
/* algo/wgs2gcj.js — WGS84 ⇄ GCJ02 坐标转换（标准国测局算法） */
(function () {
  'use strict';

  var PI = Math.PI;
  var A = 6378245.0;            // 长半轴
  var EE = 0.00669342162296594323; // 偏心率平方

  function outOfChina(lng, lat) {
    return (lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271);
  }

  function transformLat(x, y) {
    var ret = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
    ret += (20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0 / 3.0;
    ret += (20.0 * Math.sin(y * PI) + 40.0 * Math.sin(y / 3.0 * PI)) * 2.0 / 3.0;
    ret += (160.0 * Math.sin(y / 12.0 * PI) + 320 * Math.sin(y * PI / 30.0)) * 2.0 / 3.0;
    return ret;
  }

  function transformLng(x, y) {
    var ret = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
    ret += (20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0 / 3.0;
    ret += (20.0 * Math.sin(x * PI) + 40.0 * Math.sin(x / 3.0 * PI)) * 2.0 / 3.0;
    ret += (150.0 * Math.sin(x / 12.0 * PI) + 300.0 * Math.sin(x / 30.0 * PI)) * 2.0 / 3.0;
    return ret;
  }

  // WGS84 → GCJ02
  function wgs2gcj(lng, lat) {
    if (outOfChina(lng, lat)) return { lng: lng, lat: lat };
    var dLat = transformLat(lng - 105.0, lat - 35.0);
    var dLng = transformLng(lng - 105.0, lat - 35.0);
    var radLat = lat / 180.0 * PI;
    var magic = Math.sin(radLat);
    magic = 1 - EE * magic * magic;
    var sqrtMagic = Math.sqrt(magic);
    dLat = (dLat * 180.0) / ((A * (1 - EE)) / (magic * sqrtMagic) * PI);
    dLng = (dLng * 180.0) / (A / sqrtMagic * Math.cos(radLat) * PI);
    return { lng: lng + dLng, lat: lat + dLat };
  }

  // GCJ02 → WGS84（近似迭代一次）
  function gcj2wgs(lng, lat) {
    if (outOfChina(lng, lat)) return { lng: lng, lat: lat };
    var gcj = wgs2gcj(lng, lat);
    return { lng: lng * 2 - gcj.lng, lat: lat * 2 - gcj.lat };
  }

  window.Coord = {
    outOfChina: outOfChina,
    wgs2gcj: wgs2gcj,
    gcj2wgs: gcj2wgs
  };
})();

/* ==== js/algo/alg.js ==== */
/* algo/alg.js — 二进制解包（1294 GNSS 差分 / 1293 gsensor 12bit 三轴）与通用算法 */
(function () {
  'use strict';

  function hexToBytes(hex) {
    var out = [];
    hex = String(hex || '').replace(/[^0-9a-fA-F]/g, '');
    for (var i = 0; i + 1 < hex.length; i += 2) {
      out.push(parseInt(hex.substr(i, 2), 16));
    }
    return out;
  }

  function int16(bHi, bLo) {
    var v = (bHi << 8) | bLo;
    return v >= 0x8000 ? v - 0x10000 : v;
  }

  /**
   * 1294 GNSS BINARY：5×int16 大端差分
   * 布局（每样本 10 字节）：经度差 / 纬度差 / 速度×10(m/s) / 航向°×10 / 海拔(m)
   * 10s 一包 10 样本 × 10B；差分基准 = refLng/refLat（首样本绝对值 + 后续累加差分）
   * @returns [{lng,lat,speed(m/s),course(°),alt(m),idx}]
   */
  function decodeGnss5x16(bytes, refLng, refLat) {
    var out = [];
    if (!bytes || bytes.length < 10) return out;
    var lng = Number(refLng) || 0;
    var lat = Number(refLat) || 0;
    for (var off = 0; off + 9 < bytes.length; off += 10) {
      var dLng = int16(bytes[off], bytes[off + 1]);
      var dLat = int16(bytes[off + 2], bytes[off + 3]);
      var spd = int16(bytes[off + 4], bytes[off + 5]);   // 速度×10
      var crs = int16(bytes[off + 6], bytes[off + 7]);   // 航向°×10
      var alt = int16(bytes[off + 8], bytes[off + 9]);   // 海拔 m
      lng += dLng / 1e6;  // 差分单位 1e-6 度
      lat += dLat / 1e6;
      out.push({
        lng: lng,
        lat: lat,
        speed: spd / 10,          // m/s → km/h 由展示层处理
        course: crs / 10,
        alt: alt,
        idx: out.length
      });
    }
    return out;
  }

  /**
   * 1294 原始上报记录 → 解包（ref 取定位 tag 最新值或 val_hex 内首个样本绝对值）
   * rec 含 val_1294(hex) 或数字 key；refLng/refLat 为该包对应 512/513（GCJ02）
   */
  function decodeRec1294(rec, refLng, refLat) {
    var hex = rec && (rec.val_1294 !== undefined ? rec.val_1294 : rec['1294']);
    if (hex === undefined || hex === null || hex === '') return [];
    if (typeof hex === 'number') return [];
    return decodeGnss5x16(hexToBytes(hex), refLng, refLat);
  }

  /**
   * 1293 gsensor：12bit 三轴（单位 g）
   * 每样本 6 字节：x/y/z 各 12bit 大端（高 8bit + 低 4bit），有符号，满量程 ±4g
   * @returns [{x,y,z,t}]
   */
  function decodeGsensor1293(hex) {
    var bytes = hexToBytes(hex);
    var out = [];
    var off = 0;
    var t = 0;
    while (off + 5 <= bytes.length) {
      var x = sign12((bytes[off] << 4) | (bytes[off + 1] >> 4));
      var y = sign12(((bytes[off + 1] & 0x0f) << 8) | bytes[off + 2]);
      var z = sign12((bytes[off + 3] << 4) | (bytes[off + 4] >> 4));
      out.push({ x: x / 512, y: y / 512, z: z / 512, t: t }); // 满量程 ±4g → /512
      off += 5; // 12bit×3 = 4.5 字节 → 5 字节对齐时跳 5；若按 4.5 紧排则由上层按实际协议调整
      t += 10;
    }
    return out;
  }

  function sign12(v) {
    v = v & 0xfff;
    return v >= 0x800 ? v - 0x1000 : v;
  }

  // 轨迹抽稀（Douglas-Peucker 简化版：距离阈值抽稀，保起终点）
  function simplifyTrack(points, tolMeters) {
    tolMeters = tolMeters || 8;
    if (!points || points.length <= 2) return (points || []).slice();
    var out = [points[0]];
    var last = points[0];
    var U = window.U;
    for (var i = 1; i < points.length - 1; i++) {
      var p = points[i];
      if (U.distance(last.lng, last.lat, p.lng, p.lat) >= tolMeters) {
        out.push(p);
        last = p;
      }
    }
    out.push(points[points.length - 1]);
    return out;
  }

  window.Alg = {
    hexToBytes: hexToBytes,
    int16: int16,
    sign12: sign12,
    decodeGnss5x16: decodeGnss5x16,
    decodeRec1294: decodeRec1294,
    decodeGsensor1293: decodeGsensor1293,
    simplifyTrack: simplifyTrack
  };
})();

/* ==== js/api/rsa-pkcs1.js ==== */
/* api/rsa-pkcs1.js — RSA/ECB/PKCS1Padding 公钥加密（X-Key-Open-Api 用）
 * 待加密原文：当前时间戳(毫秒) + "," + appId
 * 公钥：登录接口返回 sets.publicKey（PKCS#8 格式，Base64）
 * 密文输出：Base64
 */
(function () {
  'use strict';

  // ---- DER 解析（仅提取 RSAPublicKey 的 modulus / exponent）----
  function b64ToBytes(b64) {
    var bin, bytes = [], i;
    if (typeof window.atob === 'function') {
      bin = window.atob(String(b64).replace(/\s+/g, ''));
      for (i = 0; i < bin.length; i++) bytes.push(bin.charCodeAt(i));
      return bytes;
    }
    // 兜底：无 atob 环境（不应出现于浏览器）
    throw new Error('atob unavailable');
  }

  function readLen(bytes, pos) {
    var b = bytes[pos++];
    if (b & 0x80) {
      var n = b & 0x7f, len = 0;
      while (n-- > 0) len = len * 256 + bytes[pos++];
      return [len, pos];
    }
    return [b, pos];
  }

  // 通用 DER 遍历：按序收集所有 INTEGER（兼容 PKCS#8 SubjectPublicKeyInfo 与裸 (n,e) 两种结构）
  function parsePublicKey(b64) {
    var bytes = b64ToBytes(b64);
    var ints = [];
    function readLen(pos) {
      var b = bytes[pos++];
      if (b & 0x80) {
        var n = b & 0x7f, len = 0;
        while (n-- > 0) len = len * 256 + bytes[pos++];
        return [len, pos];
      }
      return [b, pos];
    }
    function walk(pos, end) {
      while (pos + 1 < end) {
        var tag = bytes[pos];
        var r = readLen(pos + 1);
        var len = r[0], body = r[1];
        if (tag === 0x02) { // INTEGER
          var hex = '';
          for (var i = 0; i < len; i++) hex += (bytes[body + i] < 16 ? '0' : '') + bytes[body + i].toString(16);
          ints.push(BigInt('0x' + hex));
        } else if (tag === 0x30 || tag === 0x31) { // SEQUENCE / SET → 递归
          walk(body, body + len);
        } else if (tag === 0x03) { // BIT STRING → 跳过 unused-bits 后继续
          var p2 = body;
          if (bytes[p2] === 0x00) p2++;
          walk(p2, body + len);
        }
        // 其余 tag（OID/NULL/UTF8String 等）跳过
        pos = body + len;
      }
    }
    walk(0, bytes.length);
    if (ints.length < 2) throw new Error('bad public key: no (n,e)');
    return { n: ints[0], e: ints[1] };
  }

  function bytesToBigInt(bytes) {
    var hex = '';
    for (var i = 0; i < bytes.length; i++) hex += (bytes[i] < 16 ? '0' : '') + bytes[i].toString(16);
    return BigInt('0x' + (hex || '0'));
  }

  function bigIntToBytes(x, len) {
    var hex = x.toString(16);
    if (hex.length % 2) hex = '0' + hex;
    var bytes = [];
    var pad = len * 2 - hex.length;
    for (var i = 0; i < pad; i += 2) bytes.push(0);
    for (var j = 0; j < hex.length; j += 2) bytes.push(parseInt(hex.substr(j, 2), 16));
    return bytes;
  }

  function utf8Bytes(str) {
    var out = [];
    var s = window.unescape ? window.unescape(encodeURIComponent(str)) : str;
    for (var i = 0; i < s.length; i++) out.push(s.charCodeAt(i) & 0xff);
    return out;
  }

  function modPow(b, e, m) {
    var r = 1n;
    b = b % m;
    while (e > 0n) {
      if (e & 1n) r = (r * b) % m;
      b = (b * b) % m;
      e >>= 1n;
    }
    return r;
  }

  /**
   * PKCS#1 v1.5 加密
   * @param publicKeyB64 PKCS#8 Base64 公钥
   * @param text 明文字符串
   * @returns Base64 密文；失败返回 ''（调用方降级提示）
   */
  function encryptB64(publicKeyB64, text) {
    try {
      var key = parsePublicKey(publicKeyB64);
      var k = (key.n.toString(16).length + 1) >> 1; // 模长字节数
      var msg = utf8Bytes(String(text));
      if (msg.length > k - 11) return '';
      var psLen = k - msg.length - 3;
      var em = [0x00, 0x02];
      for (var i = 0; i < psLen; i++) {
        var b;
        do { b = Math.floor(Math.random() * 256); } while (b === 0); // PS 不得为 0
        em.push(b);
      }
      em.push(0x00);
      for (var j = 0; j < msg.length; j++) em.push(msg[j]);
      var m = bytesToBigInt(em);
      var c = modPow(m, key.e, key.n);
      var out = bigIntToBytes(c, k);
      var bin = '';
      for (var q = 0; q < out.length; q++) bin += String.fromCharCode(out[q]);
      return window.btoa(bin);
    } catch (e) {
      return '';
    }
  }

  window.RsaPkcs1 = {
    encryptB64: encryptB64,
    parsePublicKey: parsePublicKey,
    _b64ToBytes: b64ToBytes
  };
})();

/* ==== js/api/aircloud.js ==== */
/* api/aircloud.js — 合宙 AirCloud 统一请求层
 * 规范要点：
 *  - 三鉴权头 authorization / salt / sid（禁 Bearer、禁合并、禁打印）
 *  - POST JSON 显式 Content-Type: application/json（漏了会 951）
 *  - 15s AbortController 超时；catch 统一 {code:-102}，永不 reject
 *  - code 102/103/105 登录失效 → 清鉴权键 → 跳 login.html（resolve {code:-100}）
 *  - 本地无鉴权键：不发请求（resolve {code:-101}）
 *  - 时间 v48：平台时间已是 UTC+8 字面，本地钟面解析/展示，零 ±8
 */
(function () {
  'use strict';

  var CFG = window.CFG, U = window.U;

  // ---------- 鉴权缓存（my_* 优先 → ai_* 回退 → m_*） ----------
  function readJson(k) {
    try {
      var v = window.localStorage.getItem(k);
      if (!v) return null;
      var o = JSON.parse(v);
      return (o && typeof o === 'object') ? o : null;
    } catch (e) { return null; }
  }

  function authContext() {
    var prefixes = ['my_', 'ai_', 'm_']; // v5 认证缓存兼容
    for (var i = 0; i < prefixes.length; i++) {
      var p = prefixes[i];
      var auth = readJson(p + 'auth');
      var service = readJson(p + 'service');
      if (auth && typeof auth.token === 'string' && auth.token.length > 0 &&
          typeof auth.salt === 'string' && auth.salt.length > 0 &&
          service && typeof service.sid === 'string' && service.sid.length > 0) {
        return { prefix: p, auth: auth, service: service };
      }
    }
    return null;
  }

  function authHeaders() {
    var ctx = authContext();
    if (!ctx) return null;
    return {
      'authorization': ctx.auth.token,
      'salt': ctx.auth.salt,
      'sid': ctx.service.sid
    };
  }

  function hasAuth() { return !!authContext(); }

  function profile() {
    var prefixes = ['my_', 'ai_', 'm_'];
    for (var i = 0; i < prefixes.length; i++) {
      var p = readJson(prefixes[i] + 'profile');
      if (p) {
        // name/mobile 为新口径，user_name/user_phone 只读兼容
        return {
          name: p.name !== undefined ? p.name : p.user_name,
          mobile: p.mobile !== undefined ? p.mobile : p.user_phone,
          raw: p
        };
      }
    }
    return null;
  }

  // 登录返回 sets（RSA 公钥所在），同样三前缀兼容
  function sets() {
    var prefixes = ['my_', 'ai_', 'm_'];
    for (var i = 0; i < prefixes.length; i++) {
      var s = readJson(prefixes[i] + 'sets');
      if (s) return s;
    }
    return null;
  }

  function clearAuthKeys() {
    // 遍历须用 localStorage.key(i)；清理范围 my_*/ai_*/m_* + pt_nick/pt_account
    try {
      var ls = window.localStorage;
      var kill = [];
      for (var i = 0; i < ls.length; i++) {
        var k = ls.key(i);
        if (k && (k.indexOf('my_') === 0 || k.indexOf('ai_') === 0 || k.indexOf('m_') === 0 ||
            k === 'pt_nick' || k === 'pt_account')) kill.push(k);
      }
      for (var j = 0; j < kill.length; j++) {
        try { ls.removeItem(kill[j]); } catch (e) { /* 忽略 */ }
      }
    } catch (e) { /* 忽略 */ }
  }

  // 页面跳转（PAGE_BASE 前缀完整绝对 URL，本地回退相对路径）
  function goPage(file, returnTo) {
    var url = CFG.pageUrl(file);
    if (returnTo) {
      var safe = safeReturnTo(returnTo);
      if (safe) url += (url.indexOf('?') >= 0 ? '&' : '?') + 'return_to=' + encodeURIComponent(safe);
    }
    try { window.location.href = url; } catch (e) { /* 忽略 */ }
  }

  // returnTo 安全校验：仅放行站内路径（拒绝外域绝对地址、协议相对 //、任何 scheme:、
  // 带 query/hash 的地址、路径穿越）；PAGE_BASE 绝对地址剥离域名后取路径放行
  function safeReturnTo(u) {
    if (typeof u !== 'string' || !u) return '';
    var s = u.trim();
    if (!s) return '';
    if (s.indexOf('//') === 0) return '';
    if (/^[a-zA-Z][a-zA-Z0-9+.\-]*:/.test(s)) {
      // 仅 PAGE_BASE 开头的绝对地址放行（剥域名取站内路径）
      if (CFG.isPageBaseAbs(s)) {
        var abs = s.slice(CFG.PAGE_BASE.length);
        var q2 = abs.split(/[?&#]/)[0];
        return validSitePath(q2);
      }
      return '';
    }
    if (s.indexOf('/') !== 0) return '';
    var q = s.split(/[?&#]/)[0];
    return validSitePath(q);
  }

  function validSitePath(p) {
    if (!p || p.indexOf('/') !== 0 || p.indexOf('..') >= 0) return '';
    if (!/\.html$/.test(p)) return '';
    return p;
  }

  function handleLoginExpired() {
    clearAuthKeys();
    window.PetStore && window.PetStore.clearAllBusinessCache();
    goPage('login.html');
  }

  // ---------- 统一 request（POST JSON，永不 reject） ----------
  function request(endpoint, body, opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      var headers = opts.headers || authHeaders();
      if (!headers) {
        // 本地无鉴权键：不发请求
        resolve({ code: -101, value: '未登录或登录信息缺失' });
        return;
      }
      var url = (opts.baseUrl || CFG.GATEWAY) + endpoint;
      var controller = typeof AbortController === 'function' ? new AbortController() : null;
      var timer = null;
      var done = false;
      var init = {
        method: 'POST',
        headers: U.merge ? U.merge({ 'Content-Type': 'application/json' }, headers)
                          : Object.assign({ 'Content-Type': 'application/json' }, headers),
        body: JSON.stringify(body || {})
      };
      if (controller) init.signal = controller.signal;

      var finish = function (r) {
        if (done) return;
        done = true;
        if (timer) clearTimeout(timer);
        resolve(r);
      };

      if (controller) {
        timer = setTimeout(function () { try { controller.abort(); } catch (e) { /* 忽略 */ } }, CFG.TIMEOUT_MS);
      }

      fetch(url, init).then(function (resp) {
        return resp.text();
      }).then(function (text) {
        var data;
        try { data = JSON.parse(text); } catch (e) {
          finish({ code: -102, value: '数据解析失败' });
          return;
        }
        var code = data && typeof data.code === 'number' ? data.code : -102;
        if (code === 102 || code === 103 || code === 105) {
          handleLoginExpired();
          finish({ code: -100, value: '登录已失效，请重新登录' });
          return;
        }
        finish({ code: code, value: data ? data.value : null });
      }).catch(function () {
        finish({ code: -102, value: '网络异常或请求超时，请重试' });
      });
    });
  }

  // ---------- 开放接口（10 个已封装） ----------
  function listMyProjects() { return AC.request('/list_my_projects', {}); }

  function listMyDevices(project, page, size) {
    return AC.request('/list_my_devices', { project: project, page: page || 1, size: size || 100 });
  }

  function searchMyDevices(project, imeiPrefix, page, size) {
    return AC.request('/search_my_devices', { project: project, imei_prefix: imeiPrefix || '', page: page || 1, size: size || 100 });
  }

  // 官方 TAG_LIST 过滤；allowCustom 时跳过过滤（私有 tag 如 1293）
  function sanitizeTags(tags, allowCustom) {
    if (allowCustom) return (tags || []).filter(function (t) { return Number.isFinite(+t); });
    var list = CFG.TAG_LIST;
    return (tags || []).filter(function (t) { return list.indexOf(+t) >= 0; });
  }

  /**
   * 按 tags 查询（平台恒按 ct 降序返回）
   * opts: {clientId, tags, start, end, page, size, allowCustom}
   */
  function listByTags(opts) {
    var body = {
      client_id: opts.clientId,
      tags: sanitizeTags(opts.tags, opts.allowCustom)
    };
    if (body.tags.length === 0) {
      return Promise.resolve({ code: 1, value: '无有效 tags，已拦截请求' });
    }
    if (opts.page) body.page = opts.page;
    body.size = Math.min(100, Math.max(0, opts.size !== undefined ? opts.size : 100));
    if (opts.start && opts.end) {
      body.filter = { aks: ['ct', 'ct'], acs: ['ge', 'le'], avs: [AC.fmt(opts.start), AC.fmt(opts.end)] };
    }
    return AC.request('/aircloud/list_by_tags', body);
  }

  /**
   * 自动翻页拉全量（每页 ≤100；ct 平台恒降序，翻页后本地按 ct 升序归并）
   * opts: {clientId, tags, start, end, allowCustom, onProgress(done,total), maxRecords}
   */
  function fetchAllByTags(opts) {
    return new Promise(function (resolve) {
      var all = [];
      var page = 1;
      var stop = false;
      function step() {
        if (stop) { resolve(all); return; }
        listByTags({
          clientId: opts.clientId, tags: opts.tags, start: opts.start, end: opts.end,
          page: page, size: 100, allowCustom: opts.allowCustom
        }).then(function (r) {
          if (r.code !== 0 || !r.value || !r.value.records) {
            if (page === 1 && r.code !== 0) { resolve(r); return; }
            resolve(all);
            return;
          }
          var recs = r.value.records;
          all = all.concat(recs);
          if (opts.onProgress) {
            try { opts.onProgress(all.length, r.value.total); } catch (e) { /* 忽略 */ }
          }
          var max = opts.maxRecords || 20000;
          if (all.length >= max || recs.length < 100 || page >= 500) { resolve(all); return; }
          page++;
          step();
        });
      }
      step();
    });
  }

  function latestLocation(imei) {
    return AC.request('/aircloud/latest_location', { client_id: imei });
  }

  function locationHistory(imei, start, end, page, size) {
    return AC.request('/aircloud/location_history', {
      client_id: imei, start: AC.fmt(start), end: AC.fmt(end), page: page || 1, size: Math.min(100, size || 100)
    });
  }

  function sendCmd(imei, tag, value, protocol, sn) {
    var body = { client_id: imei, tag: +tag, protocol: protocol === undefined ? 0 : +protocol };
    if (value !== undefined && value !== null && value !== '') body.value = value;
    if (sn !== undefined && sn !== null) body.sn = +sn;
    // 已知未解问题：平台返回 code:13 "缺少Tag标志"（存在未文档化必填字段，待平台答复后补传）
    return AC.request('/aircloud/send_cmd', body);
  }

  // ---------- 时间 v48 ----------
  // 本地钟面字面 "YYYY-MM-DD HH:mm:ss"（与平台字面同基准）
  function fmt(v) { return U.fmtTime(v); }

  // 记录时间戳（ms）：batch_time(毫秒) 优先，否则 ct 本地钟面解析
  function recTs(rec) {
    if (!rec) return 0;
    if (rec.batch_time !== undefined && rec.batch_time !== null && rec.batch_time !== '') {
      var b = Number(rec.batch_time);
      if (isFinite(b) && b > 0) return b;
    }
    var d = U.parseLocal(rec.ct);
    return d ? d.getTime() : 0;
  }

  // 取值：兼容 val_<tag>（平台已解析）与数字 key（设备原始），优先顺序由 CFG.USE_PLATFORM_VAL
  function recVal(rec, tag) {
    if (!rec) return undefined;
    tag = String(tag);
    var platformVal = rec['val_' + tag];
    var rawVal = rec[tag];
    if (CFG.USE_PLATFORM_VAL) {
      if (platformVal !== undefined && platformVal !== null) return platformVal;
      return rawVal;
    }
    if (rawVal !== undefined && rawVal !== null) return rawVal;
    return platformVal;
  }

  // 坐标来源标记：val_ 形式 = 平台已解析 GCJ02（不可再 toMapCoord）；数字 key = 设备原始（WGS84）
  function recValInfo(rec, tag) {
    tag = String(tag);
    var hasPlatform = rec && rec['val_' + tag] !== undefined && rec['val_' + tag] !== null;
    var hasRaw = rec && rec[tag] !== undefined && rec[tag] !== null;
    return {
      coord: hasPlatform ? 'gcj02' : (hasRaw ? 'wgs84' : 'none'),
      value: recVal(rec, tag)
    };
  }

  // ---------- 实时状态（三路并联） ----------
  /**
   * getPetStatus(imei)：latest_location + [799,517] + [1294]
   * 返回 {imei,lng,lat,wlng,wlat,address,time,signal,percent,vbat,percentCalc,sat,gnss,speedKmh,course,alt}
   */
  function getPetStatus(imei) {
    return new Promise(function (resolve) {
      var p1 = latestLocation(imei);
      var p2 = listByTags({ clientId: imei, tags: [799, 517], size: 1 });
      var p3 = listByTags({ clientId: imei, tags: [1294], size: 1 });
      Promise.all([p1, p2, p3]).then(function (rs) {
        var loc = rs[0], bat = rs[1], gn = rs[2];
        if (loc.code !== 0) { resolve({ imei: imei, code: loc.code, value: loc.value }); return; }
        var v = loc.value || {};
        var st = {
          imei: imei,
          code: 0,
          lng: v.lng, lat: v.lat, wlng: v.wlng, wlat: v.wlat,
          address: v.address || '',
          time: v.time || '',
          signal: v.signal,
          percent: v.percent,
          vbat: null, percentCalc: null,
          sat: null, gnss: null,
          speedKmh: null, course: null, alt: null
        };
        if (bat.code === 0 && bat.value && bat.value.records && bat.value.records.length) {
          var rec = bat.value.records[0]; // 恒 ct 降序 → 首=最新
          var vb = recVal(rec, 799);
          if (vb !== undefined && vb !== null && vb !== '') {
            st.vbat = Number(vb);
            st.percentCalc = U.vbatToPercent(st.vbat);
          }
          var sat = recVal(rec, 517);
          if (sat !== undefined && sat !== null && sat !== '') st.sat = Number(sat);
        }
        if (gn.code === 0 && gn.value && gn.value.records && gn.value.records.length) {
          var grec = gn.value.records[0];
          var samples = window.Alg.decodeRec1294(grec, recVal(grec, 512), recVal(grec, 513));
          if (samples.length) {
            var last = samples[samples.length - 1]; // 最新值取末个样本
            st.gnss = last;
            st.speedKmh = last.speed * 3.6;
            st.course = last.course;
            st.alt = last.alt;
          }
        }
        // 围栏越界检查（GCJ02 原值）
        if (st.lng !== undefined && st.lat !== undefined && window.FenceStore) {
          var alert = window.FenceStore.checkAlert(imei, st.lng, st.lat, st.time);
          if (alert) {
            try { U.toast('⚠️ 设备进入围栏「' + alert.fenceName + '」', 'err'); } catch (e) { /* 忽略 */ }
          }
        }
        resolve(st);
      });
    });
  }

  // 最新单点（首页刷新用）
  function getLatest(imei) { return latestLocation(imei); }

  // ---------- 轨迹（location_history 升序 + 可选 1294 精细点） ----------
  /**
   * getTrack(imei, start, end, opts)
   * 返回 {code, points:[{lng,lat,time}], fine:[{lng,lat,speed,course,alt,time}]}
   */
  function getTrack(imei, start, end, opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      locationHistory(imei, start, end, 1, 100).then(function (first) {
        if (first.code !== 0) { resolve(first); return; }
        var value = first.value || {};
        var pages = Number(value.pages) || 1;
        var records = (value.records || []).slice();
        var promises = [];
        for (var p = 2; p <= pages; p++) promises.push(locationHistory(imei, start, end, p, 100));
        Promise.all(promises).then(function (rest) {
          for (var i = 0; i < rest.length; i++) {
            if (rest[i].code === 0 && rest[i].value && rest[i].value.records) {
              records = records.concat(rest[i].value.records);
            }
          }
          // time 升序（平台已升序，稳妥再排一次）
          records.sort(function (a, b) {
            var ta = U.parseLocal(a.time), tb = U.parseLocal(b.time);
            return (ta ? ta.getTime() : 0) - (tb ? tb.getTime() : 0);
          });
          var points = [];
          for (var j = 0; j < records.length; j++) {
            var r = records[j];
            if (r.lng !== undefined && r.lat !== undefined) {
              points.push({ lng: r.lng, lat: r.lat, time: r.time });
            }
          }
          resolve({ code: 0, value: { total: records.length }, points: points, records: records });
        });
      });
    });
  }

  // ---------- common KV（RSA 签名头 X-Key-Open-Api） ----------
  function openKeyHeader() {
    var s = sets();
    var publicKey = s && s.publicKey;
    var appId = CFG.getAppId();
    if (!publicKey || !appId) return null;
    var plain = String(Date.now()) + ',' + appId; // 时间戳ms,appId
    var enc = window.RsaPkcs1.encryptB64(publicKey, plain);
    if (!enc) return null;
    return { 'X-Key-Open-Api': enc };
  }

  // common/* 统一诊断：失败时输出非敏感信息（appId/是否有公钥），便于定位「非法访问」类问题
  function commonRequest(endpoint, body, h) {
    var pk = sets() && sets().publicKey;
    return AC.request(endpoint, body, { headers: mergeHeaders(h) }).then(function (r) {
      if (r.code !== 0) {
        try {
          console.warn('[common' + endpoint + '] code=' + r.code + ' value=' + r.value +
            ' | appId=' + CFG.getAppId() +
            ' | publicKey=' + (pk ? String(pk).length + ' chars' : 'MISSING（请退出重新登录刷新）'));
        } catch (e) { /* 忽略 */ }
      }
      return r;
    });
  }

  function commonPut(cls, fields) {
    var h = openKeyHeader();
    if (!h) return Promise.resolve({ code: -103, value: '签名参数缺失（公钥或应用标识）' });
    var body = Object.assign({ cls: cls }, fields || {});
    return commonRequest('/common/put', body, h);
  }

  function commonList(cls, opts) {
    opts = opts || {};
    var h = openKeyHeader();
    if (!h) return Promise.resolve({ code: -103, value: '签名参数缺失（公钥或应用标识）' });
    var body = { cls: cls, page: opts.page || 1, size: Math.min(100, opts.size || 100) };
    if (opts.filter) body.filter = opts.filter;
    if (opts.sort) { body.sort = opts.sort; body.desc = !!opts.desc; }
    return commonRequest('/common/list', body, h);
  }

  function commonDeleteById(cls, id) {
    var h = openKeyHeader();
    if (!h) return Promise.resolve({ code: -103, value: '签名参数缺失（公钥或应用标识）' });
    return commonRequest('/common/delete_by_id', { cls: cls, id: String(id) }, h);
  }

  function mergeHeaders(extra) {
    var base = authHeaders() || {};
    var out = {};
    for (var k in base) if (Object.prototype.hasOwnProperty.call(base, k)) out[k] = base[k];
    for (var k2 in extra) if (Object.prototype.hasOwnProperty.call(extra, k2)) out[k2] = extra[k2];
    return out;
  }

  var AC = {
    // 鉴权
    authContext: authContext,
    authHeaders: authHeaders,
    hasAuth: hasAuth,
    profile: profile,
    sets: sets,
    clearAuthKeys: clearAuthKeys,
    handleLoginExpired: handleLoginExpired,
    goPage: goPage,
    safeReturnTo: safeReturnTo,
    // 请求
    request: request,
    // 接口
    listMyProjects: listMyProjects,
    listMyDevices: listMyDevices,
    searchMyDevices: searchMyDevices,
    listByTags: listByTags,
    sanitizeTags: sanitizeTags,
    fetchAllByTags: fetchAllByTags,
    latestLocation: latestLocation,
    locationHistory: locationHistory,
    getLatest: getLatest,
    getPetStatus: getPetStatus,
    getTrack: getTrack,
    sendCmd: sendCmd,
    commonPut: commonPut,
    commonList: commonList,
    commonDeleteById: commonDeleteById,
    // 时间 / 取值
    fmt: fmt,
    recTs: recTs,
    recVal: recVal,
    recValInfo: recValInfo
  };

  window.AC = AC;
})();

/* ==== js/app/map.js ==== */
/* app/map.js — MapKit 图层管理
 * 防跨页污染核心：
 *  - create() 重建地图时递增 epoch，旧 map.remove() 整体销毁旧 tempGroup/fenceGroup
 *  - 所有函数入口 mapAlive() 拦截（容器是否在 DOM）
 *  - 回放动画闭包校验 myEpoch !== epoch → stopReplay
 *  - 临时图层统一 tempGroup（track/回放/围栏绘制预览 addTemp）
 * 瓦片：本地 Canvas 网格底图（L.GridLayer createTile），零外部请求
 */
(function () {
  'use strict';

  var L = window.L, CFG = window.CFG, U = window.U;

  var MK = {
    epoch: 0,
    map: null,
    containerId: null,
    tempGroup: null,
    fenceGroup: null,
    petMarkers: {},   // imei → {layer, info, marker}
    turboImei: null,
    onTurbo: null,    // 回调：点击弹窗「实时追踪」
    replayTimer: null,
    replayState: null,
    hoverLock: null,  // 悬停锁定 imei
    zoomLock: null,   // 点击锁定 imei（16 级记忆）
    hoverZoom: 15,
    clickZoom: 16
  };

  function mapAlive() {
    if (!MK.map) return false;
    var el = document.getElementById(MK.containerId);
    return !!(el && el.isConnected);
  }

  // ---------- 本地 Canvas 网格底图（GCJ02 坐标标注，零外部请求） ----------
  var GridLayer = L.GridLayer.extend({
    createTile: function (coords) {
      var tile = document.createElement('canvas');
      var size = this.getTileSize();
      tile.width = size.x; tile.height = size.y;
      var ctx = tile.getContext('2d');
      // 浅色底
      ctx.fillStyle = '#f2f4f0';
      ctx.fillRect(0, 0, size.x, size.y);
      // 网格线
      ctx.strokeStyle = '#d8ded6';
      ctx.lineWidth = 1;
      var n = 4, step = size.x / n;
      for (var i = 1; i < n; i++) {
        ctx.beginPath(); ctx.moveTo(i * step, 0); ctx.lineTo(i * step, size.y); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, i * step); ctx.lineTo(size.x, i * step); ctx.stroke();
      }
      // 中心经纬度标注（Web墨卡托反算）
      var scale = this._getZoomForUrl ? this._getZoomForUrl() : coords.z;
      var nw = this._tileCoordsToBounds(coords).getNorthWest();
      var se = this._tileCoordsToBounds(coords).getSouthEast();
      var clng = (nw.lng + se.lng) / 2, clat = (nw.lat + se.lat) / 2;
      ctx.fillStyle = '#9aa79b';
      ctx.font = '10px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(clng.toFixed(4) + 'E', size.x / 2, size.y / 2 - 4);
      ctx.fillText(clat.toFixed(4) + 'N', size.x / 2, size.y / 2 + 10);
      return tile;
    }
  });

  function create(containerId) {
    // 重建：递增 epoch + 整体销毁旧图
    MK.epoch++;
    if (MK.map) {
      try { MK.map.remove(); } catch (e) { /* 忽略 */ }
      MK.map = null;
    }
    MK.containerId = containerId;
    MK.tempGroup = L.layerGroup();
    MK.fenceGroup = L.layerGroup();
    MK.petMarkers = {};
    MK.turboImei = null;
    MK.replayState = null;
    if (MK.replayTimer) { clearInterval(MK.replayTimer); MK.replayTimer = null; }

    var map = L.map(containerId, {
      center: [30.57, 104.06],
      zoom: 5,
      zoomControl: true,
      attributionControl: false // 关闭 attribution（审核）
    });
    // 底图：高德栅格瓦片（GCJ02 坐标系，与平台数据零偏移对齐；用户确认采用，覆盖默认仅网格规则）
    // 下层保留本地 Canvas 网格（GCJ02 标注）：瓦片加载失败/断网时兜底显示
    new GridLayer({ tileSize: 256 }).addTo(map);
    try {
      L.tileLayer('https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}', {
        subdomains: '1234',
        minZoom: 3,
        maxZoom: 18,
        tileSize: 256,
        errorTileUrl: 'd\u0061ta:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw=='
      }).addTo(map);
    } catch (e) { /* 瓦片层异常时网格兜底 */ }
    MK.tempGroup.addTo(map);
    MK.fenceGroup.addTo(map);
    MK.map = map;
    return map;
  }

  function getMap() { return mapAlive() ? MK.map : null; }

  // ---------- 设备 marker ----------
  function petIcon(info) {
    var color = info && info.lowBat ? '#e67e22' : '#2f9e44';
    var cls = info && info.stale ? ' mk-dot stale' : ' mk-dot';
    return L.divIcon({
      className: '',
      html: '<div class="' + cls.trim() + '" style="background:' + color + '"></div>',
      iconSize: [14, 14],
      iconAnchor: [7, 7],
      popupAnchor: [0, -8]
    });
  }

  // upsert：存在则移动 + 同步打开中的 popup；不存在则新建
  function upsertPet(imei, lng, lat, info) {
    if (!mapAlive()) return null;
    var rec = MK.petMarkers[imei];
    var ll = [lat, lng];
    if (!rec) {
      var marker = L.marker(ll, { icon: petIcon(info), title: info && info.name ? info.name : imei });
      marker.bindPopup('', { maxWidth: 320, minWidth: 240 });
      marker.on('popupopen', function () {
        // popup 打开时立即刷新内容
        if (rec && typeof rec.popupHtml === 'function') {
          marker.setPopupContent(rec.popupHtml());
        }
      });
      marker.addTo(MK.map);
      rec = MK.petMarkers[imei] = { layer: marker, marker: marker, info: info || {} };
    } else {
      rec.marker.setLatLng(ll);
      rec.info = info || rec.info;
    }
    rec.lng = lng; rec.lat = lat;
    // popup 打开中 → 同步内容
    if (rec.marker.isPopupOpen && rec.marker.isPopupOpen() && typeof rec.popupHtml === 'function') {
      rec.marker.setPopupContent(rec.popupHtml());
    }
    return rec;
  }

  function setPetPopupHtml(imei, htmlFn) {
    var rec = MK.petMarkers[imei];
    if (rec) rec.popupHtml = htmlFn;
  }

  function removePet(imei) {
    var rec = MK.petMarkers[imei];
    if (rec && mapAlive()) {
      try { MK.map.removeLayer(rec.marker); } catch (e) { /* 忽略 */ }
    }
    delete MK.petMarkers[imei];
  }

  function clearPets(exceptImei) {
    for (var imei in MK.petMarkers) {
      if (Object.prototype.hasOwnProperty.call(MK.petMarkers, imei) && imei !== exceptImei) {
        removePet(imei);
      }
    }
  }

  function petImeis() {
    var out = [];
    for (var imei in MK.petMarkers) {
      if (Object.prototype.hasOwnProperty.call(MK.petMarkers, imei)) out.push(imei);
    }
    return out;
  }

  function openPopupFor(imei) {
    if (!mapAlive()) return;
    var rec = MK.petMarkers[imei];
    if (rec) {
      if (typeof rec.popupHtml === 'function') rec.marker.setPopupContent(rec.popupHtml());
      rec.marker.openPopup();
    }
  }

  function refreshOpenPopups() {
    if (!mapAlive()) return;
    for (var imei in MK.petMarkers) {
      if (!Object.prototype.hasOwnProperty.call(MK.petMarkers, imei)) continue;
      var rec = MK.petMarkers[imei];
      if (rec.marker.isPopupOpen && rec.marker.isPopupOpen() && typeof rec.popupHtml === 'function') {
        rec.marker.setPopupContent(rec.popupHtml());
      }
    }
  }

  function panToPet(imei, zoom) {
    if (!mapAlive()) return;
    var rec = MK.petMarkers[imei];
    if (!rec) return;
    if (zoom) MK.map.setView([rec.lat, rec.lng], zoom, { animate: true });
    else MK.map.panTo([rec.lat, rec.lng], { animate: true });
  }

  // ---------- Turbo 实时追踪 ----------
  function setTurboFocus(imei) {
    if (!mapAlive()) return;
    MK.turboImei = imei || null;
    for (var i in MK.petMarkers) {
      if (!Object.prototype.hasOwnProperty.call(MK.petMarkers, i)) continue;
      var el = MK.petMarkers[i].marker.getElement();
      if (el) el.style.display = (MK.turboImei && i !== MK.turboImei) ? 'none' : '';
    }
  }

  function turboImei() { return MK.turboImei; }

  // ---------- 临时图层 ----------
  function addTemp(layer) {
    if (!mapAlive()) return null;
    layer.addTo(MK.tempGroup);
    return layer;
  }
  function clearTemp() {
    if (!mapAlive()) return;
    MK.tempGroup.clearLayers();
  }
  function addFence(layer) {
    if (!mapAlive()) return null;
    layer.addTo(MK.fenceGroup);
    return layer;
  }
  function clearFences() {
    if (!mapAlive()) return;
    MK.fenceGroup.clearLayers();
  }

  function drawTrackLine(points, opts) {
    if (!mapAlive()) return null;
    clearTemp();
    if (!points || points.length < 2) return null;
    var latlngs = points.map(function (p) { return [p.lat, p.lng]; });
    var line = L.polyline(latlngs, { color: (opts && opts.color) || '#e8590c', weight: 3, opacity: 0.85 });
    addTemp(line);
    // 起终点标记
    var s = L.circleMarker(latlngs[0], { radius: 6, color: '#2f9e44', fillColor: '#2f9e44', fillOpacity: 1 });
    var e = L.circleMarker(latlngs[latlngs.length - 1], { radius: 6, color: '#e03131', fillColor: '#e03131', fillOpacity: 1 });
    addTemp(s); addTemp(e);
    if (opts && opts.fit !== false) MK.map.fitBounds(line.getBounds(), { padding: [30, 30] });
    return line;
  }

  // ---------- 回放动画（epoch 守卫） ----------
  function playReplay(points, opts) {
    stopReplay();
    if (!mapAlive() || !points || points.length < 2) return false;
    var myEpoch = MK.epoch;
    var onFrame = opts && opts.onFrame;
    var onDone = opts && opts.onDone;
    var idx = 0;
    var speedFactor = (opts && opts.speedFactor) || 2400; // ×2400 等效
    var line = L.polyline([[points[0].lat, points[0].lng]], { color: '#1971c2', weight: 4 });
    var dot = L.circleMarker([points[0].lat, points[0].lng], { radius: 7, color: '#1971c2', fillColor: '#74c0fc', fillOpacity: 1 });
    addTemp(line); addTemp(dot);
    MK.replayState = { idx: 0, total: points.length, playing: true };
    MK.replayTimer = setInterval(function () {
      if (myEpoch !== MK.epoch || !mapAlive()) { stopReplay(); return; } // 防窜页
      idx++;
      if (idx >= points.length) {
        MK.replayState.playing = false;
        clearInterval(MK.replayTimer); MK.replayTimer = null;
        if (onDone) try { onDone(); } catch (e) { /* 忽略 */ }
        return;
      }
      var p = points[idx];
      line.addLatLng([p.lat, p.lng]);
      dot.setLatLng([p.lat, p.lng]);
      MK.replayState.idx = idx;
      if (onFrame) try { onFrame(p, idx, points.length); } catch (e) { /* 忽略 */ }
    }, Math.max(30, 1000 / (speedFactor / 100) / 10)); // 基础节奏，可被 speedFactor 调
    return true;
  }

  function stopReplay() {
    if (MK.replayTimer) { clearInterval(MK.replayTimer); MK.replayTimer = null; }
    MK.replayState = null;
  }

  function replayState() { return MK.replayState; }

  // ---------- 视图/缩放记忆 ----------
  function zoomByImei(imei, zoom) {
    if (zoom) {
      MK.zoomLock = imei;
      try { U.store.set('pt_zoom_lock', { imei: imei, zoom: zoom }); } catch (e) { /* 忽略 */ }
      panToPet(imei, zoom);
    }
    return MK.zoomLock;
  }
  function restoreZoomLock() {
    var saved = U.store.get('pt_zoom_lock');
    if (saved && saved.imei) {
      MK.zoomLock = saved.imei;
      return saved.imei;
    }
    return null;
  }
  function hoverZoomTo(imei) {
    if (!mapAlive() || MK.turboImei) return;
    MK.hoverLock = imei;
    if (!MK.zoomLock) panToPet(imei, MK.hoverZoom);
    else panToPet(imei);
  }
  function hoverLeave() {
    MK.hoverLock = null;
    if (MK.turboImei || !mapAlive()) return;
    if (!MK.zoomLock) {
      var recs = [];
      for (var imei in MK.petMarkers) {
        if (Object.prototype.hasOwnProperty.call(MK.petMarkers, imei)) {
          var r = MK.petMarkers[imei];
          if (r.lng !== undefined) recs.push([r.lat, r.lng]);
        }
      }
      if (recs.length > 1) MK.map.fitBounds(L.latLngBounds(recs).pad(0.15));
    }
  }

  function fitAll() {
    if (!mapAlive()) return;
    var recs = [];
    for (var imei in MK.petMarkers) {
      if (Object.prototype.hasOwnProperty.call(MK.petMarkers, imei)) {
        var r = MK.petMarkers[imei];
        if (r.lng !== undefined) recs.push([r.lat, r.lng]);
      }
    }
    if (recs.length === 1) MK.map.setView(recs[0], 14);
    else if (recs.length) MK.map.fitBounds(L.latLngBounds(recs).pad(0.15));
  }

  function invalidateSize() {
    if (!mapAlive()) return;
    MK.map.invalidateSize();
  }

  // document 委托 [data-turbo] 点击（禁 eval / innerHTML 执行）
  document.addEventListener('click', function (e) {
    var el = e.target && e.target.closest ? e.target.closest('[data-turbo]') : null;
    if (el && MK.onTurbo) {
      var imei = el.getAttribute('data-turbo');
      if (imei) MK.onTurbo(imei);
    }
  });

  window.MapKit = {
    create: create,
    getMap: getMap,
    mapAlive: mapAlive,
    epoch: function () { return MK.epoch; },
    upsertPet: upsertPet,
    setPetPopupHtml: setPetPopupHtml,
    removePet: removePet,
    clearPets: clearPets,
    petImeis: petImeis,
    petMarker: function (imei) { return MK.petMarkers[imei] || null; },
    openPopupFor: openPopupFor,
    refreshOpenPopups: refreshOpenPopups,
    panToPet: panToPet,
    setTurboFocus: setTurboFocus,
    turboImei: turboImei,
    addTemp: addTemp,
    clearTemp: clearTemp,
    addFence: addFence,
    clearFences: clearFences,
    drawTrackLine: drawTrackLine,
    playReplay: playReplay,
    stopReplay: stopReplay,
    replayState: replayState,
    zoomByImei: zoomByImei,
    restoreZoomLock: restoreZoomLock,
    hoverZoomTo: hoverZoomTo,
    hoverLeave: hoverLeave,
    fitAll: fitAll,
    invalidateSize: invalidateSize,
    _MK: MK
  };
})();

/* ==== js/app/petstatus.js ==== */
/* app/petstatus.js — 设备状态计算（1293 gsensor 解包 → 步数/姿态/跌倒；1294 GNSS 辅助；仅真实数据无模拟） */
(function () {
  'use strict';

  var CFG = window.CFG, U = window.U;

  /**
   * analyzeGsensor(rec)：解包一条 1293 记录并计算运动特征。
   * @param rec list_by_tags 记录（val_1293 hex 或数字 key）
   * @returns {ok, samples, steps:{...}, attitude:{...}, falls:{...}, imu:{pitch,roll}}
   */
  function analyzeGsensor(rec) {
    var hex = rec ? (rec.val_1293 !== undefined ? rec.val_1293 : rec['1293']) : null;
    if (hex === undefined || hex === null || hex === '' || typeof hex === 'number') {
      return { ok: false, reason: '无 1293 数据' };
    }
    var samples = window.Alg.decodeGsensor1293(hex);
    if (!samples.length) return { ok: false, reason: '1293 解包为空' };

    var imuF = new window.IMUFilter();
    var imu = null;
    for (var i = 0; i < samples.length; i++) {
      imu = imuF.update(samples[i].x, samples[i].y, samples[i].z);
    }
    var steps = window.StepCounter.countSteps(samples);
    var attitude = window.Attitude.classify(samples, imu);
    var falls = window.Attitude.detectFalls(samples);
    return {
      ok: true,
      samples: samples,
      count: samples.length,
      steps: steps,
      attitude: attitude,
      falls: falls,
      imu: imu ? { pitch: imu.pitch, roll: imu.roll } : null,
      ct: rec.ct,
      ts: window.AC.recTs(rec)
    };
  }

  /**
   * fetchStatus(imei, opts)：拉取最近窗口内 1293（私有 tag allowCustom）+ 1294，聚合设备状态页数据。
   * opts: {minutes: 窗口分钟数（默认 30）, onProgress}
   */
  function fetchStatus(imei, opts) {
    opts = opts || {};
    var U2 = window.U;
    var now = new Date();
    var start = new Date(now.getTime() - (opts.minutes || 30) * 60 * 1000);
    var startStr = U2.fmtTime(start), endStr = U2.fmtTime(now);
    return new Promise(function (resolve) {
      var result = { imei: imei, window: { start: startStr, end: endStr }, gsensor: [], gnss: [], analyses: [] };
      var p1 = window.AC.fetchAllByTags({
        clientId: imei, tags: [1293], start: startStr, end: endStr,
        allowCustom: true, maxRecords: 500,
        onProgress: opts.onProgress
      });
      var p2 = window.AC.listByTags({ clientId: imei, tags: [1294], size: 1 });
      Promise.all([p1, p2]).then(function (rs) {
        var r1 = rs[0], r2 = rs[1];
        if (r1 && r1.code === 0 && Array.isArray(r1)) result.gsensor = r1;
        else if (r1 && r1.code === 0 && r1.value) { /* fetchAll 正常返回数组 */ }
        // fetchAllByTags resolve 数组或错误响应对象
        var recs = Array.isArray(r1) ? r1 : [];
        result.gsensor = recs;
        recs.sort(function (a, b) { return window.AC.recTs(a) - window.AC.recTs(b); });
        for (var i = 0; i < recs.length; i++) {
          var an = analyzeGsensor(recs[i]);
          if (an.ok) result.analyses.push(an);
        }
        if (r2 && r2.code === 0 && r2.value && r2.value.records && r2.value.records.length) {
          var grec = r2.value.records[0];
          var samples = window.Alg.decodeRec1294(grec, window.AC.recVal(grec, 512), window.AC.recVal(grec, 513));
          result.gnss = samples;
          result.gnssCt = grec.ct;
        }
        // 聚合
        result.summary = summarize(result.analyses);
        resolve(result);
      });
    });
  }

  function summarize(analyses) {
    var steps = 0, falls = 0, states = { '静止': 0, '活动': 0, '剧烈': 0 };
    var lastPitch = 0, lastRoll = 0, packs = analyses.length;
    for (var i = 0; i < analyses.length; i++) {
      var a = analyses[i];
      steps += a.steps.steps;
      falls += a.falls.falls;
      if (states[a.attitude.state] !== undefined) states[a.attitude.state]++;
      if (a.imu) { lastPitch = a.imu.pitch; lastRoll = a.imu.roll; }
    }
    var dominant = '无数据';
    var maxC = -1;
    for (var k in states) {
      if (Object.prototype.hasOwnProperty.call(states, k) && states[k] > maxC) { maxC = states[k]; dominant = k; }
    }
    return {
      packs: packs,
      steps: steps,
      falls: falls,
      dominant: dominant,
      states: states,
      pitch: lastPitch,
      roll: lastRoll
    };
  }

  // 调试页（#/debug 前端独立 5s 轮询）的 TLV 展示辅助：记录全字段格式化
  function recFields(rec) {
    var rows = [];
    for (var k in rec) {
      if (!Object.prototype.hasOwnProperty.call(rec, k)) continue;
      var v = rec[k];
      if (v !== null && typeof v === 'object') v = JSON.stringify(v);
      rows.push({ key: k, value: String(v === undefined ? '' : v) });
    }
    return rows;
  }

  window.PetStatus = {
    analyzeGsensor: analyzeGsensor,
    fetchStatus: fetchStatus,
    summarize: summarize,
    recFields: recFields
  };
})();

/* ==== js/app/views.js ==== */
/* app/views.js — 视图渲染（shell + 9 路由；innerHTML 动态数据一律 esc()） */
(function () {
  'use strict';

  var CFG = window.CFG, U = window.U, AC = window.AC;
  var $ = U.$, byId = U.byId, esc = U.esc, store = U.store;

  // ---------- 定时器登记（clearTimers 同时 clearInterval+clearTimeout） ----------
  var timers = [];
  function addTimer(id, isTimeout) {
    timers.push({ id: id, t: !!isTimeout });
  }
  function clearTimers() {
    for (var i = 0; i < timers.length; i++) {
      var t = timers[i];
      try { if (t.t) clearTimeout(t.id); else clearInterval(t.id); } catch (e) { /* 忽略 */ }
    }
    timers = [];
  }

  // ---------- 通用小组件 ----------
  function statusBadge(st) {
    if (!st || st.code !== 0) return '<span class="badge off">离线</span>';
    var t = st.time ? U.parseLocal(st.time) : null;
    var fresh = t && (Date.now() - t.getTime() < 10 * 60 * 1000);
    return fresh ? '<span class="badge on">在线</span>' : '<span class="badge off">离线</span>';
  }

  function batteryHtml(st) {
    var p = st && (st.percentCalc !== null && st.percentCalc !== undefined ? st.percentCalc : st.percent);
    var vbat = st && st.vbat;
    var txt, cls = 'bat';
    if (p !== null && p !== undefined && isFinite(+p)) {
      txt = Math.round(+p) + '%';
      if (vbat && +vbat <= U.VBAT_LOW) cls += ' low';
    } else {
      txt = '电量未知';
    }
    var v = vbat ? ' <span class="muted">(' + (+vbat) + 'mV)</span>' : '';
    return '<span class="' + cls + '">🔋 ' + esc(txt) + '</span>' + v;
  }

  function signalHtml(st) {
    var s = st && st.signal !== undefined && st.signal !== null ? U.signalText(st.signal) : '信号未知';
    return '<span class="sig">📶 ' + esc(s) + '</span>';
  }

  // 设备弹窗内容（MapKit popup，marker 移动/信息更新时 setPopupContent 同步）
  function popupHtml(imei, st) {
    st = st || {};
    var name = window.PetStore.getName(imei);
    var lines = [];
    lines.push('<div class="pp-title">' + esc(name) + ' ' + statusBadge(st) + '</div>');
    lines.push('<div class="pp-row">📱 IMEI：' + esc(imei) + '</div>');
    if (st.lng !== undefined && st.lat !== undefined) {
      lines.push('<div class="pp-row">📍 ' + esc((+st.lng).toFixed(6)) + ', ' + esc((+st.lat).toFixed(6)) + ' <span class="muted">(GCJ02)</span></div>');
      if (st.wlng !== undefined && st.wlat !== undefined) {
        lines.push('<div class="pp-row muted">WGS84：' + esc((+st.wlng).toFixed(6)) + ', ' + esc((+st.wlat).toFixed(6)) + '</div>');
      }
    }
    if (st.address) lines.push('<div class="pp-row">🏷 ' + esc(st.address) + '</div>');
    if (st.gnss) {
      lines.push('<div class="pp-row">🧭 速度 ' + esc((st.speedKmh || 0).toFixed(1)) + ' km/h · 角度 ' + esc(Math.round(st.course || 0)) + '° · 海拔 ' + esc(Math.round(st.alt || 0)) + 'm</div>');
    }
    if (st.sat !== null && st.sat !== undefined) lines.push('<div class="pp-row">🛰️ 卫星：' + esc(st.sat) + ' 颗</div>');
    lines.push('<div class="pp-row">' + batteryHtml(st) + '</div>');
    lines.push('<div class="pp-row">' + signalHtml(st) + '</div>');
    if (st.time) lines.push('<div class="pp-row">🕒 ' + esc(st.time) + '</div>');
    // 实时追踪按钮：最近上报 ≤5min 才可点
    var t = st.time ? U.parseLocal(st.time) : null;
    var fresh = t && (Date.now() - t.getTime() <= 5 * 60 * 1000);
    if (fresh) {
      lines.push('<button type="button" class="btn-mini btn-turbo" data-turbo="' + esc(imei) + '">⚡ 实时追踪</button>');
    } else {
      lines.push('<button type="button" class="btn-mini" disabled title="超 5 分钟未上报">⚡ 实时追踪（超 5 分钟未上报）</button>');
    }
    return '<div class="pp">' + lines.join('') + '</div>';
  }

  // 首页悬浮设备卡片
  function homeCard(imei, st) {
    var name = window.PetStore.getName(imei);
    var lines = [];
    lines.push('<div class="hc-head"><span class="hc-name">' + esc(name) + '</span>' + statusBadge(st) + '</div>');
    lines.push('<div class="hc-sub muted">IMEI ' + esc(imei) + '</div>');
    if (st && st.code === 0 && st.lng !== undefined) {
      lines.push('<div class="hc-row">📍 ' + esc((+st.lng).toFixed(6)) + ', ' + esc((+st.lat).toFixed(6)) + '</div>');
      if (st.address) lines.push('<div class="hc-row">🏷 ' + esc(st.address) + '</div>');
      if (st.time) lines.push('<div class="hc-row">🕒 ' + esc(st.time) + ' <span class="muted">(' + esc(U.agoText(st.time)) + ')</span></div>');
      lines.push('<div class="hc-row">' + batteryHtml(st) + ' ' + signalHtml(st) + '</div>');
    } else {
      lines.push('<div class="hc-row muted">暂无定位数据</div>');
    }
    return '<div class="pet-card" data-imei="' + esc(imei) + '">' + lines.join('') + '</div>';
  }

  // ---------- Shell ----------
  var NAV = [
    { route: 'home', label: '首页', icon: '🗺️' },
    { route: 'pets', label: '设备', icon: '🐾' },
    { route: 'status', label: '状态', icon: '📊' },
    { route: 'debug', label: '调试', icon: '🧪' },
    { route: 'devices', label: '管理', icon: '⚙️' },
    { route: 'fence', label: '围栏', icon: '⭕' },
    { route: 'alerts', label: '报警', icon: '🚨' }
  ];

  function shell() {
    var root = byId('app-container');
    root.innerHTML =
      '<header class="topbar">' +
      '  <div class="brand"><span class="brand-mark">iot</span><span class="brand-name">' + esc(CFG.BRAND) + '</span><span class="ver">' + esc(CFG.VERSION) + '</span></div>' +
      '  <div class="top-actions">' +
      '    <select id="project-select" class="proj-select" title="项目"></select>' +
      '    <span id="user-chip" class="user-chip"></span>' +
      '    <button type="button" id="btn-logout" class="btn-ghost">退出</button>' +
      '  </div>' +
      '</header>' +
      '<main id="main"></main>' +
      '<nav class="nav-mobile">' +
      NAV.map(function (n) {
        return '<a href="#/' + n.route + '" data-nav="' + n.route + '"><i>' + n.icon + '</i><span>' + esc(n.label) + '</span></a>';
      }).join('') +
      '</nav>';
    var p = AC.profile();
    var chip = byId('user-chip');
    if (p && (p.name || p.mobile)) {
      chip.textContent = p.name || String(p.mobile || '').replace(/^(\d{3})\d{4}(\d{4})$/, '$1****$2');
    } else {
      chip.style.display = 'none';
    }
  }

  function activeNav(route) {
    var links = document.querySelectorAll('.nav-mobile a');
    for (var i = 0; i < links.length; i++) {
      links[i].classList.toggle('active', links[i].getAttribute('data-nav') === route);
    }
  }

  function mainEl() { return byId('main'); }

  function setMain(html, cls) {
    var m = mainEl();
    m.className = cls || '';
    m.innerHTML = html;
    return m;
  }

  function empty(text) {
    return '<div class="empty">📭 ' + esc(text || '暂无数据') + '</div>';
  }
  function errorBox(text) {
    return '<div class="error-box">⚠️ ' + esc(text || '请求失败') + '</div>';
  }
  function loading(text) {
    return '<div class="loading"><div class="spinner"></div>' + esc(text || '加载中…') + '</div>';
  }

  // ---------- #/home 实时地图 ----------
  function renderHome() {
    setMain('<div id="home-map" class="map-full"></div>' +
      '<div class="home-cards" id="home-cards"><div class="loading"><div class="spinner"></div>加载设备…</div></div>' +
      '<div class="turbo-bar hidden" id="turbo-bar"><span id="turbo-info"></span><button type="button" class="btn-mini" data-action="turbo-exit">退出实时追踪</button></div>');
    window.MapKit.create('home-map');
    setTimeout(function () { window.MapKit.invalidateSize(); }, 300); // 校准
  }

  function renderHomeCards(statuses, meta) {
    var box = byId('home-cards');
    if (!box) return;
    if (!statuses || !statuses.length) {
      var m = meta || {};
      var html = '<div class="pet-card muted"><b>📭 暂无设备</b>';
      if (m.projectName) html += '<div class="hc-sub muted">当前项目「' + esc(m.projectName) + '」下没有已绑定的设备</div>';
      if (m.projectCount > 1) html += '<div class="hc-sub muted">账号下共 ' + esc(m.projectCount) + ' 个项目，可点右上角下拉切换</div>';
      if (m.error) html += '<div class="hc-sub warn">设备列表接口：' + esc(m.error) + '</div>';
      html += '<div class="hc-sub muted">请到合宙后台确认设备已绑定到该项目，或切换项目</div></div>';
      box.innerHTML = html;
      return;
    }
    box.innerHTML = statuses.map(function (st) {
      return homeCard(st.imei, st);
    }).join('');
  }

  // ---------- #/pets 我的设备 ----------
  function renderPets(statuses) {
    var cards = (statuses || []).map(function (st) {
      var imei = st.imei;
      return '<div class="pet-card wide" data-imei="' + esc(imei) + '">' +
        '<div class="hc-head"><span class="hc-name">' + esc(window.PetStore.getName(imei)) + '</span>' + statusBadge(st) + '</div>' +
        '<div class="hc-sub muted">IMEI ' + esc(imei) + (window.PetStore.hasPending(imei) ? ' · <span class="warn">名称待同步</span>' : '') + '</div>' +
        (st.code === 0 && st.lng !== undefined
          ? '<div class="hc-row">📍 ' + esc((+st.lng).toFixed(6)) + ', ' + esc((+st.lat).toFixed(6)) + '</div>' +
            '<div class="hc-row">🏷 ' + esc(st.address || '-') + '</div>' +
            '<div class="hc-row">🕒 ' + esc(st.time || '-') + '</div>' +
            '<div class="hc-row">' + batteryHtml(st) + ' ' + signalHtml(st) + '</div>'
          : '<div class="hc-row muted">暂无定位数据</div>') +
        '<div class="hc-ops">' +
        '  <button type="button" class="btn-mini" data-action="pet-debug" data-imei="' + esc(imei) + '">🔧 性能监控</button>' +
        '  <button type="button" class="btn-mini" data-action="pet-edit" data-imei="' + esc(imei) + '">✏️ 编辑</button>' +
        '  <button type="button" class="btn-mini danger" data-action="pet-del" data-imei="' + esc(imei) + '">🗑 删除</button>' +
        '</div></div>';
    }).join('');
    setMain(
      '<div class="page-head"><h2>我的设备</h2>' +
      '<button type="button" class="btn" data-action="pet-new">＋ 新建设备</button></div>' +
      (cards ? '<div class="card-grid">' + cards + '</div>' : empty('暂无设备，点击右上角新建或等待平台设备自动建档'))
    );
  }

  // 设备编辑弹窗（新建/编辑/换绑合一）
  function petEditDialog(imei) {
    var isNew = !imei;
    var p = imei ? window.PetStore.get(imei) : null;
    var knownImeis = [];
    var profiles = window.PetStore.list();
    for (var i = 0; i < profiles.length; i++) knownImeis.push(profiles[i].imei);
    var body = U.openModal(isNew ? '新建设备' : '编辑设备',
      '<label class="fld">设备 IMEI<input id="pf-imei" type="text" placeholder="15 位数字" value="' + esc(imei || '') + '"' + (isNew ? '' : ' readonly') + '></label>' +
      '<label class="fld">设备名称<input id="pf-name" type="text" maxlength="30" value="' + esc(p ? p.name : '') + '" placeholder="如：旺财的项圈"></label>' +
      '<label class="fld">备注<input id="pf-note" type="text" maxlength="60" value="' + esc(p ? p.note : '') + '" placeholder="可选"></label>' +
      '<div id="pf-msg" class="fld-msg"></div>' +
      '<div class="modal-ops"><button type="button" class="btn" id="pf-save">保存（同步云端名称）</button></div>'
    );
    byId('pf-save').addEventListener('click', function () {
      var newImei = (byId('pf-imei').value || '').trim();
      var name = (byId('pf-name').value || '').trim();
      var note = (byId('pf-note').value || '').trim();
      var msg = byId('pf-msg');
      if (!/^\d{10,17}$/.test(newImei)) { msg.textContent = 'IMEI 需为 10~17 位数字'; return; }
      if (!name) { msg.textContent = '请填写设备名称'; return; }
      if (window.App && window.App.saveDeviceProfile) {
        window.App.saveDeviceProfile(imei, newImei, name, note, msg);
      }
    });
  }

  // ---------- #/devices 设备管理 ----------
  function renderDevices(query, records) {
    var rows = (records || []).map(function (d) {
      var imei = d.deviceid;
      var name = window.PetStore.getName(imei);
      return '<tr data-imei="' + esc(imei) + '">' +
        '<td>' + esc(name) + '</td>' +
        '<td class="mono">' + esc(imei) + '</td>' +
        '<td>' +
        '<button type="button" class="btn-mini" data-action="dev-detail" data-imei="' + esc(imei) + '">详情</button> ' +
        '<button type="button" class="btn-mini" data-action="dev-cmd" data-imei="' + esc(imei) + '">⚡ 指令</button> ' +
        '<button type="button" class="btn-mini" data-action="dev-track" data-imei="' + esc(imei) + '">轨迹</button>' +
        '</td></tr>';
    }).join('');
    setMain(
      '<div class="page-head"><h2>设备管理</h2>' +
      '<div class="search-bar"><input id="dev-search" type="text" placeholder="搜索 IMEI 前缀" value="' + esc(query || '') + '">' +
      '<button type="button" class="btn" data-action="dev-search">搜索</button></div></div>' +
      '<div class="table-wrap"><table class="tbl"><thead><tr><th>名称</th><th>IMEI</th><th>操作</th></tr></thead>' +
      '<tbody>' + (rows || '<tr><td colspan="3">' + empty('无匹配设备') + '</td></tr>') + '</tbody></table></div>'
    );
  }

  function deviceDetailDialog(imei) {
    var st = window.PetStore.getStatus(imei);
    var rows = [];
    rows.push(['设备名称', window.PetStore.getName(imei)]);
    rows.push(['IMEI', imei]);
    if (st && st.code === 0) {
      rows.push(['经纬度(GCJ02)', st.lng + ', ' + st.lat]);
      rows.push(['经纬度(WGS84)', st.wlng + ', ' + st.wlat]);
      rows.push(['地址', st.address || '-']);
      rows.push(['更新时间', st.time || '-']);
      if (st.vbat) rows.push(['电压', st.vbat + ' mV']);
      if (st.sat !== null && st.sat !== undefined) rows.push(['卫星', st.sat + ' 颗']);
      if (st.gnss) {
        rows.push(['速度', (st.speedKmh || 0).toFixed(1) + ' km/h']);
        rows.push(['航向', Math.round(st.course || 0) + '°']);
        rows.push(['海拔', Math.round(st.alt || 0) + ' m']);
      }
    } else {
      rows.push(['状态', '暂无实时数据']);
    }
    var html = '<table class="tbl kv">' + rows.map(function (r) {
      return '<tr><td>' + esc(r[0]) + '</td><td>' + esc(r[1]) + '</td></tr>';
    }).join('') + '</table>';
    U.openModal('设备详情', html);
  }

  function cmdDialog(imei) {
    var opts = CFG.CMD_TAGS.map(function (t) {
      return '<option value="' + t.tag + '">' + t.tag + ' · ' + esc(t.name) + '</option>';
    }).join('');
    var body = U.openModal('下发指令 · ' + esc(window.PetStore.getName(imei)),
      '<div class="fld-row"><label class="fld">Tag<select id="cmd-tag">' + opts + '</select></label>' +
      '<label class="fld">协议<select id="cmd-proto"><option value="0">TCP(0)</option><option value="1">UDP(1)</option><option value="2">MQTT(2)</option></select></label></div>' +
      '<label class="fld">Value（JSON 或文本）<input id="cmd-value" type="text" placeholder=\'如 {"cmd":"fast_report"}\'></label>' +
      '<label class="fld">sn（可选）<input id="cmd-sn" type="number" placeholder="0"></label>' +
      '<label class="fld">自定义 Tag（覆盖预设）<input id="cmd-tag-custom" type="number" placeholder="留空用上方 Tag"></label>' +
      '<div id="cmd-msg" class="fld-msg"></div>' +
      '<div class="modal-ops"><button type="button" class="btn" id="cmd-send">下发</button></div>' +
      '<div class="muted small">注：平台 send_cmd 存在未文档化「Tag标志」必填字段，若返回 code 13「缺少Tag标志」为平台侧待解问题。</div>'
    );
    body.querySelector('#cmd-send').addEventListener('click', function () {
      var tag = byId('cmd-tag-custom').value ? +byId('cmd-tag-custom').value : +byId('cmd-tag').value;
      var value = byId('cmd-value').value.trim();
      var proto = +byId('cmd-proto').value;
      var sn = byId('cmd-sn').value ? +byId('cmd-sn').value : undefined;
      var msg = byId('cmd-msg');
      msg.textContent = '下发中…';
      AC.sendCmd(imei, tag, value, proto, sn).then(function (r) {
        if (r.code === 0) {
          msg.textContent = '✅ ' + (typeof r.value === 'string' ? r.value : '操作成功');
          U.toast('指令已下发', 'ok');
        } else {
          msg.textContent = '❌ code ' + r.code + '：' + (r.value || '失败');
        }
      });
    });
  }

  // ---------- #/fence 电子围栏 ----------
  function renderFence() {
    setMain('<div id="fence-map" class="map-full"></div>' +
      '<div class="fence-panel">' +
      '<div class="fence-btns">' +
      '<button type="button" class="fence-btn" data-action="fence-circle"><b>⭕ 圆形围栏</b><span class="muted">点两下地图：定圆心 → 定半径（≥20m）</span></button>' +
      '<button type="button" class="fence-btn" data-action="fence-polygon"><b>⬠ 多边形围栏</b><span class="muted">连续加点 → 完成 → 保存</span></button>' +
      '</div>' +
      '<div id="fence-status" class="fence-status muted">选择围栏类型开始绘制</div>' +
      '<div class="fence-list-head">我的围栏</div>' +
      '<div id="fence-list"></div>' +
      '</div>');
  }

  function renderFenceList() {
    var box = byId('fence-list');
    if (!box) return;
    var fs = window.FenceStore.list();
    if (!fs.length) { box.innerHTML = '<div class="muted small">暂无围栏</div>'; return; }
    box.innerHTML = fs.map(function (f) {
      var desc = f.type === 'circle'
        ? '圆形 · 半径 ' + Math.round(f.radius) + 'm'
        : '多边形 · ' + (f.points || []).length + ' 点';
      return '<div class="fence-item">' +
        '<span class="fi-name">' + esc(f.name) + '</span>' +
        '<span class="fi-desc muted">' + esc(desc) + '</span>' +
        '<label class="switch"><input type="checkbox" data-action="fence-toggle" data-id="' + esc(f.id) + '"' + (f.enabled ? ' checked' : '') + '><i></i></label>' +
        '<button type="button" class="btn-mini" data-action="fence-locate" data-id="' + esc(f.id) + '">定位</button>' +
        '<button type="button" class="btn-mini danger" data-action="fence-del" data-id="' + esc(f.id) + '">删除</button>' +
        '</div>';
    }).join('');
  }

  function fenceNameDialog(draft, onSave) {
    U.openModal('保存围栏',
      '<label class="fld">围栏名称<input id="fence-name" type="text" maxlength="30" placeholder="如：家附近"></label>' +
      '<div class="muted small">' + esc(draft.desc) + '</div>' +
      '<div class="modal-ops"><button type="button" class="btn" id="fence-save">保存</button></div>');
    byId('fence-save').addEventListener('click', function () {
      var name = (byId('fence-name').value || '').trim() || '未命名围栏';
      U.closeModal();
      onSave(name);
    });
  }

  // ---------- #/track/<imei> 轨迹回放 ----------
  function renderTrack(imei) {
    var tagOpts = CFG.TRACK_TAGS.map(function (t) {
      return '<label class="chk"><input type="checkbox" class="track-tag" value="' + t + '" checked> ' + t + '（' + esc(tagDesc(t)) + '）</label>';
    }).join('');
    setMain(
      '<div class="track-side">' +
      '<div class="track-imei mono">' + esc(imei) + '</div>' +
      '<label class="fld">开始时间<input id="tk-start" type="text" value="' + esc(U.todayStr() + ' 00:00:00') + '" placeholder="YYYY-MM-DD HH:mm:ss"></label>' +
      '<label class="fld">结束时间<input id="tk-end" type="text" value="' + esc(U.fmtTime(new Date())) + '"></label>' +
      '<div class="fld">Tags' + tagOpts + '<label class="chk"><input type="checkbox" class="track-tag" value="1294"> 1294（GNSS 精细点）</label></div>' +
      '<button type="button" class="btn" data-action="track-query" data-imei="' + esc(imei) + '">查询轨迹</button> ' +
      '<button type="button" class="btn-ghost" data-action="track-stop">停止</button>' +
      '<div id="tk-progress" class="progress hidden"><i id="tk-progress-bar"></i><span id="tk-progress-text"></span></div>' +
      '<div id="tk-result" class="muted small"></div>' +
      '<div class="track-ops">' +
      '<button type="button" class="btn-mini" data-action="track-play" data-imei="' + esc(imei) + '">▶ 回放（×2400）</button>' +
      '<button type="button" class="btn-mini" data-action="track-replay-stop">⏹ 停止回放</button>' +
      '</div>' +
      '</div>' +
      '<div id="track-map" class="map-rest"></div>');
  }

  function tagDesc(tag) {
    var map = {
      21: 'iRTU下行', 22: '上传日志', 25: 'iRTU上行', 28: 'SMS',
      256: '温度', 512: 'GNSS经度', 513: 'GNSS纬度', 515: '最强4星CN',
      516: '搜星总数', 517: '可见卫星', 519: '定位标识', 777: '开机原因',
      782: '4G信号', 799: '电压mV', 1281: '自定义下行', 1293: 'gsensor', 1294: 'GNSS差分'
    };
    return map[tag] || '';
  }

  // ---------- #/debug 性能监控 ----------
  function renderDebug(imeis) {
    var cards = (imeis || []).map(function (imei) {
      return debugCard(imei);
    }).join('');
    setMain(
      '<div class="page-head"><h2>性能监控</h2>' +
      '<div class="muted small">📶信号 / 🔋耗电(799) / ⭐搜星(515) / 📉丢包 / 🔄重启(777) / 🚨异常 / 📤上报数据</div></div>' +
      (cards || empty('暂无设备'))
    );
  }

  var PF_RANGES = U.RANGES;

  function debugCard(imei) {
    var chips = PF_RANGES.map(function (r, i) {
      return '<button type="button" class="pf-range' + (i === 2 ? '' : ' dis') + '" data-action="pf-range" data-imei="' + esc(imei) + '" data-range="' + r.key + '">' + esc(r.label) + '</button>';
    }).join('');
    return '<div class="pf-card" id="pf-' + esc(imei) + '" data-imei="' + esc(imei) + '">' +
      '<div class="pf-head"><span class="mono">' + esc(imei) + '</span>' +
      '<span class="muted small">数据总量：</span>' + chips + '</div>' +
      '<div class="pf-body">' + loading('加载数据…') + '</div>' +
      '</div>';
  }

  // 性能卡内容（窗口数据就绪后）
  function renderPfBody(imei, data) {
    var box = document.getElementById('pf-' + imei);
    if (!box) return null;
    var body = box.querySelector('.pf-body');
    if (!body) return null;
    body.innerHTML =
      '<div class="pf-sec" id="pf-sig-' + esc(imei) + '"></div>' +
      '<div class="pf-sec" id="pf-bat-' + esc(imei) + '"></div>' +
      '<div class="pf-sec" id="pf-sat-' + esc(imei) + '"></div>' +
      '<div class="pf-sec" id="pf-loss-' + esc(imei) + '"></div>' +
      '<div class="pf-sec" id="pf-reboot-' + esc(imei) + '"></div>' +
      '<div class="pf-sec" id="pf-err-' + esc(imei) + '"></div>' +
      '<div class="pf-sec" id="pf-up-' + esc(imei) + '"></div>';
    return body;
  }

  // 简易 SVG 折线图（X 轴按数据真实范围、本地钟面刻度）
  function sparkline(series, w, h, color) {
    if (!series || series.length < 2) return '<div class="muted small">数据不足</div>';
    var minT = series[0][0], maxT = series[series.length - 1][0];
    var minV = Infinity, maxV = -Infinity;
    for (var i = 0; i < series.length; i++) {
      if (series[i][1] < minV) minV = series[i][1];
      if (series[i][1] > maxV) maxV = series[i][1];
    }
    if (maxV === minV) { maxV = minV + 1; }
    var pad = 24;
    var pts = series.map(function (p) {
      var x = pad + (p[0] - minT) / ((maxT - minT) || 1) * (w - pad * 2);
      var y = h - pad - (p[1] - minV) / ((maxV - minV) || 1) * (h - pad * 2);
      return x.toFixed(1) + ',' + y.toFixed(1);
    }).join(' ');
    // 刻度：起始/中间/结束钟面
    function tick(t) { return esc(U.fmtShort(new Date(t))); }
    return '<svg class="spark" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none">' +
      '<polyline fill="none" stroke="' + color + '" stroke-width="1.6" points="' + pts + '"/></svg>' +
      '<div class="spark-x"><span>' + tick(minT) + '</span><span>' + tick((minT + maxT) / 2) + '</span><span>' + tick(maxT) + '</span></div>';
  }

  // 📤 上报数据列表（最新在前 ≤200）
  function renderUploadList(imei, records) {
    var box = document.getElementById('pf-up-' + imei);
    if (!box) return;
    var sorted = (records || []).slice().sort(function (a, b) { return AC.recTs(b) - AC.recTs(a); }).slice(0, 200);
    var html = '<h4>📤 上报数据 <span class="muted small">(' + sorted.length + ' 条，最新在前)</span></h4>';
    if (!sorted.length) { box.innerHTML = html + empty('窗口内无数据包'); return; }
    html += '<div class="rec-list">' + sorted.map(function (r, i) {
      return '<div class="rec-item" data-action="rec-open" data-imei="' + esc(imei) + '" data-idx="' + i + '">' +
        '<span class="mono">' + esc(r.ct || '-') + '</span>' +
        '<span class="mono muted">sn:' + esc(r.sn !== undefined ? r.sn : '-') + '</span>' +
        '<span class="muted">' + esc(Object.keys(r).filter(function (k) { return k.indexOf('val_') === 0 || /^\d+$/.test(k); }).join(' ')) + '</span>' +
        '</div>';
    }).join('') + '</div>';
    box.innerHTML = html;
    box._records = sorted;
  }

  // 全字段弹窗
  function recModal(rec) {
    var rows = window.PetStatus.recFields(rec).map(function (r) {
      return '<tr><td class="mono">' + esc(r.key) + '</td><td class="mono">' + esc(r.value) + '</td></tr>';
    }).join('');
    U.openModal('数据包详情 · ' + esc(rec.ct || ''), '<table class="tbl kv">' + rows + '</table>');
  }

  // 最新位置卡（latest_location）
  function latestCard(imei, st) {
    if (!st || st.code !== 0) return '<div class="pf-sec">' + errorBox(st && st.value ? st.value : '最新位置获取失败') + '</div>';
    return '<div class="pf-sec latest-card"><h4>📍 最新位置</h4>' +
      '<div>🏷 ' + esc(st.address || '-') + '</div>' +
      '<div>' + batteryHtml(st) + '</div>' +
      '<div class="mono small muted">GCJ02: ' + esc((+st.lng).toFixed(6)) + ', ' + esc((+st.lat).toFixed(6)) +
      ' · WGS84: ' + esc((+st.wlng).toFixed(6)) + ', ' + esc((+st.wlat).toFixed(6)) + '</div>' +
      '<div class="small muted">🕒 ' + esc(st.time || '-') + '</div></div>';
  }

  // ---------- #/status 设备状态 ----------
  function renderStatus(imeis) {
    var opts = (imeis || []).map(function (imei) {
      return '<option value="' + esc(imei) + '">' + esc(window.PetStore.getName(imei)) + ' · ' + esc(imei) + '</option>';
    }).join('');
    setMain(
      '<div class="page-head"><h2>设备状态（gsensor）</h2>' +
      '<select id="st-device" class="proj-select">' + opts + '</select>' +
      '<button type="button" class="btn" data-action="status-load">加载状态</button></div>' +
      '<div class="muted small">解包 1293（12bit 三轴）→ 步数 / 姿态 / 跌倒；1294 GNSS 辅助；仅真实数据。</div>' +
      '<div id="st-body"></div>'
    );
  }

  function renderStatusResult(r) {
    var box = byId('st-body');
    if (!box) return;
    if (!r || !r.analyses) { box.innerHTML = errorBox('加载失败'); return; }
    var s = r.summary || {};
    var imuRow = isFinite(s.pitch)
      ? '<div class="st-kv">📐 姿态：俯仰 ' + esc(s.pitch.toFixed(1)) + '° · 横滚 ' + esc(s.roll.toFixed(1)) + '°</div>' : '';
    box.innerHTML =
      '<div class="card-grid">' +
      '<div class="stat-card"><h4>🚶 步数</h4><div class="stat-num">' + esc(s.steps || 0) + '</div><div class="muted small">' + esc(s.packs || 0) + ' 包数据（窗口 ' + esc(r.window.start) + ' ~ ' + esc(r.window.end) + '）</div></div>' +
      '<div class="stat-card"><h4>🏃 运动状态</h4><div class="stat-num">' + esc(s.dominant || '-') + '</div><div class="muted small">静止 ' + (s.states ? s.states['静止'] || 0 : 0) + ' · 活动 ' + (s.states ? s.states['活动'] || 0 : 0) + ' · 剧烈 ' + (s.states ? s.states['剧烈'] || 0 : 0) + '</div></div>' +
      '<div class="stat-card"><h4>🚨 跌倒检测</h4><div class="stat-num">' + esc(s.falls || 0) + '</div><div class="muted small">冲击峰+静止判定</div></div>' +
      '<div class="stat-card"><h4>🛰️ GNSS 辅助</h4><div class="stat-num">' + (r.gnss && r.gnss.length ? esc(r.gnss.length) + ' 点' : '无') + '</div>' + (r.gnssCt ? '<div class="muted small">' + esc(r.gnssCt) + '</div>' : '') + '</div>' +
      '</div>' + imuRow;
  }

  // ---------- #/alerts 报警 ----------
  function renderAlerts() {
    var list = window.FenceStore.alertList();
    var rows = list.map(function (a) {
      return '<div class="alert-item' + (a.read ? ' read' : '') + '">' +
        '<div><b>' + esc(window.PetStore.getName(a.imei)) + '</b> 进入围栏「' + esc(a.fenceName) + '」</div>' +
        '<div class="muted small mono">' + esc(a.time) + ' · ' + esc((+a.lng).toFixed(5)) + ', ' + esc((+a.lat).toFixed(5)) + '</div>' +
        '</div>';
    }).join('');
    setMain(
      '<div class="page-head"><h2>围栏报警</h2>' +
      '<button type="button" class="btn-ghost" data-action="alerts-clear">清空</button></div>' +
      (rows || empty('暂无报警记录'))
    );
  }

  // 调试页旧版说明（保留 5s 轮询为 debug 卡片的一部分，不再单列）
  function debugNote() {
    return '<div class="muted small">调试模式：#/debug 5s 轮询 list_by_tags，全字段/TLV 见「📤 上报数据」→ 点击数据包查看全字段。</div>';
  }

  window.Views = {
    shell: shell,
    activeNav: activeNav,
    mainEl: mainEl,
    setMain: setMain,
    empty: empty,
    errorBox: errorBox,
    loading: loading,
    statusBadge: statusBadge,
    batteryHtml: batteryHtml,
    signalHtml: signalHtml,
    popupHtml: popupHtml,
    homeCard: homeCard,
    renderHome: renderHome,
    renderHomeCards: renderHomeCards,
    renderPets: renderPets,
    petEditDialog: petEditDialog,
    renderDevices: renderDevices,
    deviceDetailDialog: deviceDetailDialog,
    cmdDialog: cmdDialog,
    renderFence: renderFence,
    renderFenceList: renderFenceList,
    fenceNameDialog: fenceNameDialog,
    renderTrack: renderTrack,
    tagDesc: tagDesc,
    renderDebug: renderDebug,
    debugCard: debugCard,
    renderPfBody: renderPfBody,
    sparkline: sparkline,
    renderUploadList: renderUploadList,
    recModal: recModal,
    latestCard: latestCard,
    renderStatus: renderStatus,
    renderStatusResult: renderStatusResult,
    renderAlerts: renderAlerts,
    debugNote: debugNote,
    addTimer: addTimer,
    clearTimers: clearTimers,
    PF_RANGES: PF_RANGES
  };
})();

/* ==== js/app/main.js ==== */
/* app/main.js — 业务入口：hash 路由 / 鉴权 / 项目与设备 / 轮询 / 实时追踪 / 页面调度 */
(function () {
  'use strict';

  var CFG = window.CFG, U = window.U, AC = window.AC;
  var Views = window.Views, MapKit = window.MapKit;
  var $ = U.$, byId = U.byId, esc = U.esc;

  var state = {
    inited: false,
    projectKey: null,
    projectName: '',
    devices: [],          // [imei]
    route: '',
    currentImei: null,    // #/track/<imei>
    homeTimer: null,
    turbo: null,          // {imei, deadline, timer, prevView}
    fenceDraft: null,
    lastStatuses: [],
    homeView: { center: null, zoom: null }
  };

  // ================= 鉴权与初始化 =================
  function initAuth() {
    // m_* 外部认证注入（URL 完整有效 → 写缓存 + 宿主会话标记）
    var q = parseQuery();
    if (q.m_token && q.m_salt && q.m_sid) {
      U.store.set('m_auth', { token: q.m_token, salt: q.m_salt });
      U.store.set('m_service', { sid: q.m_sid });
      var prof = {};
      if (q.m_name) prof.name = q.m_name;
      if (q.m_phone) prof.mobile = q.m_phone;
      if (prof.name !== undefined || prof.mobile !== undefined) U.store.set('m_profile', prof);
      var msets = {};
      if (q.m_algorithm) msets.algorithm = q.m_algorithm;
      if (q.m_encryptOutput) msets.encryptOutput = q.m_encryptOutput;
      if (q.m_padding) msets.padding = q.m_padding;
      if (q.m_publicKey) msets.publicKey = q.m_publicKey;
      if (q.m_publicKeyEncoding) msets.publicKeyEncoding = q.m_publicKeyEncoding;
      if (Object.keys(msets).length) U.store.set('m_sets', msets);
      try { window.sessionStorage.setItem('m_host_session', '1'); } catch (e) { /* 忽略 */ }
    }
    cleanUrlParams(['m_token', 'm_salt', 'm_sid', 'm_name', 'm_phone', 'm_algorithm',
      'm_encryptOutput', 'm_padding', 'm_publicKey', 'm_publicKeyEncoding', 'return_to']);

    if (!AC.hasAuth()) {
      AC.goPage('login.html', location.hash || '#/home');
      return false;
    }
    return true;
  }

  function parseQuery() {
    var out = {};
    try {
      var s = window.location.search.replace(/^\?/, '');
      var parts = s ? s.split('&') : [];
      for (var i = 0; i < parts.length; i++) {
        if (!parts[i]) continue;
        var kv = parts[i].split('=');
        out[decodeURIComponent(kv[0])] = decodeURIComponent((kv[1] || '').replace(/\+/g, ' '));
      }
    } catch (e) { /* 忽略 */ }
    return out;
  }

  function cleanUrlParams(keys) {
    try {
      var search = window.location.search.replace(/^\?/, '');
      if (!search) return;
      var keep = search.split('&').filter(function (pair) {
        var k = decodeURIComponent(pair.split('=')[0] || '');
        return keys.indexOf(k) < 0;
      });
      var url = window.location.pathname + (keep.length ? '?' + keep.join('&') : '') + window.location.hash;
      window.history.replaceState({}, '', url);
    } catch (e) { /* 忽略 */ }
  }

  // ================= 项目 / 设备 =================
  function loadProjects(cb) {
    AC.listMyProjects().then(function (r) {
      if (r.code !== 0 || !Array.isArray(r.value) || !r.value.length) {
        U.toast(r.code === 0 ? '账号下暂无项目' : (r.value || '项目列表获取失败'), 'err');
        return;
      }
      var sel = byId('project-select');
      if (sel) {
        sel.innerHTML = r.value.map(function (p) {
          return '<option value="' + esc(p.project_key) + '">' + esc(p.name) + '</option>';
        }).join('');
        var remembered = U.store.get('pt_project_key');
        var key = remembered && r.value.some(function (p) { return p.project_key === remembered; })
          ? remembered : r.value[0].project_key; // 默认第一项，禁止虚构 KEY
        sel.value = key;
        sel.addEventListener('change', function () {
          state.projectKey = sel.value;
          U.store.set('pt_project_key', sel.value);
          state.devices = []; // 切项目后清空旧设备，强制重拉
          loadDevices(state.projectKey, function () { reroute(); });
        });
        state.projectKey = key;
        state.projects = r.value; // 供空态诊断展示
      }
      if (cb) cb();
    });
  }

  function loadDevices(projectKey, cb) {
    var imeis = [];
    function page(p) {
      AC.listMyDevices(projectKey, p, 100).then(function (r) {
        if (r.code !== 0 || !r.value) {
          state.deviceError = (r.value || '设备列表获取失败') + (r.code !== 0 ? '（code ' + r.code + '）' : '');
          if (p === 1) U.toast(state.deviceError, 'err');
          try { console.warn('[loadDevices] project=' + projectKey + ' code=' + r.code + ' value=', r.value); } catch (e2) { /* 忽略 */ }
          finish();
          return;
        }
        state.deviceError = null;
        var recs = r.value.records || [];
        for (var i = 0; i < recs.length; i++) {
          if (recs[i].deviceid) imeis.push(recs[i].deviceid);
        }
        if (Number(r.value.pages) > p && p < 100) page(p + 1);
        else finish();
      });
    }
    function finish() {
      state.devices = imeis;
      window.PetStore.mergeDevices(imeis);
      syncCloudNames(function (changed) {
        if (cb) cb(changed);
      });
    }
    page(1);
  }

  // 首页空态诊断信息：当前项目、项目总数、接口错误
  function homeMeta() {
    var sel = byId('project-select');
    return {
      projectName: sel && sel.selectedOptions && sel.selectedOptions[0] ? sel.selectedOptions[0].text : '',
      projectCount: state.projects ? state.projects.length : 0,
      error: state.deviceError || ''
    };
  }

  // 云端设备名称同步（v52）：common/list 以云端为权威覆盖绑定档案名
  function syncCloudNames(cb) {
    AC.commonList(CFG.DEVNAME_CLS, { size: 100 }).then(function (r) {
      if (r.code === 0 && r.value && r.value.records) {
        var changed = window.PetStore.applyCloudNames(r.value.records);
        if (cb) cb(changed);
      } else if (cb) {
        cb(false);
      }
      // 上传失败的待传名重试
      retryPendingNames();
    });
  }

  function retryPendingNames() {
    var pend = window.PetStore.pendingNames();
    for (var i = 0; i < pend.length; i++) {
      (function (item) {
        uploadDeviceName(item.imei, item.name, true);
      })(pend[i]);
    }
  }

  function uploadDeviceName(imei, name, silent) {
    AC.commonPut(CFG.DEVNAME_CLS, { uni_key: imei, s1: name }).then(function (r) {
      if (r.code === 0) {
        window.PetStore.clearPending(imei);
        if (!silent) U.toast('设备名称已同步云端', 'ok');
      } else {
        window.PetStore.markPending(imei, name); // 待传名保护：云端旧名不得回盖
        var hint = r.code === 13 || /非法访问/.test(String(r.value)) ? '（多为公钥与应用不配对，请退出后重新登录）' : '';
        if (!silent) U.toast('名称云端同步失败：' + (r.value || ('code ' + r.code)) + hint + '（本地已记录，稍后自动重试）', 'err');
      }
    });
  }

  function saveDeviceProfile(oldImei, imei, name, note, msgEl) {
    if (oldImei && oldImei !== imei) {
      // 换绑：删旧建新（云端旧记录删除）
      var oldName = window.PetStore.getName(oldImei);
      window.PetStore.remove(oldImei);
      window.PetStore.upsert(imei, { name: name, note: note, auto: false });
      AC.commonList(CFG.DEVNAME_CLS, { size: 100 }).then(function (r) {
        if (r.code === 0 && r.value && r.value.records) {
          for (var i = 0; i < r.value.records.length; i++) {
            if (r.value.records[i].uni_key === oldImei) {
              AC.commonDeleteById(CFG.DEVNAME_CLS, r.value.records[i].id);
              break;
            }
          }
        }
      });
      uploadDeviceName(imei, name);
    } else {
      window.PetStore.upsert(imei, { name: name, note: note });
      uploadDeviceName(imei, name);
    }
    U.closeModal();
    U.toast('已保存', 'ok');
    reroute();
  }

  // ================= 路由 =================
  function parseRoute() {
    var h = window.location.hash || '#/home';
    var parts = h.replace(/^#\//, '').split('/');
    return { name: parts[0] || 'home', arg: parts[1] ? decodeURIComponent(parts[1]) : null };
  }

  function reroute() {
    onRoute();
  }

  function onRoute() {
    var r = parseRoute();
    // 页面切换：清定时器 + 退出 turbo + MapKit create 时自动 epoch 隔离
    stopHomePoll();
    exitTurbo(true);
    Views.clearTimers();
    MapKit.stopReplay();
    state.route = r.name;
    state.currentImei = r.arg;

    // 异步归属守卫：渲染前记录路由代号，回调里校验
    var myRoute = r.name + '/' + (r.arg || '');

    if (r.name === 'home') { pageHome(myRoute); }
    else if (r.name === 'pets') { pagePets(myRoute); }
    else if (r.name === 'status') { pageStatus(); }
    else if (r.name === 'debug') { pageDebug(); }
    else if (r.name === 'devices') { pageDevices(); }
    else if (r.name === 'fence') { pageFence(); }
    else if (r.name === 'track') { pageTrack(r.arg); }
    else if (r.name === 'alerts') { Views.renderAlerts(); }
    else { window.location.hash = '#/home'; return; }

    Views.activeNav(r.name === 'track' ? 'home' : r.name);
  }

  // ================= #/home 实时地图 =================
  function pageHome(myRoute) {
    Views.renderHome();
    Views.renderHomeCards([]);
    refreshHomeStatuses(myRoute);
    stopHomePoll();
    state.homeTimer = setInterval(function () {
      if (state.turbo) return; // turbo 期间由 turbo 轮询接管
      refreshHomeStatuses(myRoute);
    }, CFG.POLL_HOME_MS);
    Views.addTimer(state.homeTimer);
    bindHomeCardEvents();
  }

  function stopHomePoll() {
    if (state.homeTimer) { clearInterval(state.homeTimer); state.homeTimer = null; }
  }

  function refreshHomeStatuses(myRoute) {
    if (!state.devices.length) {
      loadDevices(state.projectKey, function (changed) {
        if (changed) { reroute(); return; }
        if (byId('home-cards')) Views.renderHomeCards([], homeMeta()); // 空态诊断（不再递归重拉）
      });
      return;
    }
    var targets = state.turbo ? [state.turbo.imei] : state.devices.slice();
    var statuses = [];
    var seq = 0;
    function next() {
      if (seq >= targets.length) { after(); return; }
      var imei = targets[seq++];
      AC.getPetStatus(imei).then(function (st) {
        // 归属守卫：目标 DOM 存在才渲染
        if (byId('home-map')) {
          window.PetStore.setStatus(imei, st);
          if (st.code === 0 && st.lng !== undefined) {
            statuses.push(st);
            var rec = MapKit.upsertPet(imei, st.lng, st.lat, { name: window.PetStore.getName(imei) });
            if (rec) {
              rec.popupHtml = function () { return Views.popupHtml(imei, st); };
            }
          }
        }
        next();
      });
    }
    function after() {
      if (!byId('home-map') || parseRouteKey() !== myRoute) return;
      state.lastStatuses = statuses;
      Views.renderHomeCards(statuses);
      MapKit.refreshOpenPopups();
      if (!MapKit.zoomByImei() && !MapKit.turboImei() && statuses.length) MapKit.fitAll();
      if (state.turbo) {
        var bar = byId('turbo-bar');
        if (bar) bar.classList.remove('hidden');
        var info = byId('turbo-info');
        if (info) info.textContent = '⚡ 实时追踪中：' + window.PetStore.getName(state.turbo.imei);
        MapKit.setTurboFocus(state.turbo.imei);
        var rec2 = MapKit.petMarker(state.turbo.imei);
        if (rec2) MapKit.panToPet(state.turbo.imei, 18);
      }
    }
    function parseRouteKey() { var r = parseRoute(); return r.name + '/' + (r.arg || ''); }
    next();
  }

  function bindHomeCardEvents() {
    var box = byId('home-cards');
    if (!box || box._bound) return;
    box._bound = true;
    box.addEventListener('mouseover', function (e) {
      var card = e.target && e.target.closest ? e.target.closest('.pet-card') : null;
      if (card) MapKit.hoverZoomTo(card.getAttribute('data-imei'));
    });
    box.addEventListener('mouseout', function (e) {
      if (e.target && e.target.closest && e.target.closest('.pet-card')) MapKit.hoverLeave();
    });
    box.addEventListener('click', function (e) {
      var card = e.target && e.target.closest ? e.target.closest('.pet-card') : null;
      if (card) {
        var imei = card.getAttribute('data-imei');
        MapKit.zoomByImei(imei, 16); // 16 级锁定（悬停不降级，刷新后按锁定恢复）
        MapKit.openPopupFor(imei);
      }
    });
  }

  // ================= 实时追踪（Turbo） =================
  function onTurboClick(imei) {
    if (state.turbo) { U.toast('已在实时追踪中'); return; }
    var t = U.parseLocal((window.PetStore.getStatus(imei) || {}).time);
    if (!t || Date.now() - t.getTime() > 5 * 60 * 1000) {
      U.toast('该设备超 5 分钟未上报，无法实时追踪', 'err');
      return;
    }
    // 先下发 fast_report，成功后才进入（防重入锁）
    AC.sendCmd(imei, CFG.TURBO_CMD_TAG, '{"cmd":"fast_report"}', 0).then(function (r) {
      if (r.code !== 0) {
        U.toast('指令下发失败：' + (r.value || ('code ' + r.code)) + (r.code === 13 ? '（平台「Tag标志」待解）' : ''), 'err');
        return;
      }
      enterTurbo(imei);
    });
  }

  function enterTurbo(imei) {
    state.turbo = { imei: imei, deadline: Date.now() + CFG.TURBO_DURATION_MS };
    var myRoute = 'home/';
    // 只显示该设备 + zoom 18 居中
    MapKit.setTurboFocus(imei);
    MapKit.panToPet(imei, 18);
    var rec = MapKit.petMarker(imei);
    if (rec) MapKit.openPopupFor(imei);
    var bar = byId('turbo-bar');
    if (bar) bar.classList.remove('hidden');
    var info = byId('turbo-info');
    if (info) info.textContent = '⚡ 实时追踪中：' + window.PetStore.getName(imei);
    state.turbo.timer = setInterval(function () {
      if (!byId('home-map')) { exitTurbo(true); return; } // 离开首页自动退出
      if (Date.now() > state.turbo.deadline) { exitTurbo(); return; } // 60s 到期
      refreshHomeStatuses(myRoute);
      var rec2 = MapKit.petMarker(imei);
      if (rec2 && rec2.lng !== undefined) MapKit.panToPet(imei, 18); // 镜头跟随
    }, CFG.POLL_TURBO_MS);
    Views.addTimer(state.turbo.timer);
  }

  function exitTurbo(silent) {
    if (!state.turbo) return;
    if (state.turbo.timer) clearInterval(state.turbo.timer);
    state.turbo = null;
    MapKit.setTurboFocus(null); // 恢复全部 marker
    var bar = byId('turbo-bar');
    if (bar) bar.classList.add('hidden');
    if (!silent && parseRoute().name === 'home') {
      MapKit.zoomByImei(null, null);
      refreshHomeStatuses('home/');
    }
  }

  // ================= #/pets =================
  function pagePets(myRoute) {
    var sts = [];
    for (var i = 0; i < state.devices.length; i++) {
      var st = window.PetStore.getStatus(state.devices[i]);
      if (st) sts.push(st);
    }
    Views.renderPets(sts);
    // 实时拉一遍
    var seq = 0;
    function next() {
      if (seq >= state.devices.length || !byId('main')) return;
      var imei = state.devices[seq++];
      AC.getPetStatus(imei).then(function (st) {
        if (!byId('main') || parseRoute().name !== 'pets') return; // 归属守卫
        window.PetStore.setStatus(imei, st);
        next();
      });
    }
    next();
  }

  // ================= #/status =================
  function pageStatus() {
    Views.renderStatus(state.devices);
    var sel = byId('st-device');
    if (sel) sel.value = state.currentImei && state.devices.indexOf(state.currentImei) >= 0
      ? state.currentImei : (state.devices[0] || '');
  }

  function loadStatusPage() {
    var sel = byId('st-device');
    if (!sel || !sel.value) { U.toast('暂无设备', 'err'); return; }
    var imei = sel.value;
    var body = byId('st-body');
    if (body) body.innerHTML = Views.loading('拉取 1293/1294 数据…');
    window.PetStatus.fetchStatus(imei, { minutes: 30 }).then(function (r) {
      if (parseRoute().name !== 'status') return; // 归属守卫
      Views.renderStatusResult(r);
    });
  }

  // ================= #/debug 性能监控 =================
  function pageDebug() {
    Views.renderDebug(state.devices);
    for (var i = 0; i < state.devices.length; i++) {
      loadPfCard(state.devices[i], '6h'); // 默认 6 小时窗口
    }
  }

  // 单卡加载：窗口统一控制；数据就绪前 chips 全灰 .dis
  function loadPfCard(imei, rangeKey) {
    var card = document.getElementById('pf-' + imei);
    if (!card) return;
    var body = card.querySelector('.pf-body');
    if (body) body.innerHTML = Views.loading('拉取窗口数据…');
    var win = U.rangeWindow(rangeKey);
    AC.fetchAllByTags({
      clientId: imei, tags: [782, 799, 515, 777, 519, 256], start: win.start, end: win.end,
      onProgress: function (done, total) {
        var b = card.querySelector('.pf-body .loading');
        if (b) b.innerHTML = '<div class="spinner"></div>加载中 ' + done + '/' + (total || '?');
      }
    }).then(function (records) {
      if (!document.getElementById('pf-' + imei)) return; // 归属守卫
      if (!Array.isArray(records)) {
        var b2 = card.querySelector('.pf-body');
        if (b2) b2.innerHTML = Views.errorBox(records && records.value ? records.value : '加载失败');
        return;
      }
      records.sort(function (a, b) { return AC.recTs(a) - AC.recTs(b); });
      var data = buildPfSeries(records);
      data.window = win;
      data.range = rangeKey;
      card._data = data;
      renderPfCard(imei, data);
      // 数据就绪 → 点亮 chips
      var chips = card.querySelectorAll('.pf-range');
      for (var i = 0; i < chips.length; i++) chips[i].classList.remove('dis');
    });
  }

  function buildPfSeries(records) {
    var sig = [], bat = [], sat = [], reb = [];
    var batByHour = {}; // 每小时耗电量：hour → [min,max]
    var lastReb = null;
    var rebootCount = 0;
    var errCount = 0;
    var snGaps = 0, lastSn = null;
    for (var i = 0; i < records.length; i++) {
      var r = records[i];
      var t = AC.recTs(r);
      if (r.sn !== undefined && lastSn !== null && r.sn > lastSn + 1) snGaps += r.sn - lastSn - 1;
      if (r.sn !== undefined) lastSn = r.sn;
      var v782 = AC.recVal(r, 782);
      if (v782 !== undefined && v782 !== null && v782 !== '') sig.push([t, +v782]);
      var v799 = AC.recVal(r, 799);
      if (v799 !== undefined && v799 !== null && v799 !== '') {
        var mv = +v799;
        bat.push([t, mv]);
        var hKey = U.fmtTime(new Date(t)).slice(0, 13);
        if (!batByHour[hKey]) batByHour[hKey] = { min: mv, max: mv };
        if (mv < batByHour[hKey].min) batByHour[hKey].min = mv;
        if (mv > batByHour[hKey].max) batByHour[hKey].max = mv;
      }
      var v515 = AC.recVal(r, 515);
      if (v515 !== undefined && v515 !== null && v515 !== '') sat.push([t, +v515]);
      var v777 = AC.recVal(r, 777);
      if (v777 !== undefined && v777 !== null && v777 !== '') {
        var rv = +v777;
        reb.push([t, rv]);
        if (lastReb !== null && rv > lastReb) rebootCount++; // 值上升=重启
        lastReb = rv;
      }
      if (r.val_info && String(r.val_info).indexOf('/') !== 0) errCount++;
    }
    var drop = 0, dropH = null;
    for (var k in batByHour) {
      if (Object.prototype.hasOwnProperty.call(batByHour, k)) {
        var d = batByHour[k].max - batByHour[k].min;
        if (d > drop) { drop = d; dropH = k; }
      }
    }
    return { sig: sig, bat: bat, sat: sat, reb: reb, rebootCount: rebootCount, errCount: errCount, snGaps: snGaps, batDrop: drop, batDropHour: dropH, records: records };
  }

  function renderPfCard(imei, data) {
    var body = Views.renderPfBody(imei, data);
    if (!body) return;
    var box = function (id) { return document.getElementById(id + '-' + imei); };
    var s1 = box('pf-sig'), s2 = box('pf-bat'), s3 = box('pf-sat'), s4 = box('pf-loss'), s5 = box('pf-reboot'), s6 = box('pf-err');
    if (s1) s1.innerHTML = '<h4>📶 4G 信号(782)</h4>' + Views.sparkline(data.sig, 560, 120, '#1971c2');
    if (s2) s2.innerHTML = '<h4>🔋 电压(799) · 每小时最大降幅 <b>' + (data.batDrop || 0) + 'mV</b>' + (data.batDropHour ? ' <span class="muted small">@' + esc(data.batDropHour) + '</span>' : '') + '</h4>' + Views.sparkline(data.bat, 560, 120, '#e8590c');
    if (s3) s3.innerHTML = '<h4>⭐ GPS 搜星(515)</h4>' + Views.sparkline(data.sat, 560, 120, '#2f9e44');
    if (s4) s4.innerHTML = '<h4>📉 丢包（sn 缺口）</h4><div class="stat-num">' + data.snGaps + '</div>';
    if (s5) s5.innerHTML = '<h4>🔄 重启(777)</h4><div class="stat-num">' + data.rebootCount + '</div>';
    if (s6) s6.innerHTML = '<h4>🚨 异常(val_info)</h4><div class="stat-num">' + data.errCount + '</div>';
    Views.renderUploadList(imei, data.records);
    // 最新位置卡
    AC.getLatest(imei).then(function (st) {
      var c = document.getElementById('pf-loss-' + imei);
      if (c && c.parentNode) {
        var div = document.createElement('div');
        div.innerHTML = Views.latestCard(imei, st);
        c.parentNode.insertBefore(div, c.parentNode.firstChild);
      }
    });
  }

  // ================= #/devices =================
  function pageDevices() {
    Views.renderDevices('', []);
    devSearch('');
  }

  function devSearch(prefix) {
    if (!state.projectKey) { loadDevices(null, function () { devSearch(prefix); }); return; }
    AC.searchMyDevices(state.projectKey, prefix, 1, 100).then(function (r) {
      if (parseRoute().name !== 'devices') return; // 归属守卫
      if (r.code !== 0) {
        Views.renderDevices(prefix, []);
        U.toast(r.value || '搜索失败', 'err');
        return;
      }
      var recs = (r.value && r.value.records) || [];
      window.PetStore.mergeDevices(recs.map(function (d) { return d.deviceid; }));
      Views.renderDevices(prefix, recs);
    });
  }

  // ================= #/fence =================
  function pageFence() {
    Views.renderFence();
    MapKit.create('fence-map');
    setTimeout(function () { MapKit.invalidateSize(); }, 300);
    state.fenceDraft = null;
    MapKit.clearTemp();
    drawFences();
    Views.renderFenceList();
    bindFenceMap();
  }

  function drawFences() {
    MapKit.clearFences();
    var fs = window.FenceStore.list();
    for (var i = 0; i < fs.length; i++) {
      var f = fs[i];
      var layer;
      if (f.type === 'circle') {
        layer = window.L.circle([f.center.lat, f.center.lng], {
          radius: f.radius, color: f.enabled ? '#e8590c' : '#adb5bd', weight: 2, fillOpacity: 0.08
        });
      } else {
        layer = window.L.polygon((f.points || []).map(function (p) { return [p.lat, p.lng]; }), {
          color: f.enabled ? '#e8590c' : '#adb5bd', weight: 2, fillOpacity: 0.08
        });
      }
      layer.bindTooltip(f.name);
      MapKit.addFence(layer);
    }
  }

  function bindFenceMap() {
    var map = MapKit.getMap();
    if (!map || map._fenceBound) return;
    map._fenceBound = true;
    map.on('click', function (e) {
      var d = state.fenceDraft;
      if (!d) return;
      var pt = { lng: e.latlng.lng, lat: e.latlng.lat };
      if (d.type === 'circle' && d.step === 'center') {
        d.center = pt; d.step = 'radius';
        setFenceStatus('已定圆心：' + pt.lng.toFixed(5) + ', ' + pt.lat.toFixed(5) + ' —— 再次点击确定半径（≥20m），移动鼠标可预览');
        d.preview = window.L.circle([pt.lat, pt.lng], { radius: 20, color: '#1971c2', dashArray: '4', fillOpacity: 0.05 });
        MapKit.addTemp(d.preview);
        map.on('mousemove', onFenceMouse);
      } else if (d.type === 'circle' && d.step === 'radius') {
        var r = U.distance(d.center.lng, d.center.lat, pt.lng, pt.lat);
        if (r < 20) { setFenceStatus('半径不足 20m（当前 ' + Math.round(r) + 'm），请点更远位置'); return; }
        finishCircleDraft(r);
      } else if (d.type === 'polygon') {
        d.points.push(pt);
        redrawDraftPoly();
        setFenceStatus('多边形已加点 ' + d.points.length + ' 个 —— 继续加点，或点「完成围栏」保存');
      }
    });
    function onFenceMouse(e) {
      var d = state.fenceDraft;
      if (d && d.type === 'circle' && d.step === 'radius' && d.center && d.preview) {
        var r = U.distance(d.center.lng, d.center.lat, e.latlng.lng, e.latlng.lat);
        d.preview.setRadius(Math.max(20, r));
        setFenceStatus('半径预览：' + Math.round(r) + 'm —— 点击地图确定');
      }
    }
    // 完成围栏按钮动态注入
    var panel = document.querySelector('.fence-panel');
    if (panel && !panel._bound) {
      panel._bound = true;
      panel.addEventListener('click', function (e) {
        if (e.target && e.target.id === 'fence-done') finishPolygonDraft();
      });
    }
  }

  function setFenceStatus(text) {
    var el = byId('fence-status');
    if (el) el.innerHTML = esc(text) + (state.fenceDraft && state.fenceDraft.type === 'polygon' && state.fenceDraft.points.length >= 3
      ? ' <button type="button" class="btn-mini" id="fence-done">完成围栏</button>' : '');
  }

  function redrawDraftPoly() {
    var d = state.fenceDraft;
    if (d.poly) { MapKit.clearTemp(); redrawPreviewExcept(d.poly); }
    d.poly = window.L.polygon(d.points.map(function (p) { return [p.lat, p.lng]; }), { color: '#1971c2', dashArray: '4', fillOpacity: 0.05 });
    MapKit.addTemp(d.poly);
  }
  function redrawPreviewExcept() { /* polygon 重画时同步清理重画预览点 */ }

  function startFenceDraft(type) {
    clearFenceDraft();
    if (type === 'circle') {
      state.fenceDraft = { type: 'circle', step: 'center', points: [] };
      setFenceStatus('请在地图上点击圆心位置');
    } else {
      state.fenceDraft = { type: 'polygon', step: 'points', points: [] };
      setFenceStatus('请连续点击地图添加多边形顶点（≥3 个）');
    }
  }

  function finishCircleDraft(radius) {
    var d = state.fenceDraft;
    var desc = '圆形围栏 · 圆心 ' + d.center.lng.toFixed(5) + ', ' + d.center.lat.toFixed(5) + ' · 半径 ' + Math.round(radius) + 'm';
    Views.fenceNameDialog({ desc: desc }, function (name) {
      window.FenceStore.add({ type: 'circle', name: name, center: d.center, radius: radius });
      clearFenceDraft();
      drawFences();
      Views.renderFenceList();
      U.toast('围栏已保存', 'ok');
    });
  }

  function finishPolygonDraft() {
    var d = state.fenceDraft;
    if (!d || d.type !== 'polygon' || d.points.length < 3) { U.toast('至少需要 3 个顶点', 'err'); return; }
    var desc = '多边形围栏 · ' + d.points.length + ' 个顶点';
    Views.fenceNameDialog({ desc: desc }, function (name) {
      window.FenceStore.add({ type: 'polygon', name: name, points: d.points });
      clearFenceDraft();
      drawFences();
      Views.renderFenceList();
      U.toast('围栏已保存', 'ok');
    });
  }

  function clearFenceDraft() {
    var d = state.fenceDraft;
    if (d && d.preview) { try { MapKit.getMap().removeLayer(d.preview); } catch (e) { /* 忽略 */ } }
    var map = MapKit.getMap();
    if (map) map.off('mousemove');
    state.fenceDraft = null;
    MapKit.clearTemp();
    setFenceStatus('选择围栏类型开始绘制');
  }

  // ================= #/track/<imei> =================
  function pageTrack(imei) {
    if (!imei) { window.location.hash = '#/devices'; return; }
    state.trackData = null;
    Views.renderTrack(imei);
    var map = null;
    setTimeout(function () {
      MapKit.create('track-map');
      MapKit.invalidateSize();
    }, 100);
  }

  var trackProgress = { on: false };

  function queryTrack(imei) {
    var start = byId('tk-start').value.trim();
    var end = byId('tk-end').value.trim();
    var msg = byId('tk-result');
    if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(end)) {
      U.toast('时间格式需为 YYYY-MM-DD HH:mm:ss', 'err'); return;
    }
    var prog = byId('tk-progress');
    var bar = byId('tk-progress-bar');
    var txt = byId('tk-progress-text');
    if (prog) prog.classList.remove('hidden');
    if (msg) msg.textContent = '';
    // 位置历史 + 1294 精细点并行
    var p1 = AC.getTrack(imei, start, end, {});
    var p2 = AC.fetchAllByTags({
      clientId: imei, tags: [1294], start: start, end: end, maxRecords: 20000,
      onProgress: function (done, total) {
        if (bar) bar.style.width = Math.min(100, Math.round(done / (total || 1) * 100)) + '%';
        if (txt) txt.textContent = done + '/' + (total || '?');
      }
    });
    Promise.all([p1, p2]).then(function (rs) {
      if (prog) { prog.classList.add('hidden'); bar.style.width = '0%'; }
      if (parseRoute().name !== 'track') return; // 归属守卫
      var tr = rs[0];
      if (tr.code !== 0) {
        if (msg) msg.innerHTML = Views.errorBox(tr.value || '轨迹查询失败');
        return;
      }
      var points = tr.points;
      // 1294 精细点：按包解出每秒精细点（邻近 512/513 作差分基准）
      var fine = [];
      var grecs = Array.isArray(rs[1]) ? rs[1] : [];
      for (var i = 0; i < grecs.length; i++) {
        var g = grecs[i];
        var samples = window.Alg.decodeRec1294(g, AC.recVal(g, 512), AC.recVal(g, 513));
        for (var j = 0; j < samples.length; j++) {
          samples[j].time = g.ct;
          fine.push(samples[j]);
        }
      }
      state.trackData = { points: points, fine: fine };
      if (msg) {
        msg.textContent = '共 ' + points.length + ' 个轨迹点' + (fine.length ? '（含 ' + fine.length + ' 个 1294 精细点）' : '');
      }
      if (points.length >= 2) {
        MapKit.drawTrackLine(points, { fit: true });
      } else if (msg) {
        msg.innerHTML = Views.empty('该时段无轨迹数据');
      }
    });
  }

  function playTrack() {
    var d = state.trackData;
    if (!d || !d.points || d.points.length < 2) { U.toast('请先查询轨迹', 'err'); return; }
    MapKit.playReplay(d.points, {
      speedFactor: 2400,
      onFrame: function (p, idx, total) {
        var msg = byId('tk-result');
        if (msg) msg.textContent = '回放 ' + (idx + 1) + '/' + total + ' · ' + (p.time || '');
      },
      onDone: function () {
        var msg = byId('tk-result');
        if (msg) msg.textContent = '回放完成';
      }
    });
  }

  // ================= 事件委托 =================
  function bindGlobalEvents() {
    document.addEventListener('click', function (e) {
      var el = e.target && e.target.closest ? e.target.closest('[data-action]') : null;
      if (!el) return;
      var action = el.getAttribute('data-action');
      var imei = el.getAttribute('data-imei');
      var id = el.getAttribute('data-id');
      if (action === 'turbo-exit') { exitTurbo(); }
      else if (action === 'pet-new') { Views.petEditDialog(null); }
      else if (action === 'pet-edit') { Views.petEditDialog(imei); }
      else if (action === 'pet-del') { petDelete(imei); }
      else if (action === 'pet-debug') { window.location.hash = '#/debug'; setTimeout(function () { loadPfCard(imei, '6h'); }, 400); }
      else if (action === 'dev-search') { devSearch((byId('dev-search') || {}).value || ''); }
      else if (action === 'dev-detail') { Views.deviceDetailDialog(imei); }
      else if (action === 'dev-cmd') { Views.cmdDialog(imei); }
      else if (action === 'dev-track') { window.location.hash = '#/track/' + encodeURIComponent(imei); }
      else if (action === 'fence-circle') { startFenceDraft('circle'); }
      else if (action === 'fence-polygon') { startFenceDraft('polygon'); }
      else if (action === 'fence-del') { window.FenceStore.remove(id); drawFences(); Views.renderFenceList(); }
      else if (action === 'fence-locate') { locateFence(id); }
      else if (action === 'track-query') { queryTrack(imei); }
      else if (action === 'track-stop') { trackProgress.on = false; MapKit.stopReplay(); }
      else if (action === 'track-play') { playTrack(); }
      else if (action === 'track-replay-stop') { MapKit.stopReplay(); }
      else if (action === 'pf-range') {
        var range = el.getAttribute('data-range');
        if (el.classList.contains('dis')) return; // 数据未就绪灰态拦截
        loadPfCard(imei, range);
      }
      else if (action === 'rec-open') {
        var list = el.closest('.pf-sec');
        if (list && list._records && list._records[+el.getAttribute('data-idx')]) {
          Views.recModal(list._records[+el.getAttribute('data-idx')]);
        }
      }
      else if (action === 'status-load') { loadStatusPage(); }
      else if (action === 'alerts-clear') { window.FenceStore.clearAlerts(); Views.renderAlerts(); }
    });
    // 围栏开关
    document.addEventListener('change', function (e) {
      var el = e.target;
      if (el && el.getAttribute && el.getAttribute('data-action') === 'fence-toggle') {
        window.FenceStore.update(el.getAttribute('data-id'), { enabled: el.checked });
        drawFences();
      }
    });
    // 退出登录
    var logout = byId('btn-logout');
    if (logout) {
      logout.addEventListener('click', function () {
        AC.clearAuthKeys();
        window.PetStore.clearAllBusinessCache();
        AC.goPage('login.html');
      });
    }
  }

  function petDelete(imei) {
    if (!confirm('确定删除设备「' + window.PetStore.getName(imei) + '」？\n（平台设备会自动重建档案，本地将加入屏蔽名单）')) return;
    window.PetStore.remove(imei);
    // 云端名称记录同步删除（无记录静默成功）
    AC.commonList(CFG.DEVNAME_CLS, { size: 100 }).then(function (r) {
      if (r.code === 0 && r.value && r.value.records) {
        for (var i = 0; i < r.value.records.length; i++) {
          if (r.value.records[i].uni_key === imei) {
            AC.commonDeleteById(CFG.DEVNAME_CLS, r.value.records[i].id);
            break;
          }
        }
      }
    });
    U.toast('已删除', 'ok');
    reroute();
  }

  function locateFence(id) {
    var f = window.FenceStore.get(id);
    var map = MapKit.getMap();
    if (!f || !map) return;
    if (f.type === 'circle') map.setView([f.center.lat, f.center.lng], 16);
    else map.fitBounds(window.L.polygon(f.points.map(function (p) { return [p.lat, p.lng]; })).getBounds().pad(0.3));
  }

  // ================= 启动 =================
  function boot() {
    if (state.inited) return;
    state.inited = true;
    if (!initAuth()) return;
    Views.shell();
    bindGlobalEvents();
    MapKit.onTurbo = onTurboClick;
    loadProjects(function () {
      loadDevices(state.projectKey, function () {
        window.addEventListener('hashchange', onRoute);
        onRoute();
        // 刷新后按锁定恢复
        var lock = MapKit.restoreZoomLock();
        if (lock) MapKit.zoomByImei(lock, 16);
      });
    });
  }

  // 暴露给 views（编辑弹窗保存）
  window.App = {
    boot: boot,
    saveDeviceProfile: saveDeviceProfile,
    reroute: reroute
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
