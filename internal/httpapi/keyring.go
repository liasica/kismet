package httpapi

import (
	"strings"
	"sync"
)

// keyring 分配 DeepSeek 密钥：占用最少的先给，数量相同时从上次给出的位置往后挑，
// 因此空闲时是逐把轮转，并发时各占一把，只有并发数超过密钥数才会共用
type keyring struct {
	mu   sync.Mutex
	keys []string
	// busy 各把密钥正在进行的解读数，与 keys 同序
	busy []int
	// next 下一轮从哪个位置开始挑
	next int
}

// newKeyring 按密钥列表建一个分配器，列表为空时 acquire 返回空密钥
func newKeyring(keys []string) *keyring {
	return &keyring{keys: keys, busy: make([]int, len(keys))}
}

// acquire 取一把密钥，slot 是它在列表里的序号，release 在这次解读结束后调用
func (r *keyring) acquire() (key string, slot int, release func()) {
	release = func() {}
	if len(r.keys) == 0 {
		return
	}

	r.mu.Lock()
	defer r.mu.Unlock()

	slot = r.next % len(r.keys)
	for offset := 1; offset < len(r.keys); offset++ {
		candidate := (r.next + offset) % len(r.keys)
		if r.busy[candidate] < r.busy[slot] {
			slot = candidate
		}
	}

	r.busy[slot]++
	r.next = (slot + 1) % len(r.keys)

	key = r.keys[slot]
	taken := slot
	release = func() { r.release(taken) }
	return
}

// release 归还一把密钥
func (r *keyring) release(slot int) {
	r.mu.Lock()
	defer r.mu.Unlock()

	if r.busy[slot] > 0 {
		r.busy[slot]--
	}
}

// splitKeys 把逗号分隔的密钥切开，去掉空白与重复的
func splitKeys(raw string) []string {
	var keys []string
	seen := make(map[string]bool)
	for item := range strings.SplitSeq(raw, ",") {
		key := strings.TrimSpace(item)
		if key == "" || seen[key] {
			continue
		}
		seen[key] = true
		keys = append(keys, key)
	}
	return keys
}
