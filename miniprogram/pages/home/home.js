const api = require('../../utils/api');

Page({
  data: {
    projectNames: [], projIndex: 0,
    devices: [], loading: false,
    center: { lat: 30.57, lng: 104.06 }, scale: 4,
    markers: []
  },
  timer: null,

  onShow() {
    if (!api.hasAuth()) { wx.reLaunch({ url: '/pages/login/login' }); return; }
    this.loadProjects();
    this.timer = setInterval(() => this.refresh(), 10000);
  },
  onHide() { if (this.timer) { clearInterval(this.timer); this.timer = null; } },
  onUnload() { if (this.timer) { clearInterval(this.timer); this.timer = null; } },

  loadProjects() {
    api.listMyProjects().then((r) => {
      if (r.code !== 0 || !Array.isArray(r.value) || !r.value.length) return;
      const names = r.value.map((p) => p.name);
      let idx = Number(wx.getStorageSync('pt_proj_index') || 0);
      if (!(idx >= 0 && idx < r.value.length)) idx = 0; // 默认第一项，禁止虚构 KEY
      this.projects = r.value;
      this.setData({ projectNames: names, projIndex: idx });
      this.loadDevices(r.value[idx].project_key);
    });
  },

  onProjectChange(e) {
    const idx = Number(e.detail.value);
    wx.setStorageSync('pt_proj_index', idx);
    this.setData({ projIndex: idx, devices: [], markers: [] });
    this.loadDevices(this.projects[idx].project_key);
  },

  loadDevices(projectKey) {
    this.setData({ loading: true });
    api.listMyDevices(projectKey, 1, 100).then((r) => {
      this.setData({ loading: false });
      if (r.code !== 0 || !r.value) {
        wx.showToast({ title: r.value || '设备列表获取失败', icon: 'none' });
        return;
      }
      const imeis = (r.value.records || []).map((x) => x.deviceid).filter(Boolean);
      // 本地名称档案（小程序 v1 本地命名，不做云端同步）
      const names = wx.getStorageSync('pt_names') || {};
      const devices = imeis.map((imei) => ({ imei, name: names[imei] || ('设备 ' + imei.slice(-6)) }));
      this.setData({ devices });
      this.refresh();
    });
  },

  refresh() {
    const devices = this.data.devices;
    if (!devices.length) return;
    const statuses = [];
    let seq = 0;
    const next = () => {
      if (seq >= devices.length) { this.after(statuses); return; }
      const imei = devices[seq].imei;
      api.latestLocation(imei).then((r) => {
        const st = { imei, name: devices[seq].name, online: false, battery: null };
        if (r.code === 0 && r.value && r.value.lng !== undefined) {
          st.online = true;
          st.lng = r.value.lng; st.lat = r.value.lat; // GCJ02，地图组件直用
          st.address = r.value.address || '';
          st.time = r.value.time || '';
        }
        api.latestTags(imei).then((t) => {
          if (t.code === 0 && t.value && t.value.records && t.value.records.length) {
            const rec = t.value.records[0]; // 恒 ct 降序，首条 = 最新
            st.battery = api.vbatPercent(api.recVal(rec, 799));
            st.sat = api.recVal(rec, 517);
          }
          statuses.push(st);
          next();
        });
      });
    };
    next();
  },

  after(statuses) {
    const markers = [];
    let hasPos = false;
    let minLat = 90, maxLat = -90, minLng = 180, maxLng = -90;
    statuses.forEach((st, i) => {
      if (st.lng === undefined) return;
      hasPos = true;
      minLat = Math.min(minLat, st.lat); maxLat = Math.max(maxLat, st.lat);
      minLng = Math.min(minLng, st.lng); maxLng = Math.max(maxLng, st.lng);
      markers.push({
        id: i,
        latitude: st.lat, longitude: st.lng,
        title: st.name,
        width: 28, height: 28,
        callout: {
          content: st.name + (st.address ? '\n' + st.address : ''),
          display: 'BYCLICK', borderRadius: 6, padding: 6, fontSize: 12
        }
      });
    });
    const patch = { markers };
    if (hasPos) {
      patch.center = { lat: (minLat + maxLat) / 2, lng: (minLng + maxLng) / 2 };
      patch.scale = markers.length === 1 ? 15 : 12;
    }
    this.setData(patch);
  },

  onDeviceTap(e) {
    const imei = e.currentTarget.dataset.imei;
    wx.navigateTo({ url: '/pages/track/track?imei=' + imei });
  }
});
