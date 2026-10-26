const views = {
  dashboard: ["Dashboard", "This computer on the mesh."],
  settings: ["Settings", "Local settings for this computer."],
};

const $ = (id) => document.getElementById(id);

let lastStatus = { backendState: "", hostname: "", addresses: [], loginServer: "", message: "" };
let saved = { baseDomain: "", consoleUrl: "", apiUrl: "", loginServer: "", hostname: "" };

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

function showOrDash(value) {
  return (value || "").trim() || "—";
}

function consoleLogin() {
  if (!(saved.consoleUrl || "").trim()) return "";
  return (saved.loginServer || "").trim();
}

async function loadConfig() {
  const file = await bridge().GetConfig();
  saved = {
    baseDomain: file.baseDomain || "",
    consoleUrl: file.consoleUrl || "",
    apiUrl: file.apiUrl || "",
    loginServer: file.loginServer || "",
    hostname: file.hostname || "",
  };
  $("base-domain").value = saved.baseDomain;
  $("settings-host").value = saved.hostname;
  $("saved-console").textContent = showOrDash(saved.consoleUrl);
  $("saved-api").textContent = showOrDash(saved.apiUrl);
  $("saved-login").textContent = showOrDash(consoleLogin());
  $("network-login").value = consoleLogin();
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
  const login = lastStatus.loginServer || saved.loginServer || "—";
  $("device-host").textContent = host;
  $("device-addrs").textContent = addresses;
  $("dash-login").textContent = login;
  $("net-host").textContent = host;
  $("net-addrs").textContent = addresses;
  $("dash-message").textContent = lastStatus.message || "";
  $("dash-login-wrap").hidden = !on;
  $("dash-add").hidden = on;
  $("network-empty").hidden = on;
  $("network-live").hidden = !on;
  $("disconnect").hidden = !on;
  $("register-label").textContent = on ? "Register to a new network" : "Register to a network";
}

async function refresh() {
  if (!bridge()) return;
  try {
    paint(await bridge().GetStatus());
  } catch (err) {
    $("dash-message").textContent = text(err);
  }
}

async function rememberHostname(status) {
  const file = await bridge().GetConfig();
  const hostname = (file.hostname || "").trim();
  const live = (status.hostname || "").trim();
  if (hostname || !live || live === "—") return;
  await bridge().SaveConfig({ ...file, hostname: live });
}

document.querySelectorAll(".nav").forEach((button) => {
  button.addEventListener("click", () => showView(button.dataset.view));
});

document.querySelectorAll(".tab").forEach((button) => {
  button.addEventListener("click", () => showTab(button.dataset.tab));
});

$("dash-add").addEventListener("click", openNetwork);

$("register-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const login = consoleLogin();
  if (!login) {
    $("network-message").textContent = "Connect to the console in General first.";
    return;
  }
  const button = $("register");
  button.disabled = true;
  $("network-message").textContent = "Registering…";
  try {
    await bridge().Connect($("auth-key").value, login, "");
    $("auth-key").value = "";
    await refresh();
    await rememberHostname(lastStatus);
    await loadConfig();
    paint(lastStatus);
    $("network-message").textContent = "This machine was registered.";
  } catch (err) {
    $("network-message").textContent = text(err);
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
      ...existing,
      baseDomain: $("base-domain").value.trim(),
      hostname: $("settings-host").value.trim(),
    });
    await loadConfig();
    $("settings-message").textContent = "Saved.";
    refresh();
  } catch (err) {
    $("settings-message").textContent = text(err);
  }
});

$("connect-console").addEventListener("click", async () => {
  const button = $("connect-console");
  const typed = $("base-domain").value.trim();
  button.disabled = true;
  $("settings-message").textContent = "Waiting for you to approve this computer in the browser…";
  try {
    await bridge().ConnectConsole(typed);
    await loadConfig();
    await refresh();
    $("settings-message").textContent = "This computer is connected.";
    openNetwork();
  } catch (err) {
    await loadConfig().catch(() => undefined);
    if (!$("base-domain").value.trim()) $("base-domain").value = typed;
    $("settings-message").textContent = text(err);
  } finally {
    button.disabled = false;
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
