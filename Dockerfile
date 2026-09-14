# Build-Stage
FROM golang:1.24 AS build
WORKDIR /app

# Copy the source code
COPY . .

# Install templ
RUN go install github.com/a-h/templ/cmd/templ@v0.3.1001

# Generate templ files
RUN templ generate

# Install build dependencies
RUN apt-get update && apt-get install -y curl wget && rm -rf /var/lib/apt/lists/*

# Install Tailwind CSS standalone CLI
RUN ARCH=$(uname -m) && \
  if [ "$ARCH" = "x86_64" ]; then \
  TAILWIND_URL="https://github.com/tailwindlabs/tailwindcss/releases/download/v4.1.3/tailwindcss-linux-x64"; \
  elif [ "$ARCH" = "aarch64" ]; then \
  TAILWIND_URL="https://github.com/tailwindlabs/tailwindcss/releases/download/v4.1.3/tailwindcss-linux-arm64"; \
  else \
  echo "Unsupported architecture: $ARCH"; exit 1; \
  fi && \
  wget -O tailwindcss "$TAILWIND_URL" && \
  chmod +x tailwindcss

# Generate Tailwind CSS output
RUN ./tailwindcss -i ./assets/css/input.css -o ./assets/css/output.css --minify

# Build the application as a static binary
RUN CGO_ENABLED=0 GOOS=linux go build -o main ./cmd/docs/main.go
RUN CGO_ENABLED=0 GOOS=linux go build -o highlight-gen ./cmd/highlight-gen/main.go

# Shiki deps stage: install the highlighter service's node_modules once.
FROM node:20-alpine AS shiki
WORKDIR /shiki
COPY shiki/package*.json ./
RUN npm ci --omit=dev
COPY shiki/server.js ./

# Highlight stage: the only place node ever runs. The crawler renders every
# sitemap page against the live shiki service and bakes the resulting
# highlight cache into a file the runtime loads instead.
FROM node:20-alpine AS highlight
WORKDIR /app
COPY --from=shiki /shiki /app/shiki
COPY --from=build /app/main /app/highlight-gen ./
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

# Install ca-certificates
RUN apk add --no-cache ca-certificates

# Set environment variable for runtime
ENV GO_ENV=production

# Copy the binary, CSS output and the baked highlight cache
COPY --from=build /app/main .
COPY --from=build /app/assets/css/output.css ./assets/css/output.css
COPY --from=highlight /app/highlight-cache.json.gz ./assets/highlight-cache.json.gz

# Expose the port
EXPOSE 8090
HEALTHCHECK --interval=10s --timeout=5s --start-period=10s --retries=6 CMD wget -q --spider http://127.0.0.1:8090/healthz || exit 1

# Command to run
CMD ["./main"]
