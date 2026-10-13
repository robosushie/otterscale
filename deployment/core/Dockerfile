FROM golang:1.25-bookworm AS build
WORKDIR /src/packages/core
ENV CGO_ENABLED=0
COPY packages/core/go.mod packages/core/go.sum ./
RUN go mod download
COPY packages/core ./
RUN go build -o /out/core ./cmd/core

FROM alpine:3.22
RUN apk add --no-cache ca-certificates wget
COPY --from=build /out/core /usr/local/bin/core
COPY deployment/core/entrypoint.sh /entrypoint.sh
RUN sed -i 's/\r$//' /entrypoint.sh && chmod +x /entrypoint.sh
ENV CORE_ADDR=:4000
EXPOSE 4000
ENTRYPOINT ["/entrypoint.sh"]
