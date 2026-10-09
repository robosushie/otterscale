FROM golang:1.25-bookworm AS build
WORKDIR /src
ENV GOTOOLCHAIN=local CGO_ENABLED=0
COPY go.mod go.sum ./
RUN go mod download
COPY cmd ./cmd
COPY internal ./internal
RUN go build -o /out/proxy ./cmd/proxy

FROM alpine:3.20
RUN apk add --no-cache ca-certificates wget
COPY --from=build /out/proxy /usr/local/bin/proxy
EXPOSE 80 4180
ENTRYPOINT ["/usr/local/bin/proxy"]
