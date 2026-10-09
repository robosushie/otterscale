(function () {
  const cfg = window.OTTERSCALE || {};
  document.querySelectorAll("[data-github]").forEach((el) => {
    el.setAttribute("href", cfg.github || el.getAttribute("href"));
  });
  document.querySelectorAll("[data-ghcr]").forEach((el) => {
    el.setAttribute("href", cfg.ghcr || el.getAttribute("href"));
  });
})();
