(function () {
  const cfg = window.OTTERSCALE || {};
  document.querySelectorAll("[data-github]").forEach((el) => {
    el.setAttribute("href", cfg.github || el.getAttribute("href"));
  });
  document.querySelectorAll("[data-ghcr]").forEach((el) => {
    el.setAttribute("href", cfg.ghcr || el.getAttribute("href"));
  });

  document.querySelectorAll("[data-nav]").forEach((nav) => {
    const toggle = nav.querySelector("[data-nav-toggle]");
    const links = nav.querySelector(".nav-links");
    if (!toggle || !links) return;
    toggle.addEventListener("click", () => {
      const open = nav.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
      toggle.textContent = open ? "Close" : "Menu";
    });
  });
})();
