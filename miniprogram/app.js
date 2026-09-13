/* app.js — 合宙IoT-运动传感器 小程序端
 * 时间规定（与 WEB v48 一致）：平台时间字面已是北京时间，展示/解析一律不做 ±8 运算
 */
const api = require('./utils/api');

App({
  onLaunch() {
    // 已有登录态则直接进入首页；否则停留在登录页
    if (!api.hasAuth()) {
      wx.reLaunch({ url: '/pages/login/login' });
    }
  }
});
