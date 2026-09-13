/* app/petstatus.js — 设备状态计算（1293 gsensor 解包 → 步数/姿态/跌倒；1294 GNSS 辅助；仅真实数据无模拟） */
(function () {
  'use strict';

  var CFG = window.CFG, U = window.U;

  /**
   * analyzeGsensor(rec)：解包一条 1293 记录并计算运动特征。
   * @param rec list_by_tags 记录（val_1293 hex 或数字 key）
   * @returns {ok, samples, steps:{...}, attitude:{...}, falls:{...}, imu:{pitch,roll}}
   */
  function analyzeGsensor(rec) {
    var hex = rec ? (rec.val_1293 !== undefined ? rec.val_1293 : rec['1293']) : null;
    if (hex === undefined || hex === null || hex === '' || typeof hex === 'number') {
      return { ok: false, reason: '无 1293 数据' };
    }
    var samples = window.Alg.decodeGsensor1293(hex);
    if (!samples.length) return { ok: false, reason: '1293 解包为空' };

    var imuF = new window.IMUFilter();
    var imu = null;
    for (var i = 0; i < samples.length; i++) {
      imu = imuF.update(samples[i].x, samples[i].y, samples[i].z);
    }
    var steps = window.StepCounter.countSteps(samples);
    var attitude = window.Attitude.classify(samples, imu);
    var falls = window.Attitude.detectFalls(samples);
    return {
      ok: true,
      samples: samples,
      count: samples.length,
      steps: steps,
      attitude: attitude,
      falls: falls,
      imu: imu ? { pitch: imu.pitch, roll: imu.roll } : null,
      ct: rec.ct,
      ts: window.AC.recTs(rec)
    };
  }

  /**
   * fetchStatus(imei, opts)：拉取最近窗口内 1293（私有 tag allowCustom）+ 1294，聚合设备状态页数据。
   * opts: {minutes: 窗口分钟数（默认 30）, onProgress}
   */
  function fetchStatus(imei, opts) {
    opts = opts || {};
    var U2 = window.U;
    var now = new Date();
    var start = new Date(now.getTime() - (opts.minutes || 30) * 60 * 1000);
    var startStr = U2.fmtTime(start), endStr = U2.fmtTime(now);
    return new Promise(function (resolve) {
      var result = { imei: imei, window: { start: startStr, end: endStr }, gsensor: [], gnss: [], analyses: [] };
      var p1 = window.AC.fetchAllByTags({
        clientId: imei, tags: [1293], start: startStr, end: endStr,
        allowCustom: true, maxRecords: 500,
        onProgress: opts.onProgress
      });
      var p2 = window.AC.listByTags({ clientId: imei, tags: [1294], size: 1 });
      Promise.all([p1, p2]).then(function (rs) {
        var r1 = rs[0], r2 = rs[1];
        if (r1 && r1.code === 0 && Array.isArray(r1)) result.gsensor = r1;
        else if (r1 && r1.code === 0 && r1.value) { /* fetchAll 正常返回数组 */ }
        // fetchAllByTags resolve 数组或错误响应对象
        var recs = Array.isArray(r1) ? r1 : [];
        result.gsensor = recs;
        recs.sort(function (a, b) { return window.AC.recTs(a) - window.AC.recTs(b); });
        for (var i = 0; i < recs.length; i++) {
          var an = analyzeGsensor(recs[i]);
          if (an.ok) result.analyses.push(an);
        }
        if (r2 && r2.code === 0 && r2.value && r2.value.records && r2.value.records.length) {
          var grec = r2.value.records[0];
          var samples = window.Alg.decodeRec1294(grec, window.AC.recVal(grec, 512), window.AC.recVal(grec, 513));
          result.gnss = samples;
          result.gnssCt = grec.ct;
        }
        // 聚合
        result.summary = summarize(result.analyses);
        resolve(result);
      });
    });
  }

  function summarize(analyses) {
    var steps = 0, falls = 0, states = { '静止': 0, '活动': 0, '剧烈': 0 };
    var lastPitch = 0, lastRoll = 0, packs = analyses.length;
    for (var i = 0; i < analyses.length; i++) {
      var a = analyses[i];
      steps += a.steps.steps;
      falls += a.falls.falls;
      if (states[a.attitude.state] !== undefined) states[a.attitude.state]++;
      if (a.imu) { lastPitch = a.imu.pitch; lastRoll = a.imu.roll; }
    }
    var dominant = '无数据';
    var maxC = -1;
    for (var k in states) {
      if (Object.prototype.hasOwnProperty.call(states, k) && states[k] > maxC) { maxC = states[k]; dominant = k; }
    }
    return {
      packs: packs,
      steps: steps,
      falls: falls,
      dominant: dominant,
      states: states,
      pitch: lastPitch,
      roll: lastRoll
    };
  }

  // 调试页（#/debug 前端独立 5s 轮询）的 TLV 展示辅助：记录全字段格式化
  function recFields(rec) {
    var rows = [];
    for (var k in rec) {
      if (!Object.prototype.hasOwnProperty.call(rec, k)) continue;
      var v = rec[k];
      if (v !== null && typeof v === 'object') v = JSON.stringify(v);
      rows.push({ key: k, value: String(v === undefined ? '' : v) });
    }
    return rows;
  }

  window.PetStatus = {
    analyzeGsensor: analyzeGsensor,
    fetchStatus: fetchStatus,
    summarize: summarize,
    recFields: recFields
  };
})();
