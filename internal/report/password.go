package report

import (
	"crypto/pbkdf2"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
)

// 分享密码用 PBKDF2-SHA256 派生后保存，只存盐与派生结果
const (
	passwordSaltBytes  = 16
	passwordKeyBytes   = 32
	passwordIterations = 100_000
)

// derivePassword 生成随机盐并派生密钥
func derivePassword(password string) (salt, key []byte, err error) {
	salt = make([]byte, passwordSaltBytes)
	_, _ = rand.Read(salt)
	key, err = pbkdf2.Key(sha256.New, password, salt, passwordIterations, passwordKeyBytes)
	return
}

// Check 校验密码，未设密码的分享任何输入都通过
func (s Share) Check(password string) bool {
	if !s.Locked() {
		return true
	}

	key, err := pbkdf2.Key(sha256.New, password, s.Salt, passwordIterations, passwordKeyBytes)
	if err != nil {
		return false
	}
	return subtle.ConstantTimeCompare(key, s.Key) == 1
}
