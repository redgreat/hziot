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
