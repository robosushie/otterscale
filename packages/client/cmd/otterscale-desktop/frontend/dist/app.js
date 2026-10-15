const views = {
  dashboard: ["Dashboard", "This computer on the mesh."],
  settings: ["Settings", "Local settings for this computer."],
};

const $ = (id) => document.getElementById(id);

let lastStatus = { backendState: "", hostname: "", addresses: [], loginServer: "", message: "" };

function bridge() {
  return window.go && window.go.main && window.go.main.App;
}

function text(err) {
  if (!err) return "";
  if (typeof err === "string") return err;
  return err.message || String(err);
}

function showView(name) {
  for (const key of Object.keys(views)) {
    $("view-" + key).hidden = key !== name;
    document.querySelector('[data-view="' + key + '"]').classList.toggle("active", key === name);
  }
  $("heading").textContent = views[name][0];
  $("lede").textContent = views[name][1];
}

function showTab(name) {
  for (const tab of ["general", "network"]) {
    const on = tab === name;
    $("tab-" + tab).hidden = !on;
    const button = document.querySelector('[data-tab="' + tab + '"]');
    button.classList.toggle("active", on);
    button.setAttribute("aria-selected", on ? "true" : "false");
  }
}

function openNetwork() {
  showView("settings");
  showTab("network");
}

function savedLogin() {
  return ($("modal-login").dataset.saved || "").trim();
}

async function loadConfig() {
  const file = await bridge().GetConfig();
  $("console-url").value = file.consoleUrl || "";
  $("settings-host").value = file.hostname || "";
  $("modal-login").dataset.saved = file.loginServer || "";
  return file;
}

function paint(status) {
  lastStatus = status || lastStatus;
  const on = lastStatus.backendState === "Running";
  for (const dot of document.querySelectorAll(".dot")) {
    dot.classList.toggle("ok", on);
    dot.classList.toggle("off", !on);
  }
  const label = on ? "Connected" : "Not connected";
  $("status-label").textContent = label;
  $("network-state").textContent = label;
  const host = lastStatus.hostname || "—";
  const addresses = lastStatus.addresses && lastStatus.addresses.length ? lastStatus.addresses.join(", ") : "—";
  const login = lastStatus.loginServer || savedLogin() || "—";
  $("device-host").textContent = host;
  $("device-addrs").textContent = addresses;
  $("dash-login").textContent = login;
  $("net-host").textContent = host;
  $("net-addrs").textContent = addresses;
  $("net-login").textContent = login;
  $("dash-message").textContent = lastStatus.message || "";
  $("dash-login-wrap").hidden = !on;
  $("dash-add").hidden = on;
  $("network-empty").hidden = on;
  $("network-live").hidden = !on;
}

async function refresh() {
  if (!bridge()) return;
  try {
    paint(await bridge().GetStatus());
  } catch (err) {
    $("dash-message").textContent = text(err);
  }
}

function openRegister() {
  $("modal-login").value = savedLogin() || (lastStatus.loginServer && lastStatus.loginServer !== "—" ? lastStatus.loginServer : "");
  $("auth-key").value = "";
  $("modal-message").textContent = "";
  $("register-dialog").showModal();
}

async function rememberHostname(status) {
  const file = await bridge().GetConfig();
  const hostname = (file.hostname || "").trim();
  const live = (status.hostname || "").trim();
  if (hostname || !live || live === "—") return;
  await bridge().SaveConfig({
    consoleUrl: file.consoleUrl || "",
    loginServer: file.loginServer || "",
    hostname: live,
  });
}

document.querySelectorAll(".nav").forEach((button) => {
  button.addEventListener("click", () => showView(button.dataset.view));
});

document.querySelectorAll(".tab").forEach((button) => {
  button.addEventListener("click", () => showTab(button.dataset.tab));
});

$("dash-add").addEventListener("click", openNetwork);
$("register-open").addEventListener("click", openRegister);
$("register-again").addEventListener("click", openRegister);

$("modal-cancel").addEventListener("click", () => {
  $("register-dialog").close();
});

$("register-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = event.currentTarget.querySelector("button[type=submit]");
  button.disabled = true;
  $("modal-message").textContent = "Registering…";
  try {
    await bridge().Connect($("auth-key").value, $("modal-login").value.trim(), "");
    $("auth-key").value = "";
    await refresh();
    await rememberHostname(lastStatus);
    await loadConfig();
    paint(lastStatus);
    $("register-dialog").close();
    $("network-message").textContent = "This machine was registered.";
    openNetwork();
  } catch (err) {
    $("modal-message").textContent = text(err);
  } finally {
    button.disabled = false;
  }
});

$("disconnect").addEventListener("click", async () => {
  const button = $("disconnect");
  button.disabled = true;
  $("network-message").textContent = "Disconnecting…";
  try {
    await bridge().Disconnect();
    $("network-message").textContent = "";
    await refresh();
  } catch (err) {
    $("network-message").textContent = text(err);
  } finally {
    button.disabled = false;
  }
});

$("settings-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  $("settings-message").textContent = "";
  try {
    const existing = await bridge().GetConfig();
    await bridge().SaveConfig({
      consoleUrl: $("console-url").value.trim(),
      loginServer: existing.loginServer || "",
      hostname: $("settings-host").value.trim(),
    });
    await loadConfig();
    $("settings-message").textContent = "Saved.";
    refresh();
  } catch (err) {
    $("settings-message").textContent = text(err);
  }
});

$("open-console").addEventListener("click", async () => {
  try {
    await bridge().OpenConsole();
    $("settings-message").textContent = "";
  } catch (err) {
    $("settings-message").textContent = text(err);
  }
});

function boot() {
  if (!bridge()) {
    setTimeout(boot, 50);
    return;
  }
  loadConfig()
    .catch((err) => {
      $("dash-message").textContent = text(err);
    })
    .finally(refresh);
  setInterval(refresh, 3000);
}

boot();
