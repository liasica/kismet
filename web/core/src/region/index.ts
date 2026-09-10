/**
 * 中国行政区划查询
 *
 * 给「出生地址」联动选择与真太阳时校正提供数据：省 -> 市 -> 区县 -> 乡镇，
 * 每一级都带经纬度，真太阳时只用经度，纬度一并保留。
 *
 * ## 同步与异步的界线
 *
 * 省、市、区县三级放在 `data/divisions.ts`，随首屏加载，所有查询都是同步的；
 * 乡镇约 4 万条，按省切成 31 个分片放在 `data/towns/`，只能异步取：
 * 取列表用 `loadTowns`，按代码反查单条用 `findTown`。
 * `findByCode` 只认前三级，传乡镇代码会得到 `undefined`。
 *
 * ## 层级可以跳级
 *
 * 树按实际管辖关系建，某一级缺位时直接跳过：
 * - 直筒子市（东莞、中山、儋州、嘉峪关等）没有区县，镇街直接挂在市下，
 *   此时 `getChildren(市代码)` 为空，`loadTowns(市代码)` 返回镇街
 * - 直辖市与省直辖县级行政区的区县直接挂在省下，不经过市级
 * - 香港、澳门只有省与区县两级，台湾只有省、市、乡镇市区（按区县级存放）
 *
 * 所以调用方不要按固定级数写死流程，改为看返回条目自身的 `level`，
 * 并用 `hasTowns` 判断还要不要再往下取一级。
 *
 * ## 数据来源
 *
 * - 大陆 31 个省级单位：`kakuilan/china_area_mysql` 的 `cnarea_2023`（MIT），
 *   来自国家统计局 2023 年区划，含省市区县乡镇 5 级中的前 4 级
 * - 港澳台：区划代码与名称取 `xiangyuecn/AreaCity-JsSpider-StatsGov`（MIT），
 *   它用的是标准 12 位统计用区划代码；经纬度按名称路径从上面那份数据集匹配
 *
 * ## 经度精度
 *
 * 省、市、区县三级的经纬度都是各自的实际中心点。乡镇级 41350 条里只有 3807 条
 * （9.2%）在源数据中有独立坐标，其余 37543 条与所属区县的坐标相同——其中 36237 条
 * 源数据本身就填的是区县坐标，1306 条源数据为空、由本模块补成上级坐标。
 *
 * 也就是说约九成的乡镇，经度等于所属区县的经度。区县跨度一般在 0.3 度以内，
 * 折算真太阳时约 1 分钟；少数面积大的区县（西部牧区、林区）可达 1 度、约 4 分钟。
 * 带独立坐标的乡镇比例低是免费数据的现状，全国乡镇级坐标只有商业数据集才完整。
 */

import divisions from "../../../../data/region/divisions.json"
import { townShards } from "./data/towns"
import type {
  Region,
  RegionLevel,
  RegionMatch,
  TownIndex,
  TownShard,
} from "./types"

export type { Region, RegionLevel, RegionMatch } from "./types"

/** 数据文件里经纬度的放大倍数 */
const SCALE = 1e4

/** 差值序列还原成代码数组 */
function restoreCodes(deltas: number[], width: number): string[] {
  const out: string[] = []
  let prev = 0
  for (const d of deltas) {
    prev += d
    out.push(String(prev).padStart(width, "0"))
  }
  return out
}

function levelOfCode(code: string): RegionLevel {
  if (code.length === 9) return "town"
  if (code.endsWith("0000")) return "province"
  if (code.endsWith("00")) return "city"
  return "county"
}

function decode(
  data: TownShard,
  width: number,
  level: (code: string) => RegionLevel
): Region[] {
  const codes = restoreCodes(data.codes, width)
  const names = data.names.split("|")
  return codes.map((code, i) => ({
    code,
    name: names[i],
    level: level(code),
    lng: data.lng[i] / SCALE,
    lat: data.lat[i] / SCALE,
  }))
}

interface DivisionIndex {
  byCode: Map<string, Region>
  children: Map<string, Region[]>
  provinces: Region[]
  townCounts: Map<string, number>
}

let index: DivisionIndex | undefined

/**
 * 父级代码
 *
 * 区划代码本身是分级编码，父级可以直接从代码推出来：乡镇取前 6 位，
 * 区县取前 4 位补 `00`，市取前 2 位补 `0000`。推出的市级不存在时（直辖市、
 * 省直辖县级行政区、香港、澳门）再往上退一级到省。
 */
function parentCodeOf(
  code: string,
  exists: (c: string) => boolean
): string | undefined {
  if (code.length === 9) return code.slice(0, 6)
  if (code.endsWith("0000")) return undefined
  const city = code.slice(0, 4) + "00"
  if (code !== city && exists(city)) return city
  return code.slice(0, 2) + "0000"
}

function getIndex(): DivisionIndex {
  if (index) return index
  const list = decode(divisions, 6, levelOfCode)
  const byCode = new Map(list.map((r) => [r.code, r]))
  const children = new Map<string, Region[]>()
  const provinces: Region[] = []
  for (const region of list) {
    if (region.level === "province") {
      provinces.push(region)
      continue
    }
    const parent = parentCodeOf(region.code, (c) => byCode.has(c))
    if (!parent) continue
    const bucket = children.get(parent)
    if (bucket) bucket.push(region)
    else children.set(parent, [region])
  }
  const townCounts = new Map<string, number>()
  list.forEach((region, i) => {
    const count = divisions.townCounts[i]
    if (count > 0) townCounts.set(region.code, count)
  })
  index = { byCode, children, provinces, townCounts }
  return index
}

/** 省、自治区、直辖市、特别行政区，含台湾省。**同步** */
export function getProvinces(): Region[] {
  return [...getIndex().provinces]
}

/**
 * 下一级子区划。**同步**，只覆盖省、市、区县三级
 *
 * 返回空数组有三种情况：该级下确实没有子区划、下一级是乡镇（改用 `loadTowns`）、
 * 代码不存在。用 `hasTowns` 区分第二种。
 */
export function getChildren(code: string): Region[] {
  const bucket = getIndex().children.get(code)
  return bucket ? [...bucket] : []
}

/** 该节点下是否直接挂着乡镇。**同步** */
export function hasTowns(code: string): boolean {
  return getIndex().townCounts.has(code)
}

/** 该节点下直接挂着的乡镇条数，没有则为 0。**同步** */
export function townCount(code: string): number {
  return getIndex().townCounts.get(code) ?? 0
}

/**
 * 按代码查单条。**同步**，只覆盖省、市、区县三级
 *
 * 乡镇代码（9 位）返回 `undefined`，要用 `findTown`
 */
export function findByCode(code: string): Region | undefined {
  return getIndex().byCode.get(code)
}

/**
 * 从省级到直接父级的祖先链。**同步**
 *
 * 祖先一定落在前三级，所以传乡镇代码也不需要加载分片。
 * 拼完整地址：`[...getAncestors(town.code), town]`
 */
export function getAncestors(code: string): Region[] {
  const { byCode } = getIndex()
  const chain: Region[] = []
  let cursor = parentCodeOf(code, (c) => byCode.has(c))
  while (cursor) {
    const region = byCode.get(cursor)
    if (!region) break
    chain.unshift(region)
    cursor = parentCodeOf(region.code, (c) => byCode.has(c))
  }
  return chain
}

interface ShardIndex {
  byCode: Map<string, Region>
  byParent: Map<string, Region[]>
}

const shardCache = new Map<string, Promise<ShardIndex>>()

/** 加载某个省级单位的乡镇分片，同一分片并发调用只会 import 一次 */
function loadShard(provincePrefix: string): Promise<ShardIndex> {
  const cached = shardCache.get(provincePrefix)
  if (cached) return cached
  const loader = townShards[provincePrefix]
  const pending: Promise<ShardIndex> = loader
    ? loader().then(({ default: shard }) => {
        const towns = decode(shard, 9, () => "town")
        const byCode = new Map(towns.map((t) => [t.code, t]))
        const byParent = new Map<string, Region[]>()
        for (const town of towns) {
          const parent = town.code.slice(0, 6)
          const bucket = byParent.get(parent)
          if (bucket) bucket.push(town)
          else byParent.set(parent, [town])
        }
        return { byCode, byParent }
      })
    : Promise.resolve({ byCode: new Map(), byParent: new Map() })
  shardCache.set(provincePrefix, pending)
  return pending
}

/**
 * 某个区县或直筒子市下的乡镇（街道、镇、乡）。**异步**
 *
 * `parentCode` 传 6 位的区县代码，直筒子市与只有两级的港澳传其市级或省级代码。
 * 没有乡镇时直接返回空数组，不会去加载分片。
 */
export async function loadTowns(parentCode: string): Promise<Region[]> {
  if (!hasTowns(parentCode)) return []
  const shard = await loadShard(parentCode.slice(0, 2))
  const bucket = shard.byParent.get(parentCode)
  return bucket ? [...bucket] : []
}

/**
 * 按 9 位代码查乡镇。**异步**，会加载该省的整个分片
 *
 * 只用来把存下来的代码还原成条目，做联动选择请用 `loadTowns`
 */
export async function findTown(code: string): Promise<Region | undefined> {
  if (code.length !== 9) return undefined
  const shard = await loadShard(code.slice(0, 2))
  return shard.byCode.get(code)
}

/**
 * 跨级搜索的乡镇索引
 *
 * 前三级共 4032 条随首屏加载，搜起来是同步的；乡镇 41350 条的名称索引单独放一个
 * 文件（约 210 KB gzip），只在第一次搜索时加载，且只加载一次。索引里不含经纬度，
 * 选中之后用 `findRegion` 按代码取回完整条目，那时只需要加载所在省的那一个分片
 */
let townIndexPromise: Promise<Region[]> | undefined

function loadTownIndex(): Promise<Region[]> {
  if (townIndexPromise) return townIndexPromise
  townIndexPromise = import("../../../../data/region/town-index.json").then(
    ({ default: index }) => {
      const data = index as TownIndex
      const codes = restoreCodes(data.codes, 9)
      const names = data.names.split("|")
      // 索引只服务搜索，经纬度留 0，选中后由 `findRegion` 补齐
      return codes.map((code, i) => ({
        code,
        name: names[i],
        level: "town" as RegionLevel,
        lng: 0,
        lat: 0,
      }))
    },
  )
  return townIndexPromise
}

/** 匹配质量，完全相等最优，其次前缀，最后包含 */
function matchScore(name: string, query: string): number {
  if (name === query) return 3
  if (name.startsWith(query)) return 2
  return name.includes(query) ? 1 : 0
}

/** 层级的排序权重，同分时省在前、乡镇在后 */
const LEVEL_ORDER: Record<RegionLevel, number> = {
  province: 0,
  city: 1,
  county: 2,
  town: 3,
}

function toMatch(region: Region): RegionMatch {
  const ancestors = getAncestors(region.code)
  return {
    code: region.code,
    name: region.name,
    level: region.level,
    fullName: [...ancestors, region].map((r) => r.name).join(" "),
    path: [...ancestors.map((r) => r.code), region.code],
  }
}

export interface SearchOptions {
  /** 最多返回多少条，默认 50 */
  limit?: number
  /** 是否搜乡镇，为 false 时只搜前三级、不加载索引，默认 true */
  includeTowns?: boolean
}

/**
 * 按名称跨级搜索区划。**异步**
 *
 * 四级都会命中，结果按匹配质量排序，同分时省市在前、乡镇在后。
 * 空查询返回空数组，不会触发索引加载
 */
export async function searchRegions(
  query: string,
  options: SearchOptions = {},
): Promise<RegionMatch[]> {
  const keyword = query.trim()
  if (!keyword) return []

  const { limit = 50, includeTowns = true } = options
  const pool = [...decode(divisions, 6, levelOfCode)]
  if (includeTowns) {
    pool.push(...(await loadTownIndex()))
  }

  const scored: Array<{ region: Region; score: number }> = []
  for (const region of pool) {
    const score = matchScore(region.name, keyword)
    if (score > 0) {
      scored.push({ region, score })
    }
  }

  scored.sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score
    const levelGap = LEVEL_ORDER[a.region.level] - LEVEL_ORDER[b.region.level]
    if (levelGap !== 0) return levelGap
    return a.region.code.localeCompare(b.region.code)
  })

  return scored.slice(0, limit).map((item) => toMatch(item.region))
}

/**
 * 按代码取回完整条目，四级都认。**异步**
 *
 * 前三级立即返回，乡镇会加载所在省的分片
 */
export async function findRegion(code: string): Promise<Region | undefined> {
  return code.length === 9 ? findTown(code) : findByCode(code)
}

/** 把代码路径还原成条目数组，供联动面板定位 */
export async function resolvePath(path: readonly string[]): Promise<Region[]> {
  const out: Region[] = []
  for (const code of path) {
    const region = await findRegion(code)
    if (region) out.push(region)
  }
  return out
}
