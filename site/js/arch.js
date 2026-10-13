(function () {
  const host = document.querySelector("[data-arch]");
  if (!host) return;

  const cardW = 220;
  const cardH = 118;
  const nodes = [
    {
      id: "devices",
      title: "Devices",
      sub: "Laptops, phones, servers",
      icon: "devices",
      x: 380,
      y: 16,
    },
    {
      id: "edge",
      title: "Edge",
      sub: "Caddy and tsnet",
      icon: "router",
      container: true,
      x: 380,
      y: 188,
    },
    {
      id: "console",
      title: "Console",
      sub: "Vite app",
      icon: "web",
      container: true,
      x: 24,
      y: 372,
    },
    {
      id: "core",
      title: "Core",
      sub: "Go API",
      icon: "api",
      container: true,
      x: 380,
      y: 372,
    },
    {
      id: "hs",
      title: "Headscale",
      sub: "Coordination",
      icon: "hub",
      container: true,
      x: 736,
      y: 372,
    },
    {
      id: "apps",
      title: "Apps",
      sub: "Published on a device",
      icon: "widgets",
      x: 24,
      y: 556,
    },
    {
      id: "db",
      title: "Database",
      sub: "SQLite or Postgres",
      icon: "database",
      x: 520,
      y: 556,
    },
  ];
  const links = [
    ["devices", "edge", "bottom", "top", 0],
    ["edge", "console", "bottom", "top", 0],
    ["edge", "core", "bottom", "top", 0],
    ["edge", "hs", "bottom", "top", 0],
    ["edge", "apps", "bottom", "top", 0],
    ["core", "hs", "right", "left", 0],
    ["core", "db", "bottom", "top", -36],
    ["hs", "db", "bottom", "top", 36],
  ];
  const copy = {
    devices:
      "Laptops, phones, and servers run the official Tailscale app. They open the console in a browser and join this login server. Otterscale does not ship its own VPN client.",
    edge: "The edge container terminates TLS and routes the console, the API, and Headscale. Its tsnet process joins as hostname edge with tag:edge and proxies published apps onto the device that hosts them.",
    console: "The console container serves the static Vite app. The browser talks to Core on /api and listens on /api/live.",
    core: "The core container is the Go API. It owns sessions, workspaces, policy, audit, and auth keys, and calls the Headscale API.",
    hs: "The Headscale container is the coordination server for this tailnet. Init mints its API key onto the secrets volume. This is not Funnel.",
    apps: "An app is a service already running on a laptop or server. Edge reverse-proxies its hostname onto that device's address. The app is not a separate container in this stack.",
    db: "Core uses SQLite at /data/otterscale.db when DATABASE_URL is empty, or Postgres when the URL is postgres://. Headscale keeps a separate SQLite file on its own volume.",
  };
  const idle =
    "Hover a box. Devices join through the edge container. Core keeps state in SQLite or Postgres. A published app stays on the device that runs it.";

  function byId(id) {
    return nodes.find((node) => node.id === id);
  }

  function port(node, side, nudge) {
    const x = node.x;
    const y = node.y;
    if (side === "top") return { x: x + cardW / 2 + nudge, y: y };
    if (side === "bottom") return { x: x + cardW / 2 + nudge, y: y + cardH };
    if (side === "left") return { x: x, y: y + cardH / 2 + nudge };
    return { x: x + cardW, y: y + cardH / 2 + nudge };
  }

  function curve(a, b, from, to) {
    const horizontal = from === "left" || from === "right" || to === "left" || to === "right";
    if (horizontal && Math.abs(a.y - b.y) < 8) {
      const mid = (a.x + b.x) / 2;
      return "M" + a.x + " " + a.y + " C" + mid + " " + a.y + ", " + mid + " " + b.y + ", " + b.x + " " + b.y;
    }
    const mid = (a.y + b.y) / 2;
    return "M" + a.x + " " + a.y + " C" + a.x + " " + mid + ", " + b.x + " " + mid + ", " + b.x + " " + b.y;
  }

  const edgeMarkup = links
    .map(([fromId, toId, fromSide, toSide, nudge]) => {
      const start = port(byId(fromId), fromSide, 0);
      const end = port(byId(toId), toSide, nudge);
      return (
        '<path class="arch-edge" data-a="' +
        fromId +
        '" data-b="' +
        toId +
        '" d="' +
        curve(start, end, fromSide, toSide) +
        '" />'
      );
    })
    .join("");

  const cardMarkup = nodes
    .map((node) => {
      const kind = node.container ? " is-container" : "";
      const kicker = node.container
        ? '<span class="material-symbols-outlined" aria-hidden="true">' +
          node.icon +
          "</span><span>Container</span>"
        : '<span class="material-symbols-outlined" aria-hidden="true">' + node.icon + "</span>";
      return (
        '<button type="button" class="arch-card' +
        kind +
        '" data-id="' +
        node.id +
        '" style="left:' +
        node.x +
        "px;top:" +
        node.y +
        'px" aria-label="' +
        node.title +
        ", " +
        node.sub +
        '"><span class="arch-kicker">' +
        kicker +
        '</span><span class="arch-title">' +
        node.title +
        '</span><span class="arch-sub">' +
        node.sub +
        "</span></button>"
      );
    })
    .join("");

  host.innerHTML =
    '<div class="arch-board">' +
    '<svg class="arch-wires" viewBox="0 0 980 700" role="img" aria-label="Otterscale architecture">' +
    edgeMarkup +
    "</svg>" +
    cardMarkup +
    "</div>" +
    '<p class="arch-caption" data-arch-caption>' +
    idle +
    "</p>";

  const caption = host.querySelector("[data-arch-caption]");
  const cards = host.querySelectorAll(".arch-card");
  const edges = host.querySelectorAll(".arch-edge");

  function setActive(id) {
    cards.forEach((el) => el.classList.toggle("is-on", el.getAttribute("data-id") === id));
    edges.forEach((el) => {
      const on = el.getAttribute("data-a") === id || el.getAttribute("data-b") === id;
      el.classList.toggle("is-on", on);
    });
    if (caption) caption.textContent = copy[id];
  }

  function clear() {
    cards.forEach((el) => el.classList.remove("is-on"));
    edges.forEach((el) => el.classList.remove("is-on"));
    if (caption) caption.textContent = idle;
  }

  cards.forEach((el) => {
    const id = el.getAttribute("data-id");
    el.addEventListener("pointerenter", () => setActive(id));
    el.addEventListener("focus", () => setActive(id));
    el.addEventListener("pointerleave", clear);
    el.addEventListener("blur", clear);
  });
})();
