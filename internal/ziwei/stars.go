package ziwei

// starContext 安星所需的全部生辰要素
type starContext struct {
	yearStem   int
	yearBranch int
	// month 安星所用的农历月，闰月归属已处理
	month int
	day   int
	// hour 时支索引
	hour       int
	lifePalace int
	bodyPalace int
	// forward 阳男阴女
	forward bool
	// yang 阳年生
	yang   bool
	bureau int
}

// starPositions 各类星曜的位置：星名到地支索引
type starPositions struct {
	major     map[string]int
	minor     map[string]int
	adjective map[string]int
}

// ziweiBranchOf 安紫微：取最小的 k 使生日加 k 能被局数整除，商为从寅起数的宫数，
// k 为奇数逆退 k 宫、偶数顺进 k 宫
func ziweiBranchOf(bureau, day int) int {
	k := 0
	for (day+k)%bureau != 0 {
		k++
	}
	quotient := (day + k) / bureau
	base := mod(2+quotient-1, 12)
	if k%2 == 1 {
		return mod(base-k, 12)
	}
	return mod(base+k, 12)
}

// normalize 全部取模到 0 至 11
func normalize(raw map[string]int) map[string]int {
	out := make(map[string]int, len(raw))
	for name, at := range raw {
		out[name] = mod(at, 12)
	}
	return out
}

// placeStars 按安星口诀布全部星曜
func placeStars(ctx starContext) starPositions {
	ys, yb := ctx.yearStem, ctx.yearBranch
	month, day, hour := ctx.month, ctx.day, ctx.hour

	// 紫微逆布天机太阳武曲天同廉贞，天府以寅申轴对称，顺布太阴以下诸曜
	zi := ziweiBranchOf(ctx.bureau, day)
	fu := mod(4-zi, 12)
	major := normalize(map[string]int{
		"紫微": zi, "天机": zi - 1, "太阳": zi - 3, "武曲": zi - 4, "天同": zi - 5, "廉贞": zi - 8,
		"天府": fu, "太阴": fu + 1, "贪狼": fu + 2, "巨门": fu + 3, "天相": fu + 4, "天梁": fu + 5, "七杀": fu + 6, "破军": fu + 10,
	})

	lu := luCun[ys]
	wenChang := 10 - hour
	wenQu := 4 + hour
	zuoFu := 4 + (month - 1)
	youBi := 10 - (month - 1)
	minor := normalize(map[string]int{
		"左辅": zuoFu, "右弼": youBi, "文昌": wenChang, "文曲": wenQu,
		"天魁": tianKui[ys], "天钺": tianYue[ys], "禄存": lu, "天马": tianMa[yb%4],
		"火星": fireStart[yb%4] + hour, "铃星": bellStart[yb%4] + hour,
		"擎羊": lu + 1, "陀罗": lu - 1, "地空": 11 - hour, "地劫": 11 + hour,
	})

	// 截空、旬空各占两宫：阳年生人阳宫为正空，阴年生人阴宫为正空
	jieKong := jieKongStart[ys%5]
	xunHead := mod(yb-ys, 12)
	jieKongMain, jieKongSide := jieKong+1, jieKong
	xunKongMain, xunKongSide := xunHead+11, xunHead+10
	if ctx.yang {
		jieKongMain, jieKongSide = jieKong, jieKong+1
		xunKongMain, xunKongSide = xunHead+10, xunHead+11
	}
	// 中州派：阳男阴女天伤在交友宫、天使在疾厄宫，阴男阳女互换
	tianShang, tianShi := ctx.lifePalace-5, ctx.lifePalace-7
	if ctx.forward {
		tianShang, tianShi = ctx.lifePalace-7, ctx.lifePalace-5
	}
	// 大耗在年支对宫，阳支顺一位、阴支逆一位
	daHao := yb + 6 - 1
	if yb%2 == 0 {
		daHao = yb + 6 + 1
	}

	adjective := normalize(map[string]int{
		"天官": tianGuan[ys], "天福": tianFu[ys], "天厨": tianChu[ys],
		"天刑": 9 + (month - 1), "天姚": 1 + (month - 1),
		"解神": jieShen[month-1], "天巫": tianWu[(month-1)%4], "天月": tianYueMonth[month-1], "阴煞": 2 - 2*(month-1),
		"台辅": wenQu + 2, "封诰": wenQu - 2,
		"天空": yb + 1, "天哭": 6 - yb, "天虚": 6 + yb, "龙池": 4 + yb, "凤阁": 10 - yb, "红鸾": 3 - yb, "天喜": 9 - yb,
		"孤辰": guChen[yb], "寡宿": guaSu[yb], "蜚廉": feiLian[yb],
		"破碎": poSui[yb%3], "华盖": huaGai[yb%4], "咸池": xianChi[yb%4], "劫煞": jieSha[yb%4],
		"大耗": daHao, "天德": 9 + yb, "月德": 5 + yb, "年解": 10 - yb,
		"天才": ctx.lifePalace + yb, "天寿": ctx.bodyPalace + yb,
		"三台": zuoFu + (day - 1), "八座": youBi - (day - 1),
		"恩光": wenChang + (day - 1) - 1, "天贵": wenQu + (day - 1) - 1,
		"截空": jieKongMain, "截空傍": jieKongSide, "旬空": xunKongMain, "旬空傍": xunKongSide,
		"天伤": tianShang, "天使": tianShi,
	})

	return starPositions{major: major, minor: minor, adjective: adjective}
}
