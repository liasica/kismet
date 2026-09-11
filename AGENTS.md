# 遇见（Kismet）

中国传统命理排盘与解读的 Web 应用。用户提交生辰等信息，应用在浏览器本地排出命盘，再交给 DeepSeek 做文字解读。命理体系有八字（四柱）与紫微斗数两套，紫微取中州派口径。

主工程是 Go：一个二进制内嵌前端构建产物与区划数据，启动即可访问页面与接口。

## 技术栈

| 项 | 选型 | 说明 |
| --- | --- | --- |
| 服务 | Go 1.27，标准库 `net/http` | 静态资源、八字排盘接口、紫微排盘引擎、紫微解读的知识库检索、DeepSeek 转发、报告与分享 |
| 存储 | bbolt | 单文件键值库，存解读报告与分享设置，路径由 `DB_PATH` 指定 |
| 构建 | Vite 8 + React 19 + TypeScript 6 | SPA，无 SSR |
| 路由 | react-router 8 | 声明式 `BrowserRouter`，页面在 `web/app/src/pages/`：`/` 两张卡片各进一套体系、`/bazi` 表单、`/bazi/report` 排盘与解读、`/ziwei` 表单、`/ziwei/report` 排盘与解读、`/saved` 收藏、`/s/:hash` 分享页、`/admin` 后台的报告列表、`/admin/reports/:id` 后台的报告详情 |
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
main.go                    入口，go:embed 内嵌 data/region 与 web/app/dist
internal/bazi/             八字排盘的 Go 实现
internal/birth/            共用的出生信息与时间校正
internal/ziwei/            紫微斗数排盘的 Go 实现
internal/ziwei/knowledge/  讲义切片的加载与按命盘检索
internal/fixturetest/      黄金基准的加载与逐字段比对，八字与紫微共用
internal/region/           行政区划查询，从 fs.FS 读数据
internal/report/           解读报告的持久化与分享：bbolt 存储、分享哈希、密码派生
internal/httpapi/          HTTP 接口：排盘、区划、DeepSeek 解读转发、报告分享、SPA 静态资源
tools/ziweikb/             讲义抽取工具，依赖 pdftotext
data/region/               行政区划 JSON，Go 与 TypeScript 读同一份
data/fixtures/             黄金基准 bazi-charts.json 与 ziwei-charts.json，约束两份排盘实现一致
data/ziwei/                讲义切片 knowledge.json，只进提示词
web/                       前端 pnpm 工作区
web/core/                  排盘引擎与区划查询，TypeScript，纯计算，浏览器与命令行直接引
web/core/src/birth/        共用的出生信息与时间校正
web/core/src/ziwei/        紫微斗数排盘
web/app/                   React SPA，本地排盘，只有命理解读调后端
```

排盘有两份实现（TS 与 Go），两套体系各一份基准，靠 `data/fixtures/bazi-charts.json` 与 `data/fixtures/ziwei-charts.json` 逐字段约束一致。改动任何一侧的排盘逻辑后必须执行 `make fixtures`（先由 TS 重新生成基准，再由 Go 侧比对）。

前端把仓库根的 `data/` 当作工作区外的资源引用：TS 侧用相对路径 `../../../../data/region/...` import，Vite 开发服务器在 `web/app/vite.config.ts` 的 `server.fs.allow` 里放行了该目录。

Web 端的路径别名 `@/` 指向 `web/app/src/`，在 `web/app/vite.config.ts` 与 `web/app/tsconfig.app.json` 两处声明，改动需同步。跨包引用走包名 `@kismet/core` 与 `@kismet/core/region`，不要用相对路径穿透到别的包；根入口导出共用层与两套命理体系；两套体系都有的概念按体系加前缀（`baziPaipan` 与 `ziweiPaipan`、`BaziChart` 与 `ZiweiChart`、`BaziOptions` 与 `ZiweiOptions`、`baziToText` 与 `ziweiToText`），共用的不加前缀，体系内部的细节类型不从根入口导出。

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
make fixtures   # 重新生成两套跨语言黄金基准并用 Go 侧比对
```

`web/app/dist/` 只提交占位的 `.gitkeep`，未构建时二进制照常启动，页面提示先执行 `make web`。

开发用的环境变量写在仓库根的 `.env`（参考 `.env.example`，已被 git 忽略），`Makefile` 会 `include` 并导出给所有目标。Go 热重启工具 `wgo` 以 `go.mod` 的 `tool` 指令引入，`go tool wgo` 直接可用，不需要全局安装。

环境变量：

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `PORT` | `36579` | 监听端口 |
| `DB_PATH` | `kismet.db` | 报告与分享的数据文件，镜像里设为 `/data/kismet.db` 并挂成卷 |
| `DEEPSEEK_API_KEY` | 空 | 未设置时解读接口返回 503，其余功能不受影响 |
| `DEEPSEEK_BASE_URL` | `https://api.deepseek.com` | OpenAI 兼容的接口地址 |
| `DEEPSEEK_MODEL` | `deepseek-flash` | 模型名 |
| `ALLOWED_ORIGINS` | 空 | 跨域来源，逗号分隔，未设置时放开 |
| `ADMIN_PASSWORD` | 空 | 后台管理的密码，限 ASCII 可见字符；未设置时后台接口返回 503，`/admin` 不可用 |
| `VITE_API_BASE` | 空 | 前端构建时的接口地址，空即同源 |

## 部署

推 `master` 触发 `.github/workflows/deploy.yml`：`Dockerfile` 多阶段构建，Node 阶段出前端产物，Go 阶段把它与区划数据 embed 进单二进制，最终镜像基于 alpine，推到 `ghcr.io/liasica/kismet`，再 ssh 到服务器 `docker compose pull && docker compose up -d`。

服务器的部署目录放 `compose.yaml` 与 `.env`，两者都由工作流写入。`.env` 里的 `IMAGE_TAG` 是本次部署的 commit sha，回滚就是把它改回旧 sha 再 `docker compose up -d`。容器只监听 `127.0.0.1:36579`，TLS 与对外访问由宿主机的 nginx 反代承担。报告数据在命名卷 `kismet-data`（容器内 `/data`），换镜像不丢。

主机、账号、部署路径、部署私钥与 DeepSeek 密钥都在仓库 secrets：`SSH_HOST`、`SSH_USER`、`DEPLOY_PATH`、`SSH_KEY`、`SSH_KNOWN_HOSTS`、`DEEPSEEK_API_KEY`、`ADMIN_PASSWORD`；`DEEPSEEK_BASE_URL` 与 `DEEPSEEK_MODEL` 是仓库 variables。

## 命理解读

排盘另有独立接口，不经过模型：`POST /api/bazi/paipan`、`GET /api/bazi/options`、`POST /api/ziwei/paipan`（`?format=text` 返回文字命盘）。

八字接口 `POST /api/bazi/analyze` 收 `{"reportId", "input", "options"}`，服务端按输入排盘、拼出提示词，加上模型名转发给 DeepSeek 的 `chat/completions`，`stream: true`，把上游 SSE 逐行写回；思考模式下流里先出 `reasoning_content` 再出 `content`，服务端把思考过程按行打到控制台，前端只渲染正文，思考阶段显示「思考中」。提示词在 `internal/httpapi/prompt_bazi.go`：system 消息放角色与批命规则（按子平法先定旺衰、格局与用神再论事，以命盘为准不重新推算，每条论断给出命盘依据，分清命局与岁运，男命以财论妻、女命以官杀论夫，每节先结论后依据，健康只说方向，不写安慰话与免责声明，只用段落、列表与粗体），user 消息放命主信息、今天的日期（北京时间）、虚岁、所处大运、当前与下一个流年（以立春为界，由 `bazi.FortuneAt` 算）、`bazi.ToText` 带流年的文字命盘与章节清单：成人七节（命局总论、性格与天赋、事业与财运、婚姻与感情、健康、大运与流年、建议）2500 到 3500 字；虚岁 18 以下六节面向父母、不谈婚姻财运事业（命局总论、性格与天赋、健康与体质、学业与培养、大运与流年、给父母的建议）1800 到 2500 字。面向用户的页面不出现所用模型的名字，也不提供提示词的查看入口；模型名只在后台的报告详情里显示。

紫微接口 `POST /api/ziwei/analyze`，收同样的 `{"reportId", "input", "options"}`，`options` 是紫微选项，提示词在 `internal/httpapi/prompt_ziwei.go`：system 消息放中州派批命规则（先看父母宫田宅宫、命宫福德宫合看、以星系论、分清原局大限流年、按参考资料口径、不承认宿命），user 消息放命主信息、今天、虚岁、所处大限与当前下一流年、`<命盘>` 文字命盘加大限流曜与流年流曜 `</命盘>`、`<参考资料>` 按命盘从知识库选出的讲义切片（命宫星系、命宫正曜、生年大限流年四化、十二宫宫垣论、三方四正的辅佐煞对星，总量 45000 字以内）`</参考资料>`、章节清单：成人八节 2500 到 3500 字，未成年人六节 1800 到 2500 字。

带 `reportId` 时服务端在转发前把排盘输入与选项存成报告，流结束（含客户端中途断开）后把已生成的正文写回同一份，`reportId` 由前端在提交表单时生成（128 位随机数的 32 位十六进制），持有 id 即可管理这份报告的分享。

## 分享

- 链接：`POST /api/reports/{id}/share` 收 `{"system", "password", "input", "options", "analysis"}` 开启分享或改密码，返回 `{"hash", "locked"}`；`GET` 查状态，`DELETE` 取消。`system` 缺省 `bazi`，兼容早期客户端；报告尚未解读时随请求带上的 `input` 与 `options` 会先存成报告，`options` 按体系原样透传，`analysis` 非空时以它为准写入正文，前端每次创建或改密码都带上本地最新的解读
- 查看：`GET /api/shares/{hash}` 未设密码直接返回 `{"locked": false, "report": {system, input, options, analysis, createdAt, updatedAt}}`，设了密码只返回 `{"locked": true}`，再 `POST /api/shares/{hash}/unlock` 收 `{"password"}` 换正文；同一分享连续输错 5 次密码冷却 30 秒
- 分享哈希是 8 字节随机数的 base64url 编码；密码只存 PBKDF2-SHA256 的盐与派生结果，路径不合格式一律按 404 处理
- 存储的 `Report` 带 `system` 字段，早期记录没有这个字段，读出时按 `bazi` 补上
- 前端 `/s/:hash` 取到 `system`、`input` 与 `options` 后按体系在本地重新排盘，接口层不算盘；报告页头部的「分享」对话框分「链接」「图片」两页，图片由 `web/app/src/lib/poster.ts` 用 Canvas 画成长图：命盘与完整解读正文，正文按自带的简易 Markdown 排版（标题、段落、列表、引用、表格、粗体），颜色取当前主题的 CSS 变量，有分享链接时附二维码（`uqr`）；先空跑一遍量出总高度，画布总像素压在 1600 万以内，超长解读自动降低导出倍率

## 后台管理

- 密码是环境变量 `ADMIN_PASSWORD`，未设置时后台接口返回 503；前端 `/admin` 输入后放在 sessionStorage，关掉标签页即失效，每次请求以 `Authorization: Bearer <密码>` 携带，密码限 ASCII 可见字符
- `GET /api/admin/reports?offset=&limit=` 按创建时间倒序分页列出全部报告，返回 `{"total", "reports": [{id, createdAt, updatedAt, system, input, model, analysisRunes, share}]}`，不带正文，`limit` 默认 50、最大 200；`GET /api/admin/reports/{id}` 返回单份报告的全部内容，比列表项多 `options` 与 `analysis`。密码缺失或不正确返回 401，连续输错 5 次冷却 30 秒，计数不按客户端区分
- 前端 `/admin` 以表格列出报告（创建时间、姓名、体系、出生时刻、出生地、解读字数、分享状态），页码在查询参数 `page`，点一行进 `/admin/reports/:id`：先列出报告 id、体系、时间、模型与分享链接，再按体系与保存的输入在本地重新排盘并展示解读正文；分享页与后台详情共用 `web/app/src/components/report-view.tsx`。头部导航不放后台入口，直接访问路径

## 开发约定

- 组件先查 shadcn registry 再考虑自写，在 `web/app` 下执行：`pnpm dlx shadcn@latest search @shadcn -q <关键词>`、`pnpm dlx shadcn@latest add @shadcn/<component>`
- 基座是 `base` 而非 `radix`：自定义触发器用 `render` 属性，没有 `asChild`
- 颜色只用语义 token（`bg-background`、`text-muted-foreground` 等），不写 `bg-blue-500` 这类裸值，也不手写 `dark:` 覆盖
- 间距用 `flex` + `gap-*`，不用 `space-x-*` / `space-y-*`；宽高相等用 `size-*`
- 表单用 `FieldGroup` + `Field` 组合，不用 `div` 加 `space-y-*` 拼版；出生信息表单 `birth-form.tsx` 各命理模块共用，模块特有选项以 `children` 接在后面，体系各自的选项落一个 `*-options-fields.tsx`（`bazi-options-fields.tsx`、`ziwei-options-fields.tsx`）
- 体系元数据（眉题、标题、路径）集中在 `lib/system.ts` 的 `SYSTEMS`；首页卡片、两套表单页、两套报告页与需要按体系动态分发的组件（分享、收藏卡片、长图、后台）都从这里取
- 所有页面共用 `App.tsx` 容器的宽度（`max-w-4xl`），页面内不再各自设最大宽度；结果另开报告页；会话存储由 `components/session-store.tsx` 的工厂按体系生成（`kismet.bazi`、`kismet.ziwei`），表单草稿只在表单页组件内，提交时才写入会话，报告页据此重新排盘，刷新不丢，「返回修改」以路由 state 带回上次提交的值，其余入口进表单页都是空表单；报告可收藏到 localStorage（`lib/reports.ts`，键 `kismet.reports`，条目带 `system`），报告页头部有收藏开关，解读结束后自动收藏并更新正文；`/saved` 以卡片列出全部收藏，沿用首页卡片的光斑特效，八字卡片以四柱为主体、紫微卡片以命身宫为主体，点开写入对应体系的会话并展示保存的解读
- 长图 `lib/poster.ts` 按 `PosterSubject.system` 分发：八字画四柱与五行，紫微画十二宫格；分享对话框（`ShareDialog`）与解读面板（`AnalysisPanel`）都接带 `system` 的记录
- 弹层内的可滚动列表不显示滚动条，用 `.time-list` 那样的渐隐边缘提示可滚动
- 主题切换由 `web/app/src/components/theme-provider.tsx` 提供，按 `d` 键在明暗之间切换
- 提交前 `make lint` 必须无 issue，`make test` 必须全绿
- 讲义切片只进提示词：任何接口响应、日志与界面都不输出原文，`docs/*.pdf` 不入库，重新抽取用 `go run ./tools/ziweikb`。模型按切片的口径批命，解读正文里会有对讲义的改写复述，提示词要求不照抄原句，这是这套做法的边界

## 命理算法约束

- 农历、干支、节气换算不自行推导，选用经过验证的库或查表数据，并在引入时记录数据来源与适用年份范围
- 排盘计算与界面渲染分离：算法放 `web/core`，保持纯函数、可单独调用；界面不写任何命理算法
- 序列化结构里的 JSON key 一律英文，中文只出现在值与界面上，Go 与移动端解析中文 key 很别扭
- 真太阳时、时区、闰月这类边界情况在算法层显式处理，不留给调用方
- 紫微斗数按中州派口径，规则与差异记在 `web/core/README.md`，不做流派开关
- 紫微的虚岁与流年以农历年为界，八字以立春为界，两边不要混用
