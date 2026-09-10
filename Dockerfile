# 单二进制镜像：Node 阶段构建前端，Go 阶段把前端产物与区划数据一并 embed
# 前端引用仓库根的 data/，因此构建上下文必须是仓库根

FROM node:24-alpine AS web
WORKDIR /src
RUN npm install -g pnpm@11.21.0
COPY web/package.json web/pnpm-lock.yaml web/pnpm-workspace.yaml ./web/
COPY web/core/package.json ./web/core/
COPY web/app/package.json ./web/app/
RUN pnpm -C web install --frozen-lockfile
COPY data ./data
COPY web ./web
RUN pnpm -C web build

FROM golang:1.27-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY main.go ./
COPY internal ./internal
COPY data/region ./data/region
COPY --from=web /src/web/app/dist ./web/app/dist
RUN CGO_ENABLED=0 go build -trimpath -ldflags '-s -w' -o /out/kismet .

FROM alpine:3
# 调用 DeepSeek 需要根证书
RUN apk add --no-cache ca-certificates
COPY --from=build /out/kismet /usr/local/bin/kismet
EXPOSE 36579
ENTRYPOINT ["kismet"]
