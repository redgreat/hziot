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
