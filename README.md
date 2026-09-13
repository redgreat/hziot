# hziot — PetTrack「合宙IoT-运动传感器」

合宙 AirCloud IoT 宠物/设备定位与状态平台，共三端：

| 端 | 位置 | 说明 |
|---|---|---|
| **WEB 版** | 仓库根目录 | `login.html` + `index.html`（构建产物，上传合宙平台部署）；源码在 `js/`、`css/`、`index.tpl.html`，构建 `python build_deploy.py`，测试 `node smoke-test.js` |
| **微信小程序** | `miniprogram/` | 原生小程序，微信开发者工具直接导入该目录；登录采用授权 token 导入。详见 [miniprogram/README.md](miniprogram/README.md) |
| **Android** | `android/` | WebView 壳工程（加载已部署的 WEB 应用），Android Studio 打包 APK。详见 [android/README.md](android/README.md) |

## 共同规则（三端一致）

- 接口网关 `https://api-iot.luatos.com/iot/open_api`，三鉴权头 `authorization / salt / sid`（无 Bearer）；
- 平台时间字面已是北京时间，展示/解析**不做任何 ±8 运算**；
- 坐标 GCJ02（国测局）：WEB 端高德瓦片、小程序 map 组件均直用，零偏移转换；
- 电压 tag = **799**（勿用 771）；512=经度、513=纬度；
- 无 mock 数据，一切来自真实平台接口。

## WEB 版快速命令

```bash
python build_deploy.py      # 构建 → index.html（审核自检）
node smoke-test.js          # 126 项结构级冒烟测试
```
