const api = require('../../utils/api');

Page({
  data: { paste: '', loading: false, error: '' },

  onInput(e) { this.setData({ paste: e.detail.value }); },

  onCopyAuthorize() {
    wx.setClipboardData({
      data: '1) 在浏览器打开你的 WEB 应用（合宙平台已部署的 login.html）并完成登录；\n2) 登录成功后复制浏览器地址栏完整地址；\n3) 回到小程序粘贴到输入框点登录。',
      success() { wx.showToast({ title: '已复制说明', icon: 'success' }); }
    });
  },

  onLogin() {
    const token = api.extractToken(this.data.paste);
    if (!token) {
      this.setData({ error: '未识别到 token：请粘贴含 token= 的完整地址或裸 token' });
      return;
    }
    this.setData({ loading: true, error: '' });
    api.appLogin(token).then((r) => {
      this.setData({ loading: false });
      if (r.code === 0) {
        wx.switchTab({ url: '/pages/home/home' });
      } else {
        this.setData({ error: '登录失败：' + (r.value || 'code ' + r.code) });
      }
    });
  }
});
