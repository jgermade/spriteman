# Makefile — Build, Test, and Automation for Spritemotion

.PHONY: all install test typecheck build up clean

all: build

## install: Install all project dependencies (npm packages and checks for wasm-pack)
install:
	@which wasm-pack >/dev/null 2>&1 || (echo "wasm-pack not found. Installing via cargo..." && cargo install wasm-pack)
	npm install

## typecheck: Type-check the TypeScript sources
typecheck:
	npx tsc --noEmit

## test: Run the frontend type check and unit tests, then the Rust suite
test:
	npx tsc --noEmit
	npx vitest run
	cargo test

## build: Compile native Rust release library, WebAssembly package, and frontend bundle
build:
	cargo build --release
	wasm-pack build engine --target web --out-dir ../src/wasm/pkg
	npx vite build

## up: Start local development server with HMR and PWA support
up:
	npx vite --port 3000

## clean: Remove build artifacts and temporary files
clean:
	cargo clean
	rm -rf dist src/wasm/pkg
