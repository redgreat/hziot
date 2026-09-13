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
