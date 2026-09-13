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
