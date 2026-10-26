const views = {
  dashboard: ["Dashboard", "This computer on the mesh."],
  machines: ["Machines", "Your machines, and the other devices in a workspace."],
  apps: ["Apps", "Your apps, and the other apps in a workspace."],
  settings: ["Settings", "Local settings for this computer."],
};

const $ = (id) => document.getElementById(id);

let lastStatus = { backendState: "", hostname: "", addresses: [], loginServer: "", message: "" };
let saved = { baseDomain: "", consoleUrl: "", apiUrl: "", loginServer: "", hostname: "" };
let currentView = "dashboard";
let network = { workspaces: [], machines: [], apps: [] };
let networkError = "";
let machineWorkspace = "";
let appWorkspace = "";

function bridge() {
  return window.go && window.go.main && window.go.main.App;
}

function text(err) {
  if (!err) return "";
  if (typeof err === "string") return err;
  return err.message || String(err);
}

function showView(name) {
  currentView = name;
  for (const key of Object.keys(views)) {
    $("view-" + key).hidden = key !== name;
    document.querySelector('[data-view="' + key + '"]').classList.toggle("active", key === name);
  }
  $("heading").textContent = views[name][0];
  $("lede").textContent = views[name][1];
  if (name === "machines" || name === "apps") refreshNetwork();
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

function fillSelect(id, workspaces, selected) {
  const select = $(id);
  const keep = selected && workspaces.some((workspace) => workspace.id === selected);
  const value = keep ? selected : (workspaces[0] && workspaces[0].id) || "";
  select.replaceChildren();
  for (const workspace of workspaces) {
    const option = document.createElement("option");
    option.value = workspace.id;
    option.textContent = workspace.name;
    select.append(option);
  }
  select.value = value;
  select.hidden = workspaces.length === 0;
  return value;
}

function cell(value) {
  const td = document.createElement("td");
  td.textContent = value;
  return td;
}

function statusDot(on, onLabel, offLabel) {
  const span = document.createElement("span");
  span.className = on ? "dot ok" : "dot";
  span.setAttribute("role", "img");
  span.setAttribute("aria-label", on ? onLabel : offLabel);
  return span;
}

function paintRows(tableId, emptyId, rows, build, emptyText) {
  const table = $(tableId);
  const empty = $(emptyId);
  table.tBodies[0].replaceChildren(...rows.map(build));
  table.hidden = rows.length === 0;
  empty.hidden = rows.length > 0;
  empty.textContent = emptyText;
}

function leadingCell(label, on, onLabel, offLabel) {
  const td = document.createElement("td");
  const wrap = document.createElement("span");
  wrap.className = "name-with-dot";
  wrap.append(statusDot(on, onLabel, offLabel), document.createTextNode(label || "—"));
  td.append(wrap);
  return td;
}

function machineRow(machine) {
  const tr = document.createElement("tr");
  tr.append(
    leadingCell(machine.name, Boolean(machine.online), "Online", "Offline"),
    cell(machine.hostname || "—"),
    cell(machine.addresses && machine.addresses.length ? machine.addresses.join(", ") : "—"),
    cell(machine.addedBy || "—"),
  );
  return tr;
}

function appRow(app) {
  const tr = document.createElement("tr");
  tr.append(
    leadingCell(app.subdomain, app.status === "ACTIVE", "Running", "Stopped"),
    cell(app.machine || "—"),
    cell(app.port ? String(app.port) : "—"),
    cell(app.addedBy || "—"),
  );
  return tr;
}

function paintNetwork() {
  const workspaces = network.workspaces || [];
  const enrolled = !networkError;
  machineWorkspace = fillSelect("machines-workspace", workspaces, machineWorkspace);
  appWorkspace = fillSelect("apps-workspace", workspaces, appWorkspace);
  const machines = (network.machines || []).filter((machine) => (machine.workspaceIds || []).includes(machineWorkspace));
  const apps = (network.apps || []).filter((app) => (app.workspaceIds || []).includes(appWorkspace));
  paintRows("machines", "machines-empty", enrolled ? machines : [], machineRow, enrolled ? "No machines in this workspace." : networkError);
  paintRows("apps", "apps-empty", enrolled ? apps : [], appRow, enrolled ? "No apps in this workspace." : networkError);
}

async function refreshNetwork() {
  if (!bridge() || (currentView !== "machines" && currentView !== "apps")) return;
  try {
    network = await bridge().Network();
    networkError = "";
  } catch (err) {
    network = { workspaces: [], machines: [], apps: [] };
    networkError = text(err);
  }
  paintNetwork();
}

async function refresh() {
  if (!bridge()) return;
  try {
    paint(await bridge().GetStatus());
  } catch (err) {
    $("dash-message").textContent = text(err);
  }
  await refreshNetwork();
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

$("machines-workspace").addEventListener("change", () => {
  machineWorkspace = $("machines-workspace").value;
  paintNetwork();
});

$("apps-workspace").addEventListener("change", () => {
  appWorkspace = $("apps-workspace").value;
  paintNetwork();
});

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
  if (window.runtime && window.runtime.EventsOn) {
    window.runtime.EventsOn("connect-progress", (message) => {
      if (typeof message === "string" && message) $("settings-message").textContent = message;
    });
  }
  loadConfig()
    .catch((err) => {
      $("dash-message").textContent = text(err);
    })
    .finally(refresh);
  setInterval(refresh, 3000);
}

boot();
