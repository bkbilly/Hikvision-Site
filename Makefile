.PHONY: all build build-frontend build-backend test run clean docker

all: build

build-frontend:
	cd web && npm install && npm run build

build-backend:
	go build -ldflags="-s -w" -o hikvision-hub .

build: build-frontend build-backend

test:
	go test -v ./...

run: build
	./hikvision-hub -port 8080 -data-dir ./data

docker:
	docker compose up --build -d

docker-build:
	docker build -t bkbillybk/hikvision-hub:latest .

clean:
	rm -rf hikvision-hub data/cache
