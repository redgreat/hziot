const api = require('../../utils/api');

Page({
  data: {
    deviceNames: [], devIndex: 0,
    startDate: '', loading: false, error: '', count: 0,
    center: { lat: 30.57, lng: 104.06 }, scale: 5,
    polyline: [], markers: [], points: []
  },

  onLoad(query) {
    this.lockImei = query.imei || ''; // 从首页点入则锁定设备
    const d = new Date(); const p = (n) => (n < 10 ? '0' : '') + n; // 本地钟面，无时区换算
    this.setData({
      startDate: d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate())
    });
  },

  onShow() {
    if (!api.hasAuth()) { wx.reLaunch({ url: '/pages/login/login' }); return; }
    this.loadDevices();
  },

  loadDevices() {
    const projIdx = Number(wx.getStorageSync('pt_proj_index') || 0);
    api.listMyProjects().then((r) => {
      if (r.code !== 0 || !Array.isArray(r.value) || !r.value.length) return;
      const key = r.value[projIdx >= 0 && projIdx < r.value.length ? projIdx : 0].project_key;
      api.listMyDevices(key, 1, 100).then((r2) => {
        if (r2.code !== 0 || !r2.value) return;
        const imeis = (r2.value.records || []).map((x) => x.deviceid).filter(Boolean);
        const names = wx.getStorageSync('pt_names') || {};
        this.imeis = imeis;
        const deviceNames = imeis.map((imei) => names[imei] || ('设备 ' + imei.slice(-6)));
        let devIndex = 0;
        if (this.lockImei) {
          const found = imeis.indexOf(this.lockImei);
          if (found >= 0) devIndex = found;
        }
        this.setData({ deviceNames, devIndex });
      });
    });
  },

  onDevChange(e) { this.setData({ devIndex: Number(e.detail.value) }); },
  onStartChange(e) { this.setData({ startDate: e.detail.value }); },

  onQuery() {
    const imei = this.imeis && this.imeis[this.data.devIndex];
    if (!imei) { this.setData({ error: '请先选择设备' }); return; }
    const day = this.data.startDate;
    this.setData({ loading: true, error: '', points: [], polyline: [], markers: [], count: 0 });
    api.fetchAllHistory(imei, day + ' 00:00:00', day + ' 23:59:59', (n, total) => {
      wx.setNavigationBarTitle({ title: '轨迹 ' + n + '/' + total });
    }).then((r) => {
      this.setData({ loading: false });
      wx.setNavigationBarTitle({ title: '轨迹' });
      if (r.code !== 0) { this.setData({ error: r.value || '查询失败' }); return; }
      const recs = r.value || [];
      if (!recs.length) { this.setData({ error: '该日无轨迹数据' }); return; }
      const points = recs
        .filter((p) => p.lng !== undefined)
        .map((p) => ({ lng: p.lng, lat: p.lat, time: p.time }));
      const coords = points.map((p) => ({ latitude: p.lat, longitude: p.lng }));
      const first = coords[0], last = coords[coords.length - 1];
      const markers = [];
      if (first) markers.push({ id: 1, ...first, title: '起点', width: 24, height: 24 });
      if (last && coords.length > 1) markers.push({ id: 2, ...last, title: '终点', width: 24, height: 24 });
      let minLat = 90, maxLat = -90, minLng = 180, maxLng = -90;
      coords.forEach((c) => {
        minLat = Math.min(minLat, c.latitude); maxLat = Math.max(maxLat, c.latitude);
        minLng = Math.min(minLng, c.longitude); maxLng = Math.max(maxLng, c.longitude);
      });
      this.setData({
        count: points.length,
        points: points.slice(-500).reverse(), // 列表最新在前，最多 500 条
        polyline: [{ points: coords, color: '#2f7d46', width: 4, arrowLine: true }],
        markers,
        center: { lat: (minLat + maxLat) / 2, lng: (minLng + maxLng) / 2 },
        scale: coords.length === 1 ? 15 : 12
      });
    });
  }
});
