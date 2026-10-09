FROM headscale/headscale:0.23.0 AS upstream

FROM alpine:3.20
RUN apk add --no-cache ca-certificates openssl wget jq \
  && mkdir -p /etc/headscale /var/lib/headscale /var/run/headscale /otterscale-secrets
COPY --from=upstream /ko-app/headscale /ko-app/headscale
COPY config.yaml /etc/headscale/config.yaml
COPY policy.hujson /etc/headscale/policy.hujson
COPY entrypoint.sh /entrypoint.sh
COPY bootstrap.sh /bootstrap.sh
RUN sed -i 's/\r$//' /entrypoint.sh /bootstrap.sh \
  && chmod +x /entrypoint.sh /bootstrap.sh /ko-app/headscale
EXPOSE 8080
ENTRYPOINT ["/entrypoint.sh"]
CMD ["serve"]
