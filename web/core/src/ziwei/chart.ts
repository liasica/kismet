/**
 * 紫微斗数排盘主流程
 *
 * `ziweiPaipan(input)` 是本模块唯一的入口，纯函数、不碰网络与 DOM，结果可直接 `JSON.stringify`
 */

import { EarthBranch } from "tyme4ts"

import { EARTH_BRANCHES, HEAVEN_STEMS } from "../birth/constants"
import { correctTime } from "../birth/time"
import type { Location, PaipanInput } from "../birth/types"
import { brightnessOf } from "./data/brightness"
import {
  ADJECTIVE_STARS,
  BODY_MASTER,
  branchIndex,
  LIFE_MASTER,
  MAJOR_STARS,
  MINOR_STARS,
  mod,
  PALACE_NAMES,
  stemIndex,
} from "./data/tables"
import {
  boShiOf,
  changShengOf,
  decadesOf,
  minorLimitAgesOf,
  mutationsOf,
} from "./fortune"
import { lunarBirthOf } from "./lunar"
import { bodyPalaceOf, bureauOf, lifePalaceOf, palaceStemOf } from "./palaces"
import { placeStars } from "./stars"
import type {
  ZiweiChart,
  ZiweiMutation,
  ZiweiOptions,
  ZiweiPalace,
  ZiweiStar,
} from "./types"

export const DEFAULT_ZIWEI_OPTIONS: ZiweiOptions = {
  useTrueSolarTime: false,
  useDaylightSaving: false,
  lateZiAsNextDay: false,
  maxAge: 100,
}

/** 合并选项，`undefined` 的键当作没传，未知键忽略 */
export function resolveZiweiOptions(
  partial?: Partial<ZiweiOptions>
): ZiweiOptions {
  const merged: ZiweiOptions = { ...DEFAULT_ZIWEI_OPTIONS }
  if (!partial) return merged
  for (const key of Object.keys(
    DEFAULT_ZIWEI_OPTIONS
  ) as (keyof ZiweiOptions)[]) {
    const value = partial[key]
    if (value !== undefined) {
      merged[key] = value as never
    }
  }
  return merged
}

/** 落在某宫的星，按清单顺序，带庙陷与生年四化 */
function starsAt(
  names: readonly string[],
  positions: Record<string, number>,
  branch: number,
  mutations: ZiweiMutation[]
): ZiweiStar[] {
  return names
    .filter((name) => positions[name] === branch)
    .map((name) => {
      const star: ZiweiStar = { name }
      const brightness = brightnessOf(name, branch)
      if (brightness) star.brightness = brightness
      const mutation = mutations.find((m) => m.star === name)?.mutation
      if (mutation) star.mutation = mutation
      return star
    })
}

export function ziweiPaipan(
  input: PaipanInput,
  partial?: Partial<ZiweiOptions>
): ZiweiChart {
  const options = resolveZiweiOptions(partial)
  const { effective, info } = correctTime(input, options)
  const lunar = lunarBirthOf(effective, options.lateZiAsNextDay)

  const yearStem = stemIndex(lunar.yearSixtyCycle[0]!)
  const yearBranch = branchIndex(lunar.yearSixtyCycle[1]!)
  const yang = yearStem % 2 === 0
  const male = input.gender === "male"
  // 阳男阴女顺行
  const forward = yang === male

  const lifePalace = lifePalaceOf(lunar.effectiveMonth, lunar.hourBranchIndex)
  const bodyPalace = bodyPalaceOf(lunar.effectiveMonth, lunar.hourBranchIndex)
  const bureau = bureauOf(palaceStemOf(yearStem, lifePalace), lifePalace)

  const positions = placeStars({
    yearStem,
    yearBranch,
    month: lunar.effectiveMonth,
    day: lunar.day,
    hour: lunar.hourBranchIndex,
    lifePalace,
    bodyPalace,
    forward,
    yang,
    bureau: bureau.number,
  })
  const mutations = mutationsOf(yearStem)
  const changSheng = changShengOf(bureau.number, forward)
  const boShi = boShiOf(positions.minor["禄存"]!, forward)
  const decades = decadesOf(lifePalace, forward, bureau.number, lunar.year)
  const minorLimits = minorLimitAgesOf(yearBranch, male, options.maxAge)

  const palaces: ZiweiPalace[] = EARTH_BRANCHES.map((branch, b) => {
    const index = mod(lifePalace - b, 12)
    const stem = HEAVEN_STEMS[palaceStemOf(yearStem, b)]!
    return {
      index,
      name: PALACE_NAMES[index]!,
      branch,
      stem,
      sixtyCycle: stem + branch,
      isBodyPalace: b === bodyPalace,
      majorStars: starsAt(MAJOR_STARS, positions.major, b, mutations),
      minorStars: starsAt(MINOR_STARS, positions.minor, b, mutations),
      adjectiveStars: starsAt(
        ADJECTIVE_STARS,
        positions.adjective,
        b,
        mutations
      ),
      changSheng: changSheng[b]!,
      boShi: boShi[b]!,
      decade: decades[b]!,
      minorLimitAges: minorLimits[b]!,
    }
  })

  const location: Location | undefined =
    input.location !== undefined ||
    input.longitude !== undefined ||
    input.latitude !== undefined
      ? {
          name: input.location,
          longitude: input.longitude,
          latitude: input.latitude,
        }
      : undefined

  return {
    name: input.name,
    gender: input.gender,
    input,
    options,
    location,
    time: {
      ...info,
      // 生肖按农历年支，与八字按立春分界不同
      zodiac: EarthBranch.fromName(EARTH_BRANCHES[yearBranch]!)
        .getZodiac()
        .getName(),
    },
    lunar: {
      year: lunar.year,
      yearSixtyCycle: lunar.yearSixtyCycle,
      month: lunar.month,
      leap: lunar.leap,
      day: lunar.day,
      effectiveMonth: lunar.effectiveMonth,
      hourBranch: EARTH_BRANCHES[lunar.hourBranchIndex]!,
      text: lunar.text,
    },
    yearStem: HEAVEN_STEMS[yearStem]!,
    yearBranch: EARTH_BRANCHES[yearBranch]!,
    yang,
    forward,
    lifePalace: EARTH_BRANCHES[lifePalace]!,
    bodyPalace: EARTH_BRANCHES[bodyPalace]!,
    bureau,
    lifeMaster: LIFE_MASTER[yearBranch]!,
    bodyMaster: BODY_MASTER[yearBranch]!,
    mutations,
    palaces,
  }
}
