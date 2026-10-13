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

  const composeStandalone = "docker compose -f otterscale-standalone.yaml --env-file .env up -d";
  const composeStack = "docker compose -f otterscale-stack.yaml --env-file .env up -d";

  const envStack = [
    "OTTERSCALE_IMAGE_TAG=<tag>",
    "AUTH_SECRET=<secret>",
    "AUTH_URL=https://console.<custom domain>",
    "OTTERSCALE_DOMAIN=hs.<custom domain>",
    "CONSOLE_HOST=console.<custom domain>",
    "HS_HOST=hs.<custom domain>",
    "HEADSCALE_PUBLIC_URL=https://hs.<custom domain>",
    "APPS_BASE_DOMAIN=<custom domain>",
  ].join("\n");

  const joinHttps = "tailscale up --login-server https://hs.<custom domain> --auth-key <key>";
  const tls = "Caddy uses an internal certificate. Browsers and tailscale up trust the login server after a public certificate sits in front and still forwards Upgrade: tailscale-control-protocol on /ts2021.";

  function vmMethods(host) {
    return [
      {
        tab: "Standalone (One container)",
        note: "Copy otterscale-standalone.yaml and otterscale-standalone.env.example from the Compose section.",
        steps: [
          step("01", host.title, [host.standalone], host.file, host.code),
          step("02", "Environment", [
            "Save the example as .env. Replace <tag> with the tag in Pull an image, and the hostnames with yours. No quote marks. Leave HEADSCALE_API_KEY and APPS_EDGE_AUTHKEY unset. The first boot writes them onto the Docker volume at /data. Leave PORT unset so Caddy serves 80 and 443.",
          ], ".env", envVm),
          step("03", "Start", [
            "Compose pulls the standalone image. /data stays on a Docker volume across restarts.",
          ], "shell", composeStandalone),
          step("04", "DNS and ports", [host.dns + " " + tls], "dns", host.dnsCode),
          step("05", "Join a device", [
            "Join once a public certificate in front of Caddy is trusted. The login server is the Headscale hostname.",
          ], "shell", joinHttps),
        ],
      },
      {
        tab: "Stack (Multiple Containers)",
        note: "Copy otterscale-stack.yaml and otterscale-stack.env.example from the Compose section. Headscale, core, the console, and edge each run as their own container.",
        steps: [
          step("01", host.title, [host.stack], host.file, host.code),
          step("02", "Environment", [
            "Save the example as .env. AUTH_SECRET is required and must be at least 32 characters. No quote marks. Leave HEADSCALE_API_KEY, APPS_EDGE_AUTHKEY, and HEADSCALE_INTERNAL_URL unset. Init writes the keys onto the otterscale_secrets volume. Leave PORT unset.",
          ], ".env", envStack),
          step("03", "Start", [
            "Compose pulls headscale, core, app, and edge at the same tag. Headscale stays on 127.0.0.1:8080. Edge publishes 80 and 443. Named volumes keep the database, secrets, and proxy state.",
          ], "shell", composeStack),
          step("04", "DNS and ports", [host.dns + " " + tls], "dns", host.dnsCode),
          step("05", "Join a device", [
            "Join once a public certificate in front of Caddy is trusted. The login server is the Headscale hostname.",
          ], "shell", joinHttps),
        ],
      },
    ];
  }

  function step(num, title, paragraphs, file, code) {
    return { num: num, title: title, paragraphs: paragraphs, file: file || "", code: code || "" };
  }

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
        ]),
        step("02", "Disk and port", [
          "Create a web service from the image. Add a persistent disk mounted at /data. Set the service port to 8080 so it matches PORT. One instance.",
        ], "mount", "/data\nport 8080"),
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
          "A Droplet can keep the data on Docker volumes. Select DigitalOcean Droplet in this list. That page has the standalone file and the stack file.",
        ]),
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
        step("03", "HTTP ingress", [
          "HTTP ingress, external, target port 8080, for the console and apps. Custom domains attach only to this ingress.",
        ], "shell", "az containerapp ingress enable --name otterscale --resource-group <group> --type external --target-port 8080 --transport auto"),
        step("04", "TCP port", [
          "Headscale needs a second TCP port. Add it under ingress.additionalPortMappings, then apply the app YAML. The exposed port is unique in the environment and is not 80 or 443. External TCP requires the app to be external and the environment to be joined to a virtual network. The login URL is the app FQDN plus that exposed port.",
        ], "ingress.yaml", [
          "ingress:",
          "  additionalPortMappings:",
          "    - external: true",
          "      targetPort: 18080",
          "      exposedPort: <exposed-port>",
        ].join("\n")),
        step("05", "Variables", [
          "No quote characters in the values. OTTERSCALE_DOMAIN includes http:// and the TCP exposed port. HS_HOST stays a hostname for the HTTP name.",
        ], "variables", [
          "PORT=8080",
          "AUTH_URL=https://console.<custom domain>",
          "CONSOLE_HOST=console.<custom domain>",
          "HS_HOST=hs.<custom domain>",
          "OTTERSCALE_DOMAIN=http://<app>.<env-suffix>:<exposed-port>",
          "APPS_BASE_DOMAIN=<custom domain>",
        ].join("\n")),
        step("06", "Join a device", [
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
          "Select GCP Compute Engine in this list. That VM can open TCP 80 and 443 and keep data on Docker volumes, with either Compose file.",
        ]),
      ],
    },
    {
      group: "A VM with Docker",
      id: "vm",
      label: "Any Linux VM",
      methods: vmMethods({
        title: "Install Docker",
        file: "shell",
        code: "docker compose version",
        standalone: "Install Docker Engine and the Compose plugin. Copy otterscale-standalone.yaml and its env example into the same directory. This confirms the plugin is present.",
        stack: "Install Docker Engine and the Compose plugin. Copy otterscale-stack.yaml and its env example into the same directory. This confirms the plugin is present.",
        dns: "Open TCP 80 and 443 to the VM. Point these names at that address.",
        dnsCode: "TCP 80\nTCP 443\nconsole.<custom domain>\nhs.<custom domain>\n*.<custom domain>",
      }),
    },
    {
      group: "A VM with Docker",
      id: "ec2",
      label: "AWS EC2",
      methods: vmMethods({
        title: "Instance",
        file: "ports",
        code: "TCP 80\nTCP 443",
        standalone: "Launch Ubuntu and attach a security group that allows TCP 80 and 443 from the internet. SSH stays on 22 for you. Install Docker Compose and copy otterscale-standalone.yaml and its env example onto the instance.",
        stack: "Launch Ubuntu and attach a security group that allows TCP 80 and 443 from the internet. SSH stays on 22 for you. Install Docker Compose and copy otterscale-stack.yaml and its env example onto the instance.",
        dns: "Route 53 records for these names aim at the instance.",
        dnsCode: "console.<custom domain>\nhs.<custom domain>\n*.<custom domain>",
      }),
    },
    {
      group: "A VM with Docker",
      id: "azure-vm",
      label: "Azure Virtual Machine",
      methods: vmMethods({
        title: "VM and disk",
        file: "ports",
        code: "TCP 80\nTCP 443",
        standalone: "Create an Ubuntu VM. Network security group: TCP 80 and 443. A data disk is optional if Docker’s volume lives on the OS disk. Copy otterscale-standalone.yaml and the env example.",
        stack: "Create an Ubuntu VM. Network security group: TCP 80 and 443. A data disk is optional if Docker’s volumes live on the OS disk. Copy otterscale-stack.yaml and the env example.",
        dns: "Point these names at the VM.",
        dnsCode: "console.<custom domain>\nhs.<custom domain>\n*.<custom domain>",
      }),
    },
    {
      group: "A VM with Docker",
      id: "gce",
      label: "GCP Compute Engine",
      methods: vmMethods({
        title: "VM and firewall",
        file: "shell",
        code: "gcloud compute firewall-rules create otterscale-web --allow=tcp:80,tcp:443",
        standalone: "Create a VM and reserve a static IP. Allow tcp:80 and tcp:443 on the VPC firewall. Install Docker Compose and copy otterscale-standalone.yaml and the env example.",
        stack: "Create a VM and reserve a static IP. Allow tcp:80 and tcp:443 on the VPC firewall. Install Docker Compose and copy otterscale-stack.yaml and the env example.",
        dns: "Cloud DNS records for these names point at the static IP. Clients use the Headscale hostname on 443. Do not publish 18080 in place of 443.",
        dnsCode: "console.<custom domain>\nhs.<custom domain>\n*.<custom domain>",
      }),
    },
    {
      group: "A VM with Docker",
      id: "droplet",
      label: "DigitalOcean Droplet",
      methods: vmMethods({
        title: "Droplet",
        file: "ports",
        code: "TCP 80\nTCP 443",
        standalone: "Create a Droplet with Docker, or install the Compose plugin. Cloud Firewall: TCP 80 and 443. Copy otterscale-standalone.yaml and the env example. This is the DigitalOcean path that can keep the data. App Platform cannot.",
        stack: "Create a Droplet with Docker, or install the Compose plugin. Cloud Firewall: TCP 80 and 443. Copy otterscale-stack.yaml and the env example. This is the DigitalOcean path that can keep the data. App Platform cannot.",
        dns: "Point these names at the Droplet.",
        dnsCode: "console.<custom domain>\nhs.<custom domain>\n*.<custom domain>",
      }),
    },
  ];

  function add(parent, tag, text) {
    const node = document.createElement(tag);
    if (text) node.textContent = text;
    parent.appendChild(node);
    return node;
  }

  function renderStep(item) {
    const row = add(panel, "article");
    row.className = "guide-step";
    const copy = add(row, "div");
    copy.className = "guide-copy";
    add(copy, "span", item.num).className = "guide-num";
    add(copy, "h3", item.title);
    item.paragraphs.forEach((paragraph) => add(copy, "p", paragraph));
    if (!item.code) {
      row.classList.add("guide-step-text");
      return;
    }
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
  }

  let methodIndex = 0;

  function render(id) {
    const provider = providers.find((item) => item.id === id) || providers[0];
    panel.replaceChildren();
    const methods = provider.methods;
    const steps = methods ? methods[Math.min(methodIndex, methods.length - 1)].steps : provider.steps;
    if (methods) {
      const method = methods[Math.min(methodIndex, methods.length - 1)];
      const tabs = add(panel, "div");
      tabs.className = "method-tabs";
      tabs.setAttribute("role", "tablist");
      tabs.setAttribute("aria-label", "Install method");
      methods.forEach((item, index) => {
        const button = add(tabs, "button", item.tab);
        const selected = item === method;
        button.type = "button";
        button.className = "method-tab" + (selected ? " is-active" : "");
        button.setAttribute("role", "tab");
        button.setAttribute("aria-selected", selected ? "true" : "false");
        button.addEventListener("click", () => {
          methodIndex = index;
          render(select.value);
        });
      });
      add(panel, "p", method.note).className = "method-note";
    }
    steps.forEach(renderStep);
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
