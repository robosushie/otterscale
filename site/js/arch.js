(function () {
  const host = document.querySelector("[data-arch]");
  if (!host) return;

  const cardW = 200;
  const cardH = 72;
  const nodes = [
    { id: "browser", title: "Browser", sub: "Console UI", x: 40, y: 24 },
    { id: "clients", title: "Tailscale clients", sub: "Official apps", x: 740, y: 24 },
    { id: "edge", title: "Edge", sub: "Caddy and tsnet", x: 390, y: 168 },
    { id: "console", title: "Console", sub: "Static Vite app", x: 40, y: 340 },
    { id: "core", title: "Core", sub: "Go API", x: 390, y: 340 },
    { id: "hs", title: "Headscale", sub: "Coordination", x: 740, y: 340 },
    { id: "mesh", title: "Mesh", sub: "Published apps", x: 180, y: 530 },
    { id: "data", title: "Data", sub: "SQLite or Postgres", x: 600, y: 530 },
  ];
  const links = [
    ["browser", "edge", "bottom", "top", -36],
    ["clients", "edge", "bottom", "top", 36],
    ["edge", "console", "bottom", "top", -48],
    ["edge", "core", "bottom", "top", 0],
    ["edge", "hs", "bottom", "top", 48],
    ["edge", "mesh", "bottom", "top", -70],
    ["core", "hs", "right", "left", 0],
    ["core", "data", "bottom", "top", -28],
    ["hs", "data", "bottom", "top", 28],
  ];
  const copy = {
    browser: "The browser opens the console through edge TLS. API calls stay on the same host.",
    clients:
      "Official Tailscale apps use the login server. Locally that is http://127.0.0.1:8080. In production it is OTTERSCALE_DOMAIN.",
    edge: "Caddy terminates TLS for the console, Headscale, and published apps. The tsnet process joins as hostname edge with tag:edge. Init mints that key onto the secrets volume.",
    console: "The Vite app is static files. It talks to the Go API on /api and listens on /api/live.",
    core: "Core owns sessions, workspaces, policy, audit, and machine keys. It calls the Headscale API and writes routes.json for edge.",
    hs: "Headscale is the coordination engine, one process for this tailnet. It keeps its own SQLite state. This is not Funnel.",
    data: "An empty DATABASE_URL creates /data/otterscale.db. postgres:// uses Postgres. Headscale state stays in its own SQLite file.",
    mesh: "Published apps are reached on 100.64.0.0/10 through the edge node. This hop is not Funnel.",
  };
  const idle =
    "Hover a box. Init mints Headscale keys onto the secrets volume. Edge joins as tag:edge. Published apps use the mesh, not Funnel.";

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
    .map(
      (node) =>
        '<button type="button" class="arch-card" data-id="' +
        node.id +
        '" style="left:' +
        node.x +
        "px;top:" +
        node.y +
        'px" aria-label="' +
        node.title +
        ", " +
        node.sub +
        '"><span class="arch-title">' +
        node.title +
        '</span><span class="arch-sub">' +
        node.sub +
        "</span></button>",
    )
    .join("");

  host.innerHTML =
    '<div class="arch-board">' +
    '<svg class="arch-wires" viewBox="0 0 980 640" role="img" aria-label="Otterscale architecture">' +
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
