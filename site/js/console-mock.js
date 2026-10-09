(function () {
  const html = `
    <div class="console-frame" data-console>
      <aside class="console-side" aria-label="Console">
        <div class="console-mark">Otterscale</div>
        <div class="console-group">Network</div>
        <button type="button" class="nested is-on" data-panel="machines">Machines</button>
        <button type="button" class="nested" data-panel="apps">Apps</button>
        <button type="button" data-panel="users">Users</button>
        <div class="console-group">Access controls</div>
        <button type="button" class="nested" data-panel="workspaces">Workspaces</button>
        <button type="button" class="nested" data-panel="policies">Policies</button>
        <div class="console-group">Audit</div>
        <button type="button" class="nested" data-panel="audit">System logs</button>
        <div class="console-group">Settings</div>
        <button type="button" class="nested" data-panel="keys">Keys</button>
      </aside>
      <div class="console-main">
        <section class="console-panel" data-view="machines">
          <h3>Machines</h3>
          <p class="blurb">Nodes on the tailnet. Dummy data for the marketing site.</p>
          <table class="console-table">
            <thead><tr><th>Name</th><th>Address</th><th>Tags</th><th>Last seen</th></tr></thead>
            <tbody>
              <tr><td>build-01</td><td>100.64.0.11</td><td><span class="tag">prod</span></td><td>2 min ago</td></tr>
              <tr><td>laptop-sam</td><td>100.64.0.18</td><td><span class="tag">dev</span></td><td>14 min ago</td></tr>
              <tr><td>prod-db</td><td>100.64.0.4</td><td><span class="tag">prod</span></td><td>1 hr ago</td></tr>
            </tbody>
          </table>
        </section>
        <section class="console-panel" data-view="apps" hidden>
          <h3>Apps</h3>
          <p class="blurb">Published mesh hostnames. Edge reverse-proxies onto 100.x.</p>
          <table class="console-table">
            <thead><tr><th>Hostname</th><th>Target</th><th>Status</th></tr></thead>
            <tbody>
              <tr><td>grafana.apps.localhost</td><td>100.64.0.12:3000</td><td>online</td></tr>
              <tr><td>docs.apps.localhost</td><td>100.64.0.19:4173</td><td>online</td></tr>
            </tbody>
          </table>
        </section>
        <section class="console-panel" data-view="users" hidden>
          <h3>Users</h3>
          <p class="blurb">Local credentials always on. OIDC when three env vars are set.</p>
          <table class="console-table">
            <thead><tr><th>Person</th><th>Role</th><th>Workspaces</th></tr></thead>
            <tbody>
              <tr><td>sam@acme.test</td><td>Owner</td><td>engineering</td></tr>
              <tr><td>lee@acme.test</td><td>Admin</td><td>engineering</td></tr>
              <tr><td>jo@acme.test</td><td>Member</td><td>contractors</td></tr>
            </tbody>
          </table>
        </section>
        <section class="console-panel" data-view="workspaces" hidden>
          <h3>Workspaces</h3>
          <p class="blurb">Isolation unit. Maps to a Headscale ACL group.</p>
          <table class="console-table">
            <thead><tr><th>Name</th><th>Members</th><th>ACL group</th></tr></thead>
            <tbody>
              <tr><td>engineering</td><td>6</td><td>group:engineering</td></tr>
              <tr><td>contractors</td><td>2</td><td>group:contractors</td></tr>
            </tbody>
          </table>
        </section>
        <section class="console-panel" data-view="policies" hidden>
          <h3>Policies</h3>
          <p class="blurb">Intent compiles to Headscale HuJSON.</p>
          <pre class="console-pre">{
  "groups": { "group:engineering": ["sam@", "lee@"] },
  "acls": [{ "action": "accept", "src": ["group:engineering"], "dst": ["*:*"] }]
}</pre>
        </section>
        <section class="console-panel" data-view="audit" hidden>
          <h3>System logs</h3>
          <p class="blurb">Append-only hash chain for control-plane actions.</p>
          <table class="console-table">
            <thead><tr><th>When</th><th>Actor</th><th>Action</th><th>Hash</th></tr></thead>
            <tbody>
              <tr><td>10:14</td><td>sam</td><td>authkey.create</td><td>9f3a…c21</td></tr>
              <tr><td>09:02</td><td>lee</td><td>policy.apply</td><td>c21b…88e</td></tr>
              <tr><td>08:41</td><td>sam</td><td>member.invite</td><td>88e0…1aa</td></tr>
            </tbody>
          </table>
        </section>
        <section class="console-panel" data-view="keys" hidden>
          <h3>Keys</h3>
          <p class="blurb">Add device prints logout then up. Dummy key only.</p>
          <pre class="console-pre">tailscale logout
tailscale up --login-server=http://127.0.0.1:8080 --auth-key=tskey-auth-demo</pre>
        </section>
      </div>
    </div>
  `;

  function bind(root) {
    const buttons = root.querySelectorAll("[data-panel]");
    const views = root.querySelectorAll("[data-view]");
    buttons.forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-panel");
        buttons.forEach((b) => b.classList.toggle("is-on", b === btn));
        views.forEach((view) => {
          view.hidden = view.getAttribute("data-view") !== id;
        });
      });
    });
  }

  document.querySelectorAll("[data-console-mock]").forEach((host) => {
    host.innerHTML = html;
    const frame = host.querySelector("[data-console]");
    if (frame) bind(frame);
  });
})();
