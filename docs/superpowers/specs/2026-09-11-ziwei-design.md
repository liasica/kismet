# 紫微斗数模块设计

## 目标

在现有八字模块之外新增紫微斗数：浏览器本地排盘（TypeScript）、Go 侧同构排盘（供解读接口与其他客户端）、DeepSeek 解读、以及收藏、分享（链接与长图）、后台详情对紫微的完整支持。口径取中州派（王亭之讲义），不做流派切换。

## 依据

`docs/` 下三本中州派讲义：

| 书 | 用途 |
| --- | --- |
| 《中州派紫微斗数初级讲义》 | 安星法（46 条口诀、安星简表、庙陷总表）、年限推断法、星盘推断法。排盘算法全部据此 |
| 《深造讲义（上）星曜论》 | 十四正曜、六十星系、辅佐八曜、煞曜、化曜（四十条）、杂曜、流曜。解读知识库来源 |
| 《深造讲义（下）宫垣论》 | 十二宫逐宫论十四正曜。解读知识库来源 |

书中「安紫微表」有两处印刷错误（土五局十一日印作寅应为申，火六局初九印作丑应为子），以算法为准，书中自己的掌诀也能推出正确结果。

## 中州派与坊本的差异（实现时必须按书）

- 四化：戊干 贪狼禄、太阴权、太阳科、天机忌；庚干 太阳禄、武曲权、天府科、天同忌；壬干 天梁禄、紫微权、天府科、武曲忌。不用左辅右弼化科
- 天伤天使：阳男阴女 天伤在交友宫、天使在疾厄宫；阴男阳女互换
- 命主按出生年支取（坊本多按命宫地支）
- 解神分年解（年支起）与月解（月份起），流年另有年解流曜
- 截空、旬空各占两宫，分正空与傍空：阳年生人阳宫为正空，阴年生人阴宫为正空
- 流曲有独立起法：甲酉 乙申 丙午 丁巳 戊午 己巳 庚卯 辛寅 壬子 癸亥
- 晚子时属当日（零时才是一日之始），与八字模块一样保留 `lateZiAsNextDay` 开关，默认关
- 庙陷分庙、旺、地、平、闲、陷六级，「地」是表中原字（贪狼在卯、天梁在酉），照录

## 时间与历法

- 输入沿用 `PaipanInput`（公历北京时间钟表读数 + 性别 + 经纬度），时间校正复用八字模块的三道校正（夏令时、经度差、均时差）。书中「以洛阳为基准」的说法不实现，真太阳时按出生地经度校正
- 农历换算走 `tyme4ts` / `tyme4go`：`SolarDay.getLunarDay()`，月份用 `LunarMonth.getMonthWithLeap()`（负数为闰月），年干支用 `LunarYear.getSixtyCycle()`
- 年以正月初一为界，月按农历月，不看节气
- 闰月：初一至十五按本月，十六起按下一个月，日数不变；闰十二月十六起按正月但年干支不变
- 时支 = `floor((小时 + 1) / 2) mod 12`，23 时与 0 时同为子
- 虚岁与流年都以农历年为界：虚岁 = 当前农历年 - 出生农历年 + 1

## 安星规则（地支索引子 0 至亥 11，「+」为顺行）

命身与十二宫：

- 命宫 = (2 + (月 - 1) - 时支) mod 12；身宫 = (2 + (月 - 1) + 时支) mod 12
- 十二宫自命宫逆布：命宫 兄弟 夫妻 子女 财帛 疾厄 迁移 交友 事业 田宅 福德 父母
- 宫干：五虎遁，寅宫干序 = (年干序 mod 5) x 2 + 2，其余宫按地支顺推
- 五行局：命宫干支纳音。天干分五组 甲乙 丙丁 戊己 庚辛 壬癸，地支分三组 子丑午未、寅卯申酉、辰巳戌亥，纳音 = [[金水火],[水火土],[火土木],[土木金],[木金水]][干组][支组]；水二 木三 金四 土五 火六
- 阳男阴女为「顺」，阴男阳女为「逆」

紫微与十四正曜：

- 紫微：设局数 n、生日 d，取最小 k >= 0 使 (d + k) 能被 n 整除，商 q = (d + k) / n；从寅数 q 宫（寅为第 1 宫）得基准宫，k 为奇数逆退 k 宫、偶数顺进 k 宫
- 天机 = 紫 - 1，太阳 = 紫 - 3，武曲 = 紫 - 4，天同 = 紫 - 5，廉贞 = 紫 - 8
- 天府 = (4 - 紫) mod 12；太阴 = 府 + 1，贪狼 + 2，巨门 + 3，天相 + 4，天梁 + 5，七杀 + 6，破军 + 10

年干系（甲至癸）：

| 星 | 甲 | 乙 | 丙 | 丁 | 戊 | 己 | 庚 | 辛 | 壬 | 癸 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 禄存 | 寅 | 卯 | 巳 | 午 | 巳 | 午 | 申 | 酉 | 亥 | 子 |
| 擎羊 | 禄存 + 1 | | | | | | | | | |
| 陀罗 | 禄存 - 1 | | | | | | | | | |
| 天魁 | 丑 | 子 | 亥 | 亥 | 丑 | 子 | 丑 | 午 | 卯 | 卯 |
| 天钺 | 未 | 申 | 酉 | 酉 | 未 | 申 | 未 | 寅 | 巳 | 巳 |
| 天官 | 未 | 辰 | 巳 | 寅 | 卯 | 酉 | 亥 | 酉 | 戌 | 午 |
| 天福 | 酉 | 申 | 子 | 亥 | 卯 | 寅 | 午 | 巳 | 午 | 巳 |
| 天厨 | 巳 | 午 | 子 | 巳 | 午 | 申 | 寅 | 午 | 酉 | 亥 |
| 截空 | 申酉 | 午未 | 辰巳 | 寅卯 | 子丑 | 申酉 | 午未 | 辰巳 | 寅卯 | 子丑 |
| 流昌 | 巳 | 午 | 申 | 酉 | 申 | 酉 | 亥 | 子 | 寅 | 卯 |
| 流曲 | 酉 | 申 | 午 | 巳 | 午 | 巳 | 卯 | 寅 | 子 | 亥 |

- 旬空：旬首地支 = (年支 - 年干) mod 12，旬空 = 旬首 + 10 与旬首 + 11

年支系（子至亥）：

- 天马 = [寅 亥 申 巳][年支 mod 4]（三合局长生之冲）；劫煞 = [巳 寅 亥 申]；华盖 = [辰 丑 戌 未]；咸池 = [酉 午 卯 子]
- 破碎 = [巳 丑 酉][年支 mod 3]
- 天空 = 年支 + 1；天哭 = 6 - 年支；天虚 = 6 + 年支；龙池 = 4 + 年支；凤阁 = 10 - 年支；红鸾 = 3 - 年支；天喜 = 红鸾 + 6
- 月德 = 5 + 年支；天德 = 9 + 年支；年解 = 10 - 年支
- 大耗 = 年支 + 6，阳支再 + 1、阴支再 - 1
- 蜚廉 = [申 酉 戌 巳 午 未 寅 卯 辰 亥 子 丑][年支]
- 孤辰 = [寅 寅 巳 巳 巳 申 申 申 亥 亥 亥 寅][年支]；寡宿 = [戌 戌 丑 丑 丑 辰 辰 辰 未 未 未 戌][年支]
- 天才 = 命宫 + 年支；天寿 = 身宫 + 年支
- 命主 = [贪狼 巨门 禄存 文曲 廉贞 武曲 破军 武曲 廉贞 文曲 禄存 巨门][年支]；身主 = [火星 天相 天梁 天同 文昌 天机 火星 天相 天梁 天同 文昌 天机][年支]

月系（正月为 1）：

- 左辅 = 4 + (月 - 1)；右弼 = 10 - (月 - 1)；天刑 = 9 + (月 - 1)；天姚 = 1 + (月 - 1)
- 解神（月解）= [申 申 戌 戌 子 子 寅 寅 辰 辰 午 午][月 - 1]；天巫 = [巳 申 寅 亥][(月 - 1) mod 4]
- 天月 = [戌 巳 辰 寅 未 卯 亥 未 寅 午 戌 寅][月 - 1]；阴煞 = 2 - 2 x (月 - 1)

时系（子时为 0）：

- 文昌 = 10 - 时；文曲 = 4 + 时；地劫 = 11 + 时；地空 = 11 - 时；台辅 = 文曲 + 2；封诰 = 文曲 - 2
- 火星 = [寅 卯 丑 酉][年支 mod 4] + 时；铃星 = [戌 戌 卯 戌][年支 mod 4] + 时

日系：三台 = 左辅 + (日 - 1)；八座 = 右弼 - (日 - 1)；恩光 = 文昌 + (日 - 1) - 1；天贵 = 文曲 + (日 - 1) - 1

依宫位：天伤天使见上文差异一节。

长生十二神：起点 水二局申、木三局亥、金四局巳、土五局申、火六局寅，顺者顺行逆者逆行；序 长生 沐浴 冠带 临官 帝旺 衰 病 死 墓 绝 胎 养。博士十二神从禄存起同向：博士 力士 青龙 小耗 将军 奏书 飞廉 喜神 病符 大耗 伏兵 官府。

运限：

- 大限自命宫起，顺者向父母宫、逆者向兄弟宫，起限岁 = 局数，每宫十年
- 小限男顺女逆不分阴阳，一岁起点 [戌 未 辰 丑][年支 mod 4]（申子辰戌、巳酉丑未、寅午戌辰、亥卯未丑）
- 流年以太岁宫为命宫；流曜按流年干起流禄流羊流陀流魁流钺流昌流曲与流四化，流马按流年支，年解按流年支；大限流曜按大限宫干支同法
- 岁前十二神从流年支起顺行：岁建 晦气 丧门 贯索 官符 小耗 岁破 龙德 白虎 天德 吊客 病符
- 将前十二神从 [子 酉 午 卯][流年支 mod 4] 起顺行：将星 攀鞍 岁驿 息神 华盖 劫煞 灾煞 天煞 指背 咸池 月煞 亡神
- 斗君 = (流年支 - (生月 - 1) + 生时) mod 12；流月流日流时本期不实现

## 庙陷（列序子至亥，`-` 表示该星不会落在此宫）

```
紫微 平庙庙旺陷旺庙庙旺平闲旺    天机 庙陷旺旺庙平庙陷平旺庙平
太阳 陷陷旺庙旺旺庙平闲闲陷陷    武曲 旺庙闲陷庙平旺庙平旺庙平
天同 旺陷闲庙平庙陷陷旺平平庙    廉贞 平旺庙闲旺陷平庙庙平旺陷
天府 庙庙庙平庙平旺庙平陷庙旺    太阴 庙庙闲陷闲陷陷平平旺旺庙
贪狼 旺庙平地庙陷旺庙平平庙陷    巨门 旺旺庙庙平平旺陷庙庙旺旺
天相 庙庙庙陷旺平旺闲庙陷闲平    天梁 庙旺庙庙旺陷庙旺陷地旺陷
七杀 旺庙庙陷旺平旺旺庙闲庙平    破军 庙旺陷旺旺闲庙庙陷陷旺平
擎羊 陷庙-陷庙-平庙-陷庙-        陀罗 -庙陷-庙陷-庙陷-庙陷
火星 平旺庙平闲旺庙闲陷陷庙平    铃星 陷陷庙庙旺旺庙旺旺陷庙庙
地空 平陷陷平陷庙庙平庙庙陷陷    地劫 陷陷平平陷闲庙平庙平平旺
天魁 旺旺-庙--庙----旺           天钺 --旺--旺-旺庙庙--
左辅 旺庙庙陷庙平旺庙平陷庙闲    右弼 庙庙旺陷庙平旺庙闲陷庙平
文昌 旺庙陷平旺庙陷平旺庙陷旺    文曲 庙庙平旺庙庙陷旺平庙陷旺
禄存 旺-庙旺-庙旺-庙旺-庙        天马 --旺--平--旺--平
```

杂曜与四化曜的庙陷表书中另有，本期不纳入。

## 验证

排盘原型已与书中全部例题及安紫微表逐格核对，并与 iztro 交叉比对数百张随机命盘：命身宫、五行局、宫干、十四正曜、辅佐煞、全部杂曜、长生、博士、大限、小限、流曜、岁前、将前全部一致，差异只在上文列出的流派差异处。实现完成后应重做一次同样的比对（脚本不入库）。

## 代码结构

TypeScript 是正本，Go 逐个移植，黄金基准约束两边一致。

```
web/core/src/birth/      共用：PaipanInput、TimeInfo、时间校正、均时差、夏令时、干支常量
web/core/src/bazi/       八字（对外名字加 bazi 前缀：BaziChart、baziPaipan、baziToText、BaziOptions）
web/core/src/ziwei/      紫微：types、data/tables、data/brightness、lunar、palaces、stars、fortune、chart、text
web/core/src/index.ts    根入口，导出 birth、bazi、ziwei 全部
internal/birth/          Go 共用层，bazi 用类型别名保持 bazi.Input 等名字不变
internal/ziwei/          Go 紫微排盘
internal/ziwei/knowledge Go 知识库检索
internal/fixturetest/    两套黄金基准共用的加载与递归比对
data/fixtures/bazi-charts.json、ziwei-charts.json
data/ziwei/knowledge.json 讲义切片
tools/ziweikb/           讲义抽取工具，go run，依赖 pdftotext
```

`@kismet/core` 的 `exports` 根入口改为 `src/index.ts`，`./region` 不变。

## 数据模型（JSON key 英文，两边一致）

```ts
interface ZiweiOptions { useTrueSolarTime: boolean; useDaylightSaving: boolean; lateZiAsNextDay: boolean; maxAge: number }
type Brightness = "庙" | "旺" | "地" | "平" | "闲" | "陷"
type Mutation = "禄" | "权" | "科" | "忌"
interface ZiweiStar { name: string; brightness?: Brightness; mutation?: Mutation }
interface Decade { index: number; startAge: number; endAge: number; startYear: number; endYear: number }
interface ZiweiPalace {
  index: number; name: PalaceName; branch: string; stem: string; sixtyCycle: string; isBodyPalace: boolean
  majorStars: ZiweiStar[]; minorStars: ZiweiStar[]; adjectiveStars: ZiweiStar[]
  changSheng: string; boShi: string; decade: Decade; minorLimitAges: number[]
}
interface ZiweiLunar { year: number; yearSixtyCycle: string; month: number; leap: boolean; day: number; effectiveMonth: number; hourBranch: string; text: string }
interface Bureau { name: string; element: FiveElement; number: number }
interface ZiweiChart {
  name?: string; gender: Gender; input: PaipanInput; options: ZiweiOptions; location?: Location; time: TimeInfo
  lunar: ZiweiLunar; yearStem: string; yearBranch: string; yang: boolean; forward: boolean
  lifePalace: string; bodyPalace: string; bureau: Bureau; lifeMaster: string; bodyMaster: string
  mutations: Record<Mutation, string>; palaces: ZiweiPalace[]   // 12 项按地支子至亥
}
interface ZiweiFlow { scope: "decade" | "year"; stem: string; branch: string; sixtyCycle: string; lifePalace: string; stars: Record<string, string>; mutations: Record<Mutation, string> }
interface ZiweiYear extends ZiweiFlow { year: number; age: number; suiQian: Record<string, string>; jiangQian: Record<string, string>; douJun: string; minorLimit: string }
```

`majorStars` 为十四正曜；`minorStars` 为左辅 右弼 文昌 文曲 天魁 天钺 禄存 天马 火星 铃星 擎羊 陀罗 地空 地劫；`adjectiveStars` 为其余杂曜，截空与旬空的傍空记作 `截空傍`、`旬空傍`。星曜在各列表内按固定表序排列。

流年与大限流曜不进 `ZiweiChart`，由 `ziweiYearly(chart, year)`、`ziweiDecadeFlow(chart, index)`、`ziweiLimitAt(chart, date)` 按需算；Go 侧同名 `Yearly`、`DecadeFlow`、`LimitAt`。

## 服务端

- 报告存储 `Report` 增加 `System`（`bazi` / `ziwei`，旧数据缺省按 `bazi`），`Options` 改为 `json.RawMessage`；`Input` 仍是共用的 `birth.Input`
- 路由改为按体系分组：`POST /api/bazi/paipan`、`/api/bazi/analyze`、`GET /api/bazi/options`、`POST /api/ziwei/paipan`、`/api/ziwei/analyze`。旧的 `/api/paipan`、`/api/analyze`、`/api/options` 删除（前端是唯一客户端）
- 分享与后台接口的请求与响应带 `system`，`options` 原样透传
- 解读：`prompt_ziwei.go` 拼中州派提示词。system 消息放角色与批命规则；user 消息放命主信息、今天、虚岁、所处大限与当前流年、`<命盘>` 文字命盘加大限流曜与流年流曜 `</命盘>`、`<参考资料>` 讲义切片 `</参考资料>`、章节清单。成人八节（命局总论、性格与才能、事业与财运、婚姻与感情、六亲与人际、健康、大限与流年、建议）2500 到 3500 字；虚岁 18 以下六节面向父母（命局总论、性格与天赋、健康与体质、学业与培养、大限与流年、给父母的建议）1800 到 2500 字

## 知识库

`tools/ziweikb` 把深造讲义两册按半页抽取文本（每页左右各半，宽 395 pt），去页眉页码、拼接换行、规范用字（宮 -> 宫、曰 -> 日、一一 -> ——），按标题切成条目写入 `data/ziwei/knowledge.json`：

| 类别 | 键 | 条目数 | 来源标题格式 |
| --- | --- | --- | --- |
| `stars` | 星名 | 14 | 上册「1 紫微」至「14 破军」 |
| `systems` | 星系名如「紫微独坐子午」 | 60 | 上册「N 星系名」，含无编号、编号后置与标题并入正文首行的三处特例 |
| `assist` | 「天魁天钺」「左辅右弼」「文昌文曲」「禄存天马」「擎羊陀罗」「火星铃星」「地空地劫」 | 7 | 上册辅佐八曜与煞曜的「N 星 星」 |
| `mutations` | 干 + 化，如「甲禄」 | 40 | 上册「星名(X干化Y)」 |
| `adjective` | 杂曜名或对星名 | 约 30 | 上册杂曜总论内的短行标题 |
| `palaces` | 宫名 -> 正曜名 | 12 x 14 | 下册各宫章内的「N 星名」 |

检索：按命盘选条目，优先级依次为命宫星系、命宫正曜、生年四化四条、当前大限与流年四化、十二宫按命宫 福德 夫妻 财帛 事业 疾厄 迁移 父母 田宅 子女 兄弟 交友 的顺序取该宫正曜的宫垣论（宫无正曜借对宫）、命宫三方四正所见辅佐煞的对星条目，总量超过 45000 字时从低优先级起丢弃。参考资料只进提示词，任何界面不展示、不提供下载。

## 前端

- 路由 `/ziwei`、`/ziwei/report`；`ziwei-session.tsx` 与 `bazi-session.tsx` 由同一个工厂生成，两个 Provider 都包在路由外
- 收藏 `SavedReport` 增加 `system`，存储键改为 `kismet.reports`，首次读取时把旧键 `kismet.bazi.reports` 迁入并补 `system: "bazi"`；卡片按体系画四柱或命宫身宫
- `AnalysisRecord` 增加 `system`，解读面板与分享对话框接 `record` 与 `chart` 联合类型；长图的命盘绘制按体系分发：八字画四柱与五行，紫微画十二宫格
- 分享页与后台详情按报告的 `system` 渲染对应命盘与标题
- 紫微命盘组件：4 x 4 宫格（巳午未申一行、辰与酉、卯与戌、寅丑子亥），每格正曜大字带庙陷与四化标记、辅佐煞中字、杂曜小字、底部宫名干支与大限岁数，中央放命主信息；标签页「命盘」「大限流年」「文本」，大限流年页选大限或流年后在宫格上叠加流曜并标出流年命宫
- 首页紫微卡片接 `/ziwei`，去掉「待实现」

## 版权

讲义原文切片只用于服务端提示词，不进任何接口响应；`docs/*.pdf` 不纳入版本控制。
