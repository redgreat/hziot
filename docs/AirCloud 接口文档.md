# AirCloud 接口文档

## POST /open_api/get_my_default_project_key - 获取我的标准模块“合宙标准模块”的项目Key

**使用场景**: 使用场景：
扫码绑定设备到“合宙标准模块”上，其余的场景除非用户主动指定，都不会主动调用本API

### 请求参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|

### 请求示例

```json
{}
```

### 返回示例

```json
返回value部分的格式是“合宙标准模块”的项目Key。

举例：{
    "code": 0,
    "value": "sx..."}
```

## POST /open_api/list_my_projects - 获取我的项目列表

**使用场景**: 如果需要使用自己的项目列表（举例：先获取项目列表，然后选择项目得到设备列表，再继续选择设备得到具体的数据）

### 请求参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|

### 请求示例

```json
{}
```

### 返回示例

```json
返回value部分的格式是数组。
返回数据的ctime为项目的创建时间(本地时间，不是UTC时间)，
举例：{
    "code": 0,
    "value": [
        {
            "id": "466205",
            "name": "合宙标准模块",
            "project_key": "Df...2w",
            "model": "",
            "info": "",
            "ctime": "20.. 11:44:11",
            "key_id": "0...s"
        }
    ]
}
```

## POST /open_api/list_my_devices - 获取指定项目Key下的设备列表

**使用场景**: 场景说明：
1）获取设备列表。分页获取所有设备的列表。分页大小size可以设置比如10,15等


### 请求参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| project | String | 是 | 最多32个字符。是接口my_projects返回的project_key，表示在合宙的项目Key |
| page | Integer | 否 | 请求页数 |
| size | Integer | 否 | 每页显示数据条数，最多100条 |
| sort | String | 否 | 结果排序字段 |
| desc | Boolean | 否 | 结果排序方式 |

### 请求示例

```json
查询指定项目Key下的设备的列表
{
   "project": "qQ...0I",
}
```

### 返回示例

```json
{
    "code": 0,
    "value": {
        "total": "7",
        "current": "1",
        "pages": "1",
        "size": "10",
        "records": [
            {
                "deviceid": "86...834",
            },
            ...
        ]
   }
}
```

## POST /open_api/search_my_devices - 搜索指定项目Key下的设备

**使用场景**: 场景说明：1）获取设备列表。分页获取所有设备的列表。此时分页大小size可以设置比如10,15等
2）在进行设备分组时，需要提前获取所有设备的列表。此时页面大小size可以设置为一个较大的值（通常超过设备总量），比如1000等，便于一次获取出所有设备

### 请求参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| project | String | 是 | 最多32个字符。是接口my_projects返回的project_key，表示在合宙的项目Key |
| imei_prefix | String | 是 | 必须有请求内容（没有如果为空字符则相当于查询所有） |
| page | Integer | 否 | 请求页数 |
| size | Integer | 否 | 每页显示数据条数，最多100条 |
| sort | String | 否 | 结果排序字段 |
| desc | Boolean | 否 | 结果排序方式 |

### 请求示例

```json
查询指定项目的所有客户的设备的imei及设备名称（使用默认的分页配置）：
{
   "project": "qQ...0I",
   "imei_prefix":"863542" 
}
```

### 返回示例

```json
{
    "code": 0,
    "value": {
        "total": "7",
        "current": "1",
        "pages": "1",
        "size": "10",
        "records": [
            {
                "deviceid": "86...834"
            },
            ...
        ]
   }
}
```

## POST /open_api/aircloud/location_history - 获取设备指定时间内的国测局02标准的经纬度信息

**使用场景**: 使用场景：1、获取指定时间内的经纬度列表，放在表格中供用户查看
2、获取指定时间内的经纬度列表，前端使用echarts等地图组件组装经纬度结果，展示历史轨迹调用频率：单用户5次/秒1、该接口不应该轮询调用。一旦指定了一个时间段，结果是相同的，轮询除了增加服务器负担，没有任何作用


### 请求参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| client_id | String | 是 | 设备的ID，一般是IMEI（对于某些设备，也可能是MAC地址） |
| start | String | 是 | 查询的起始时间（本地时间，非UTC时间），格式yyyy-MM-dd HH:mm:ss |
| end | String | 是 | 查询的结束时间（本地时间，非UTC时间），格式yyyy-MM-dd HH:mm:ss。结束时间要比起始时间晚 |
| page | Integer | 否 | 请求第几页的数据，从1开始 |
| size | Integer | 否 | 要求结果每页返回多少条记录，建议在[0,100]内 |

### 请求示例

```json
请求示例（请求指定时间内的数据，一般用于地图展示历史轨迹）：{
   "client_id": "86...2",   "start": "2026-08-24 00:00:00",   "end": "2026-08-24 23:59:59"}
"请求示例（分页展示，一般用于表格展示）：" +
   "client_id": "86...2",   "start": "2026-08-24 00:00:00",   "end": "2026-08-24 23:59:59",   "page": 1,   "size": 50}
```

### 返回示例

```json
检测结果的时候只要code不为0，value返回的都是错误信息字符串，用于展示给用户。
如果code是0，查询的结果在value中。格式如下。
value部分包含total表示记录总数，current表示当前页数（从1开始），pages表示总共有多少页，size表示每页多少条数据，
records是具体的结果，它是一个JSON对象的数组。records返回格式类似如下
其中id表示数据序号，lng和lat表示经纬度（国测局02标准）,wlng和wlat表示经纬度（WGS84标准）
具体使用哪个数据，需要根据根据地图来选（比如高德等国内地图需要就是lng/lat值）
time表示数据上报时间，是本地时间，不是UTC时间
注意：数据的排序是按照时间time升序
{"code":0,
"value":
{
  "total": "461",
  "current": "1",
  "pages": "837",
  "size": "10",
  "records": [
    {
      "time": "2026-08-24 10:50:37",
      "lat": 30.539525094353166,
      "lng": 104.06249058135519,
      "wlat": 30.5xx,
      "wlng": 104.1ss,
      "id": "8...2
    },
    {...}
  ]
 }
}

```

## POST /open_api/aircloud/latest_location - 获取设备时间最新的经纬度及位置描述

**使用场景**: 使用场景：1、获取设备最新位置：以文字展示在页面上
2、获取设备最新位置：可以展示在地图页面上。作为地图页的首次请求（可以返回国测局02格式的经纬度，及地址描述如“xx省xx市xx街道...”）
调用频率：
单用户：10次/秒；单用户每设备：5次/秒1、该接口可以轮询：从而获取最新的设备位置，轮询的间隔频率建议在大于10秒1次（过于频繁可能导致ip被封禁）。因为系统没有提供websocket/sse之类的长连接
2、如果一个页面有多个设备，比如大于10个，在单个设备轮询时要间隔大于100ms下发一个，否则会导致服务器同时收到多个请求排队而返回更慢
3、当业务上需要不断获取设备的最新的位置时，前端可以轮询该api（不要整体更新页面，只轮询查询，动态去更新界面上的位置信息）从而获得设备的动态信息。
该接口和AirCloud协议的关系：这是AirCloud协议中经纬度这两个Tag的具体业务场景。他总是查询该设备AirCloud数据的最新经纬度数据

### 请求参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| client_id | String | 是 | 设备的ID，一般是IMEI（对于某些设备，也可能是MAC地址） |

### 请求示例

```json
请求示例：{
   "client_id": "86...42"}
```

### 返回示例

```json
检测结果的时候只要code不为0，value返回的都是错误信息字符串，用于展示给用户。
如果code是0，查询的结果在value中。格式如下。
value部分包含如下有用信息：
address是具体的位置描述。比如“四川省成都市武侯区桂溪街道...lng/lat分别表示国测局02标准的经度和维度（大部分国内地图都用这个）
wlng/wlat分别表示WGS84标准的经度和维度（根据用户需要则展示）
具体使用哪个数据，需要根据根据地图来选（比如高德等国内地图需要就是lng/lat值）
time产生本次数据的时间。示例“2026-08-24 14:22:36
signal设备当时的信号量，数字。
percent设备当时电量，数字。
下面是一个具体的返回数据示例：
{"code":0,
"value":
{
            "id": "84...65",
            "deviceid": "86..42",
            "percent": "36",
            "signal": "27",
            "time": "2026-08-24 14:22:36",
            "address": "四川省成都市...",
            "lng": 104.6xxx,
            "lat": 30.5xxx,
            "wlat": 30.542,
            "wlng": 104.06
        }
}

```

## POST /open_api/aircloud/list_by_tags - 按照AirCloud协议的Tags查询数据

**使用场景**: 使用场景：
查询指定tags的数据（如果有设备号，则设备号作为条件）。
调用频率：
单用户10次/秒如果是指定了查询的时间间隔，即查询历史数据，不应轮询调用。
如果是查询最新数据，有必要轮询的情况下，应该每10秒左右轮询一次。
如果同一个页面内涉及n多个设备要轮询，多个设备之间要间隔100ms左右下发请求，一批次大于10个设备同时下发，服务端返回反而会更慢

### 请求参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| client_id | String | 是 | 设备的ID，一般是IMEI（对于某些设备，也可能是MAC地址） |
| tags | Integer[] | 是 | AirCloud协议的tag列表 |
| page | Integer | 否 | 请求第几页的数据，从1开始 |
| size | Integer | 否 | 要求结果每页返回多少条记录，建议在[0,100]内 |
| filter | JSONObject | 否 | 过滤条件，是JSON，有三个key，是三个数组，分别是：aks,acs,avs。aks表示keys，acs表示条件，avs表示value，它们组合组成了and查询条件。<br>aks 是String[], acs是String[], avs是Object.<br>aks支持的字段：ct(表示数据产生时间，是本地时间，不是UTC时间)，acs支持gt(表示大于),ge(表示大于等于),lt(表示小于),le(表示小于等于)，avs可以取具体时间比如2026-08-12 00:00:00<br>比如filter:{"acs":["ct","ct"],"acs":["ge","le"],"avs":["2026-08-12 00:00:00","2026-08-12 23:59:59"]}就表示查询ct>=2026-08-12 00:00:00 and ct<=2026-08-12 00:00:00之间的数据 |

### 请求示例

```json
请求示例：
{
   "client_id": "86...04",
   "tags":[512,513],
   "page":1,
   "size":50,
   "filter":{"aks":["ct","ct"],"acs":["ge","le"],"avs":["2026-08-12 00:00:00","2026-08-12 23:59:59"]}
}
```

### 返回示例

```json
检测结果的时候只要code不为0，value返回的都是错误信息字符串，用于展示给用户。
如果code是0，查询的结果在value中。格式如下。
value部分包含total表示记录总数，current表示当前页数（从1开始），pages表示总共有多少页，size表示每页多少条数据，
records是具体的结果，它是一个JSON对象的数组。records返回格式类似如下（这里我们以请求的tags是512,513为例）
其中val_512和val_513表示我们最后要的值。
注意：ct表示数据上报时间（是本地时间，不是UTC时间），排序是按照ct降序
val_hex表示上报的原始数据的16进制字符串
{"code":0,
"value":
{
  "total": "8361",
  "current": "1",
  "pages": "837",
  "size": "10",
  "records": [
    {
      "ct": "2026-08-18 18:53:54",
      "client": "86...04",
      "protocol": 0,
      "device_type": 1,
      "sn": 2575,
      "val_512": 103.969194,
      "val_513": 30.733357,
      "val_hex": "0001961F/00007810",
      "val_info": "/"
    },
    {...}
  ]
 }
}

```

## POST /open_api/aircloud/send_cmd - 按照AirCloud协议，向设备下发命令（TLV信息），支持的Tag包含21（iRTU下行指令）、1281（自定义下行消息）、22（通知设备上传日志）

**使用场景**: 场景：用户会有需求，主动朝某个设备下发命令，比如iRTU下行、下发自定义消息或通知设备上传日志。

### 请求参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| client_id | String | 是 | 设备的ID，一般是IMEI（对于某些设备，也可能是MAC地址） |
| tag | Integer | 是 | AirCloud协议的tag值 |
| protocol | Integer | 否 | 协议类型，只能是0(TCP)、1(UDP)、或2（MQTT）之一 |
| value | Object | 否 | 要发送的数据，数据的类型需要参考AirCloud协议的tag值对应的数据类型。 |
| sn | Ingeter | 否 | 消息的sn号。如果设备需要通过sn号找对应的消息，则需要填写，否则不需要填写，系统会给一个默认值0 |

### 请求示例

```json
请求示例：
{
   "client_id": "86...04",
   "tag":1281,
   "value":test,
   "protocol":1
}
```

### 返回示例

```json
检测结果的时候只要code不为0，value返回的都是错误信息字符串，用于展示给用户。
如果code是0，查询的结果在value中。格式如下。
value部分的值是操作结果描述，一般是字符串，比如“操作成功”
{"code":0,
"value":"操作成功"
}

```

## POST /open_api/common/list - 分页查询通用数据列表

**使用场景**: 场景：按 cls 分类和自定义过滤条件查询当前App数据，返回分页结果。
过滤条件支持多个字段组合（AND 逻辑），结果按照App自动隔离。
Header要求额外增加该参数：需要在Header中额外携带 X-Key-Open-Api，
&nbsp;&nbsp;&nbsp;- 待加密的原始数据：当前时间戳(毫秒) + "," + appId（示例："1756378552000,your_app_id"）
&nbsp;&nbsp;&nbsp;- 加密算法：RSA
&nbsp;&nbsp;&nbsp;- 填充方式：PKCS1（RSA/ECB/PKCS1Padding）
&nbsp;&nbsp;&nbsp;- 密文输出格式：Base64
&nbsp;&nbsp;&nbsp;- 登录接口返回的 sets.publicKey 即为RSA公钥（PKCS#8格式，Base64编码）
&nbsp;&nbsp;&nbsp;- 前端可直接用于JSEncrypt等库


### 请求参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| cls | Integer | 是 | 数据分类，对应开放API用户分类。cls范围：[0,254]； |
| page | Integer | 否 | 页码，默认 1 |
| size | Integer | 否 | 每页条数，默认 10，最大 100 |
| sort | String | 否 | 排序字段，开放API添加数据时定义的字段。默认 |
| desc | Boolean | 否 | 是否降序，true为降序，false为升序 |
| filter | Object | 否 | 过滤条件对象，包含 aks/acs/avs（AND条件组）和 oks/ocs/ovs（OR条件组）。同时存在时，两者取 AND 关系。
操作符支持：eq, ne, gt, ge, lt, le, like, nlike, in, nin, btw, likes, nlikes, lsand, lsor, nlsand
操作符说明：eq=等于, ne=不等于, gt=大于, ge=大于等于, lt=小于, le=小于等于, like=模糊匹配, nlike=模糊不匹配, btw=区间(BETWEEN),  |
| filter.aks | String[] | 否 | AND 条件字段名数组（） |
| filter.acs | String[] | 否 | AND 条件操作符数组（如 eq, gt, like 等） |
| filter.avs | Object[] | 否 | AND 条件值数组 |
| filter.oks | String[] | 否 | OR 条件字段名数组 |
| filter.ocs | String[] | 否 | OR 条件操作符数组 |
| filter.ovs | Object[] | 否 | OR 条件值数组 |

### 请求示例

```json
查询示例（分页 + 过滤条件）：
{
    "cls": 1,
    "page": 1,
    "size": 10,
    "filter": {
        "aks": ["s1"],
        "acs": ["eq"],
        "avs": ["my_value"],
        "oks": ["i1"],
        "ocs": ["gt"],
        "ovs": [100]
    }
}
```

### 返回示例

```json
响应示例：
{
    "code": 0,
    "value": {
        "total": "25",
        "current": "1",
        "pages": "3",
        "size": "10",
        "records": [
            {
                "id": "1001",
                "uni_key": "key001",
                "appid": "app123",
                "s1": "value1",
                "s2": "value2",
                "i1": 123,
                "d1": "2025-03-20 10:00:00"
            }
        ]
    }
}
```

## POST /open_api/common/put - 添加或更新通用数据（根据 cls 分类存储）

**使用场景**: 场景：
允许外部系统通过开放 API 向平台写入自定义数据，数据按 cls 分类；cls范围：[0,254]；每个 App 有独立的数据空间。如果 uni_key 已存在则更新，否则插入新记录。
Header要求额外增加该参数：需要在Header中额外携带 X-Key-Open-Api，
&nbsp;&nbsp;&nbsp;- 待加密的原始数据：当前时间戳(毫秒) + "," + appId（示例："1756378552000,your_app_id"）
&nbsp;&nbsp;&nbsp;- 加密算法：RSA
&nbsp;&nbsp;&nbsp;- 填充方式：PKCS1（RSA/ECB/PKCS1Padding）
&nbsp;&nbsp;&nbsp;- 密文输出格式：Base64
&nbsp;&nbsp;&nbsp;- 登录接口返回的 sets.publicKey 即为RSA公钥（PKCS#8格式，Base64编码）
&nbsp;&nbsp;&nbsp;- 前端可直接用于JSEncrypt等库


### 请求参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| cls | Integer | 是 | 数据分类，对应开放API用户分类。cls范围：[0,254]； |
| uni_key | String | 否 | 业务唯一键，不传则自动生成时间戳作为键，最长64个字符 |
| s1 | String | 否 | 字符串字段1，最长256字符 |
| s2 | String | 否 | 字符串字段2，最长256字符 |
| s3 | String | 否 | 字符串字段3，最长256字符 |
| s4 | String | 否 | 字符串字段4，最长256字符 |
| i1 | Integer | 否 | 整数字段1 |
| i2 | Integer | 否 | 整数字段2 |
| i3 | Integer | 否 | 整数字段3 |
| i4 | Integer | 否 | 整数字段4 |
| d1 | String | 否 | 日期时间字段1，格式 'yyyy-MM-dd HH:mm:ss' |
| d2 | String | 否 | 日期时间字段2，格式 'yyyy-MM-dd HH:mm:ss' |

### 请求示例

```json
请求示例（插入一条数据）：
{
    "cls": 1,
    "uni_key": "my_unique_key_001",
    "s1": "字符串字段1",
    "s2": "字符串字段2",
    "i1": 123,
    "d1": "2025-03-20 10:00:00"
}
```

### 返回示例

```json
成功返回：
{
    "code": 0,
    "value": "操作成功"
}
失败返回：
{
    "code": 非0,
    "value": "错误描述"
}
```

## POST /open_api/common/delete_by_id - 根据 ID 删除通用数据

**使用场景**: 场景：删除指定 App 下某个 cls 分类中的记录，需提供记录的 ID（即数据库主键。需要注意：id是字符串格式，不是数字格式）。
Header要求额外增加该参数：需要在Header中额外携带 X-Key-Open-Api，
&nbsp;&nbsp;&nbsp;- 待加密的原始数据：当前时间戳(毫秒) + "," + appId（示例："1756378552000,your_app_id"）
&nbsp;&nbsp;&nbsp;- 加密算法：RSA
&nbsp;&nbsp;&nbsp;- 填充方式：PKCS1（RSA/ECB/PKCS1Padding）
&nbsp;&nbsp;&nbsp;- 密文输出格式：Base64
&nbsp;&nbsp;&nbsp;- 登录接口返回的 sets.publicKey 即为RSA公钥（PKCS#8格式，Base64编码）
&nbsp;&nbsp;&nbsp;- 前端可直接用于JSEncrypt等库


### 请求参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| cls | Integer | 是 | 数据分类，对应开放API用户分类。cls范围：[0,254]； |
| id | String | 是 | 要删除的记录 id（数据库主键，作为参数上传时，需要使用字符串格式）,该值来自查询结果。 |

### 请求示例

```json
请求示例：
{
    "cls": 1,
    "id": "123456789"
}
```

### 返回示例

```json
成功返回：
{
    "code": 0,
    "value": "操作完成"
}
失败返回：
{
    "code": 非0,
    "value": "错误描述"
}
```

