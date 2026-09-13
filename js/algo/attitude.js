/* algo/attitude.js — 运动姿态判定（静止/活动/剧烈）与跌倒检测（1293 三轴统计特征） */
(function () {
  'use strict';

  /**
   * 姿态判定：基于合加速度方差。
   * @param samples [{x,y,z}] 单位 g
   * @param imu 可选 {pitch,roll} 来自 IMUFilter
   */
  function classify(samples, imu) {
    var n = samples ? samples.length : 0;
    if (!n) return { state: '无数据', level: -1, variance: 0, tilt: imu ? Math.abs(imu.pitch) : 0 };
    var sum = 0, sum2 = 0;
    for (var i = 0; i < n; i++) {
      var s = samples[i];
      var mag = Math.sqrt(s.x * s.x + s.y * s.y + s.z * s.z);
      sum += mag; sum2 += mag * mag;
    }
    var mean = sum / n;
    var variance = Math.max(0, sum2 / n - mean * mean);
    var tilt = imu ? Math.sqrt(imu.pitch * imu.pitch + imu.roll * imu.roll) : 0;

    var state, level;
    if (variance < 0.0025) { state = '静止'; level = 0; }
    else if (variance < 0.02) { state = '活动'; level = 1; }
    else { state = '剧烈'; level = 2; }
    return { state: state, level: level, variance: variance, mean: mean, tilt: tilt };
  }

  /**
   * 跌倒检测：冲击峰（>2.2g）后紧随静止（方差极小）。
   * @returns {falls, indices:[...样本下标]}
   */
  function detectFalls(samples) {
    var falls = [], indices = [];
    var n = samples ? samples.length : 0;
    var WINDOW = 30; // 冲击后 30 个样本内检测静止
    for (var i = 1; i < n; i++) {
      var m1 = mag(samples[i - 1]), m2 = mag(samples[i]);
      if (m1 > 2.2 && m2 > 2.2) { // 合并连续冲击段
        var lowVar = true;
        var end = Math.min(n, i + WINDOW);
        var prev = m2, sum = 0, cnt = 0;
        for (var j = i; j < end; j++) {
          var mj = mag(samples[j]);
          sum += Math.abs(mj - prev); prev = mj; cnt++;
        }
        if (cnt && sum / cnt < 0.03) { lowVar = true; i = end; }
        if (lowVar) { falls.push(i); indices.push(i); }
      }
    }
    return { falls: falls.length, indices: indices };
  }

  function mag(s) { return Math.sqrt(s.x * s.x + s.y * s.y + s.z * s.z); }

  window.Attitude = { classify: classify, detectFalls: detectFalls };
})();
