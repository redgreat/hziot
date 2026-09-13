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
