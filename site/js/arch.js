(function () {
  const host = document.querySelector("[data-arch]");
  if (!host) return;

  const nodes = [
    { id: "browser", x: 28, y: 36, label: "Browser" },
    { id: "clients", x: 28, y: 200, label: "Tailscale clients" },
    { id: "edge", x: 280, y: 118, label: "edge Caddy + tsnet" },
    { id: "console", x: 532, y: 36, label: "Console" },
    { id: "hs", x: 532, y: 200, label: "Headscale" },
    { id: "mesh", x: 760, y: 118, label: "Mesh 100.x" },
  ];
  const edges = [
    ["browser", "edge"],
    ["clients", "hs"],
    ["edge", "console"],
    ["edge", "hs"],
    ["edge", "mesh"],
    ["console", "hs"],
  ];
  const copy = {
    browser: "The console UI reaches Headscale through edge TLS, not from the laptop loopback.",
    clients: "Official Tailscale clients speak the login-server — local HTTP or OTTERSCALE_DOMAIN.",
    edge: "Caddy terminates TLS. A Go tsnet hop reverse-proxies Network Apps onto mesh IPs.",
    console: "Next.js issues keys, compiles policy, and writes routes.json for edge.",
    hs: "Headscale is the coordination engine. One process per tailnet.",
    mesh: "Peers talk 100.64.0.0/10. This hop is not Funnel.",
  };

  function xy(id) {
    const n = nodes.find((item) => item.id === id);
    return { x: n.x + 96, y: n.y + 22 };
  }

  const edgeMarkup = edges
    .map(([a, b]) => {
      const p = xy(a);
      const q = xy(b);
      return `<path class="arch-edge" data-a="${a}" data-b="${b}" d="M${p.x} ${p.y} L${q.x} ${q.y}" />`;
    })
    .join("");

  const nodeMarkup = nodes
    .map(
      (n) => `
      <g class="arch-node" data-id="${n.id}" tabindex="0" role="button" aria-label="${n.label}">
        <rect x="${n.x}" y="${n.y}" width="192" height="44" rx="8" />
        <text x="${n.x + 16}" y="${n.y + 27}">${n.label}</text>
      </g>`,
    )
    .join("");

  host.innerHTML = `
    <svg viewBox="0 0 980 280" role="img" aria-label="Otterscale architecture">
      ${edgeMarkup}
      ${nodeMarkup}
    </svg>
    <p class="arch-caption" data-arch-caption>Hover a node. Browser and clients enter at the edge; the console talks to Headscale; apps land on the mesh.</p>
  `;

  const caption = host.querySelector("[data-arch-caption]");
  const nodeEls = host.querySelectorAll(".arch-node");
  const edgeEls = host.querySelectorAll(".arch-edge");

  function setActive(id) {
    nodeEls.forEach((el) => el.classList.toggle("is-on", el.getAttribute("data-id") === id));
    edgeEls.forEach((el) => {
      const on = el.getAttribute("data-a") === id || el.getAttribute("data-b") === id;
      el.classList.toggle("is-on", on);
    });
    if (caption && id) caption.textContent = copy[id];
  }

  function clear() {
    nodeEls.forEach((el) => el.classList.remove("is-on"));
    edgeEls.forEach((el) => el.classList.remove("is-on"));
    if (caption) {
      caption.textContent =
        "Hover a node. Browser and clients enter at the edge; the console talks to Headscale; apps land on the mesh.";
    }
  }

  nodeEls.forEach((el) => {
    const id = el.getAttribute("data-id");
    el.addEventListener("pointerenter", () => setActive(id));
    el.addEventListener("focus", () => setActive(id));
    el.addEventListener("pointerleave", clear);
    el.addEventListener("blur", clear);
  });
})();
