// 由 scripts/build-data.mjs 生成，不要手工修改

import type { TownShard } from "../types"

/** 乡镇分片按省级代码前两位切分，值是动态 import，不进首屏 chunk */
export const townShards: Record<
  string,
  () => Promise<{ default: TownShard }>
> = {
  "11": () => import("../../../../../data/region/towns/11.json"),
  "12": () => import("../../../../../data/region/towns/12.json"),
  "13": () => import("../../../../../data/region/towns/13.json"),
  "14": () => import("../../../../../data/region/towns/14.json"),
  "15": () => import("../../../../../data/region/towns/15.json"),
  "21": () => import("../../../../../data/region/towns/21.json"),
  "22": () => import("../../../../../data/region/towns/22.json"),
  "23": () => import("../../../../../data/region/towns/23.json"),
  "31": () => import("../../../../../data/region/towns/31.json"),
  "32": () => import("../../../../../data/region/towns/32.json"),
  "33": () => import("../../../../../data/region/towns/33.json"),
  "34": () => import("../../../../../data/region/towns/34.json"),
  "35": () => import("../../../../../data/region/towns/35.json"),
  "36": () => import("../../../../../data/region/towns/36.json"),
  "37": () => import("../../../../../data/region/towns/37.json"),
  "41": () => import("../../../../../data/region/towns/41.json"),
  "42": () => import("../../../../../data/region/towns/42.json"),
  "43": () => import("../../../../../data/region/towns/43.json"),
  "44": () => import("../../../../../data/region/towns/44.json"),
  "45": () => import("../../../../../data/region/towns/45.json"),
  "46": () => import("../../../../../data/region/towns/46.json"),
  "50": () => import("../../../../../data/region/towns/50.json"),
  "51": () => import("../../../../../data/region/towns/51.json"),
  "52": () => import("../../../../../data/region/towns/52.json"),
  "53": () => import("../../../../../data/region/towns/53.json"),
  "54": () => import("../../../../../data/region/towns/54.json"),
  "61": () => import("../../../../../data/region/towns/61.json"),
  "62": () => import("../../../../../data/region/towns/62.json"),
  "63": () => import("../../../../../data/region/towns/63.json"),
  "64": () => import("../../../../../data/region/towns/64.json"),
  "65": () => import("../../../../../data/region/towns/65.json"),
}
