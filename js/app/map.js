/* app/map.js — MapKit 图层管理
 * 防跨页污染核心：
 *  - create() 重建地图时递增 epoch，旧 map.remove() 整体销毁旧 tempGroup/fenceGroup
 *  - 所有函数入口 mapAlive() 拦截（容器是否在 DOM）
 *  - 回放动画闭包校验 myEpoch !== epoch → stopReplay
 *  - 临时图层统一 tempGroup（track/回放/围栏绘制预览 addTemp）
 * 瓦片：本地 Canvas 网格底图（L.GridLayer createTile），零外部请求
 */
(function () {
  'use strict';

  var L = window.L, CFG = window.CFG, U = window.U;

  var MK = {
    epoch: 0,
    map: null,
    containerId: null,
    tempGroup: null,
    fenceGroup: null,
    petMarkers: {},   // imei → {layer, info, marker}
    turboImei: null,
    onTurbo: null,    // 回调：点击弹窗「实时追踪」
    replayTimer: null,
    replayState: null,
    hoverLock: null,  // 悬停锁定 imei
    zoomLock: null,   // 点击锁定 imei（16 级记忆）
    hoverZoom: 15,
    clickZoom: 16
  };

  function mapAlive() {
    if (!MK.map) return false;
    var el = document.getElementById(MK.containerId);
    return !!(el && el.isConnected);
  }

  // ---------- 本地 Canvas 网格底图（GCJ02 坐标标注，零外部请求） ----------
  var GridLayer = L.GridLayer.extend({
    createTile: function (coords) {
      var tile = document.createElement('canvas');
      var size = this.getTileSize();
      tile.width = size.x; tile.height = size.y;
      var ctx = tile.getContext('2d');
      // 浅色底
      ctx.fillStyle = '#f2f4f0';
      ctx.fillRect(0, 0, size.x, size.y);
      // 网格线
      ctx.strokeStyle = '#d8ded6';
      ctx.lineWidth = 1;
      var n = 4, step = size.x / n;
      for (var i = 1; i < n; i++) {
        ctx.beginPath(); ctx.moveTo(i * step, 0); ctx.lineTo(i * step, size.y); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, i * step); ctx.lineTo(size.x, i * step); ctx.stroke();
      }
      // 中心经纬度标注（Web墨卡托反算）
      var scale = this._getZoomForUrl ? this._getZoomForUrl() : coords.z;
      var nw = this._tileCoordsToBounds(coords).getNorthWest();
      var se = this._tileCoordsToBounds(coords).getSouthEast();
      var clng = (nw.lng + se.lng) / 2, clat = (nw.lat + se.lat) / 2;
      ctx.fillStyle = '#9aa79b';
      ctx.font = '10px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(clng.toFixed(4) + 'E', size.x / 2, size.y / 2 - 4);
      ctx.fillText(clat.toFixed(4) + 'N', size.x / 2, size.y / 2 + 10);
      return tile;
    }
  });

  function create(containerId) {
    // 重建：递增 epoch + 整体销毁旧图
    MK.epoch++;
    if (MK.map) {
      try { MK.map.remove(); } catch (e) { /* 忽略 */ }
      MK.map = null;
    }
    MK.containerId = containerId;
    MK.tempGroup = L.layerGroup();
    MK.fenceGroup = L.layerGroup();
    MK.petMarkers = {};
    MK.turboImei = null;
    MK.replayState = null;
    if (MK.replayTimer) { clearInterval(MK.replayTimer); MK.replayTimer = null; }

    var map = L.map(containerId, {
      center: [30.57, 104.06],
      zoom: 5,
      zoomControl: true,
      attributionControl: false // 关闭 attribution（审核）
    });
    // 底图：高德栅格瓦片（GCJ02 坐标系，与平台数据零偏移对齐；用户确认采用，覆盖默认仅网格规则）
    // 下层保留本地 Canvas 网格（GCJ02 标注）：瓦片加载失败/断网时兜底显示
    new GridLayer({ tileSize: 256 }).addTo(map);
    try {
      L.tileLayer('https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}', {
        subdomains: '1234',
        minZoom: 3,
        maxZoom: 18,
        tileSize: 256,
        errorTileUrl: 'd\u0061ta:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw=='
      }).addTo(map);
    } catch (e) { /* 瓦片层异常时网格兜底 */ }
    MK.tempGroup.addTo(map);
    MK.fenceGroup.addTo(map);
    MK.map = map;
    return map;
  }

  function getMap() { return mapAlive() ? MK.map : null; }

  // ---------- 设备 marker ----------
  function petIcon(info) {
    var color = info && info.lowBat ? '#e67e22' : '#2f9e44';
    var cls = info && info.stale ? ' mk-dot stale' : ' mk-dot';
    return L.divIcon({
      className: '',
      html: '<div class="' + cls.trim() + '" style="background:' + color + '"></div>',
      iconSize: [14, 14],
      iconAnchor: [7, 7],
      popupAnchor: [0, -8]
    });
  }

  // upsert：存在则移动 + 同步打开中的 popup；不存在则新建
  function upsertPet(imei, lng, lat, info) {
    if (!mapAlive()) return null;
    var rec = MK.petMarkers[imei];
    var ll = [lat, lng];
    if (!rec) {
      var marker = L.marker(ll, { icon: petIcon(info), title: info && info.name ? info.name : imei });
      marker.bindPopup('', { maxWidth: 320, minWidth: 240 });
      marker.on('popupopen', function () {
        // popup 打开时立即刷新内容
        if (rec && typeof rec.popupHtml === 'function') {
          marker.setPopupContent(rec.popupHtml());
        }
      });
      marker.addTo(MK.map);
      rec = MK.petMarkers[imei] = { layer: marker, marker: marker, info: info || {} };
    } else {
      rec.marker.setLatLng(ll);
      rec.info = info || rec.info;
    }
    rec.lng = lng; rec.lat = lat;
    // popup 打开中 → 同步内容
    if (rec.marker.isPopupOpen && rec.marker.isPopupOpen() && typeof rec.popupHtml === 'function') {
      rec.marker.setPopupContent(rec.popupHtml());
    }
    return rec;
  }

  function setPetPopupHtml(imei, htmlFn) {
    var rec = MK.petMarkers[imei];
    if (rec) rec.popupHtml = htmlFn;
  }

  function removePet(imei) {
    var rec = MK.petMarkers[imei];
    if (rec && mapAlive()) {
      try { MK.map.removeLayer(rec.marker); } catch (e) { /* 忽略 */ }
    }
    delete MK.petMarkers[imei];
  }

  function clearPets(exceptImei) {
    for (var imei in MK.petMarkers) {
      if (Object.prototype.hasOwnProperty.call(MK.petMarkers, imei) && imei !== exceptImei) {
        removePet(imei);
      }
    }
  }

  function petImeis() {
    var out = [];
    for (var imei in MK.petMarkers) {
      if (Object.prototype.hasOwnProperty.call(MK.petMarkers, imei)) out.push(imei);
    }
    return out;
  }

  function openPopupFor(imei) {
    if (!mapAlive()) return;
    var rec = MK.petMarkers[imei];
    if (rec) {
      if (typeof rec.popupHtml === 'function') rec.marker.setPopupContent(rec.popupHtml());
      rec.marker.openPopup();
    }
  }

  function refreshOpenPopups() {
    if (!mapAlive()) return;
    for (var imei in MK.petMarkers) {
      if (!Object.prototype.hasOwnProperty.call(MK.petMarkers, imei)) continue;
      var rec = MK.petMarkers[imei];
      if (rec.marker.isPopupOpen && rec.marker.isPopupOpen() && typeof rec.popupHtml === 'function') {
        rec.marker.setPopupContent(rec.popupHtml());
      }
    }
  }

  function panToPet(imei, zoom) {
    if (!mapAlive()) return;
    var rec = MK.petMarkers[imei];
    if (!rec) return;
    if (zoom) MK.map.setView([rec.lat, rec.lng], zoom, { animate: true });
    else MK.map.panTo([rec.lat, rec.lng], { animate: true });
  }

  // ---------- Turbo 实时追踪 ----------
  function setTurboFocus(imei) {
    if (!mapAlive()) return;
    MK.turboImei = imei || null;
    for (var i in MK.petMarkers) {
      if (!Object.prototype.hasOwnProperty.call(MK.petMarkers, i)) continue;
      var el = MK.petMarkers[i].marker.getElement();
      if (el) el.style.display = (MK.turboImei && i !== MK.turboImei) ? 'none' : '';
    }
  }

  function turboImei() { return MK.turboImei; }

  // ---------- 临时图层 ----------
  function addTemp(layer) {
    if (!mapAlive()) return null;
    layer.addTo(MK.tempGroup);
    return layer;
  }
  function clearTemp() {
    if (!mapAlive()) return;
    MK.tempGroup.clearLayers();
  }
  function addFence(layer) {
    if (!mapAlive()) return null;
    layer.addTo(MK.fenceGroup);
    return layer;
  }
  function clearFences() {
    if (!mapAlive()) return;
    MK.fenceGroup.clearLayers();
  }

  function drawTrackLine(points, opts) {
    if (!mapAlive()) return null;
    clearTemp();
    if (!points || points.length < 2) return null;
    var latlngs = points.map(function (p) { return [p.lat, p.lng]; });
    var line = L.polyline(latlngs, { color: (opts && opts.color) || '#e8590c', weight: 3, opacity: 0.85 });
    addTemp(line);
    // 起终点标记
    var s = L.circleMarker(latlngs[0], { radius: 6, color: '#2f9e44', fillColor: '#2f9e44', fillOpacity: 1 });
    var e = L.circleMarker(latlngs[latlngs.length - 1], { radius: 6, color: '#e03131', fillColor: '#e03131', fillOpacity: 1 });
    addTemp(s); addTemp(e);
    if (opts && opts.fit !== false) MK.map.fitBounds(line.getBounds(), { padding: [30, 30] });
    return line;
  }

  // ---------- 回放动画（epoch 守卫） ----------
  function playReplay(points, opts) {
    stopReplay();
    if (!mapAlive() || !points || points.length < 2) return false;
    var myEpoch = MK.epoch;
    var onFrame = opts && opts.onFrame;
    var onDone = opts && opts.onDone;
    var idx = 0;
    var speedFactor = (opts && opts.speedFactor) || 2400; // ×2400 等效
    var line = L.polyline([[points[0].lat, points[0].lng]], { color: '#1971c2', weight: 4 });
    var dot = L.circleMarker([points[0].lat, points[0].lng], { radius: 7, color: '#1971c2', fillColor: '#74c0fc', fillOpacity: 1 });
    addTemp(line); addTemp(dot);
    MK.replayState = { idx: 0, total: points.length, playing: true };
    MK.replayTimer = setInterval(function () {
      if (myEpoch !== MK.epoch || !mapAlive()) { stopReplay(); return; } // 防窜页
      idx++;
      if (idx >= points.length) {
        MK.replayState.playing = false;
        clearInterval(MK.replayTimer); MK.replayTimer = null;
        if (onDone) try { onDone(); } catch (e) { /* 忽略 */ }
        return;
      }
      var p = points[idx];
      line.addLatLng([p.lat, p.lng]);
      dot.setLatLng([p.lat, p.lng]);
      MK.replayState.idx = idx;
      if (onFrame) try { onFrame(p, idx, points.length); } catch (e) { /* 忽略 */ }
    }, Math.max(30, 1000 / (speedFactor / 100) / 10)); // 基础节奏，可被 speedFactor 调
    return true;
  }

  function stopReplay() {
    if (MK.replayTimer) { clearInterval(MK.replayTimer); MK.replayTimer = null; }
    MK.replayState = null;
  }

  function replayState() { return MK.replayState; }

  // ---------- 视图/缩放记忆 ----------
  function zoomByImei(imei, zoom) {
    if (zoom) {
      MK.zoomLock = imei;
      try { U.store.set('pt_zoom_lock', { imei: imei, zoom: zoom }); } catch (e) { /* 忽略 */ }
      panToPet(imei, zoom);
    }
    return MK.zoomLock;
  }
  function restoreZoomLock() {
    var saved = U.store.get('pt_zoom_lock');
    if (saved && saved.imei) {
      MK.zoomLock = saved.imei;
      return saved.imei;
    }
    return null;
  }
  function hoverZoomTo(imei) {
    if (!mapAlive() || MK.turboImei) return;
    MK.hoverLock = imei;
    if (!MK.zoomLock) panToPet(imei, MK.hoverZoom);
    else panToPet(imei);
  }
  function hoverLeave() {
    MK.hoverLock = null;
    if (MK.turboImei || !mapAlive()) return;
    if (!MK.zoomLock) {
      var recs = [];
      for (var imei in MK.petMarkers) {
        if (Object.prototype.hasOwnProperty.call(MK.petMarkers, imei)) {
          var r = MK.petMarkers[imei];
          if (r.lng !== undefined) recs.push([r.lat, r.lng]);
        }
      }
      if (recs.length > 1) MK.map.fitBounds(L.latLngBounds(recs).pad(0.15));
    }
  }

  function fitAll() {
    if (!mapAlive()) return;
    var recs = [];
    for (var imei in MK.petMarkers) {
      if (Object.prototype.hasOwnProperty.call(MK.petMarkers, imei)) {
        var r = MK.petMarkers[imei];
        if (r.lng !== undefined) recs.push([r.lat, r.lng]);
      }
    }
    if (recs.length === 1) MK.map.setView(recs[0], 14);
    else if (recs.length) MK.map.fitBounds(L.latLngBounds(recs).pad(0.15));
  }

  function invalidateSize() {
    if (!mapAlive()) return;
    MK.map.invalidateSize();
  }

  // document 委托 [data-turbo] 点击（禁 eval / innerHTML 执行）
  document.addEventListener('click', function (e) {
    var el = e.target && e.target.closest ? e.target.closest('[data-turbo]') : null;
    if (el && MK.onTurbo) {
      var imei = el.getAttribute('data-turbo');
      if (imei) MK.onTurbo(imei);
    }
  });

  window.MapKit = {
    create: create,
    getMap: getMap,
    mapAlive: mapAlive,
    epoch: function () { return MK.epoch; },
    upsertPet: upsertPet,
    setPetPopupHtml: setPetPopupHtml,
    removePet: removePet,
    clearPets: clearPets,
    petImeis: petImeis,
    petMarker: function (imei) { return MK.petMarkers[imei] || null; },
    openPopupFor: openPopupFor,
    refreshOpenPopups: refreshOpenPopups,
    panToPet: panToPet,
    setTurboFocus: setTurboFocus,
    turboImei: turboImei,
    addTemp: addTemp,
    clearTemp: clearTemp,
    addFence: addFence,
    clearFences: clearFences,
    drawTrackLine: drawTrackLine,
    playReplay: playReplay,
    stopReplay: stopReplay,
    replayState: replayState,
    zoomByImei: zoomByImei,
    restoreZoomLock: restoreZoomLock,
    hoverZoomTo: hoverZoomTo,
    hoverLeave: hoverLeave,
    fitAll: fitAll,
    invalidateSize: invalidateSize,
    _MK: MK
  };
})();
