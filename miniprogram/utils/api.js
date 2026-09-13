/* utils/api.js — 合宙 AirCloud 开放接口统一层（小程序版）
 * 对应 WEB 端 js/api/aircloud.js 的能力子集：
 * - 三鉴权头 authorization / salt / sid（禁止 Bearer 前缀、禁止合并）
 * - 15s 超时；网络异常统一返回 code -102，永不 reject
 * - code 102/103/105 视为登录失效：清鉴权 → 跳登录页
 * - 时间规定：平台时间字面已是北京时间，展示/解析不做任何 ±8 运算
 */
const API_HOST = 'https://api-iot.luatos.com';
const GATEWAY = API_HOST + '/iot/open_api';
const LOGIN_URL = API_HOST + '/iam/luat_oauth/v2/login';

const KEY_AUTH = 'pt_auth'; // { token, salt }
const KEY_SERVICE = 'pt_service'; // { sid }
const KEY_PROFILE = 'pt_profile'; // { name, mobile }

function getAuth() { return wx.getStorageSync(KEY_AUTH) || null; }
function getService() { return wx.getStorageSync(KEY_SERVICE) || null; }
function getProfile() { return wx.getStorageSync(KEY_PROFILE) || null; }
function hasAuth() {
  const a = getAuth(), s = getService();
  return !!(a && a.token && a.salt && s && s.sid);
}
function saveLogin(value) {
  if (!value || !value.auth || !value.service) return false;
  if (!value.auth.token || !value.auth.salt || !value.service.sid) return false;
  wx.setStorageSync(KEY_AUTH, { token: value.auth.token, salt: value.auth.salt });
  wx.setStorageSync(KEY_SERVICE, { sid: value.service.sid });
  if (value.user) {
    wx.setStorageSync(KEY_PROFILE, {
      name: value.user.name !== undefined ? value.user.name : (value.user.user_name || ''),
      mobile: value.user.mobile !== undefined ? value.user.mobile : (value.user.user_phone || '')
    });
  }
  if (value.sets) wx.setStorageSync(KEY_SETS, value.sets); // RSA 公钥（小程序 v1 暂不用 common/*，仅保存备用）
  return true;
}
const KEY_SETS = 'pt_sets';
function clearAuth() {
  try { wx.removeStorageSync(KEY_AUTH); } catch (e) { /* 忽略 */ }
  try { wx.removeStorageSync(KEY_SERVICE); } catch (e) { /* 忽略 */ }
  try { wx.removeStorageSync(KEY_PROFILE); } catch (e) { /* 忽略 */ }
}
function goLogin() {
  clearAuth();
  wx.reLaunch({ url: '/pages/login/login' });
}

/* 从粘贴内容提取 OAuth token：支持完整回调地址（?token=xxx）或裸 token */
function extractToken(text) {
  const s = String(text || '').trim();
  if (!s) return '';
  const m = /[?&]token=([^&\s]+)/.exec(s);
  if (m) return decodeURIComponent(m[1]);
  if (/^[a-zA-Z0-9._\-]{16,}$/.test(s)) return s;
  return '';
}

/* 应用登录：OAuth token 换 auth/service */
function appLogin(token) {
  return new Promise((resolve) => {
    wx.request({
      url: LOGIN_URL + '?token=' + encodeURIComponent(token),
      method: 'POST',
      header: { 'Content-Type': 'application/json' },
      timeout: 15000,
      success(res) {
        const r = res.data || {};
        if (r.code === 0 && saveLogin(r.value)) resolve({ code: 0 });
        else resolve({ code: r.code || -1, value: r.value || '登录信息校验失败' });
      },
      fail() { resolve({ code: -102, value: '网络异常，请稍后重试' }); }
    });
  });
}

/* 业务请求统一层 */
function request(path, body) {
  return new Promise((resolve) => {
    const a = getAuth(), s = getService();
    if (!a || !a.token || !a.salt || !s || !s.sid) {
      resolve({ code: -101, value: '未登录' });
      goLogin();
      return;
    }
    wx.request({
      url: GATEWAY + path,
      method: 'POST',
      header: {
        'Content-Type': 'application/json',
        'authorization': a.token,
        'salt': a.salt,
        'sid': s.sid
      },
      data: body || {},
      timeout: 15000,
      success(res) {
        let r = res.data;
        if (typeof r === 'string') { try { r = JSON.parse(r); } catch (e) { r = null; } }
        if (!r) { resolve({ code: -102, value: '响应解析失败' }); return; }
        if (r.code === 102 || r.code === 103 || r.code === 105) {
          goLogin();
          resolve({ code: -100, value: '登录已失效，请重新登录' });
          return;
        }
        resolve(r);
      },
      fail() { resolve({ code: -102, value: '网络异常，请稍后重试' }); }
    });
  });
}

/* ---- 业务接口 ---- */
function listMyProjects() { return request('/list_my_projects', {}); }
function listMyDevices(project, page, size) {
  return request('/list_my_devices', { project, page: page || 1, size: size || 100 });
}
function latestLocation(imei) {
  return request('/aircloud/latest_location', { client_id: imei });
}
/* 历史轨迹：自动翻页合并（time 升序） */
function fetchAllHistory(imei, start, end, onProgress) {
  const all = [];
  function page(p) {
    return request('/aircloud/location_history', { client_id: imei, start, end, page: p, size: 100 })
      .then((r) => {
        if (r.code !== 0 || !r.value) return r.code !== 0 ? r : { code: 0, value: all };
        const recs = r.value.records || [];
        for (let i = 0; i < recs.length; i++) all.push(recs[i]);
        if (onProgress) onProgress(all.length, Number(r.value.total) || all.length);
        if (Number(r.value.pages) > p && p < 200) return page(p + 1);
        return { code: 0, value: all };
      });
  }
  return page(1);
}
/* 设备状态附属 tag：799 电压 / 517 卫星数（恒 ct 降序，取第一条 = 最新） */
function latestTags(imei) {
  return request('/aircloud/list_by_tags', {
    client_id: imei,
    tags: [799, 517],
    page: 1,
    size: 1,
    filter: { aks: ['ct'], acs: ['ge'], avs: ['2000-01-01 00:00:00'] }
  });
}
function recVal(rec, tag) {
  if (!rec) return undefined;
  if (rec['val_' + tag] !== undefined) return rec['val_' + tag];
  const k = String(tag);
  if (rec[k] !== undefined) return rec[k];
  return undefined;
}
/* tag 799 上报电压 mV → 百分比（(v-3000)/(4200-3000)） */
function vbatPercent(vbat) {
  const v = Number(vbat);
  if (!v || v <= 0) return null;
  return Math.max(0, Math.min(100, Math.round(((v - 3000) / (4200 - 3000)) * 100)));
}

/* 本地钟面直出（平台字面已是北京钟面，不做换算） */
function nowStr() {
  const d = new Date();
  const p = (n) => (n < 10 ? '0' : '') + n;
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
}
function todayStr() { return nowStr().slice(0, 10); }

module.exports = {
  API_HOST,
  hasAuth, getProfile, clearAuth, appLogin, extractToken,
  listMyProjects, listMyDevices, latestLocation, fetchAllHistory, latestTags,
  recVal, vbatPercent, nowStr, todayStr
};
