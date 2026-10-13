(function () {
  document.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-copy], [data-copy-text]");
    if (!button) return;
    const icon = button.querySelector(".material-symbols-outlined");
    const label = icon ? icon.textContent : button.textContent;
    try {
      const inline = button.getAttribute("data-copy-text");
      const text = inline
        ? inline
        : await fetch(button.getAttribute("data-copy")).then((response) => {
            if (!response.ok) throw new Error("missing");
            return response.text();
          });
      await navigator.clipboard.writeText(text);
      if (icon) icon.textContent = "check";
      else button.textContent = "Copied";
    } catch {
      if (icon) icon.textContent = "error";
      else button.textContent = "Copy failed";
    }
    window.clearTimeout(button._copyTimer);
    button._copyTimer = window.setTimeout(() => {
      if (icon) icon.textContent = label === "check" || label === "error" ? "content_copy" : label;
      else button.textContent = label;
    }, 1600);
  });

  const host = document.querySelector("[data-releases]");
  if (!host) return;

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function rows(prefix, names, tag) {
    return names
      .map((name) => {
        const path = prefix + "/" + name + ":" + tag;
        const safe = escapeHtml(path);
        return (
          '<li class="image-path"><code>' +
          safe +
          '</code><button type="button" class="icon-btn" data-copy-text="' +
          safe +
          '" aria-label="Copy ' +
          safe +
          '"><span class="material-symbols-outlined" aria-hidden="true">content_copy</span></button></li>'
        );
      })
      .join("");
  }

  function column(title, prefix, names, tag) {
    return (
      '<section class="release-col"><h4>' +
      escapeHtml(title) +
      '</h4><ul class="pull-list">' +
      rows(prefix, names, tag) +
      "</ul></section>"
    );
  }

  function panel(label, tag, prefix, data, open) {
    const stack = data.stack || ["headscale", "core", "app", "edge"];
    const standalone = data.standalone || ["standalone"];
    return (
      '<details class="release-panel"' +
      (open ? " open" : "") +
      '><summary><span class="release-summary-copy"><span class="caption">' +
      escapeHtml(label) +
      '</span><span class="release-tag">' +
      escapeHtml(tag) +
      '</span></span><span class="material-symbols-outlined accordion-chevron" aria-hidden="true">keyboard_arrow_down</span></summary><div class="release-split">' +
      column("Stack", prefix, stack, tag) +
      column("Standalone", prefix, standalone, tag) +
      "</div></details>"
    );
  }

  fetch("./releases.json")
    .then((response) => (response.ok ? response.json() : null))
    .then((data) => {
      if (!data || !data.latest) {
        host.textContent = "No published docker images.";
        return;
      }
      const prefix = data.prefix || "ghcr.io/robosushie/otterscale";
      const older = (data.history || []).filter((tag) => tag && tag !== data.latest);
      if (!older.length && data.previous && data.previous !== data.latest) older.push(data.previous);
      host.innerHTML =
        panel("Latest", data.latest, prefix, data, true) +
        older.map((tag) => panel("Tag", tag, prefix, data, false)).join("");
    })
    .catch(() => {
      host.textContent = "No published docker images.";
    });
})();
