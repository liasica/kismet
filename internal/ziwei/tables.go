package ziwei

// 中州派安星查表数据，全部出自《中州派紫微斗数初级讲义》的安星口诀与安星简表。
// 地支索引子 0 至亥 11，天干索引甲 0 至癸 9，与 web/core/src/ziwei/data/tables.ts 逐项对应

var heavenStems = []string{"甲", "乙", "丙", "丁", "戊", "己", "庚", "辛", "壬", "癸"}

var earthBranches = []string{"子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"}

// palaceNames 十二宫自命宫逆布的名字
var palaceNames = []string{
	"命宫", "兄弟宫", "夫妻宫", "子女宫", "财帛宫", "疾厄宫",
	"迁移宫", "交友宫", "事业宫", "田宅宫", "福德宫", "父母宫",
}

var majorStars = []string{
	"紫微", "天机", "太阳", "武曲", "天同", "廉贞", "天府",
	"太阴", "贪狼", "巨门", "天相", "天梁", "七杀", "破军",
}

var minorStars = []string{
	"左辅", "右弼", "文昌", "文曲", "天魁", "天钺", "禄存",
	"天马", "火星", "铃星", "擎羊", "陀罗", "地空", "地劫",
}

// adjectiveStars 杂曜的固定表序
var adjectiveStars = []string{
	"天官", "天福", "天厨", "天刑", "天姚", "解神", "天巫", "天月", "阴煞",
	"台辅", "封诰", "天空", "天哭", "天虚", "龙池", "凤阁", "红鸾", "天喜",
	"孤辰", "寡宿", "蜚廉", "破碎", "华盖", "咸池", "劫煞", "大耗", "天德",
	"月德", "年解", "天才", "天寿", "三台", "八座", "恩光", "天贵",
	"截空", "截空傍", "旬空", "旬空傍", "天伤", "天使",
}

// mod 非负取模
func mod(n, m int) int {
	return ((n % m) + m) % m
}

// branchIndex 地支名转索引，找不到返回 -1
func branchIndex(name string) int {
	for i, b := range earthBranches {
		if b == name {
			return i
		}
	}
	return -1
}

// stemIndex 天干名转索引，找不到返回 -1
func stemIndex(name string) int {
	for i, s := range heavenStems {
		if s == name {
			return i
		}
	}
	return -1
}

// branches 把一串地支转成索引切片
func branches(row string) []int {
	out := make([]int, 0, 12)
	for _, ch := range row {
		out = append(out, branchIndex(string(ch)))
	}
	return out
}

// 年干系，索引为天干
var (
	luCun    = branches("寅卯巳午巳午申酉亥子")
	tianKui  = branches("丑子亥亥丑子丑午卯卯")
	tianYue  = branches("未申酉酉未申未寅巳巳")
	tianGuan = branches("未辰巳寅卯酉亥酉戌午")
	tianFu   = branches("酉申子亥卯寅午巳午巳")
	tianChu  = branches("巳午子巳午申寅午酉亥")
	// jieKongStart 截空两宫的起点，索引为天干 mod 5
	jieKongStart = branches("申午辰寅子")
	liuChang     = branches("巳午申酉申酉亥子寅卯")
	liuQu        = branches("酉申午巳午巳卯寅子亥")
)

var mutationNames = []string{"禄", "权", "科", "忌"}

// mutationTable 中州派四化，索引为天干，内层依禄权科忌
var mutationTable = [][]string{
	{"廉贞", "破军", "武曲", "太阳"},
	{"天机", "天梁", "紫微", "太阴"},
	{"天同", "天机", "文昌", "廉贞"},
	{"太阴", "天同", "天机", "巨门"},
	{"贪狼", "太阴", "太阳", "天机"},
	{"武曲", "贪狼", "天梁", "文曲"},
	{"太阳", "武曲", "天府", "天同"},
	{"巨门", "太阳", "文曲", "文昌"},
	{"天梁", "紫微", "天府", "武曲"},
	{"破军", "巨门", "太阴", "贪狼"},
}

// 年支系，索引为地支
var (
	feiLian    = branches("申酉戌巳午未寅卯辰亥子丑")
	guChen     = branches("寅寅巳巳巳申申申亥亥亥寅")
	guaSu      = branches("戌戌丑丑丑辰辰辰未未未戌")
	lifeMaster = []string{"贪狼", "巨门", "禄存", "文曲", "廉贞", "武曲", "破军", "武曲", "廉贞", "文曲", "禄存", "巨门"}
	bodyMaster = []string{"火星", "天相", "天梁", "天同", "文昌", "天机", "火星", "天相", "天梁", "天同", "文昌", "天机"}
)

// 三合局，索引为年支 mod 4：0 申子辰 1 巳酉丑 2 寅午戌 3 亥卯未
var (
	tianMa          = branches("寅亥申巳")
	jieSha          = branches("巳寅亥申")
	huaGai          = branches("辰丑戌未")
	xianChi         = branches("酉午卯子")
	fireStart       = branches("寅卯丑酉")
	bellStart       = branches("戌戌卯戌")
	minorLimitStart = branches("戌未辰丑")
	generalStart    = branches("子酉午卯")
	// poSui 破碎，索引为年支 mod 3
	poSui = branches("巳丑酉")
)

// 月系，索引为月份减一
var (
	jieShen      = branches("申申戌戌子子寅寅辰辰午午")
	tianWu       = branches("巳申寅亥")
	tianYueMonth = branches("戌巳辰寅未卯亥未寅午戌寅")
)

var changSheng = []string{"长生", "沐浴", "冠带", "临官", "帝旺", "衰", "病", "死", "墓", "绝", "胎", "养"}

// changShengStart 长生的起点，键为局数：金生巳 木生亥 火生寅 水土生申
var changShengStart = map[int]int{2: 8, 3: 11, 4: 5, 5: 8, 6: 2}

var boShi = []string{"博士", "力士", "青龙", "小耗", "将军", "奏书", "飞廉", "喜神", "病符", "大耗", "伏兵", "官府"}

var suiQian = []string{"岁建", "晦气", "丧门", "贯索", "官符", "小耗", "岁破", "龙德", "白虎", "天德", "吊客", "病符"}

var jiangQian = []string{"将星", "攀鞍", "岁驿", "息神", "华盖", "劫煞", "灾煞", "天煞", "指背", "咸池", "月煞", "亡神"}

// nayinElements 六十纳音的五行：天干分五组，地支分三组（子丑午未、寅卯申酉、辰巳戌亥）
var nayinElements = [][]string{
	{"金", "水", "火"},
	{"水", "火", "土"},
	{"火", "土", "木"},
	{"土", "木", "金"},
	{"木", "金", "水"},
}

var bureauNumber = map[string]int{"水": 2, "木": 3, "金": 4, "土": 5, "火": 6}

var bureauName = map[int]string{2: "水二局", 3: "木三局", 4: "金四局", 5: "土五局", 6: "火六局"}
