/**
 * 中州派安星查表数据
 *
 * 全部出自《中州派紫微斗数初级讲义》的安星口诀与安星简表，地支索引子 0 至亥 11，
 * 天干索引甲 0 至癸 9。与坊本不同之处见 web/core/README.md 的紫微一节
 */

import { EARTH_BRANCHES, HEAVEN_STEMS } from "../../birth/constants"
import type { FiveElement } from "../../birth/types"
import type { Mutation, PalaceName } from "../types"

/** 非负取模 */
export function mod(n: number, m: number): number {
  return ((n % m) + m) % m
}

/** 地支名转索引 */
export function branchIndex(name: string): number {
  return EARTH_BRANCHES.indexOf(name as (typeof EARTH_BRANCHES)[number])
}

/** 天干名转索引 */
export function stemIndex(name: string): number {
  return HEAVEN_STEMS.indexOf(name as (typeof HEAVEN_STEMS)[number])
}

/** 把一串地支转成索引数组 */
function branches(row: string): number[] {
  return Array.from(row, (ch) => branchIndex(ch))
}

/** 十二宫自命宫逆布的名字 */
export const PALACE_NAMES: readonly PalaceName[] = [
  "命宫",
  "兄弟宫",
  "夫妻宫",
  "子女宫",
  "财帛宫",
  "疾厄宫",
  "迁移宫",
  "交友宫",
  "事业宫",
  "田宅宫",
  "福德宫",
  "父母宫",
]

export const MAJOR_STARS = [
  "紫微",
  "天机",
  "太阳",
  "武曲",
  "天同",
  "廉贞",
  "天府",
  "太阴",
  "贪狼",
  "巨门",
  "天相",
  "天梁",
  "七杀",
  "破军",
] as const

export const MINOR_STARS = [
  "左辅",
  "右弼",
  "文昌",
  "文曲",
  "天魁",
  "天钺",
  "禄存",
  "天马",
  "火星",
  "铃星",
  "擎羊",
  "陀罗",
  "地空",
  "地劫",
] as const

/** 杂曜的固定表序，宫内按这个顺序排列 */
export const ADJECTIVE_STARS = [
  "天官",
  "天福",
  "天厨",
  "天刑",
  "天姚",
  "解神",
  "天巫",
  "天月",
  "阴煞",
  "台辅",
  "封诰",
  "天空",
  "天哭",
  "天虚",
  "龙池",
  "凤阁",
  "红鸾",
  "天喜",
  "孤辰",
  "寡宿",
  "蜚廉",
  "破碎",
  "华盖",
  "咸池",
  "劫煞",
  "大耗",
  "天德",
  "月德",
  "年解",
  "天才",
  "天寿",
  "三台",
  "八座",
  "恩光",
  "天贵",
  "截空",
  "截空傍",
  "旬空",
  "旬空傍",
  "天伤",
  "天使",
] as const

// 年干系，索引为天干
export const LU_CUN = branches("寅卯巳午巳午申酉亥子")
export const TIAN_KUI = branches("丑子亥亥丑子丑午卯卯")
export const TIAN_YUE = branches("未申酉酉未申未寅巳巳")
export const TIAN_GUAN = branches("未辰巳寅卯酉亥酉戌午")
export const TIAN_FU = branches("酉申子亥卯寅午巳午巳")
export const TIAN_CHU = branches("巳午子巳午申寅午酉亥")
/** 截空两宫的起点，索引为天干 mod 5：甲己申酉 乙庚午未 丙辛辰巳 丁壬寅卯 戊癸子丑 */
export const JIE_KONG_START = branches("申午辰寅子")
/** 流昌按流年干：巳位起甲乙顺流 */
export const LIU_CHANG = branches("巳午申酉申酉亥子寅卯")
/** 流曲按流年干：酉位起甲乙逆行，中州派传授 */
export const LIU_QU = branches("酉申午巳午巳卯寅子亥")

export const MUTATIONS: readonly Mutation[] = ["禄", "权", "科", "忌"]

/** 中州派四化，索引为天干，内层依禄权科忌 */
export const MUTATION_TABLE: readonly (readonly [
  string,
  string,
  string,
  string,
])[] = [
  ["廉贞", "破军", "武曲", "太阳"],
  ["天机", "天梁", "紫微", "太阴"],
  ["天同", "天机", "文昌", "廉贞"],
  ["太阴", "天同", "天机", "巨门"],
  ["贪狼", "太阴", "太阳", "天机"],
  ["武曲", "贪狼", "天梁", "文曲"],
  ["太阳", "武曲", "天府", "天同"],
  ["巨门", "太阳", "文曲", "文昌"],
  ["天梁", "紫微", "天府", "武曲"],
  ["破军", "巨门", "太阴", "贪狼"],
]

// 年支系，索引为地支
export const FEI_LIAN = branches("申酉戌巳午未寅卯辰亥子丑")
export const GU_CHEN = branches("寅寅巳巳巳申申申亥亥亥寅")
export const GUA_SU = branches("戌戌丑丑丑辰辰辰未未未戌")
export const LIFE_MASTER = [
  "贪狼",
  "巨门",
  "禄存",
  "文曲",
  "廉贞",
  "武曲",
  "破军",
  "武曲",
  "廉贞",
  "文曲",
  "禄存",
  "巨门",
] as const
export const BODY_MASTER = [
  "火星",
  "天相",
  "天梁",
  "天同",
  "文昌",
  "天机",
  "火星",
  "天相",
  "天梁",
  "天同",
  "文昌",
  "天机",
] as const

// 三合局，索引为年支 mod 4：0 申子辰 1 巳酉丑 2 寅午戌 3 亥卯未
/** 天马在三合局长生的对冲宫 */
export const TIAN_MA = branches("寅亥申巳")
/** 劫煞在三合局的绝位 */
export const JIE_SHA = branches("巳寅亥申")
/** 华盖在三合局的墓库 */
export const HUA_GAI = branches("辰丑戌未")
/** 咸池在三合局的沐浴位 */
export const XIAN_CHI = branches("酉午卯子")
/** 火星子时的起点 */
export const FIRE_START = branches("寅卯丑酉")
/** 铃星子时的起点 */
export const BELL_START = branches("戌戌卯戌")
/** 小限一岁的起点，墓库之冲 */
export const MINOR_LIMIT_START = branches("戌未辰丑")
/** 将星在三合局的旺地 */
export const GENERAL_START = branches("子酉午卯")
/** 破碎，索引为年支 mod 3 */
export const PO_SUI = branches("巳丑酉")

// 月系，索引为月份减一
export const JIE_SHEN = branches("申申戌戌子子寅寅辰辰午午")
/** 天巫，索引为（月份 - 1） mod 4 */
export const TIAN_WU = branches("巳申寅亥")
export const TIAN_YUE_MONTH = branches("戌巳辰寅未卯亥未寅午戌寅")

export const CHANG_SHENG = [
  "长生",
  "沐浴",
  "冠带",
  "临官",
  "帝旺",
  "衰",
  "病",
  "死",
  "墓",
  "绝",
  "胎",
  "养",
] as const

/** 长生的起点，键为局数：金生巳 木生亥 火生寅 水土生申 */
export const CHANG_SHENG_START: Readonly<Record<number, number>> = {
  2: branchIndex("申"),
  3: branchIndex("亥"),
  4: branchIndex("巳"),
  5: branchIndex("申"),
  6: branchIndex("寅"),
}

export const BO_SHI = [
  "博士",
  "力士",
  "青龙",
  "小耗",
  "将军",
  "奏书",
  "飞廉",
  "喜神",
  "病符",
  "大耗",
  "伏兵",
  "官府",
] as const

export const SUI_QIAN = [
  "岁建",
  "晦气",
  "丧门",
  "贯索",
  "官符",
  "小耗",
  "岁破",
  "龙德",
  "白虎",
  "天德",
  "吊客",
  "病符",
] as const

export const JIANG_QIAN = [
  "将星",
  "攀鞍",
  "岁驿",
  "息神",
  "华盖",
  "劫煞",
  "灾煞",
  "天煞",
  "指背",
  "咸池",
  "月煞",
  "亡神",
] as const

/**
 * 六十纳音的五行：天干分五组，地支分三组（子丑午未、寅卯申酉、辰巳戌亥）
 *
 * 口诀「甲乙锦江烟 丙丁没谷田 戊己营堤柳 庚辛挂杖钱 壬癸林钟满」的偏旁
 */
export const NAYIN_ELEMENTS: readonly (readonly FiveElement[])[] = [
  ["金", "水", "火"],
  ["水", "火", "土"],
  ["火", "土", "木"],
  ["土", "木", "金"],
  ["木", "金", "水"],
]

export const BUREAU_NUMBER: Readonly<Record<FiveElement, number>> = {
  水: 2,
  木: 3,
  金: 4,
  土: 5,
  火: 6,
}

export const BUREAU_NAME: Readonly<Record<number, string>> = {
  2: "水二局",
  3: "木三局",
  4: "金四局",
  5: "土五局",
  6: "火六局",
}
