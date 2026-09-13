/* algo/stepcount.js — 步数计（1293 三轴合加速度峰值检测，自适应阈值 + 最小步间隔） */
(function () {
  'use strict';

  var MIN_STEP_MS = 250;   // 最小步间隔（~240 步/分上限）
  var MIN_MAG = 1.05;      // 最小幅度阈值（g）
  var MAX_MAG = 2.2;       // 上限截断防跌落冲击误计

  /**
   * 对 gsensor 样本序列计步。
   * @param samples [{t(ms可选), x, y, z}] 三轴单位 g
   * @returns {steps, stepsPerMin, distance(米), duration(秒)}
   */
  function countSteps(samples) {
    if (!samples || samples.length < 2) return { steps: 0, stepsPerMin: 0, distance: 0, duration: 0 };
    var lastPeakT = -1e9;
    var wasAbove = false;
    var steps = 0;
    var t0 = samples[0].t || 0;
    var tEnd = samples[samples.length - 1].t || t0 + samples.length * 10;
    var dynamicMin = MIN_MAG;

    // 预估动态阈值：先取合加速度均方差
    var sum = 0, sum2 = 0, n = 0;
    for (var i = 0; i < samples.length; i++) {
      var s = samples[i];
      var mag = Math.sqrt(s.x * s.x + s.y * s.y + s.z * s.z);
      sum += mag; sum2 += mag * mag; n++;
    }
    var mean = sum / n;
    var variance = Math.max(0, sum2 / n - mean * mean);
    var sd = Math.sqrt(variance);
    if (sd > 0.04) dynamicMin = Math.max(MIN_MAG, mean + sd * 0.6);

    for (var i2 = 0; i2 < samples.length; i2++) {
      var s2 = samples[i2];
      var m2 = Math.sqrt(s2.x * s2.x + s2.y * s2.y + s2.z * s2.z);
      var above = m2 >= Math.min(dynamicMin, MAX_MAG);
      var t = s2.t || (t0 + i2 * 10);
      if (above && !wasAbove && t - lastPeakT >= MIN_STEP_MS) {
        steps++;
        lastPeakT = t;
      }
      wasAbove = above;
    }

    var dur = Math.max(0, (tEnd - t0) / 1000);
    return {
      steps: steps,
      stepsPerMin: dur > 0 ? Math.round(steps * 60 / dur) : 0,
      distance: Math.round(steps * 0.7), // 步长经验值 0.7m
      duration: Math.round(dur)
    };
  }

  window.StepCounter = { countSteps: countSteps, MIN_STEP_MS: MIN_STEP_MS };
})();
