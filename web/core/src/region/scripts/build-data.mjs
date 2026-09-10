/**
 * 生成 `src/lib/region/data/` 下的行政区划数据
 *
 * 数据源（均为开源数据集，需先手工下载解压到 `--src` 指向的目录）：
 * 1. `cnarea_2023.sql`（kakuilan/china_area_mysql，MIT）
 *    国家统计局 2023 年 5 级区划，带经纬度。本脚本只取 1~4 级（省市区县乡镇），
 *    丢弃第 5 级（村/社区，约 63 万条）。该库中港澳台记录的 `area_code` 是 13 位
 *    自造码，只取其经纬度，编码与层级不用
 * 2. `ok_data_level4.csv`（xiangyuecn/AreaCity-JsSpider-StatsGov，MIT）
 *    省市区县乡镇 4 级区划，港澳台用标准 12 位统计用区划代码。本脚本只取其中的
 *    港澳台部分，补齐 `cnarea_2023.sql` 里编码不可用的这三个省级单位
 *
 * 下载与解压（macOS 自带的 bsdtar 能解 7z 与 zip）：
 *
 * ```sh
 * cd <解压目录>
 * curl -sLO https://raw.githubusercontent.com/kakuilan/china_area_mysql/master/cnarea_2023.sql.zip
 * curl -sLO https://github.com/xiangyuecn/AreaCity-JsSpider-StatsGov/releases/download/2025.251231.260403/ok_data_level3-4.csv.7z
 * bsdtar -xf cnarea_2023.sql.zip
 * bsdtar -xf ok_data_level3-4.csv.7z
 * ```
 *
 * 用法：node build-data.mjs --src <解压目录>
 */

import fs from "node:fs"
import path from "node:path"

const args = process.argv.slice(2)
const srcIndex = args.indexOf("--src")
if (srcIndex < 0 || !args[srcIndex + 1]) {
  throw new Error("必须用 --src <目录> 指定数据源所在目录")
}
const SRC = args[srcIndex + 1]
// 数据本体是语言中立的 JSON，Web 与 Go 服务端读同一份
const DATA_OUT = path.resolve(import.meta.dirname, "../../../../../data/region")
// 只有乡镇分片的动态 import 映射需要是 TS，Vite 要求路径静态可分析
const SRC_OUT = path.resolve(import.meta.dirname, "../data")

/** 经纬度放大倍数，保留 4 位小数 */
const SCALE = 1e4

/** 层级序号，与 `RegionLevel` 一一对应 */
const PROVINCE = 1
const CITY = 2
const COUNTY = 3
const TOWN = 4

/**
 * 统计局给「市辖区」「县」「省直辖县级行政区划」这类没有实体的市级节点占了位，
 * 直辖市与省直辖县级市的区县实际直接归省管，生成时把这些占位节点摘掉
 */
const PLACEHOLDER_CITY_NAMES = new Set([
  "市辖区",
  "市辖县",
  "县",
  "省直辖县级行政区划",
  "自治区直辖县级行政区划",
])

// ---------------------------------------------------------------- 读取 cnarea

const QUOTED = String.raw`'((?:[^'\\]|\\.)*)'`
const CNAREA_ROW = new RegExp(
  String.raw`VALUES \((\d+), (\d+), (\d+), (\d+), (\d+), ` +
    [QUOTED, QUOTED, QUOTED, QUOTED, QUOTED].join(", ") +
    String.raw`, (-?[\d.]+), (-?[\d.]+)\);`
)

function readCnarea() {
  const file = path.join(SRC, "cnarea_2023.sql")
  const mainland = []
  const foreignCode = []
  let unparsed = 0
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    if (!line) continue
    const m = CNAREA_ROW.exec(line)
    if (!m) {
      unparsed++
      continue
    }
    const level = Number(m[2])
    if (level > 4) continue
    const row = {
      level,
      parent: m[3],
      code: m[4],
      name: m[7],
      lng: Number(m[11]),
      lat: Number(m[12]),
    }
    if (row.code.length === 12) mainland.push(row)
    else foreignCode.push(row)
  }
  if (unparsed > 0) throw new Error(`cnarea_2023.sql 有 ${unparsed} 行没能解析`)
  return { mainland, foreignCode }
}

// ------------------------------------------------------- 读取 AreaCity 港澳台

function parseCsvLine(line) {
  const cells = []
  let cur = ""
  let quoted = false
  for (const c of line) {
    if (quoted) {
      if (c === '"') quoted = false
      else cur += c
    } else if (c === '"') quoted = true
    else if (c === ",") {
      cells.push(cur)
      cur = ""
    } else cur += c
  }
  cells.push(cur)
  return cells
}

function readAreaCityHmt() {
  const file = path.join(SRC, "ok_data_level4.csv")
  const lines = fs.readFileSync(file, "utf8").replace(/^﻿/, "").split(/\r?\n/)
  const header = lines[0].split(",")
  const col = (name) => header.indexOf(name)
  const rows = []
  for (const line of lines.slice(1)) {
    if (!line) continue
    const c = parseCsvLine(line)
    const extId = c[col("ext_id")]
    if (!/^(71|81|82)\d{10}$/.test(extId)) continue
    rows.push({
      id: c[col("id")],
      pid: c[col("pid")],
      deep: Number(c[col("deep")]),
      extId,
      name: c[col("ext_name")],
    })
  }
  return rows
}

// -------------------------------------------------------------------- 构造树

/** 由 6 位或 9 位区划代码反推层级 */
function levelOfCode(code) {
  if (code.length === 9) return TOWN
  if (code.endsWith("0000")) return PROVINCE
  if (code.endsWith("00")) return CITY
  return COUNTY
}

const nodes = new Map()

function addNode(code, name, level, lng, lat) {
  if (nodes.has(code)) return
  if (levelOfCode(code) !== level) {
    throw new Error(`代码 ${code}（${name}）与层级 ${level} 不匹配`)
  }
  nodes.set(code, { code, name, level, lng, lat })
}

const { mainland, foreignCode } = readCnarea()

// 大陆：12 位码取前 6 位（省市区县）或前 9 位（乡镇）
const codeOfCnarea = (row) => (row.level === TOWN ? row.code.slice(0, 9) : row.code.slice(0, 6))
const cnareaByCode = new Map(mainland.map((r) => [r.code, r]))
const collapsed = new Set()
for (const row of mainland) {
  if (row.level === CITY && PLACEHOLDER_CITY_NAMES.has(row.name)) {
    collapsed.add(row.code)
    continue
  }
  addNode(codeOfCnarea(row), row.name, row.level, row.lng, row.lat)
}

// 港澳台：AreaCity 的 12 位码里第 7~9 位为 000 的其实是区县级，不是乡镇级
const hmt = readAreaCityHmt()
const hmtById = new Map(hmt.map((r) => [r.id, r]))
const codeOfHmt = (row) =>
  row.extId.slice(6, 9) === "000" ? row.extId.slice(0, 6) : row.extId.slice(0, 9)
const hmtPath = (row) => {
  const names = [row.name]
  let cur = row
  while (hmtById.has(cur.pid)) {
    cur = hmtById.get(cur.pid)
    names.unshift(cur.name)
  }
  return names
}

// cnarea 的港澳台记录按「全名路径」建索引，只借用经纬度
const hmtGeo = new Map()
/** 同一父级下的兄弟节点，供名称写法不同时兜底 */
const hmtSiblings = new Map()
{
  const byCode = new Map(foreignCode.map((r) => [r.code, r]))
  for (const row of foreignCode) {
    const names = [row.name]
    let cur = row
    while (byCode.has(cur.parent)) {
      cur = byCode.get(cur.parent)
      names.unshift(cur.name)
    }
    // 香港、澳门在 cnarea 里多了「香港岛」「澳门半岛」这类中间层，去掉后与标准区划对齐
    const key = names.filter((n) => !/^(香港岛|九龙|新界|澳门半岛|氹仔岛|路环岛)$/.test(n))
    const geo = { lng: row.lng, lat: row.lat }
    hmtGeo.set(key.join("/"), geo)
    const parentKey = key.slice(0, -1).join("/")
    if (!hmtSiblings.has(parentKey)) hmtSiblings.set(parentKey, [])
    hmtSiblings.get(parentKey).push({ name: key[key.length - 1], ...geo })
  }
}

/**
 * 名称只差一个字时按兄弟节点兜底
 *
 * 台湾乡镇在两个数据集里存在繁简写法差异（崙／仑、恆／恒），
 * 同一父级下字数相同且只差一个字的候选唯一时认为是同一个地方
 */
function matchBySibling(names) {
  const target = names[names.length - 1]
  const siblings = hmtSiblings.get(names.slice(0, -1).join("/")) ?? []
  const hits = siblings.filter((s) => {
    if (s.name.length !== target.length) return false
    let diff = 0
    for (let i = 0; i < target.length; i++) if (s.name[i] !== target[i]) diff++
    return diff === 1
  })
  return hits.length === 1 ? hits[0] : undefined
}

let hmtMatched = 0
let hmtFuzzy = 0
const hmtUnmatched = []
const hmtSeen = new Set()
for (const row of hmt) {
  const code = codeOfHmt(row)
  if (nodes.has(code) || hmtSeen.has(code)) continue
  hmtSeen.add(code)
  // 港澳的省、市、区县三级同码，路径里会出现重复名，去重后再查经纬度
  const names = [...new Set(hmtPath(row))]
  let geo = hmtGeo.get(names.join("/"))
  if (geo) hmtMatched++
  else {
    geo = matchBySibling(names)
    if (geo) hmtFuzzy++
    else hmtUnmatched.push(names.join("/"))
  }
  addNode(code, row.name, levelOfCode(code), geo?.lng ?? 0, geo?.lat ?? 0)
}

// ---------------------------------------------------- 父级推导（与运行时一致）

function parentCodeOf(code) {
  if (code.length === 9) return code.slice(0, 6)
  if (code.endsWith("0000")) return undefined
  const city = code.slice(0, 4) + "00"
  if (code !== city && nodes.has(city)) return city
  return code.slice(0, 2) + "0000"
}

// 校验推导出的父级与数据源里的父级一致
let parentMismatch = 0
for (const row of mainland) {
  if (row.level === PROVINCE) continue
  const code = codeOfCnarea(row)
  if (!nodes.has(code)) continue
  let parentRow = cnareaByCode.get(row.parent)
  while (parentRow && collapsed.has(parentRow.code)) {
    parentRow = cnareaByCode.get(parentRow.parent)
  }
  const expected = parentRow ? codeOfCnarea(parentRow) : undefined
  if (parentCodeOf(code) !== expected) {
    parentMismatch++
    if (parentMismatch <= 10) {
      console.log(`父级不一致: ${code} ${row.name} 推导=${parentCodeOf(code)} 实际=${expected}`)
    }
  }
}
if (parentMismatch > 0) throw new Error(`父级推导与数据源不一致 ${parentMismatch} 条`)

// 每个节点都要能挂到已存在的父级上
for (const node of nodes.values()) {
  if (node.level === PROVINCE) continue
  const parent = parentCodeOf(node.code)
  if (!parent || !nodes.has(parent)) {
    throw new Error(`节点 ${node.code} ${node.name} 找不到父级（推导为 ${parent}）`)
  }
}

// ------------------------------------------------------------ 缺失坐标继承父级

const sorted = [...nodes.values()].sort((a, b) => (a.code < b.code ? -1 : 1))
let inherited = 0
for (const node of sorted) {
  if (node.lng && node.lat) continue
  const parent = nodes.get(parentCodeOf(node.code) ?? "")
  if (parent && parent.lng && parent.lat) {
    node.lng = parent.lng
    node.lat = parent.lat
    node.inherited = true
    inherited++
  }
}
const stillEmpty = sorted.filter((n) => !n.lng || !n.lat)
if (stillEmpty.length > 0) {
  throw new Error(`仍有 ${stillEmpty.length} 个节点缺坐标，例如 ${stillEmpty[0].code}`)
}

// ---------------------------------------------------------------- 序列化输出

const divisions = sorted.filter((n) => n.level !== TOWN)
const towns = sorted.filter((n) => n.level === TOWN)

const townCount = new Map()
for (const t of towns) {
  const p = parentCodeOf(t.code)
  townCount.set(p, (townCount.get(p) ?? 0) + 1)
}

for (const node of sorted) {
  if (node.name.includes("|")) throw new Error(`名称含分隔符: ${node.code} ${node.name}`)
}

/** 代码升序排列后转成差值序列，首项为绝对值 */
function deltas(codes) {
  const out = []
  let prev = 0
  for (const c of codes) {
    out.push(c - prev)
    prev = c
  }
  return out
}

const round = (v) => Math.round(v * SCALE)

function serializeGroup(list) {
  return {
    codes: deltas(list.map((n) => Number(n.code))),
    names: list.map((n) => n.name).join("|"),
    lng: list.map((n) => round(n.lng)),
    lat: list.map((n) => round(n.lat)),
  }
}

const HEADER = `// 由 scripts/build-data.mjs 生成，不要手工修改\n`

function writeJson(file, value) {
  const target = path.join(DATA_OUT, file)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, JSON.stringify(value))
}

function writeSource(file, body) {
  const target = path.join(SRC_OUT, file)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, HEADER + body)
}

// 前三级：省、市、区县
{
  const g = serializeGroup(divisions)
  writeJson("divisions.json", {
    ...g,
    townCounts: divisions.map((n) => townCount.get(n.code) ?? 0),
  })
}

// 乡镇：按省分片，Web 按需加载，Go 服务端启动时全量读入
const shards = new Map()
for (const t of towns) {
  const key = t.code.slice(0, 2)
  if (!shards.has(key)) shards.set(key, [])
  shards.get(key).push(t)
}
const shardKeys = [...shards.keys()].sort()
for (const key of shardKeys) {
  writeJson(path.join("towns", `${key}.json`), serializeGroup(shards.get(key)))
}

// 乡镇的跨级搜索索引：只要名称与代码，经纬度等选中后再从分片里取
{
  const flat = shardKeys.flatMap((key) => shards.get(key))
  writeJson("town-index.json", {
    codes: deltas(flat.map((n) => Number(n.code))),
    names: flat.map((n) => n.name).join("|"),
  })
}

{
  const entries = shardKeys
    .map((k) => `  "${k}": () => import("../../../../../data/region/towns/${k}.json"),`)
    .join("\n")
  const body =
    `\nimport type { TownShard } from "../types"\n\n` +
    `/** 乡镇分片按省级代码前两位切分，值是动态 import，不进首屏 chunk */\n` +
    `export const townShards: Record<\n` +
    `  string,\n` +
    `  () => Promise<{ default: TownShard }>\n` +
    `> = {\n` +
    `${entries}\n}\n`
  writeSource("towns.ts", body)
}

for (const file of ["divisions.json"]) {
  console.log(file, fs.statSync(path.join(DATA_OUT, file)).size, "字节")
}
let shardTotal = 0
for (const key of shardKeys) {
  shardTotal += fs.statSync(path.join(DATA_OUT, "towns", `${key}.json`)).size
}
console.log("乡镇分片合计", shardTotal, "字节，单片均值", Math.round(shardTotal / shardKeys.length))
