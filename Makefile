SHELL := bash
.DEFAULT_GOAL := help

KIND_NAME := kubeaquarium
KCONTEXT := kind-$(KIND_NAME)
ADDR ?= 127.0.0.1:7777

VERSION := $(shell git describe --tags --always --dirty 2>/dev/null || echo dev)
COMMIT  := $(shell git rev-parse --short HEAD 2>/dev/null || echo none)
DATE    := $(shell date -u +%Y-%m-%dT%H:%M:%SZ)
LDFLAGS := -s -w \
  -X github.com/gabriel-dantas98/kubeaquarium/internal/cli.Version=$(VERSION) \
  -X github.com/gabriel-dantas98/kubeaquarium/internal/cli.Commit=$(COMMIT) \
  -X github.com/gabriel-dantas98/kubeaquarium/internal/cli.Date=$(DATE)

.PHONY: help cluster cluster-down samples web-deps web-build web-dev backend run scale clean install snapshot

help:
	@echo "Targets:"
	@echo "  cluster       create kind cluster ($(KIND_NAME))"
	@echo "  samples       apply sample workloads to the cluster"
	@echo "  web-deps      install frontend dependencies"
	@echo "  web-build     build frontend into internal/webassets/dist"
	@echo "  web-dev       run vite dev server (proxies /api -> backend)"
	@echo "  backend       build the Go binary"
	@echo "  run           web-build + backend + start ./kubeaquarium"
	@echo "  scale N=500   scale workloads up to ~N pods"
	@echo "  cluster-down  delete the kind cluster"
	@echo "  clean         remove built artifacts"

cluster:
	kind create cluster --config deploy/kind/cluster.yaml

cluster-down:
	kind delete cluster --name $(KIND_NAME)

samples:
	kubectl --context $(KCONTEXT) apply -f deploy/kind/samples.yaml

web-deps:
	cd web && npm install

web-build:
	cd web && ./node_modules/.bin/vite build

web-dev:
	cd web && ./node_modules/.bin/vite

backend:
	go build -ldflags "$(LDFLAGS)" -o kubeaquarium ./cmd/kubeaquarium

install: web-build
	go install -ldflags "$(LDFLAGS)" ./cmd/kubeaquarium

snapshot: web-build
	goreleaser release --snapshot --clean --skip=publish

run: web-build backend
	./kubeaquarium --addr $(ADDR) --context $(KCONTEXT)

N ?= 500
scale:
	kubectl --context $(KCONTEXT) scale deploy -n payments worker --replicas=$$(( $(N) * 40 / 100 ))
	kubectl --context $(KCONTEXT) scale deploy -n web nginx --replicas=$$(( $(N) * 25 / 100 ))
	kubectl --context $(KCONTEXT) scale deploy -n web httpbin --replicas=$$(( $(N) * 15 / 100 ))
	kubectl --context $(KCONTEXT) scale deploy -n payments redis --replicas=$$(( $(N) * 10 / 100 ))
	kubectl --context $(KCONTEXT) scale deploy -n monitoring grafana-fake --replicas=$$(( $(N) * 8 / 100 ))

clean:
	rm -rf kubeaquarium internal/webassets/dist/* web/node_modules
