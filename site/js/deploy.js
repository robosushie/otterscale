(function () {
  document.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-copy], [data-copy-text]");
    if (!button) return;
    const label = button.textContent;
    try {
      const inline = button.getAttribute("data-copy-text");
      const text = inline
        ? inline
        : await fetch(button.getAttribute("data-copy")).then((response) => {
            if (!response.ok) throw new Error("missing");
            return response.text();
          });
      await navigator.clipboard.writeText(text);
      button.textContent = "Copied";
    } catch {
      button.textContent = "Copy failed";
    }
    window.setTimeout(() => {
      button.textContent = label;
    }, 1600);
  });

  const host = document.querySelector("[data-releases]");
  if (!host) return;

  function namesFor(data) {
    return (data.standalone || ["standalone"]).concat(data.stack || ["headscale", "core", "app", "edge"]);
  }

  function rows(prefix, names, tag) {
    return names
      .map((name) => {
        const path = prefix + "/" + name + ":" + tag;
        return (
          '<li class="image-path"><code>' +
          path +
          '</code><button type="button" class="btn btn-ghost" data-copy-text="' +
          path +
          '" aria-label="Copy ' +
          path +
          '">Copy</button></li>'
        );
      })
      .join("");
  }

  fetch("./releases.json")
    .then((response) => (response.ok ? response.json() : null))
    .then((data) => {
      if (!data || !data.latest) {
        host.textContent = "No published docker images.";
        return;
      }
      const prefix = data.prefix || "ghcr.io/robosushie/otterscale";
      const names = namesFor(data);
      const older = (data.history || []).filter((tag) => tag && tag !== data.latest);
      if (!older.length && data.previous && data.previous !== data.latest) older.push(data.previous);
      let html =
        '<article class="release-current"><p class="caption">Latest</p><h3>' +
        data.latest +
        '</h3><ul class="pull-list">' +
        rows(prefix, names, data.latest) +
        "</ul></article>";
      if (older.length) {
        html +=
          '<details class="release-older"><summary>Older tags</summary>' +
          older
            .map(
              (tag) =>
                "<details><summary><code>" +
                tag +
                '</code></summary><ul class="pull-list">' +
                rows(prefix, names, tag) +
                "</ul></details>",
            )
            .join("") +
          "</details>";
      }
      host.innerHTML = html;
    })
    .catch(() => {
      host.textContent = "No published docker images.";
    });
})();
