import { ModuleCard } from "@/components/module-card"

/** 四柱示意：四根柱各两字，取 README 里的基准盘 */
function PillarsFigure() {
  const pillars = [
    ["年", "庚午"],
    ["月", "庚辰"],
    ["日", "戊辰"],
    ["时", "戊午"],
  ]
  return (
    <span className="flex gap-2">
      {pillars.map(([label, ganzhi]) => (
        <span
          key={label}
          className="flex w-9 flex-col items-center gap-2 border border-foreground/15 py-2"
        >
          <span className="text-[0.625rem] text-muted-foreground">{label}</span>
          <span className="font-serif text-xl leading-tight text-foreground/70 [writing-mode:vertical-rl]">
            {ganzhi}
          </span>
        </span>
      ))}
    </span>
  )
}

/** 十二宫示意：外圈十二格，中央合并 */
function PalaceFigure() {
  const palaces = [
    "巳",
    "午",
    "未",
    "申",
    "辰",
    "",
    "",
    "酉",
    "卯",
    "",
    "",
    "戌",
    "寅",
    "丑",
    "子",
    "亥",
  ]
  return (
    <span className="relative grid size-40 grid-cols-4 grid-rows-4 border border-foreground/15">
      {palaces.map((name, i) =>
        name ? (
          <span
            key={i}
            className="flex items-end justify-end border border-foreground/10 p-1 font-serif text-[0.625rem] text-foreground/60"
          >
            {name}
          </span>
        ) : (
          <span key={i} />
        )
      )}
      <span className="absolute inset-1/4 flex items-center justify-center border border-foreground/10 font-serif text-sm text-foreground/50">
        命盘
      </span>
    </span>
  )
}

export function HomePage() {
  return (
    <section className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <h1 className="font-serif text-2xl tracking-wide">选择命理体系</h1>
        <p className="text-sm text-muted-foreground">
          填入出生时刻与地点，在本地排出命盘，再交给 DeepSeek 解读。
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <ModuleCard
          eyebrow="Four Pillars"
          title="八字命理"
          description="以出生时刻的年、月、日、时四柱干支论命，含藏干十神、神煞、五行强弱与大运流年。"
          to="/bazi"
          figure={<PillarsFigure />}
        />
        <ModuleCard
          eyebrow="Purple Star"
          title="紫微斗数"
          description="以农历生时安命身十二宫，布紫微、天府诸星，按宫位论命。"
          status="待实现"
          figure={<PalaceFigure />}
        />
      </div>
    </section>
  )
}
