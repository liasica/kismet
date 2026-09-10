package bazi

import "math"

// 均时差
//
// 算法出处：Jean Meeus, `Astronomical Algorithms` 2nd ed.
//   - 均时差主式取第 28 章式 (28.1)：E = L0 - 0.0057183 - α + Δψ·cos ε
//   - 太阳几何平黄经 L0 用式 (25.2)，平近点角 M 用式 (25.3)，中心差 C 用第 25 章
//   - 视黄经用式 (25.9)，含光行差常数项与黄经章动主项
//   - 平黄赤交角 ε0 用式 (22.2)，真交角加上交角章动主项 0.00256·cos Ω
//
// 这套公式是自包含的，不依赖任何天文级数表。这一点是刻意的：本服务要排出与 Web 端
// 逐位相同的盘，而 tyme4go 没有导出寿星天文历的太阳黄经函数，两边只有共用同一套
// 自包含公式才能保证一致。TS 侧的实现在 web/core/src/bazi/equation-of-time.ts，
// 两份代码的公式、常量与运算顺序必须保持一致
//
// 精度：对 Meeus 书中例 28.1（1992-10-13.0）算得 +13m42.0s，印刷值 +13m42.6s；
// 与寿星天文历级数逐日比对六个年份，最大相差 2.02 秒。真太阳时只取到分钟，
// 秒级差异只在秒位恰好落在取整边界时才影响结果
//
// 力学时与世界时之差 ΔT 未参与计算：均时差每天变化约 20 秒，1990 年的 ΔT 约 57 秒，
// 折合影响 0.013 秒，远小于本算法自身的误差

// j2000 J2000.0 历元的儒略日
const j2000 = 2451545

// daysPerCentury 一个儒略世纪的天数
const daysPerCentury = 36525

const radPerDeg = math.Pi / 180
const degPerRad = 180 / math.Pi

// BeijingMeridian 北京时间的标准经线
const BeijingMeridian = 120

// MinutesPerDegree 地球自转 1 度对应的时间分钟数
const MinutesPerDegree = 4

// beijingUTCOffsetHours 北京时间相对世界时的小时数
const beijingUTCOffsetHours = 8

// julianDay 公历日期转儒略日，时刻按世界时解释
//
// Meeus, `Astronomical Algorithms` 2nd ed., 第 7 章
func julianDay(year, month, day int, hour, minute float64) float64 {
	y := year
	m := month
	if m <= 2 {
		y--
		m += 12
	}
	a := math.Floor(float64(y) / 100)
	b := 2 - a + math.Floor(a/4)
	return math.Floor(365.25*float64(y+4716)) +
		math.Floor(30.6001*float64(m+1)) +
		float64(day) +
		(hour+minute/60)/24 +
		b -
		1524.5
}

// normalizeDegrees 角度归一化到 [0, 360)
func normalizeDegrees(degrees float64) float64 {
	r := math.Mod(degrees, 360)
	if r < 0 {
		r += 360
	}
	return r
}

// wrapDegrees 角度归一化到 [-180, 180)
func wrapDegrees(degrees float64) float64 {
	return normalizeDegrees(degrees+180) - 180
}

// equationOfTimeAt 由儒略日（世界时）算均时差，单位分钟
func equationOfTimeAt(jd float64) float64 {
	t := (jd - j2000) / daysPerCentury

	// 太阳几何平黄经与平近点角，度
	meanLongitude := 280.46646 + t*(36000.76983+t*0.0003032)
	meanAnomaly := (357.52911 + t*(35999.05029-t*0.0001537)) * radPerDeg

	// 中心差
	center := (1.914602-t*(0.004817+t*0.000014))*math.Sin(meanAnomaly) +
		(0.019993-t*0.000101)*math.Sin(2*meanAnomaly) +
		0.000289*math.Sin(3*meanAnomaly)

	// 月球升交点平黄经，章动两个主项都由它给出
	ascendingNode := (125.04 - 1934.136*t) * radPerDeg
	nutationInLongitude := -0.00478 * math.Sin(ascendingNode)

	// 视黄经，0.00569 度是光行差常数项
	apparentLongitude := (meanLongitude + center - 0.00569 + nutationInLongitude) * radPerDeg

	// 平黄赤交角加交角章动主项
	meanObliquity := 23 + (26+(21.448-t*(46.815+t*(0.00059-t*0.001813)))/60)/60
	obliquity := (meanObliquity + 0.00256*math.Cos(ascendingNode)) * radPerDeg

	// 视赤经，度。忽略太阳黄纬，其最大值 1.2 角秒折合时间不足 0.03 秒
	rightAscension := math.Atan2(
		math.Cos(obliquity)*math.Sin(apparentLongitude),
		math.Cos(apparentLongitude),
	) * degPerRad

	delta := normalizeDegrees(meanLongitude) -
		0.0057183 -
		normalizeDegrees(rightAscension) +
		nutationInLongitude*math.Cos(obliquity)

	return wrapDegrees(delta) * MinutesPerDegree
}

// EquationOfTime 均时差：真太阳时与地方平太阳时之差，单位分钟，范围约 -14 ~ +17
//
// 正值表示真太阳时快于平太阳时。时刻按世界时解释
func EquationOfTime(year, month, day, hour, minute int) float64 {
	return equationOfTimeAt(julianDay(year, month, day, float64(hour), float64(minute)))
}

// TrueSolarOffsetMinutes 北京时间到真太阳时的总偏移分钟数（经度差加均时差）
func TrueSolarOffsetMinutes(
	year int,
	month int,
	day int,
	hour int,
	minute int,
	longitude float64,
) float64 {
	// 减 8 小时落在儒略日的小数部分上，跨日由儒略日本身连续处理
	jd := julianDay(year, month, day, float64(hour-beijingUTCOffsetHours), float64(minute))
	return (longitude-BeijingMeridian)*MinutesPerDegree + equationOfTimeAt(jd)
}
