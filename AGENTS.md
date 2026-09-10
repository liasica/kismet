# 遇见（Kismet）

中国传统命理排盘与解读的 Web 应用。用户提交生辰等信息，应用在浏览器本地排出命盘，再交给 DeepSeek 做文字解读。命理体系以八字（四柱）为主，紫微斗数待实现。

主工程是 Go：一个二进制内嵌前端构建产物与区划数据，启动即可访问页面与接口。

## 技术栈

| 项 | 选型 | 说明 |
| --- | --- | --- |
| 服务 | Go 1.27，标准库 `net/http` | 静态资源、排盘接口、DeepSeek 转发 |
| 构建 | Vite 8 + React 19 + TypeScript 6 | SPA，无 SSR |
| 路由 | react-router 8 | 声明式 `BrowserRouter`，页面在 `web/app/src/pages/`：`/` 首页卡片、`/bazi` 表单、`/bazi/report` 排盘与解读、`/saved` 收藏 |
| 样式 | Tailwind CSS v4 | CSS-first，无 `tailwind.config`，主题变量集中在 `web/app/src/index.css` |
| 组件 | shadcn/ui，style `base-sera` | 配置见 `web/app/components.json` |
| 组件基座 | `@base-ui/react` | 不是 Radix |
| 图标 | `@remixicon/react` | 不是 lucide |
| 日期 | react-day-picker 10 + date-fns 4 | 出生时间选择器的日历部分 |
| Markdown | react-markdown + remark-gfm | 渲染 DeepSeek 的解读 |
| 字体 | Oxanium、Raleway、思源宋体 | 拉丁与数字走 Oxanium（`--font-sans`，html 默认）与 Raleway（`--font-heading`），中文字形由思源宋体承担 |
| 包管理 | pnpm，工作区在 `web/` | |

## 目录结构

```
main.go            入口，go:embed 内嵌 data/region 与 web/app/dist
internal/bazi/     八字排盘的 Go 实现
internal/region/   行政区划查询，从 fs.FS 读数据
internal/httpapi/  HTTP 接口：排盘、区划、DeepSeek 解读转发、SPA 静态资源
data/region/       行政区划 JSON，Go 与 TypeScript 读同一份
data/fixtures/     黄金基准 charts.json，约束两份排盘实现一致
web/               前端 pnpm 工作区
web/core/          排盘引擎与区划查询，TypeScript，纯计算，浏览器与命令行直接引
web/app/           React SPA，本地排盘，只有命理解读调后端
```

排盘有两份实现（TS 与 Go），靠 `data/fixtures/charts.json` 逐字段约束一致。改动任何一侧的排盘逻辑后必须执行 `make fixtures`（先由 TS 重新生成基准，再由 Go 侧比对）。

前端把仓库根的 `data/` 当作工作区外的资源引用：TS 侧用相对路径 `../../../../data/region/...` import，Vite 开发服务器在 `web/app/vite.config.ts` 的 `server.fs.allow` 里放行了该目录。

Web 端的路径别名 `@/` 指向 `web/app/src/`，在 `web/app/vite.config.ts` 与 `web/app/tsconfig.app.json` 两处声明，改动需同步。跨包引用走包名 `@kismet/core` 与 `@kismet/core/region`，不要用相对路径穿透到别的包。

字体细节：思源宋体走 `@fontsource-variable/noto-serif-sc`，按 unicode-range 切成 101 个分片，浏览器只取命中的片，单片约 60~100 KB。中文挂在 `--font-sans` 与 `--font-heading` 的回退位，靠拉丁字体不含汉字字形自然回落；整段走宋体用 `--font-serif`。Oxanium 的 `@font-face` 在 `web/app/src/index.css` 里自行声明而不 import 字体包的 CSS，用 `ascent-override`／`descent-override` 把上伸／下伸定为 86%／14%，让回落到宋体的汉字与拉丁大写在行框里居中；升级字体包版本时同步其 `unicode-range`。生僻字（卦名、神煞）分散在多个分片，字符面铺开时首屏字体流量可达 1 MB 量级。

## 构建与运行

```bash
make build      # pnpm 构建前端，再 go build 到 bin/kismet
make run        # 构建并运行，http://localhost:36579
make dev        # 同时启动 Vite 与 Go 服务，Go 代码改动后 wgo 自动重编译重启
make dev-web    # 只跑 Vite 开发服务器 http://localhost:36578，/api 代理到 36579
make dev-server # 只跑 Go 服务 http://localhost:36579
make test       # TypeScript 与 Go 的全部测试
make lint       # ESLint、tsc、go vet
make fixtures   # 重新生成黄金基准并用 Go 侧比对
```

`web/app/dist/` 只提交占位的 `.gitkeep`，未构建时二进制照常启动，页面提示先执行 `make web`。

开发用的环境变量写在仓库根的 `.env`（参考 `.env.example`，已被 git 忽略），`Makefile` 会 `include` 并导出给所有目标。Go 热重启工具 `wgo` 以 `go.mod` 的 `tool` 指令引入，`go tool wgo` 直接可用，不需要全局安装。

环境变量：

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `PORT` | `36579` | 监听端口 |
| `DEEPSEEK_API_KEY` | 空 | 未设置时解读接口返回 503，其余功能不受影响 |
| `DEEPSEEK_BASE_URL` | `https://api.deepseek.com` | OpenAI 兼容的接口地址 |
| `DEEPSEEK_MODEL` | `deepseek-v4-flash` | 模型名 |
| `ALLOWED_ORIGINS` | 空 | 跨域来源，逗号分隔，未设置时放开 |
| `VITE_API_BASE` | 空 | 前端构建时的接口地址，空即同源 |

## 部署

推 `master` 触发 `.github/workflows/deploy.yml`：`Dockerfile` 多阶段构建，Node 阶段出前端产物，Go 阶段把它与区划数据 embed 进单二进制，最终镜像基于 alpine，推到 `ghcr.io/liasica/kismet`，再 ssh 到服务器 `docker compose pull && docker compose up -d`。

服务器的部署目录放 `compose.yaml` 与 `.env`，两者都由工作流写入。`.env` 里的 `IMAGE_TAG` 是本次部署的 commit sha，回滚就是把它改回旧 sha 再 `docker compose up -d`。容器只监听 `127.0.0.1:36579`，TLS 与对外访问由宿主机的 nginx 反代承担。

主机、账号、部署路径、部署私钥与 DeepSeek 密钥都在仓库 secrets：`SSH_HOST`、`SSH_USER`、`DEPLOY_PATH`、`SSH_KEY`、`SSH_KNOWN_HOSTS`、`DEEPSEEK_API_KEY`；`DEEPSEEK_BASE_URL` 与 `DEEPSEEK_MODEL` 是仓库 variables。

## 命理解读

`POST /api/analyze` 收 `{"prompt": string}`，服务端加上模型名转发给 DeepSeek 的 `chat/completions`，`stream: true`，把上游 SSE 逐行写回；思考模式下流里先出 `reasoning_content` 再出 `content`，服务端把思考过程按行打到控制台，前端只渲染正文，思考阶段显示「思考中」。提示词由前端 `web/app/src/lib/analysis.ts` 拼装，把姓名、出生时刻、出生地、性别与 `toText(chart, { years: true })` 的文字排盘填进固定模板，界面上可以展开查看。

## 开发约定

- 组件先查 shadcn registry 再考虑自写，在 `web/app` 下执行：`pnpm dlx shadcn@latest search @shadcn -q <关键词>`、`pnpm dlx shadcn@latest add @shadcn/<component>`
- 基座是 `base` 而非 `radix`：自定义触发器用 `render` 属性，没有 `asChild`
- 颜色只用语义 token（`bg-background`、`text-muted-foreground` 等），不写 `bg-blue-500` 这类裸值，也不手写 `dark:` 覆盖
- 间距用 `flex` + `gap-*`，不用 `space-x-*` / `space-y-*`；宽高相等用 `size-*`
- 表单用 `FieldGroup` + `Field` 组合，不用 `div` 加 `space-y-*` 拼版；出生信息表单 `birth-form.tsx` 各命理模块共用，模块特有选项以 `children` 接在后面
- 所有页面共用 `App.tsx` 容器的宽度（`max-w-4xl`），页面内不再各自设最大宽度；结果另开报告页；表单值放在 `bazi-session.tsx` 的会话存储里（sessionStorage），报告页据此重新排盘，刷新不丢；报告可收藏到 localStorage（`web/app/src/lib/reports.ts`），报告页头部有收藏开关，解读结束后自动收藏并更新正文；`/saved` 以卡片列出全部收藏，卡片以四柱为主体、沿用首页卡片的光斑特效，点开即按原表单值重新排盘并展示保存的解读
- 弹层内的可滚动列表不显示滚动条，用 `.time-list` 那样的渐隐边缘提示可滚动
- 主题切换由 `web/app/src/components/theme-provider.tsx` 提供，按 `d` 键在明暗之间切换
- 提交前 `make lint` 必须无 issue，`make test` 必须全绿

## 命理算法约束

- 农历、干支、节气换算不自行推导，选用经过验证的库或查表数据，并在引入时记录数据来源与适用年份范围
- 排盘计算与界面渲染分离：算法放 `web/core`，保持纯函数、可单独调用；界面不写任何命理算法
- 序列化结构里的 JSON key 一律英文，中文只出现在值与界面上，Go 与移动端解析中文 key 很别扭
- 真太阳时、时区、闰月这类边界情况在算法层显式处理，不留给调用方
