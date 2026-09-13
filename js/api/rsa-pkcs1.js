/* api/rsa-pkcs1.js — RSA/ECB/PKCS1Padding 公钥加密（X-Key-Open-Api 用）
 * 待加密原文：当前时间戳(毫秒) + "," + appId
 * 公钥：登录接口返回 sets.publicKey（PKCS#8 格式，Base64）
 * 密文输出：Base64
 */
(function () {
  'use strict';

  // ---- DER 解析（仅提取 RSAPublicKey 的 modulus / exponent）----
  function b64ToBytes(b64) {
    var bin, bytes = [], i;
    if (typeof window.atob === 'function') {
      bin = window.atob(String(b64).replace(/\s+/g, ''));
      for (i = 0; i < bin.length; i++) bytes.push(bin.charCodeAt(i));
      return bytes;
    }
    // 兜底：无 atob 环境（不应出现于浏览器）
    throw new Error('atob unavailable');
  }

  function readLen(bytes, pos) {
    var b = bytes[pos++];
    if (b & 0x80) {
      var n = b & 0x7f, len = 0;
      while (n-- > 0) len = len * 256 + bytes[pos++];
      return [len, pos];
    }
    return [b, pos];
  }

  // 通用 DER 遍历：按序收集所有 INTEGER（兼容 PKCS#8 SubjectPublicKeyInfo 与裸 (n,e) 两种结构）
  function parsePublicKey(b64) {
    var bytes = b64ToBytes(b64);
    var ints = [];
    function readLen(pos) {
      var b = bytes[pos++];
      if (b & 0x80) {
        var n = b & 0x7f, len = 0;
        while (n-- > 0) len = len * 256 + bytes[pos++];
        return [len, pos];
      }
      return [b, pos];
    }
    function walk(pos, end) {
      while (pos + 1 < end) {
        var tag = bytes[pos];
        var r = readLen(pos + 1);
        var len = r[0], body = r[1];
        if (tag === 0x02) { // INTEGER
          var hex = '';
          for (var i = 0; i < len; i++) hex += (bytes[body + i] < 16 ? '0' : '') + bytes[body + i].toString(16);
          ints.push(BigInt('0x' + hex));
        } else if (tag === 0x30 || tag === 0x31) { // SEQUENCE / SET → 递归
          walk(body, body + len);
        } else if (tag === 0x03) { // BIT STRING → 跳过 unused-bits 后继续
          var p2 = body;
          if (bytes[p2] === 0x00) p2++;
          walk(p2, body + len);
        }
        // 其余 tag（OID/NULL/UTF8String 等）跳过
        pos = body + len;
      }
    }
    walk(0, bytes.length);
    if (ints.length < 2) throw new Error('bad public key: no (n,e)');
    return { n: ints[0], e: ints[1] };
  }

  function bytesToBigInt(bytes) {
    var hex = '';
    for (var i = 0; i < bytes.length; i++) hex += (bytes[i] < 16 ? '0' : '') + bytes[i].toString(16);
    return BigInt('0x' + (hex || '0'));
  }

  function bigIntToBytes(x, len) {
    var hex = x.toString(16);
    if (hex.length % 2) hex = '0' + hex;
    var bytes = [];
    var pad = len * 2 - hex.length;
    for (var i = 0; i < pad; i += 2) bytes.push(0);
    for (var j = 0; j < hex.length; j += 2) bytes.push(parseInt(hex.substr(j, 2), 16));
    return bytes;
  }

  function utf8Bytes(str) {
    var out = [];
    var s = window.unescape ? window.unescape(encodeURIComponent(str)) : str;
    for (var i = 0; i < s.length; i++) out.push(s.charCodeAt(i) & 0xff);
    return out;
  }

  function modPow(b, e, m) {
    var r = 1n;
    b = b % m;
    while (e > 0n) {
      if (e & 1n) r = (r * b) % m;
      b = (b * b) % m;
      e >>= 1n;
    }
    return r;
  }

  /**
   * PKCS#1 v1.5 加密
   * @param publicKeyB64 PKCS#8 Base64 公钥
   * @param text 明文字符串
   * @returns Base64 密文；失败返回 ''（调用方降级提示）
   */
  function encryptB64(publicKeyB64, text) {
    try {
      var key = parsePublicKey(publicKeyB64);
      var k = (key.n.toString(16).length + 1) >> 1; // 模长字节数
      var msg = utf8Bytes(String(text));
      if (msg.length > k - 11) return '';
      var psLen = k - msg.length - 3;
      var em = [0x00, 0x02];
      for (var i = 0; i < psLen; i++) {
        var b;
        do { b = Math.floor(Math.random() * 256); } while (b === 0); // PS 不得为 0
        em.push(b);
      }
      em.push(0x00);
      for (var j = 0; j < msg.length; j++) em.push(msg[j]);
      var m = bytesToBigInt(em);
      var c = modPow(m, key.e, key.n);
      var out = bigIntToBytes(c, k);
      var bin = '';
      for (var q = 0; q < out.length; q++) bin += String.fromCharCode(out[q]);
      return window.btoa(bin);
    } catch (e) {
      return '';
    }
  }

  window.RsaPkcs1 = {
    encryptB64: encryptB64,
    parsePublicKey: parsePublicKey,
    _b64ToBytes: b64ToBytes
  };
})();
