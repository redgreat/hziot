/* algo/alg.js — 二进制解包（1294 GNSS 差分 / 1293 gsensor 12bit 三轴）与通用算法 */
(function () {
  'use strict';

  function hexToBytes(hex) {
    var out = [];
    hex = String(hex || '').replace(/[^0-9a-fA-F]/g, '');
    for (var i = 0; i + 1 < hex.length; i += 2) {
      out.push(parseInt(hex.substr(i, 2), 16));
    }
    return out;
  }

  function int16(bHi, bLo) {
    var v = (bHi << 8) | bLo;
    return v >= 0x8000 ? v - 0x10000 : v;
  }

  /**
   * 1294 GNSS BINARY：5×int16 大端差分
   * 布局（每样本 10 字节）：经度差 / 纬度差 / 速度×10(m/s) / 航向°×10 / 海拔(m)
   * 10s 一包 10 样本 × 10B；差分基准 = refLng/refLat（首样本绝对值 + 后续累加差分）
   * @returns [{lng,lat,speed(m/s),course(°),alt(m),idx}]
   */
  function decodeGnss5x16(bytes, refLng, refLat) {
    var out = [];
    if (!bytes || bytes.length < 10) return out;
    var lng = Number(refLng) || 0;
    var lat = Number(refLat) || 0;
    for (var off = 0; off + 9 < bytes.length; off += 10) {
      var dLng = int16(bytes[off], bytes[off + 1]);
      var dLat = int16(bytes[off + 2], bytes[off + 3]);
      var spd = int16(bytes[off + 4], bytes[off + 5]);   // 速度×10
      var crs = int16(bytes[off + 6], bytes[off + 7]);   // 航向°×10
      var alt = int16(bytes[off + 8], bytes[off + 9]);   // 海拔 m
      lng += dLng / 1e6;  // 差分单位 1e-6 度
      lat += dLat / 1e6;
      out.push({
        lng: lng,
        lat: lat,
        speed: spd / 10,          // m/s → km/h 由展示层处理
        course: crs / 10,
        alt: alt,
        idx: out.length
      });
    }
    return out;
  }

  /**
   * 1294 原始上报记录 → 解包（ref 取定位 tag 最新值或 val_hex 内首个样本绝对值）
   * rec 含 val_1294(hex) 或数字 key；refLng/refLat 为该包对应 512/513（GCJ02）
   */
  function decodeRec1294(rec, refLng, refLat) {
    var hex = rec && (rec.val_1294 !== undefined ? rec.val_1294 : rec['1294']);
    if (hex === undefined || hex === null || hex === '') return [];
    if (typeof hex === 'number') return [];
    return decodeGnss5x16(hexToBytes(hex), refLng, refLat);
  }

  /**
   * 1293 gsensor：12bit 三轴（单位 g）
   * 每样本 6 字节：x/y/z 各 12bit 大端（高 8bit + 低 4bit），有符号，满量程 ±4g
   * @returns [{x,y,z,t}]
   */
  function decodeGsensor1293(hex) {
    var bytes = hexToBytes(hex);
    var out = [];
    var off = 0;
    var t = 0;
    while (off + 5 <= bytes.length) {
      var x = sign12((bytes[off] << 4) | (bytes[off + 1] >> 4));
      var y = sign12(((bytes[off + 1] & 0x0f) << 8) | bytes[off + 2]);
      var z = sign12((bytes[off + 3] << 4) | (bytes[off + 4] >> 4));
      out.push({ x: x / 512, y: y / 512, z: z / 512, t: t }); // 满量程 ±4g → /512
      off += 5; // 12bit×3 = 4.5 字节 → 5 字节对齐时跳 5；若按 4.5 紧排则由上层按实际协议调整
      t += 10;
    }
    return out;
  }

  function sign12(v) {
    v = v & 0xfff;
    return v >= 0x800 ? v - 0x1000 : v;
  }

  // 轨迹抽稀（Douglas-Peucker 简化版：距离阈值抽稀，保起终点）
  function simplifyTrack(points, tolMeters) {
    tolMeters = tolMeters || 8;
    if (!points || points.length <= 2) return (points || []).slice();
    var out = [points[0]];
    var last = points[0];
    var U = window.U;
    for (var i = 1; i < points.length - 1; i++) {
      var p = points[i];
      if (U.distance(last.lng, last.lat, p.lng, p.lat) >= tolMeters) {
        out.push(p);
        last = p;
      }
    }
    out.push(points[points.length - 1]);
    return out;
  }

  window.Alg = {
    hexToBytes: hexToBytes,
    int16: int16,
    sign12: sign12,
    decodeGnss5x16: decodeGnss5x16,
    decodeRec1294: decodeRec1294,
    decodeGsensor1293: decodeGsensor1293,
    simplifyTrack: simplifyTrack
  };
})();
