FROM golang:1.25-bookworm AS build
WORKDIR /src
ENV GOTOOLCHAIN=local CGO_ENABLED=0
COPY go.mod go.sum ./
RUN go mod download
COPY cmd ./cmd
COPY internal ./internal
RUN go build -o /out/proxy ./cmd/proxy

FROM caddy:2-alpine
RUN apk add --no-cache ca-certificates wget
COPY --from=build /out/proxy /usr/local/bin/proxy
COPY deploy/edge/entrypoint.sh /entrypoint.sh
RUN sed -i 's/\r$//' /entrypoint.sh && chmod +x /entrypoint.sh
EXPOSE 80 443 4180
ENTRYPOINT ["/entrypoint.sh"]
