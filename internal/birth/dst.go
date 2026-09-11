package birth

// 中国夏令时区间
//
// 数据来源：国务院 1986 年 4 月发布的夏令时通知，以及 IANA 时区数据库 `Asia/Shanghai`
// 的 `PRC` 规则段。适用年份仅 1986 至 1991 六年，1992 年起中国不再实行夏令时
//
// 区间端点写的是**钟表读数**，不是标准时：
//   - 开始日标准时 02:00 拨到 03:00，所以钟表读数从开始日 03:00 起进入夏令时
//   - 结束日钟表 02:00 拨回 01:00，所以钟表读数到结束日 02:00 为止
//
// 结束日 01:00 至 02:00 这一小时在钟表上出现两次，仅凭读数无法区分，
// 本实现按夏令时处理，这是一个可配置的流派边界

// DstOffsetMinutes 夏令时相对标准时快的分钟数
const DstOffsetMinutes = 60

// dstRange 一段夏令时区间，右开
type dstRange struct {
	start int
	end   int
}

// dstKey 把年月日时分压成可比较的整数
func dstKey(year, month, day, hour, minute int) int {
	return (((year*100+month)*100+day)*100+hour)*100 + minute
}

// chinaDstRanges 六个年份的夏令时区间
var chinaDstRanges = []dstRange{
	{dstKey(1986, 5, 4, 3, 0), dstKey(1986, 9, 14, 2, 0)},
	{dstKey(1987, 4, 12, 3, 0), dstKey(1987, 9, 13, 2, 0)},
	{dstKey(1988, 4, 10, 3, 0), dstKey(1988, 9, 11, 2, 0)},
	{dstKey(1989, 4, 16, 3, 0), dstKey(1989, 9, 17, 2, 0)},
	{dstKey(1990, 4, 15, 3, 0), dstKey(1990, 9, 16, 2, 0)},
	{dstKey(1991, 4, 14, 3, 0), dstKey(1991, 9, 15, 2, 0)},
}

// IsInChinaDst 判断一个钟表读数是否落在中国夏令时区间内
func IsInChinaDst(year, month, day, hour, minute int) bool {
	k := dstKey(year, month, day, hour, minute)
	for _, r := range chinaDstRanges {
		if k >= r.start && k < r.end {
			return true
		}
	}
	return false
}
