const api = require('../../utils/api');

Page({
  data: { profile: {}, nImei: '', nName: '' },

  onShow() {
    if (!api.hasAuth()) { wx.reLaunch({ url: '/pages/login/login' }); return; }
    this.setData({ profile: api.getProfile() || {} });
  },

  onImei(e) { this.setData({ nImei: e.detail.value }); },
  onName(e) { this.setData({ nName: e.detail.value }); },

  onSaveName() {
    const { nImei, nName } = this.data;
    if (!/^\d{10,20}$/.test(nImei.trim()) || !nName.trim()) {
      wx.showToast({ title: '请输入正确的 IMEI 与名称', icon: 'none' });
      return;
    }
    const names = wx.getStorageSync('pt_names') || {};
    names[nImei.trim()] = nName.trim();
    wx.setStorageSync('pt_names', names);
    this.setData({ nImei: '', nName: '' });
    wx.showToast({ title: '已保存', icon: 'success' });
  },

  onLogout() {
    wx.showModal({
      title: '退出登录',
      content: '将清除本机登录信息',
      success: (res) => {
        if (res.confirm) {
          api.clearAuth();
          wx.reLaunch({ url: '/pages/login/login' });
        }
      }
    });
  }
});
