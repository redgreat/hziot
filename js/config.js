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
