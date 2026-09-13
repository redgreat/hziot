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
