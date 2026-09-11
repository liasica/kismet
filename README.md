# 遇见（Kismet）

中国传统命理排盘与解读的 Web 应用，命理体系以八字（四柱）与易经卦象为主。

## 目录结构

主工程是 Go，一个二进制内嵌前端构建产物与区划数据，启动即可访问页面与接口。

```
main.go            入口，go:embed 内嵌 data/region 与 web/app/dist
internal/bazi/     八字排盘的 Go 实现
internal/region/   行政区划查询
internal/report/   解读报告的持久化与分享，bbolt 单文件存储
internal/httpapi/  HTTP 接口：排盘、区划、DeepSeek 解读转发、报告分享、SPA 静态资源
data/              语言中立的数据：区划 JSON 与黄金基准，Go 与 TypeScript 读同一份
web/core/          排盘引擎与区划查询，TypeScript，纯计算、无 UI 与网络依赖
web/app/           React SPA，直接引 core 在浏览器本地排盘，只有命理解读调后端
```

分成这几块的理由：

- **排盘是纯计算**，没有密钥、没有状态、不需要数据库。Web 端直接在浏览器里算，零延迟、可离线，不经过服务端
- **`core` 独立成包**是为了避免多端各自维护一份排盘实现，那会产生「同一个生辰在不同端排出不同盘」这类最难查的问题
- **Go 服务**面向原生 app 与其他语言的客户端，同时托管前端并代理 DeepSeek 解读，密钥只留在服务端。Go 无法引用 TypeScript 包，所以 `internal/bazi` 是另一份实现，两边共用同一个 tyme 库（tyme4go 与 tyme4ts 同代），并由黄金基准逐字段约束一致性

## 一致性怎么保证

`data/fixtures/charts.json` 由 TS 侧生成，里面是 54 个覆盖各分支的输入连同它们算出的完整 `Chart`。Go 的 `TestChartMatchesTypeScript` 读同一份文件，跑同样的输入，把结果序列化后与基准逐字段比对，差异会精确报出 JSON 路径。

改动任何一侧的排盘逻辑后：

```bash
make fixtures      # TS 侧重新生成基准，Go 侧比对
```

两边的均时差算法为此刻意都用自包含的 Meeus 公式而不是寿星天文历级数 —— tyme4go 没有导出那组函数，只有共用同一套公式才能逐位一致。取舍与精度实测见 [web/core/README.md](web/core/README.md)。

## 开发

```bash
make dev          # 同时启动 Vite（36578）与 Go 服务（36579），Go 代码改动后自动重编译重启
```

开发用的环境变量写在 `.env`（参考 `.env.example`），`make` 会自动导出。

| 命令 | 作用 |
| --- | --- |
| `make build` | 构建前端并编译二进制 `bin/kismet` |
| `make run` | 构建并运行 |
| `make dev` | 同时启动 Vite 与 Go 服务，Go 侧由 `wgo` 热重启 |
| `make dev-web` | 只启动 Vite 开发服务器 |
| `make dev-server` | 只启动 Go 服务 |
| `make test` | 跑 TypeScript 与 Go 的全部测试 |
| `make lint` | ESLint、TypeScript 类型检查、go vet |
| `make fixtures` | 重新生成跨语言的黄金基准并比对 |
| `pnpm -C web paipan` | 命令行排盘，用于与现有排盘工具对照 |
| `pnpm -C web format` | Prettier 格式化 |

添加 Web 组件，在 `web/app` 下执行：

```bash
pnpm dlx shadcn@latest add @shadcn/<component>
```

## 接口

Go 服务只做请求解析与转发，不含排盘逻辑。环境变量：

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `PORT` | `36579` | 监听端口 |
| `DB_PATH` | `kismet.db` | 报告与分享的数据文件 |
| `DEEPSEEK_API_KEY` | 空 | 未设置时解读接口返回 503 |
| `DEEPSEEK_BASE_URL` | `https://api.deepseek.com` | OpenAI 兼容的接口地址 |
| `DEEPSEEK_MODEL` | `deepseek-flash` | 模型名 |
| `ALLOWED_ORIGINS` | 空 | 跨域来源，逗号分隔，未设置时放开 |

| 方法与路径 | 说明 |
| --- | --- |
| `GET /health` | 存活检查 |
| `GET /api/options` | 选项默认值与可用的五行评分策略，客户端不必硬编码 |
| `POST /api/paipan` | 排盘，加 `?format=text` 返回竖排文字 |
| `POST /api/analyze` | 命理解读，收 `{"reportId", "input", "options"}`，服务端排盘并拼提示词，以 SSE 流式返回 DeepSeek 的回复；带 `reportId` 时输入与解读正文存成报告 |
| `GET /api/reports/{id}/share` | 报告的分享状态，未分享返回 404 |
| `POST /api/reports/{id}/share` | 开启分享或改密码，收 `{"password", "input", "options", "analysis"}`，返回 `{"hash", "locked"}` |
| `DELETE /api/reports/{id}/share` | 取消分享 |
| `GET /api/shares/{hash}` | 查看分享，设了密码只返回 `{"locked": true}` |
| `POST /api/shares/{hash}/unlock` | 收 `{"password"}`，密码正确返回报告内容 |
| `GET /api/regions/provinces` | 省级列表 |
| `GET /api/regions/search?q=&limit=` | 按名称跨级搜索，四级都命中，带完整地名与代码路径 |
| `GET /api/regions/{code}` | 单条区划，带完整地名与乡镇条数 |
| `GET /api/regions/{code}/children` | 下一级区划 |
| `GET /api/regions/{code}/towns` | 该节点下的乡镇 |

排盘请求的出生地可以传 `regionCode` 让服务端查经纬度，也可以直接传 `longitude`：

```bash
curl -X POST http://localhost:36579/api/paipan \
  -H 'Content-Type: application/json' \
  -d '{
    "year": 1990, "month": 5, "day": 3, "hour": 12, "minute": 30,
    "gender": "male", "regionCode": "441900112",
    "options": { "useTrueSolarTime": true, "qiYunPrecision": "hour" }
  }'
```

输入不合法返回 400、区划代码不存在返回 404，响应体是 `{"error": "..."}`。

区划层级不固定，某一级缺位时直接跳过：直筒子市的镇街直接挂在市下，直辖市的区县直接挂在省下，港澳只有两级。客户端不要按固定级数写死流程，看返回条目自身的 `level`，再用 `hasTowns` 判断要不要往下取一级。

## 技术栈

Web 端 Vite 8 + React 19 + TypeScript 6，样式 Tailwind CSS v4，组件 shadcn/ui（基座 `@base-ui/react`，图标 `@remixicon/react`）。服务端 Go 1.27 + 标准库 `net/http`。干支与节气两边都用 6tail 的 tyme。

排盘规则、流派选项与与问真八字的核对结果见 [web/core/README.md](web/core/README.md)，开发约定见 [AGENTS.md](AGENTS.md)。
