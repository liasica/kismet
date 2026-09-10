# 前端在 web/ 用 pnpm 构建，产物由 Go 内嵌进同一个二进制

BIN := bin/kismet

# 本地开发的环境变量放 .env（见 .env.example），存在时导出给下面所有命令
-include .env
export

.PHONY: build web run dev dev-web dev-server test lint fixtures clean

## build 构建前端并编译二进制，产物 bin/kismet
build: web
	go build -o $(BIN) .

## web 构建前端到 web/app/dist
web:
	pnpm -C web install --frozen-lockfile
	pnpm -C web build

## run 构建并运行
run: build
	./$(BIN)

## dev 同时启动前端与后端开发服务，Ctrl-C 一起退出
dev:
	$(MAKE) -j2 dev-web dev-server

## dev-web Vite 开发服务器 http://localhost:36578，/api 代理到 Go 服务
dev-web:
	pnpm -C web dev

## dev-server Go 服务 http://localhost:36579，wgo 监听 .go 文件改动后自动重编译重启
dev-server:
	go tool wgo run .

## test TypeScript 与 Go 的全部测试
test:
	pnpm -C web test
	go test ./...

## lint 前端 ESLint、类型检查与 Go vet
lint:
	pnpm -C web lint
	pnpm -C web typecheck
	go vet ./...

## fixtures 重新生成跨语言黄金基准并用 Go 侧比对
fixtures:
	pnpm -C web fixtures
	go test ./internal/bazi/...

clean:
	rm -rf $(BIN) web/app/dist/*
