# Build-Stage
FROM golang:1.26 AS build
WORKDIR /app

# Dependency layer: re-downloads only when go.mod/go.sum change, every
# other deploy reuses the cached modules.
COPY go.mod go.sum ./
RUN go mod download

# Copy the source code
COPY . .

# Install templ, pinned to the version go.mod pins
RUN go install github.com/a-h/templ/cmd/templ@$(go list -m -f '{{.Version}}' github.com/a-h/templ)

# Generate templ files
RUN templ generate

# Install build dependencies
RUN apt-get update && apt-get install -y curl wget && rm -rf /var/lib/apt/lists/*

# Get the latest version from GitHub API and save it to version.txt
RUN curl -s https://api.github.com/repos/axadrn/shadcn-templ/releases/latest | grep tag_name | cut -d '"' -f 4 > version.txt || echo "unknown" > version.txt

# Install Tailwind CSS standalone CLI
RUN ARCH=$(uname -m) && \
  if [ "$ARCH" = "x86_64" ]; then \
  TAILWIND_URL="https://github.com/tailwindlabs/tailwindcss/releases/download/v4.3.3/tailwindcss-linux-x64"; \
  elif [ "$ARCH" = "aarch64" ]; then \
  TAILWIND_URL="https://github.com/tailwindlabs/tailwindcss/releases/download/v4.3.3/tailwindcss-linux-arm64"; \
  else \
  echo "Unsupported architecture: $ARCH"; exit 1; \
  fi && \
  wget -O tailwindcss "$TAILWIND_URL" && \
  chmod +x tailwindcss

# Generate Tailwind CSS output (the 2.0 entry file is globals.css)
RUN ./tailwindcss -i ./assets/css/globals.css -o ./assets/css/output.css --minify

# Build the component JS asset before embedding assets in the application.
RUN go run ./cmd/shadcn-templ bundle

# Regenerate the sitemap before it is embedded: the highlight crawler only
# visits sitemap pages, a stale one leaves new pages unhighlighted (#632).
RUN go run ./cmd/sitemap/main.go --baseurl="https://shadcn-templ.com" --output="./static/sitemap.xml"

# Build the application as a static binary. -p 2 caps compile parallelism
# so small builders do not OOM, -s -w strips debug info from the binary.
RUN CGO_ENABLED=0 GOOS=linux go build -p 2 -ldflags="-s -w" -o main ./cmd/docs/main.go
RUN CGO_ENABLED=0 GOOS=linux go build -p 2 -ldflags="-s -w" -o highlight-gen ./cmd/highlight-gen/main.go

# Shiki deps stage: install the highlighter service's node_modules once.
FROM node:20-alpine AS shiki
WORKDIR /shiki
COPY shiki/package*.json ./
RUN npm ci --omit=dev
COPY shiki/server.js ./

# Highlight stage (CREATE_1TO1_PLAN 2f): the only place node ever runs.
# The crawler renders every sitemap page against the live shiki service and
# bakes the resulting highlight cache into a file the runtime loads instead.
FROM node:20-alpine AS highlight
WORKDIR /app
COPY --from=shiki /shiki /app/shiki
COPY --from=build /app/main /app/highlight-gen ./
COPY --from=build /app/version.txt .
COPY --from=build /app/assets/css/output.css ./assets/css/output.css
# GO_ENV=production so pages render exactly like the deploy; SHIKI_URL keeps
# the service reachable despite production mode; HIGHLIGHT_DUMP mounts the
# dump route the generator reads at the end.
RUN node /app/shiki/server.js & \
  GO_ENV=production HIGHLIGHT_DUMP=1 SHIKI_URL=http://localhost:3000/highlight ./main & \
  ./highlight-gen -server http://localhost:8090 -out /app/highlight-cache.json.gz

# Deploy-Stage
FROM alpine:3.20.2
WORKDIR /app

RUN apk add --no-cache ca-certificates

# Set environment variable for runtime. BASE_URL feeds every
# self-referencing absolute URL (canonical, og:url, AI prompt links);
# beta interim like the CLI defaults, flips back at stable.
ENV GO_ENV=production
ENV BASE_URL=https://shadcn-templ.com

# Copy the binary, version file, CSS output and the baked highlight cache
COPY --from=build /app/main .
COPY --from=build /app/version.txt .
COPY --from=build /app/assets/css/output.css ./assets/css/output.css
COPY --from=highlight /app/highlight-cache.json.gz ./assets/highlight-cache.json.gz

# Expose the port
EXPOSE 8090
HEALTHCHECK --interval=10s --timeout=5s --start-period=10s --retries=6 CMD wget -q --spider http://127.0.0.1:8090/healthz || exit 1

CMD ["./main"]
