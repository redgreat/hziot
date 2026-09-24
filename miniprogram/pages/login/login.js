const api = require('../../utils/api');

Page({
  data: { paste: '', loading: false, error: '' },

  onInput(e) { this.setData({ paste: e.detail.value }); },

  onCopyAuthorize() {
    wx.setClipboardData({
      data: '1) 在浏览器打开你的 WEB 应用登录页（合宙平台已部署的 login.html）；\n2) 点「为微信小程序获取登录 Token（取票模式）」完成授权；\n3) 页面出现二维码和 token：小程序点「扫码导入」对准二维码，或复制 token 粘贴到输入框。',
      success() { wx.showToast({ title: '已复制说明', icon: 'success' }); }
    });
  },

  /* 扫码导入：对准网页取票面板上的 token 二维码 */
  onScanImport() {
    wx.scanCode({
      onlyFromCamera: false,
      success: (res) => {
        const token = api.extractToken(res && res.result);
        if (!token) {
          this.setData({ error: '二维码内容未识别到 token，请改用复制粘贴' });
          return;
        }
        this.setData({ paste: token, error: '' });
        wx.showToast({ title: '已识别 token', icon: 'success' });
      },
      fail: () => { /* 用户取消，静默 */ }
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
