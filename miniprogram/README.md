# 微信小程序端（PetTrack 合宙IoT-运动传感器）

原生微信小程序（零框架、零 npm），复用 WEB 端同一套合宙 AirCloud 开放接口。

## 目录导入

1. 打开「微信开发者工具」→ 导入项目 → 选择本 `miniprogram/` 目录；
2. AppID 填你自己的小程序 AppID（`project.config.json` 里 `appid` 占位为 `touristappid`，可先以游客模式预览）；
3. **request 合法域名**：登录 微信公众平台 → 开发管理 → 开发设置 → 服务器域名，把 `https://api-iot.luatos.com` 加入 **request 合法域名**（工具里临时调试可勾选「不校验合法域名」）。

## 登录方式（授权导入）

小程序内无法跑网页 OAuth 跳转（web-view 需要业务域名验证，平台域名不可控），因此采用**授权 token 导入**：

1. 在浏览器打开你部署在合宙的 WEB 应用，完成 OAuth 登录；
2. 登录成功后浏览器地址栏形如 `…/login.html?token=xxxxx`；
3. 复制完整地址（或仅 token），粘贴进小程序登录页 → 点「登录」；
4. 小程序调用 `POST /iam/luat_oauth/v2/login?token=…` 换取 auth/service，之后与 WEB 端完全同源。

## 功能（v1）

- 设备页：项目切换、设备列表（最新位置/地址/电压%/卫星数）、地图标注、10s 轮询；
- 轨迹页：按日查询 `location_history`（GCJ02 直上地图组件，零坐标转换）、起终点标记、自动翻页合并；
- 设置页：账号信息、本地设备命名、退出登录。

## 与 WEB 端的规则一致性

- 时间：平台字面已是北京时间，全程**不做 ±8 运算**；
- 鉴权：`authorization / salt / sid` 三头，无 Bearer；code 102/103/105 清登录态回登录页；
- 电压：tag **799**（勿用 771），`(v-3000)/(4200-3000)` 换算百分比；
- 无 mock 数据，全部来自真实接口。

## v1 未含（后续可加）

- 云端设备名称同步（common/*，需移植 RSA-PKCS1 到小程序环境）；
- 电子围栏、实时追踪（send_cmd 依赖平台「Tag标志」未解问题）、性能监控。
