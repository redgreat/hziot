/* algo/imufilter.js — IMU 姿态滤波（1293 gsensor 12bit 三轴，无陀螺仪 → 重力方向低通平滑 + 倾角估计） */
(function () {
  'use strict';

  /**
   * 构造一个滤波器实例。
   * @param opts.alpha 低通系数（0~1，越小越平滑，默认 0.15）
   */
  function IMUFilter(opts) {
    opts = opts || {};
    this.alpha = typeof opts.alpha === 'number' ? opts.alpha : 0.15;
    this.reset();
  }

  IMUFilter.prototype.reset = function () {
    this.sx = null; this.sy = null; this.sz = null;
    this.pitch = 0; this.roll = 0;
    this.samples = 0;
  };

  // 喂入一个三轴样本（单位 g），返回平滑后的姿态 {pitch, roll, gx, gy, gz}
  IMUFilter.prototype.update = function (x, y, z) {
    if (this.sx === null) { this.sx = x; this.sy = y; this.sz = z; }
    else {
      var a = this.alpha;
      this.sx += a * (x - this.sx);
      this.sy += a * (y - this.sy);
      this.sz += a * (z - this.sz);
    }
    var gx = this.sx, gy = this.sy, gz = this.sz;
    var norm = Math.sqrt(gx * gx + gy * gy + gz * gz) || 1e-9;
    // 俯仰/横滚：由重力方向估计（弧度 → 度）
    var pitch = Math.asin(Math.max(-1, Math.min(1, -gx / norm))) * 180 / Math.PI;
    var roll = Math.atan2(gy, gz) * 180 / Math.PI;
    this.pitch = pitch; this.roll = roll;
    this.samples++;
    return { pitch: pitch, roll: roll, gx: gx, gy: gy, gz: gz };
  };

  window.IMUFilter = IMUFilter;
})();
