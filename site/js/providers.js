(function () {
  const select = document.querySelector("[data-provider]");
  const panel = document.querySelector("[data-provider-panel]");
  if (!select || !panel) return;

  const image = "ghcr.io/robosushie/otterscale/standalone:<tag>";

  const envVm = [
    "OTTERSCALE_IMAGE_TAG=<tag>",
    "AUTH_URL=https://console.<custom domain>",
    "OTTERSCALE_DOMAIN=hs.<custom domain>",
    "CONSOLE_HOST=console.<custom domain>",
    "HS_HOST=hs.<custom domain>",
    "APPS_BASE_DOMAIN=<custom domain>",
  ].join("\n");

  const compose = "docker compose -f otterscale-standalone.yaml --env-file .env up -d";

  const joinHttps = "tailscale up --login-server https://hs.<custom domain> --auth-key <key>";

  function step(num, title, paragraphs, file, code) {
    return { num: num, title: title, paragraphs: paragraphs, file: file, code: code };
  }

  const vmSteps = [
    step("01", "Install Docker", [
      "Install Docker Engine and the Compose plugin on the VM. Copy otterscale-standalone.yaml and its env example from the Compose section above into the same directory.",
    ], "shell", "docker compose version"),
    step("02", "Environment", [
      "Save the example as .env. Replace <tag> with the tag in Pull an image, and the hostnames with yours. No quote marks. Leave HEADSCALE_API_KEY and APPS_EDGE_AUTHKEY unset. The first boot writes them onto the Docker volume.",
    ], ".env", envVm),
    step("03", "Start", [
      "Compose pulls the standalone image and keeps /data on a Docker volume. The stack file is the alternative when you want four containers instead of one.",
    ], "shell", compose),
    step("04", "DNS and ports", [
      "Open TCP 80 and 443 to the VM. Point the console name, the Headscale name, and *.<custom domain> at that address. Caddy on this image uses an internal certificate, so browsers and tailscale up trust the login server only after a public certificate sits in front and still forwards Upgrade: tailscale-control-protocol on /ts2021.",
    ], "shell", joinHttps),
  ];

  const providers = [
    {
      group: "One container",
      id: "railway",
      label: "Railway",
      steps: [
        step("01", "Image", [
          "One service. Source image is the standalone image. Use the tag from Pull an image. Do not deploy the stack Compose file here.",
        ], "image", image),
        step("02", "Volume", [
          "On the project canvas, right-click the service and add a volume. Mount path is /data. Stay at one replica and leave serverless off. Redeploys keep this disk. Deleting the volume or the service removes the Headscale database and keys. The first deploy after you attach it starts empty.",
        ], "mount", "/data"),
        step("03", "HTTP domains", [
          "Public networking serves the console and the apps. Generate a Railway domain, or add your own, and set every HTTP target port to 8080. A wildcard covers the console and each published app. Do not aim an HTTPS domain at 18080.",
        ], "dns", "console.<custom domain>\n*.<custom domain>"),
        step("04", "TCP proxy", [
          "Settings, Networking, TCP Proxy. Internal port 18080. Apply the change. Railway then shows a proxy host and a public port. That pair is <tcp-host>:<tcp-port>. It is the login server, and it is not an up.railway.app domain.",
        ], "tcp", "internal port 18080\npublic  <tcp-host>:<tcp-port>"),
        step("05", "Variables", [
          "Type each value with no quote characters. PORT must be 8080. If it is 18080, Caddy and Headscale fight for that port and the container exits. HS_HOST is only a hostname. The TCP URL belongs in OTTERSCALE_DOMAIN, including http:// and the port Railway assigned. Leave the Headscale keys unset. <custom domain> is the zone in DNS. <slug> is only the published app name.",
        ], "variables", [
          "PORT=8080",
          "AUTH_URL=https://console.<custom domain>",
          "CONSOLE_HOST=console.<custom domain>",
          "HS_HOST=hs.<custom domain>",
          "OTTERSCALE_DOMAIN=http://<tcp-host>:<tcp-port>",
          "APPS_BASE_DOMAIN=<custom domain>",
        ].join("\n")),
        step("06", "Join a device", [
          "After deploy, the log should show Caddy public HTTP on :8080 and server_url equal to http://<tcp-host>:<tcp-port>. Copy the auth key from Add device.",
        ], "shell", "tailscale up --login-server http://<tcp-host>:<tcp-port> --auth-key <key>"),
        step("07", "Published apps", [
          "Settings, General, Apps base domain must match APPS_BASE_DOMAIN. The table reads the saved setting, not the variable. Save the app again, then open https://<slug>.<custom domain>. The process on the machine has to listen on 0.0.0.0 at the published port.",
        ], "url", "https://<slug>.<custom domain>"),
      ],
    },
    {
      group: "One container",
      id: "render",
      label: "Render",
      steps: [
        step("01", "What Render can host", [
          "A paid web service can keep a disk at /data and serve the console and published apps over HTTPS, including a wildcard domain. Render does not publish a raw TCP port to the internet, so tailscale up cannot use the HTTPS URL. Use Railway, Fly.io, Azure Container Apps, or a VM when devices must join.",
        ], "image", image),
        step("02", "Disk and port", [
          "Create a web service from the image. Add a persistent disk mounted at /data. Set the service port to 8080 so it matches PORT. One instance. Render’s own default port is 10000, which collides with nothing, but 8080 matches the domains you will attach.",
        ], "mount", "/data"),
        step("03", "Variables", [
          "No quote characters. These names are hostnames. Devices still need a login server on a host that can expose TCP 18080.",
        ], "variables", [
          "PORT=8080",
          "AUTH_URL=https://console.<custom domain>",
          "CONSOLE_HOST=console.<custom domain>",
          "HS_HOST=hs.<custom domain>",
          "OTTERSCALE_DOMAIN=hs.<custom domain>",
          "APPS_BASE_DOMAIN=<custom domain>",
        ].join("\n")),
        step("04", "Domains", [
          "Add the console hostname and *.<custom domain>. Render supports wildcard domains. Point DNS at the values Render shows. Both names hit the HTTP service on port 8080.",
        ], "dns", "console.<custom domain>\n*.<custom domain>"),
      ],
    },
    {
      group: "One container",
      id: "fly",
      label: "Fly.io",
      steps: [
        step("01", "Volume", [
          "One Machine, one volume, same region. The volume mounts at /data. Turn auto-stop off and keep one machine running so the disk stays with the process.",
        ], "shell", "fly volumes create otterscale_data --size 1 --region <region>"),
        step("02", "fly.toml", [
          "HTTP on 8080 is the console and the apps. The second service is raw TCP to Headscale with no HTTP handler. Quotes in this file are TOML. They are not part of the value. Replace <tag> from Pull an image.",
        ], "fly.toml", [
          "app = \"<app>\"",
          "primary_region = \"<region>\"",
          "",
          "[build]",
          "  image = \"" + image + "\"",
          "",
          "[env]",
          "  PORT = \"8080\"",
          "  AUTH_URL = \"https://console.<custom domain>\"",
          "  CONSOLE_HOST = \"console.<custom domain>\"",
          "  HS_HOST = \"hs.<custom domain>\"",
          "  OTTERSCALE_DOMAIN = \"http://<ipv4>:<tcp-port>\"",
          "  APPS_BASE_DOMAIN = \"<custom domain>\"",
          "",
          "[mounts]",
          "  source = \"otterscale_data\"",
          "  destination = \"/data\"",
          "",
          "[http_service]",
          "  internal_port = 8080",
          "  force_https = true",
          "  auto_stop_machines = \"off\"",
          "  min_machines_running = 1",
          "",
          "[[services]]",
          "  internal_port = 18080",
          "  protocol = \"tcp\"",
          "  [[services.ports]]",
          "    port = 18080",
          "    handlers = []",
        ].join("\n")),
        step("03", "Address and certificates", [
          "A shared anycast address often will not accept a custom TCP port. Allocate a dedicated IPv4 and put that address, with port 18080, in OTTERSCALE_DOMAIN. Add certificates for the console and the apps wildcard. Those names stay on HTTPS port 443.",
        ], "shell", [
          "fly ips allocate-v4",
          "fly certs add console.<custom domain>",
          "fly certs add \"*.<custom domain>\"",
          "fly deploy",
        ].join("\n")),
        step("04", "Join a device", [
          "The login server is the dedicated IPv4 and the TCP port, over http. The Noise session is still encrypted. The console is the HTTPS name.",
        ], "shell", "tailscale up --login-server http://<ipv4>:<tcp-port> --auth-key <key>"),
      ],
    },
    {
      group: "One container",
      id: "do-app",
      label: "DigitalOcean App Platform",
      steps: [
        step("01", "No disk", [
          "App Platform does not support volumes. The filesystem is ephemeral, so the Headscale database and keys disappear on the next deploy. Do not run this image there.",
        ], "docs", "https://docs.digitalocean.com/products/app-platform/details/limits/"),
        step("02", "Use a Droplet", [
          "A Droplet with a block volume, or Docker’s own volume, can keep /data. Select DigitalOcean Droplet in this list and follow those steps.",
        ], "shell", compose),
      ],
    },
    {
      group: "One container",
      id: "azure-aca",
      label: "Azure Container Apps",
      steps: [
        step("01", "Image and scale", [
          "One container app from the standalone image. Minimum and maximum replicas are 1. A second replica cannot share the Azure Files mount safely.",
        ], "image", image),
        step("02", "Azure Files", [
          "Create a classic file share and add it to the Container Apps environment. Mount it on the container at /data. NFS or SMB both work if the environment storage type matches the share.",
        ], "mount", "/data"),
        step("03", "HTTP and TCP ingress", [
          "HTTP ingress, external, target port 8080, for the console and apps. Custom domains attach only to HTTP ingress. Add a second ingress with transport tcp, target port 18080, and an exposed port that is unique in the environment and is not 80 or 443. External TCP requires an environment joined to a virtual network. The login URL is the app FQDN plus that exposed port.",
        ], "shell", "az containerapp ingress enable --name otterscale --resource-group <group> --type external --target-port 8080 --transport auto"),
        step("04", "Variables", [
          "No quote characters in the values. OTTERSCALE_DOMAIN includes http:// and the TCP exposed port. HS_HOST stays a hostname for the HTTP name.",
        ], "variables", [
          "PORT=8080",
          "AUTH_URL=https://console.<custom domain>",
          "CONSOLE_HOST=console.<custom domain>",
          "HS_HOST=hs.<custom domain>",
          "OTTERSCALE_DOMAIN=http://<app>.<env-suffix>:<exposed-port>",
          "APPS_BASE_DOMAIN=<custom domain>",
        ].join("\n")),
        step("05", "Join a device", [
          "tailscale up uses the TCP FQDN and exposed port. The console uses the custom HTTPS domain on the HTTP ingress.",
        ], "shell", "tailscale up --login-server http://<app>.<env-suffix>:<exposed-port> --auth-key <key>"),
      ],
    },
    {
      group: "One container",
      id: "cloud-run",
      label: "GCP Cloud Run",
      steps: [
        step("01", "Not this image", [
          "Cloud Run’s public ingress is HTTP only, so it cannot carry the Tailscale login connection. A Cloud Storage mount is also a poor disk for Headscale’s SQLite file. Use Compute Engine.",
        ], "docs", "https://cloud.google.com/run/docs/configuring/services/cloud-storage-volume-mounts"),
        step("02", "Compute Engine", [
          "Select GCP Compute Engine in this list. That VM can open TCP 80 and 443 and keep /data on a Docker volume.",
        ], "shell", compose),
      ],
    },
    {
      group: "A VM with Docker",
      id: "vm",
      label: "Any Linux VM",
      steps: vmSteps,
    },
    {
      group: "A VM with Docker",
      id: "ec2",
      label: "AWS EC2",
      steps: [
        step("01", "Instance", [
          "Launch Ubuntu and attach a security group that allows TCP 80 and 443 from the internet. SSH stays on 22 for you. Use option 1, the standalone Compose file, not four images pasted in by hand.",
        ], "ports", "TCP 80\nTCP 443"),
        step("02", "Environment", [
          "Install Docker Compose. Copy the standalone file and the env example onto the instance. Save it as .env with no quote characters. Route 53 records: console, Headscale, and the apps wildcard, all aimed at the instance.",
        ], ".env", envVm),
        step("03", "Start", [
          "Compose pulls the image and stores /data in a Docker volume. Caddy’s certificate is internal until a public certificate proxies 443 and still passes the Tailscale upgrade on /ts2021.",
        ], "shell", compose + "\n" + joinHttps),
      ],
    },
    {
      group: "A VM with Docker",
      id: "azure-vm",
      label: "Azure Virtual Machine",
      steps: [
        step("01", "VM and disk", [
          "Create an Ubuntu VM. Network security group: TCP 80 and 443. A data disk is optional if Docker’s volume lives on the OS disk. Copy the standalone Compose file and the env example.",
        ], "ports", "TCP 80\nTCP 443"),
        step("02", "Environment", [
          "DNS for the console, Headscale, and the apps wildcard. Values have no quote characters.",
        ], ".env", envVm),
        step("03", "Start", [
          "The login server is the Headscale hostname over HTTPS once clients trust the certificate in front of Caddy.",
        ], "shell", compose + "\n" + joinHttps),
      ],
    },
    {
      group: "A VM with Docker",
      id: "gce",
      label: "GCP Compute Engine",
      steps: [
        step("01", "VM and firewall", [
          "Create a VM, reserve a static IP, and allow tcp:80 and tcp:443 on the VPC firewall. Cloud DNS records for the console, Headscale, and the apps wildcard point at that IP.",
        ], "shell", "gcloud compute firewall-rules create otterscale-web --allow=tcp:80,tcp:443"),
        step("02", "Environment", [
          "Install Docker Compose. The .env values are the public hostnames, with no quote characters. Leave PORT unset so Caddy serves 80 and 443 itself.",
        ], ".env", envVm),
        step("03", "Start", [
          "Clients use the Headscale hostname on 443. Host port 18080 stays on the machine for local checks. Do not publish 18080 in place of 443.",
        ], "shell", compose + "\n" + joinHttps),
      ],
    },
    {
      group: "A VM with Docker",
      id: "droplet",
      label: "DigitalOcean Droplet",
      steps: [
        step("01", "Droplet", [
          "Create a Droplet with Docker, or install the Compose plugin. Cloud Firewall: TCP 80 and 443. This is the DigitalOcean path that can keep /data. App Platform cannot.",
        ], "ports", "TCP 80\nTCP 443"),
        step("02", "Environment", [
          "Copy the standalone Compose file and the env example. Point DNS at the Droplet for the console, Headscale, and the apps wildcard.",
        ], ".env", envVm),
        step("03", "Start", [
          "Compose pulls the published image. The login server is the Headscale hostname after TLS in front of Caddy is trusted.",
        ], "shell", compose + "\n" + joinHttps),
      ],
    },
  ];

  function add(parent, tag, text) {
    const node = document.createElement(tag);
    if (text) node.textContent = text;
    parent.appendChild(node);
    return node;
  }

  function render(id) {
    const provider = providers.find((item) => item.id === id) || providers[0];
    panel.replaceChildren();
    provider.steps.forEach((item) => {
      const row = add(panel, "article");
      row.className = "guide-step";
      const copy = add(row, "div");
      copy.className = "guide-copy";
      add(copy, "span", item.num).className = "guide-num";
      add(copy, "h3", item.title);
      item.paragraphs.forEach((paragraph) => add(copy, "p", paragraph));
      const snippet = add(row, "div");
      snippet.className = "snippet";
      const bar = add(snippet, "div");
      bar.className = "snippet-bar";
      const title = add(bar, "span");
      title.className = "snippet-title";
      const dots = add(title, "span");
      dots.className = "snippet-dots";
      dots.setAttribute("aria-hidden", "true");
      for (let i = 0; i < 3; i += 1) add(dots, "span").className = "snippet-dot";
      add(title, "span", item.file);
      const button = add(bar, "button");
      button.type = "button";
      button.className = "snippet-copy";
      button.setAttribute("data-copy-text", item.code);
      button.setAttribute("aria-label", "Copy " + item.file);
      const icon = add(button, "span", "content_copy");
      icon.className = "material-symbols-outlined";
      icon.setAttribute("aria-hidden", "true");
      add(button, "span", "Copy");
      const pre = add(snippet, "pre");
      add(pre, "code", item.code);
    });
  }

  const groups = [];
  providers.forEach((provider) => {
    let group = groups.find((item) => item.label === provider.group);
    if (!group) {
      group = { label: provider.group, items: [] };
      groups.push(group);
    }
    group.items.push(provider);
  });
  groups.forEach((group) => {
    const optgroup = add(select, "optgroup");
    optgroup.label = group.label;
    group.items.forEach((provider) => {
      const option = add(optgroup, "option", provider.label);
      option.value = provider.id;
    });
  });
  select.addEventListener("change", () => render(select.value));
  render(select.value);
})();
