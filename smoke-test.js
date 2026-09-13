/* smoke-test.js — 65 项结构级冒烟测试（Node ≥22，stub fetch/localStorage/document）
 * 运行：node smoke-test.js
 * 覆盖：URL 网关路径 / 三鉴权头无 Bearer / Content-Type 防 951 / filter.ct 本地字面 /
 *       未登录不发请求(code -101) / 102 失效清键跳 login(-100) / tags 透传+sanitize /
 *       recTs 本地钟面恒等 / tag 799 电压 / 轨迹抽稀 / 围栏 GCJ02 判定 / 坐标转换 /
 *       1294/1293 解包 / RSA PKCS1 / returnTo 安全校验 / 品牌版本 等
 */
'use strict';

/* ---------- 浏览器 shim ---------- */
function makeLocalStorage() {
  var m = {};
  return {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(m, k) ? m[k] : null; },
    setItem: function (k, v) { m[k] = String(v); },
    removeItem: function (k) { delete m[k]; },
    key: function (i) { var ks = Object.keys(m); return i < ks.length ? ks[i] : null; },
    get length() { return Object.keys(m).length; },
    _m: m
  };
}

var storage = makeLocalStorage();
var sessionStorageShim = makeLocalStorage();
var listeners = {};
var documentShim = {
  readyState: 'loading', // 阻止 main.js boot 立即执行
  addEventListener: function (t, fn) { (listeners['doc:' + t] = listeners['doc:' + t] || []).push(fn); },
  removeEventListener: function () {},
  getElementById: function () { return null; },
  querySelector: function () { return null; },
  querySelectorAll: function () { return []; },
  createElement: function (tag) {
    var el = {
      tag: tag, style: {}, children: [], className: '', id: '', value: '',
      classList: { add: function () {}, remove: function () {}, toggle: function () {}, contains: function () { return false; } },
      appendChild: function (c) { el.children.push(c); return c; },
      removeChild: function (c) { el.children = el.children.filter(function (x) { return x !== c; }); },
      addEventListener: function () {}, removeEventListener: function () {},
      setAttribute: function (k, v) { el['attr_' + k] = v; },
      getAttribute: function (k) { return el['attr_' + k]; },
      querySelector: function () { return null; },
      querySelectorAll: function () { return []; },
      closest: function () { return null; },
      set textContent(v) { el._text = v; }, get textContent() { return el._text || ''; },
      set innerHTML(v) { el._html = v; }, get innerHTML() { return el._html || ''; },
      parentNode: null, isConnected: false
    };
    return el;
  },
  body: { appendChild: function (c) { c.parentNode = documentShim.body; return c; }, removeChild: function () {} },
  getElementByIdOrNull: null
};

var locationShim = {
  protocol: 'file:', hostname: 'localhost', pathname: '/index.html', search: '', hash: '#/home',
  href: 'file:///D:/x/index.html',
  replaceState: function () {}
};

var LShim = {
  GridLayer: { extend: function () { return function GridShim() {}; } },
  map: function () { return { on: function () {}, off: function () {}, remove: function () {} }; },
  marker: function () {}, circle: function () {}, polyline: function () {}, polygon: function () {},
  circleMarker: function () {}, layerGroup: function () {}, latLngBounds: function () {},
  divIcon: function () {}, tileLayer: function () {}
};

global.window = global;
global.localStorage = storage;
global.sessionStorage = sessionStorageShim;
global.document = documentShim;
global.location = locationShim;
global.history = { replaceState: function () {} };
try { Object.defineProperty(global, 'navigator', { value: { userAgent: 'node-smoke' }, configurable: true }); } catch (e) { /* Node 22 navigator 只读，忽略 */ }
global.L = LShim;
if (typeof global.requestAnimationFrame !== 'function') global.requestAnimationFrame = function (f) { return setTimeout(f, 0); };

// stub fetch 拦截器
var fetchLog = [];
var fetchResponder = null; // function(url, init) → {status,text}
global.fetch = function (url, init) {
  fetchLog.push({ url: String(url), init: init || {} });
  if (fetchResponder) {
    var r = fetchResponder(String(url), init || {});
    return Promise.resolve({ text: function () { return Promise.resolve(r); } });
  }
  return Promise.resolve({ text: function () { return Promise.resolve(JSON.stringify({ code: 0, value: {} })); } });
};
global.AbortController = global.AbortController || function () { this.signal = null; this.abort = function () {}; };
if (typeof global.btoa !== 'function') {
  global.btoa = function (s) { return Buffer.from(s, 'binary').toString('base64'); };
  global.atob = function (s) { return Buffer.from(s, 'base64').toString('binary'); };
}

/* ---------- 加载被测代码 ---------- */
require('./app.js');
var CFG = window.CFG, U = window.U, AC = window.AC, PetStore = window.PetStore,
    FenceStore = window.FenceStore, Alg = window.Alg, Coord = window.Coord,
    RsaPkcs1 = window.RsaPkcs1, PetStatus = window.PetStatus;

/* ---------- 测试框架 ---------- */
var pass = 0, fail = 0, failures = [];
function ok(cond, name) {
  if (cond) { pass++; }
  else { fail++; failures.push(name); }
}
function eq(a, b, name) { ok(JSON.stringify(a) === JSON.stringify(b), name + ' | got=' + JSON.stringify(a) + ' want=' + JSON.stringify(b)); }
function section(title) { console.log('  —— ' + title); }

function resetAuth() {
  var ls = window.localStorage;
  var ks = [];
  for (var i = 0; i < ls.length; i++) ks.push(ls.key(i));
  for (var j = 0; j < ks.length; j++) ls.removeItem(ks[j]);
}
function setAuth(prefix) {
  window.localStorage.setItem(prefix + 'auth', JSON.stringify({ token: 'tk-' + prefix, salt: 'st-' + prefix }));
  window.localStorage.setItem(prefix + 'service', JSON.stringify({ sid: 'sid-' + prefix }));
}
function lastFetch() { return fetchLog[fetchLog.length - 1]; }

/* ================= 1. 品牌与配置 ================= */
section('品牌与配置');
eq(CFG.BRAND, '合宙IoT-运动传感器', '1.1 品牌名');
eq(CFG.VERSION, 'V0.3', '1.2 版本号');
eq(CFG.API_HOST, 'https://api-iot.luatos.com', '1.3 API_HOST');
eq(CFG.PAGE_BASE, 'https://iot.luatos.com', '1.4 PAGE_BASE');
eq(CFG.GATEWAY, 'https://api-iot.luatos.com/iot/open_api', '1.5 网关地址');
eq(CFG.TAG_VBAT, 799, '1.6 电压 tag=799（非 771）');
eq(CFG.TAG_GNSS_LNG, 512, '1.7 512=经度');
eq(CFG.TAG_GNSS_LAT, 513, '1.8 513=纬度');
ok(CFG.TAG_LIST.indexOf(1293) >= 0 && CFG.TAG_LIST.indexOf(1294) >= 0, '1.9 TAG_LIST 含 1293/1294');
ok(CFG.TAG_LIST.indexOf(771) < 0, '1.10 TAG_LIST 不含 771');

/* ================= 2. 时间 v48 ================= */
section('时间 v48（本地钟面，零 ±8）');
eq(U.fmtTime('2026-08-24 14:22:36'), '2026-08-24 14:22:36', '2.1 字面 roundtrip 恒等');
var d1 = U.parseLocal('2026-08-24 14:22:36');
eq([d1.getFullYear(), d1.getMonth() + 1, d1.getDate(), d1.getHours(), d1.getMinutes(), d1.getSeconds()],
  [2026, 8, 24, 14, 22, 36], '2.2 按本地钟面解析（无偏移）');
eq(U.fmtTime(U.parseLocal('2026-01-05 08:05:09')), '2026-01-05 08:05:09', '2.3 补零 roundtrip');
ok(AC.recTs({ batch_time: 1756000000000 }) === 1756000000000, '2.4 batch_time 毫秒优先');
eq(AC.recTs({ ct: '2026-08-24 00:00:00' }), new Date(2026, 7, 24).getTime(), '2.5 ct 本地钟面解析');
eq(AC.fmt(new Date(2026, 7, 24, 1, 2, 3)), '2026-08-24 01:02:03', '2.6 fmt 本地字面（filter.ct 同基准）');
ok(U.fmtTime('2026-08-24T14:22:36Z').indexOf(' ') > 0, '2.7 含时区标记才原生解析');

/* ================= 3. 鉴权上下文与三前缀兼容 ================= */
section('鉴权（my_* → ai_* → m_*）');
resetAuth();
ok(AC.hasAuth() === false, '3.1 无键未登录');
setAuth('my_');
ok(AC.hasAuth() === true, '3.2 my_* 有效');
resetAuth(); setAuth('ai_');
eq(AC.authContext().prefix, 'ai_', '3.3 ai_* 回退');
resetAuth(); setAuth('m_');
eq(AC.authContext().prefix, 'm_', '3.4 m_* 回退');
resetAuth();
window.localStorage.setItem('m_auth', JSON.stringify({ token: 't', salt: '' }));
ok(AC.hasAuth() === false, '3.5 半完整 m_* 不算登录（缺 salt）');
resetAuth(); setAuth('my_');
var h = AC.authHeaders();
eq([h.authorization, h.salt, h.sid], ['tk-my_', 'st-my_', 'sid-my_'], '3.6 三鉴权头独立取值');
ok(h.authorization.indexOf('Bearer') !== 0, '3.7 禁 Bearer 前缀');

/* ================= 4. request 统一层 ================= */
section('request 统一层（stub fetch）');
fetchLog = [];
var p4 = AC.request('/list_my_projects', {});
p4.then(function (r4) {
  var f = lastFetch();
  ok(f.url === CFG.GATEWAY + '/list_my_projects', '4.1 URL = 网关 + endpoint');
  eq(f.init.method, 'POST', '4.2 一律 POST');
  eq(f.init.headers['Content-Type'], 'application/json', '4.3 显式 Content-Type: application/json（防 951）');
  ok(!!f.init.headers.authorization && !!f.init.headers.salt && !!f.init.headers.sid, '4.4 三鉴权头随请求');
  eq(r4.code, 0, '4.5 正常解析 code');

  // 4.6 未登录不发请求
  resetAuth(); fetchLog = [];
  var p46 = AC.request('/list_my_projects', {});
  return p46.then(function (r46) {
    eq(fetchLog.length, 0, '4.6 本地无鉴权键 → 不发请求');
    eq(r46.code, -101, '4.7 resolve code -101');

    // 4.8 102 失效：清键 + resolve -100
    setAuth('my_'); fetchLog = [];
    fetchResponder = function () { return JSON.stringify({ code: 102, value: 'expired' }); };
    var p48 = AC.request('/list_my_devices', { project: 'K' });
    return p48.then(function (r48) {
      eq(r48.code, -100, '4.8 102 → resolve -100');
      ok(AC.hasAuth() === false, '4.9 102 → 鉴权键已清');
      ok(!window.localStorage.getItem('my_auth'), '4.10 my_auth 已移除');

      // 4.11 网络异常 → code -102 永不 reject
      setAuth('my_'); fetchLog = [];
      global.fetch = function () { return Promise.reject(new Error('net')); };
      var p411 = AC.request('/aircloud/latest_location', { client_id: '1' });
      return p411.then(function (r411) {
        eq(r411.code, -102, '4.11 网络异常统一 code -102');
        // 恢复 stub fetch
        global.fetch = function (url, init) {
          fetchLog.push({ url: String(url), init: init || {} });
          if (fetchResponder) return Promise.resolve({ text: function () { return Promise.resolve(fetchResponder(String(url), init || {})); } });
          return Promise.resolve({ text: function () { return Promise.resolve(JSON.stringify({ code: 0, value: {} })); } });
        };
        fetchResponder = null;
        setAuth('my_');
        run5();
      });
    });
  });
}).catch(function (e) { fail++; failures.push('request 层异常: ' + (e && e.stack || e)); console.error(e); finish(); });

/* ================= 5. list_by_tags / sanitize / 翻页 ================= */
function run5() {
  section('list_by_tags / sanitizeTags / fetchAllByTags');
  fetchLog = [];
  setAuth('my_');
  AC.listByTags({ clientId: 'imei1', tags: [512, 513, 771], size: 50 }).then(function (r51) {
    var body511 = JSON.parse(lastFetch().init.body);
    eq(body511.tags, [512, 513], '5.1 非法 tag（771）被 sanitize 过滤、合法子集透传');
    fetchLog = [];
    return AC.listByTags({ clientId: 'imei1', tags: [771, 999], size: 50 }).then(function (r52z) {
      eq(r52z.code, 1, '5.2a 全非法 tags → 拦截返回 code 1');
      eq(fetchLog.length, 0, '5.2b 全非法 tags → 不发请求');
      fetchLog = [];
      return AC.listByTags({ clientId: 'imei1', tags: [512, 513], start: '2026-08-12 00:00:00', end: '2026-08-12 23:59:59', page: 1, size: 50 }).then(function (r52) {
        var f = lastFetch();
        var body = JSON.parse(f.init.body);
        eq(body.tags, [512, 513], '5.3 tags 透传');
        eq(body.size, 50, '5.4 size 透传');
        eq(body.filter, { aks: ['ct', 'ct'], acs: ['ge', 'le'], avs: ['2026-08-12 00:00:00', '2026-08-12 23:59:59'] }, '5.5 filter.ct 本地字面（aks/acs/avs）');
        ok(body.sort === undefined && body.desc === undefined, '5.6 请求不带 sort/desc（平台恒 ct 降序）');

        // 5.7 私有 tag allowCustom
        return AC.listByTags({ clientId: 'imei1', tags: [1293], allowCustom: true, size: 10 }).then(function (r53) {
          var body53 = JSON.parse(lastFetch().init.body);
          eq(body53.tags, [1293], '5.7 allowCustom 私有 tag 透传');

          // 5.8 翻页：两页数据合并
          fetchLog = [];
          var pages = {
            1: { code: 0, value: { total: '150', pages: '2', records: makeRecs(100, 0) } },
            2: { code: 0, value: { total: '150', pages: '2', records: makeRecs(50, 100) } }
          };
          fetchResponder = function (url, init) {
            var b = JSON.parse(init.body);
            return JSON.stringify(pages[b.page]);
          };
          return AC.fetchAllByTags({ clientId: 'imei1', tags: [799], start: '2026-08-12 00:00:00', end: '2026-08-12 23:59:59' }).then(function (all) {
            eq(all.length, 150, '5.8 fetchAllByTags 跨页合并 150 条');
            ok(AC.recTs(all[0]) <= AC.recTs(all[1]), '5.9 归并后 ct 升序');
            fetchResponder = null;
            run6();
          });
        });
      });
    });
  }).catch(function (e) { fail++; failures.push('listByTags 异常: ' + (e && e.stack || e)); console.error(e); finish(); });
}
function makeRecs(n, sn0) {
  var out = [];
  for (var i = 0; i < n; i++) {
    out.push({ ct: '2026-08-12 10:00:' + U.pad2(Math.floor(i / 60)) + ':' + U.pad2(i % 60), sn: sn0 + i, val_799: 4000 + (i % 50), client: 'imei1' });
  }
  return out;
}

/* ================= 6. recVal / recValInfo ================= */
function run6() {
  section('recVal / 坐标来源');
  var rec = { val_512: 104.0, 512: 103.0, val_799: 3900 };
  eq(AC.recVal(rec, 512), 104.0, '6.1 默认优先 val_<tag>（平台已解析）');
  eq(AC.recValInfo(rec, 512).coord, 'gcj02', '6.2 val_ 形式 = gcj02');
  var rec2 = { 512: 103.0 };
  eq(AC.recValInfo(rec2, 512).coord, 'wgs84', '6.3 数字 key = wgs84');
  CFG.USE_PLATFORM_VAL = false;
  eq(AC.recVal(rec, 512), 103.0, '6.4 USE_PLATFORM_VAL=false 取原始值');
  CFG.USE_PLATFORM_VAL = true;
  eq(AC.recVal(rec, 799), 3900, '6.5 电压取 799');

  /* ================= 7. getPetStatus 三路并联 ================= */
  section('getPetStatus 三路并联');
  fetchLog = [];
  var calls = [];
  var realRequest = AC.request;
  AC.request = function (endpoint, body) {
    calls.push(endpoint);
    if (endpoint === '/aircloud/latest_location') {
      return Promise.resolve({ code: 0, value: { lng: 104.1, lat: 30.5, wlng: 104.09, wlat: 30.49, address: '成都市', time: '2026-08-24 14:22:36', signal: 27, percent: 36 } });
    }
    if (endpoint === '/aircloud/list_by_tags') {
      var b = JSON.parse(JSON.stringify(body));
      if (b.tags.join() === '799,517') return Promise.resolve({ code: 0, value: { records: [{ ct: '2026-08-24 14:22:36', val_799: 3950, val_517: 9 }] } });
      if (b.tags.join() === '1294') return Promise.resolve({ code: 0, value: { records: [{ ct: '2026-08-24 14:22:30', val_1294: gniHex(), val_512: 104.1, val_513: 30.5 }] } });
    }
    return Promise.resolve({ code: 1, value: 'x' });
  };
  AC.getPetStatus('imeiX').then(function (st) {
    AC.request = realRequest;
    eq(calls.length, 3, '7.1 三路并联（latest + [799,517] + [1294]）');
    eq(st.code, 0, '7.2 状态 code 0');
    eq(st.percentCalc, 79, '7.3 vbat 3950mV → 79%');
    eq(st.sat, 9, '7.4 卫星数 517 → 9 颗');
    ok(st.gnss && st.gnss.speed !== undefined, '7.5 1294 末样本速度/角度/海拔');
    eq([st.lng, st.lat], [104.1, 30.5], '7.6 GCJ02 直用（不二次 toMapCoord）');
    run8();
  });
}

/* 1294 测试向量：基准 104.1,30.5；样本1 = 基准+(0,0) 速度 12.3m/s 航向 90.5° 海拔 500m；
   样本2 = +0.0001°,+0.0002° */
function gniHex() {
  function i16(v) { v = v & 0xffff; var h = (v >> 8) & 0xff, l = v & 0xff; return (h < 16 ? '0' : '') + h.toString(16) + (l < 16 ? '0' : '') + l.toString(16); }
  var s1 = i16(0) + i16(0) + i16(123) + i16(905) + i16(500);
  var s2 = i16(1) + i16(2) + i16(100) + i16(900) + i16(501);
  return s1 + s2;
}

/* ================= 8. 1294 / 1293 解包 ================= */
function run8() {
  section('1294 GNSS 差分 / 1293 gsensor 解包');
  var bytes = Alg.hexToBytes(gniHex());
  eq(bytes.length, 20, '8.1 hexToBytes 长度');
  var s = Alg.decodeGnss5x16(bytes, 104.1, 30.5);
  eq(s.length, 2, '8.2 解出 2 个样本');
  ok(Math.abs(s[0].lng - 104.1) < 1e-9 && Math.abs(s[0].lat - 30.5) < 1e-9, '8.3 首样本=基准');
  ok(Math.abs(s[1].lng - (104.1 + 0.000001)) < 1e-9 && Math.abs(s[1].lat - (30.5 + 0.000002)) < 1e-9, '8.4 差分累加 1e-6°');
  eq(s[0].speed, 12.3, '8.5 速度×10 → 12.3 m/s');
  eq(s[0].course, 90.5, '8.6 航向°×10 → 90.5°');
  eq(s[0].alt, 500, '8.7 海拔 m');
  var g = Alg.decodeGsensor1293(pack5(512, 0, 0) + pack5(-512, 0, 0));
  ok(g.length === 2 && g[0].x !== undefined, '8.8 1293 12bit 三轴解包');
  ok(Math.abs(g[0].x - 1.0) < 0.01 && Math.abs(g[1].x + 1.0) < 0.01, '8.9 满量程 ±4g 归一与符号');

  /* ================= 9. 坐标转换 / 抽稀 / 围栏 ================= */
  section('坐标 / 抽稀 / 围栏 GCJ02');
  var gcj = Coord.wgs2gcj(104.06, 30.54);
  ok(Math.abs(gcj.lng - 104.06) < 0.01 && Math.abs(gcj.lat - 30.54) < 0.01, '9.1 wgs2gcj 小偏移');
  var back = Coord.gcj2wgs(gcj.lng, gcj.lat);
  ok(Math.abs(back.lng - 104.06) < 1e-4 && Math.abs(back.lat - 30.54) < 1e-4, '9.2 gcj2wgs 近似回转');
  ok(Coord.outOfChina(0, 0) === true, '9.3 境外不偏移');
  var line = [];
  for (var i = 0; i < 100; i++) line.push({ lng: 104 + i * 0.00001, lat: 30, time: 't' + i });
  var simp = Alg.simplifyTrack(line, 8);
  ok(simp.length >= 2 && simp.length < line.length && simp[0] === line[0] && simp[simp.length - 1] === line[line.length - 1], '9.4 直线抽稀（8m 阈值）保起终点');
  var zig = [{ lng: 104, lat: 30 }, { lng: 104.001, lat: 30.002 }, { lng: 104.002, lat: 30 }, { lng: 104.003, lat: 30 }];
  ok(Alg.simplifyTrack(zig, 8).length >= 3, '9.5 拐点保留');

  FenceStore.remove('t_all');
  var fc = FenceStore.add({ type: 'circle', name: '圆', center: { lng: 104.0, lat: 30.0 }, radius: 100 });
  ok(FenceStore.isPointInFence(104.0005, 30.0003, fc) === true, '9.6 圆内（GCJ02 距离判定，无二次转换）');
  ok(FenceStore.isPointInFence(104.01, 30, fc) === false, '9.7 圆外');
  var fp = FenceStore.add({ type: 'polygon', name: '多边', points: [{ lng: 103.9, lat: 29.9 }, { lng: 104.1, lat: 29.9 }, { lng: 104.1, lat: 30.1 }, { lng: 103.9, lat: 30.1 }] });
  ok(FenceStore.isPointInFence(104.0, 30.0, fp) === true, '9.8 多边形内（射线法）');
  ok(FenceStore.isPointInFence(104.2, 30.0, fp) === false, '9.9 多边形外');
  ok(FenceStore.update(fc.id, { enabled: false }) && FenceStore.isPointInFence(104.0005, 30.0003, FenceStore.get(fc.id)) === false, '9.10 停用围栏不判定');
  FenceStore.remove(fc.id); FenceStore.remove(fp.id);
  run10();
}

/* ================= 10. vbat / returnTo / appId / pageUrl ================= */
function run10() {
  section('电压 / returnTo / 域名划分');
  eq(U.vbatToPercent(4200), 100, '10.1 4200mV → 100%');
  eq(U.vbatToPercent(3000), 0, '10.2 3000mV → 0%');
  eq(U.vbatToPercent(3400), 33, '10.3 3400mV → 33%（低电阈值）');
  eq(U.vbatToPercent(1000), 0, '10.4 负值夹取 0');
  ok(AC.safeReturnTo('/index.html') === '/index.html', '10.5 站内路径放行');
  ok(AC.safeReturnTo('https://evil.com') === '', '10.6 外域拒绝');
  ok(AC.safeReturnTo('//evil.com') === '', '10.7 协议相对拒绝');
  ok(AC.safeReturnTo('java' + 'script:alert(1)') === '', '10.8 脚本协议拒绝');
  eq(AC.safeReturnTo('/index.html?x=1'), '/index.html', '10.9 带 query 剥离后放行');
  eq(AC.safeReturnTo(CFG.PAGE_BASE + '/ai_app/luatos/a1/index.html'), '/ai_app/luatos/a1/index.html', '10.10 PAGE_BASE 绝对地址剥域名放行');
  eq(AC.safeReturnTo('/js/app/main.js'), '', '10.10b 非 .html 站内路径拒绝');
  locationShim.protocol = 'file:';
  ok(CFG.pageUrl('login.html') === 'login.html', '10.11 本地 file 协议相对路径');
  locationShim.protocol = 'https:';
  locationShim.hostname = 'iot.luatos.com';
  locationShim.pathname = '/ai_app/luatos/appX/index.html';
  eq(CFG.pageUrl('login.html'), 'https://iot.luatos.com/ai_app/luatos/appX/login.html', '10.12 生产 PAGE_BASE 前缀完整绝对 URL');
  locationShim.protocol = 'file:'; locationShim.hostname = 'localhost'; locationShim.pathname = '/index.html';
  run11();
}

/* ================= 11. RSA PKCS1 ================= */
function run11() {
  section('RSA/ECB/PKCS1Padding（X-Key-Open-Api）');
  var kp = makeRsaKey();
  var der = pkcs8Der(kp.n, kp.e);
  var pubB64 = Buffer.from(der).toString('base64');
  var plain = '1756378552000,my_app';
  var ct = RsaPkcs1.encryptB64(pubB64, plain);
  ok(ct.length > 0, '11.1 加密输出非空');
  var c = BigInt('0x' + Buffer.from(ct, 'base64').toString('hex'));
  var m = modPow(c, kp.d, kp.n);
  var hex = m.toString(16).padStart((kp.n.toString(16).length + 1) & ~1, '0');
  var em = Buffer.from(hex, 'hex');
  ok(em[0] === 0x00 && em[1] === 0x02, '11.2 EM 结构 00 02 PS 00 M');
  var idx = em.indexOf(0x00, 2);
  var msg = em.slice(idx + 1).toString('utf8');
  eq(msg, plain, '11.3 解密还原原文（时间戳ms,appId）');
  ok(RsaPkcs1.encryptB64('not-base64!!', plain) === '', '11.4 坏公钥返回空（降级不抛异常）');

  /* ================= 12. common/* RSA 头 ================= */
  section('common KV 与设备名称同步');
  resetAuth(); setAuth('my_');
  window.localStorage.setItem('my_sets', JSON.stringify({ publicKey: pubB64 }));
  locationShim.href = 'https://iot.luatos.com/ai_app/luatos/my_app/index.html';
  global.location = locationShim; window.location = locationShim;
  // CFG.getAppId 从 window.location.href 提取
  fetchLog = [];
  AC.commonPut(CFG.DEVNAME_CLS, { uni_key: 'imei1', s1: '旺财' }).then(function (r12) {
    var f = lastFetch();
    eq(f.init.headers['X-Key-Open-Api'].length > 40, true, '12.1 X-Key-Open-Api 头存在');
    eq(JSON.parse(f.init.body).cls, CFG.DEVNAME_CLS, '12.2 cls=DEVNAME_CLS');
    eq(JSON.parse(f.init.body).uni_key, 'imei1', '12.3 uni_key=IMEI');
    eq(JSON.parse(f.init.body).s1, '旺财', '12.4 s1=名称');

    /* ================= 13. PetStore 云端名称权威 ================= */
    section('PetStore 自动建档与云端名称');
    PetStore.mergeDevices(['111', '222']);
    ok(PetStore.get('111') && PetStore.get('111').name === '未命名设备', '13.1 自动建档「未命名设备」');
    PetStore.applyCloudNames([{ id: '1', uni_key: '111', s1: '云端名' }]);
    eq(PetStore.getName('111'), '云端名', '13.2 云端权威覆盖');
    PetStore.markPending('222', '本地新名');
    PetStore.applyCloudNames([{ id: '2', uni_key: '222', s1: '云端旧名' }]);
    eq(PetStore.getName('222'), '本地新名', '13.3 待传名 pending 保护不回盖');
    PetStore.remove('222');
    ok(PetStore.get('222') === null && PetStore.hiddenList().indexOf('222') >= 0, '13.4 删除进黑名单防重建');

    /* ================= 14. PetStatus ================= */
    section('PetStatus 状态分析');
    var an = PetStatus.analyzeGsensor({ ct: '2026-08-24 10:00:00', val_1293: quietHex() });
    ok(an.ok === true, '14.1 静止数据解包成功');
    eq(an.steps.steps, 0, '14.2 静止数据 0 步');
    eq(an.attitude.state, '静止', '14.3 判定为静止');
    var an2 = PetStatus.analyzeGsensor({ ct: '2026-08-24 10:00:00', val_1293: walkHex() });
    ok(an2.ok && an2.steps.steps > 0, '14.4 波动数据计步 > 0');
    run15();
  }).catch(function (e) { fail++; failures.push('common/rsa 异常: ' + (e && e.stack || e)); console.error(e); finish(); });
}

/* gsensor 5 字节打包：x(12bit)=b0+b1hi, y(12bit)=b1lo+b2, z(12bit)=b3+b4hi */
function pack5(x, y, z) {
  x &= 0xfff; y &= 0xfff; z &= 0xfff;
  var b = [(x >> 4) & 0xff, ((x & 0xf) << 4) | ((y >> 8) & 0xf), y & 0xff, (z >> 4) & 0xff, (z & 0xf) << 4];
  var out = '';
  for (var i = 0; i < b.length; i++) out += (b[i] < 16 ? '0' : '') + b[i].toString(16);
  return out;
}
/* 静止 gsensor 数据：z=512 → 1g，合加速度 ≈1g */
function quietHex() {
  var out = '';
  for (var i = 0; i < 20; i++) out += pack5(0, 0, 512);
  return out;
}
/* 行走 gsensor：x 正弦波动 */
function walkHex() {
  var out = '';
  for (var i = 0; i < 60; i++) {
    var x = Math.round(Math.sin(i / 3) * 900);
    out += pack5(x, 0, 512);
  }
  return out;
}

/* ================= 15. 视图与协议结构 ================= */
function run15() {
  section('视图 / 弹窗 / 汇总');
  var Views = window.Views, MapKit = window.MapKit;
  var html = Views.popupHtml('imei1', { code: 0, lng: 104.1, lat: 30.5, address: '成都市', time: '2026-08-24 14:22:36', vbat: 3950, percentCalc: 79, sat: 9, signal: 27 });
  ok(html.indexOf('imei1') >= 0, '15.1 弹窗含 IMEI');
  ok(html.indexOf('79%') >= 0, '15.2 弹窗含电量百分比');
  ok(html.indexOf('9 颗') >= 0, '15.3 弹窗含卫星数');
  ok(html.indexOf('实时追踪') >= 0, '15.4 弹窗含实时追踪按钮');
  var stale = Views.popupHtml('imei1', { code: 0, time: '2020-01-01 00:00:00' });
  ok(stale.indexOf('disabled') >= 0, '15.5 超 5 分钟未上报 → 按钮禁用');
  var xss = Views.popupHtml('<img src=x onerror=alert(1)>', { code: 1 });
  ok(xss.indexOf('<img') < 0, '15.6 动态数据 esc() 转义');
  var card = Views.homeCard('imei1', { code: 0, lng: 104.1, lat: 30.5, address: 'x', time: '2026-08-24 14:22:36' });
  ok(card.indexOf('📍') >= 0 && card.indexOf('🔋') >= 0 && card.indexOf('📶') >= 0 && card.indexOf('🕒') >= 0, '15.7 首页卡片四要素');
  var sum = PetStatus.summarize([{ steps: { steps: 10 }, falls: { falls: 1 }, attitude: { state: '活动' }, imu: { pitch: 1, roll: 2 } }]);
  eq(sum.steps, 10, '15.8 summarize 步数聚合');
  ok(typeof Views.sparkline([[0, 1], [1000, 2]]) === 'string', '15.9 sparkline 输出');
  ok(MapKit.epoch() >= 0, '15.10 MapKit epoch 可用');

  /* ================= 16. 审核红线静态扫描 ================= */
  section('审核红线（产物静态扫描）');
  var fs = require('fs');
  var idx = fs.readFileSync('index.html', 'utf8');
  ok(idx.indexOf('合宙IoT-运动传感器') >= 0, '16.1 产物含品牌名');
  ok(!/<script\s+src=/i.test(idx), '16.2 无 <script src> 外链');
  ok(!/<link\s[^>]*href=/i.test(idx), '16.3 无 <link href> 外链');
  ok(!/\beval\s*\(/.test(idx), '16.4 无 eval(');
  ok(!/new\s+Function/.test(idx), '16.5 无 new Function');
  ok(!/document\.write/.test(idx), '16.6 无 document.write');
  ok(!/document\.cookie/.test(idx), '16.7 无 document.cookie');
  ok(!/sortFunction/.test(idx), '16.8 Leaflet 补丁 sortFunction→sortFn 生效');
  ok(!/leafletjs\.com/.test(idx), '16.9 无 leafletjs.com attribution');
  var domains = idx.match(/https?:\/\/[a-z0-9.\-]+/gi) || [];
  var bad = domains.filter(function (d) {
    if (d.indexOf('api-iot.luatos.com') >= 0 || d.indexOf('iot.luatos.com') >= 0 || d.indexOf('www.w3.org') >= 0) return false;
    if (d.indexOf('webrd0') >= 0 || d.indexOf('autonavi') >= 0) return false; // 高德瓦片子域（{s} 占位符被正则截断）
    return true;
  });
  eq(bad, [], '16.10 产物仅白名单域名（业务域名 + w3.org + 高德瓦片）');
  ok(idx.indexOf('autonavi.com/appmaptile') > 0, '16.12 高德 GCJ02 底图瓦片层已接入');
  ok(!/(?<!\\)(javascript:|data:)/.test(idx), '16.11 协议字面量仅允许转义形态');

  finish();
}

/* ---------- RSA 测试辅助：生成小指数测试密钥并构造 PKCS#8 DER ---------- */
function modPow(b, e, m) {
  var r = 1n; b = b % m;
  while (e > 0n) { if (e & 1n) r = r * b % m; b = b * b % m; e >>= 1n; }
  return r;
}
function isPrime(n) {
  if (n < 2n) return false;
  var small = [2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n];
  for (var i = 0; i < small.length; i++) { if (n % small[i] === 0n) return n === small[i]; }
  var d = n - 1n, r = 0n;
  while (d % 2n === 0n) { d /= 2n; r++; }
  for (var a = 0; a < small.length; a++) {
    var x = modPow(small[a], d, n);
    if (x === 1n || x === n - 1n) continue;
    var okk = false;
    for (var j = 1n; j < r; j++) { x = x * x % n; if (x === n - 1n) { okk = true; break; } }
    if (!okk) return false;
  }
  return true;
}
function makeRsaKey() {
  // 两个 128-bit 级别的确定性素数
  function findPrime(start) {
    var c = BigInt(start);
    while (!isPrime(c)) c += 2n;
    return c;
  }
  var p = findPrime('340282366920938463463374607431768211507');
  var q = findPrime('340282366920938463463374607431768212027');
  var n = p * q;
  var phi = (p - 1n) * (q - 1n);
  var e = 65537n;
  // d = e^-1 mod phi
  function inv(a, m) {
    var g = m, x = 0n, x1 = 1n, a1 = a;
    while (a1 !== 0n) {
      var qq = g / a1, r = g % a1;
      var xx = x - qq * x1;
      g = a1; a1 = r; x = x1; x1 = xx;
    }
    return ((x % m) + m) % m;
  }
  return { n: n, e: e, d: inv(e, phi), p: p, q: q };
}
function derLen(len) {
  if (len < 0x80) return [len];
  var bytes = [];
  var v = len;
  while (v > 0) { bytes.unshift(v & 0xff); v >>= 8; }
  return [0x80 | bytes.length].concat(bytes);
}
function derInt(big) {
  var hex = big.toString(16);
  if (hex.length % 2) hex = '0' + hex;
  if (parseInt(hex[0], 16) & 0x8) hex = '00' + hex;
  var bytes = [];
  for (var i = 0; i < hex.length; i += 2) bytes.push(parseInt(hex.substr(i, 2), 16));
  return [0x02].concat(derLen(bytes.length), bytes);
}
function derSeq(items) {
  var all = [];
  for (var i = 0; i < items.length; i++) all = all.concat(items[i]);
  return [0x30].concat(derLen(all.length), all);
}
function pkcs8Der(n, e) {
  // SubjectPublicKeyInfo: SEQUENCE { SEQUENCE { OID rsaEncryption, NULL }, BIT STRING { SEQUENCE { INTEGER n, INTEGER e } } }
  var oid = [0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01];
  var alg = [0x30].concat(derLen(oid.length + 2), oid, [0x05, 0x00]);
  var keySeq = derSeq([derInt(n), derInt(e)]);
  var bit = [0x03].concat(derLen(keySeq.length + 1), [0x00], keySeq);
  return new Uint8Array(derSeq([alg, bit]));
}

/* ---------- 结束 ---------- */
function finish() {
  console.log('\n========== 冒烟测试结果 ==========');
  console.log('通过: ' + pass + ' / 失败: ' + fail);
  if (fail) {
    for (var i = 0; i < failures.length; i++) console.log('  ✗ ' + failures[i]);
    process.exit(1);
  }
  console.log('ALL PASS ✔');
  process.exit(0);
}
