/**
 * casa-dev-overlay overlay (browser bundle).
 *
 * Vanilla JS, Shadow DOM, no build step. Loaded as a `type="module"` script
 * by `inject-overlay.js`. Reads its mount URL from a data-attribute on its
 * own <script> tag.
 */

(() => {
  const me = document.currentScript || lastScript();
  const MOUNT = me?.dataset?.casaDevOverlayMount || "/__casa";

  // Don't double-inject if the user navigated within an SPA-like context
  if (document.getElementById("__casa-dev-overlay-host")) return;

  const host = document.createElement("div");
  host.id = "__casa-dev-overlay-host";
  host.style.position = "fixed";
  host.style.zIndex = "2147483647";
  host.style.top = "0";
  host.style.right = "0";
  document.body.appendChild(host);

  const root = host.attachShadow({ mode: "open" });

  // Pull in the overlay CSS into the shadow root so page styles can't bleed in
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = `${MOUNT}/overlay.css`;
  root.appendChild(link);

  const wrap = document.createElement("div");
  wrap.className = "casa-dt collapsed";
  root.appendChild(wrap);

  wrap.innerHTML = `
    <button class="casa-dt-toggle" type="button" aria-label="Toggle CASA devtools">
      <span class="dot"></span> CASA
    </button>
    <section class="casa-dt-panel" hidden>
      <header>
        <strong>CASA devtools</strong>
        <nav class="tabs">
          <button data-tab="journey"  class="active">Journey</button>
          <button data-tab="context">Context</button>
          <button data-tab="fields">Fields</button>
          <button data-tab="hooks">Hooks</button>
          <button data-tab="presets">Presets</button>
          <button data-tab="snapshots">Snapshots</button>
        </nav>
        <button class="close" type="button" aria-label="Close">\u00d7</button>
      </header>
      <div class="body">
        <div data-pane="journey"   class="pane active"><p class="loading">Loading\u2026</p></div>
        <div data-pane="context"   class="pane"></div>
        <div data-pane="fields"    class="pane"></div>
        <div data-pane="hooks"     class="pane"></div>
        <div data-pane="presets"   class="pane"></div>
        <div data-pane="snapshots" class="pane"></div>
      </div>
      <footer>
        <span class="env-warn" hidden>\u26a0 not on localhost</span>
        <span class="meta"></span>
      </footer>
    </section>
  `;

  const $ = (sel) => wrap.querySelector(sel);
  const $$ = (sel) => Array.from(wrap.querySelectorAll(sel));

  // ------- panel collapse / expand
  $(".casa-dt-toggle").addEventListener("click", () => {
    wrap.classList.toggle("collapsed");
    const panel = $(".casa-dt-panel");
    panel.hidden = wrap.classList.contains("collapsed");
    if (!panel.hidden) refresh();
  });
  $(".close").addEventListener("click", () => {
    wrap.classList.add("collapsed");
    $(".casa-dt-panel").hidden = true;
  });

  // ------- tabs
  $$(".tabs button").forEach((b) =>
    b.addEventListener("click", () => {
      $$(".tabs button").forEach((x) => x.classList.remove("active"));
      $$(".pane").forEach((x) => x.classList.remove("active"));
      b.classList.add("active");
      $(`.pane[data-pane="${b.dataset.tab}"]`).classList.add("active");
    }),
  );

  // ------- data
  let state = null;
  async function refresh() {
    try {
      const r = await fetch(`${MOUNT}/api/state`, { credentials: "same-origin" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      state = await r.json();
      render();
    } catch (err) {
      $('.pane[data-pane="journey"]').innerHTML =
        `<p class="err">Failed to load state: ${escape(err.message)}</p>`;
    }
  }

  function render() {
    if (!state) return;

    $(".meta").textContent = state.waypoint
      ? `\u25b6 ${state.waypoint}`
      : "(not on a waypoint)";

    if (location.hostname !== "localhost" && location.hostname !== "127.0.0.1") {
      $(".env-warn").hidden = false;
    }

    renderJourney();
    renderContext();
    renderFields();
    renderHooks();
    renderPresets();
    renderSnapshots();
  }

  // ------- panes
  function renderJourney() {
    const pane = $('.pane[data-pane="journey"]');
    const { graph, traversed, waypoint, mountUrl } = state;
    if (!graph || graph.nodes.length === 0) {
      pane.innerHTML = `<p class="muted">No Plan defined.</p>`;
      return;
    }
    const traversedSet = new Set(traversed || []);
    const rows = graph.nodes
      .map((n) => {
        const isHere = n.id === waypoint;
        const isDone = traversedSet.has(n.id);
        const cls = isHere ? "here" : isDone ? "done" : "";
        return `<li class="${cls}">
          <button data-jump="${escape(n.id)}" type="button">${escape(n.id)}</button>
        </li>`;
      })
      .join("");

    const edges = graph.edges
      .map(
        (e) =>
          `<li><code>${escape(e.source)}</code> \u2192 <code>${escape(e.target)}</code>${
            e.label ? ` <span class="cond">[${escape(String(e.label))}]</span>` : ""
          }</li>`,
      )
      .join("");

    pane.innerHTML = `
      <h4>Waypoints</h4>
      <ul class="waypoints">${rows}</ul>
      <details><summary>Routes (${graph.edges.length})</summary>
        <ul class="edges">${edges}</ul>
      </details>
      <p class="muted small">Click any waypoint to jump there. Mount: <code>${escape(mountUrl)}</code></p>
    `;

    pane.querySelectorAll("[data-jump]").forEach((b) =>
      b.addEventListener("click", () => jump(b.dataset.jump)),
    );
  }

  function renderContext() {
    const pane = $('.pane[data-pane="context"]');
    pane.innerHTML = `
      <h4>JourneyContext.data</h4>
      <pre class="json">${escape(JSON.stringify(state.data, null, 2))}</pre>
      <h4>Validation</h4>
      <pre class="json">${escape(JSON.stringify(state.validation, null, 2))}</pre>
      <h4>Identity</h4>
      <pre class="json">${escape(JSON.stringify(state.identity, null, 2))}</pre>
      ${
        state.contexts && state.contexts.length
          ? `<h4>Other contexts (${state.contexts.length})</h4>
             <ul>${state.contexts
               .map(
                 (c) =>
                   `<li><code>${escape(c.id || "?")}</code>${
                     c.name ? ` \u00b7 ${escape(c.name)}` : ""
                   }</li>`,
               )
               .join("")}</ul>`
          : ""
      }
      <button class="danger" data-act="clear" type="button">Destroy session</button>
    `;
    pane.querySelector('[data-act="clear"]').addEventListener("click", async () => {
      if (!confirm("Destroy the current session?")) return;
      await fetch(`${MOUNT}/api/context/clear`, { method: "POST", credentials: "same-origin" });
      location.reload();
    });
  }

  function renderFields() {
    const pane = $('.pane[data-pane="fields"]');
    if (!state.fields || state.fields.length === 0) {
      pane.innerHTML = `<p class="muted">No fields on this waypoint.</p>`;
      return;
    }
    pane.innerHTML = `
      <h4>Fields on <code>${escape(state.waypoint || "")}</code></h4>
      <table>
        <thead><tr><th>Name</th><th>Optional</th><th>Validators</th><th>Conds</th></tr></thead>
        <tbody>${state.fields
          .map(
            (f) => `<tr>
              <td><code>${escape(f.name)}</code></td>
              <td>${f.meta?.optional ? "yes" : ""}</td>
              <td>${(f.validators || []).map((v) => `<code>${escape(v.name)}</code>`).join(" ")}</td>
              <td>${f.conditions || ""}</td>
            </tr>`,
          )
          .join("")}</tbody>
      </table>
    `;
  }

  function renderHooks() {
    const pane = $('.pane[data-pane="hooks"]');
    const stages = state.hooks || [];
    if (stages.length === 0) {
      pane.innerHTML = `<p class="muted">No hook timing captured for this request. (POST a form, then come back.)</p>`;
      return;
    }
    const t0 = stages[0].t;
    pane.innerHTML = `
      <h4>Hook timeline</h4>
      <ol class="hooks">${stages
        .map(
          (s) =>
            `<li><span class="t">${(s.t - t0).toFixed(2)} ms</span> <code>${escape(s.stage)}</code></li>`,
        )
        .join("")}</ol>
    `;
  }

  function renderPresets() {
    const pane = $('.pane[data-pane="presets"]');
    const presets = state.presets || [];
    if (presets.length === 0) {
      pane.innerHTML = `
        <p class="muted">No presets found.</p>
        <p class="small">Drop YAML files into your configured <code>presetsDir</code>:</p>
        <pre class="json">target: check-your-answers
data:
  personal-details:
    firstName: Alice
    lastName: Example
</pre>`;
      return;
    }
    pane.innerHTML = `
      <h4>Presets</h4>
      <ul class="presets">${presets
        .map(
          (p) => `<li>
            <code>${escape(p)}</code>
            <button data-preset="${escape(p)}" type="button">Apply</button>
          </li>`,
        )
        .join("")}</ul>
    `;
    pane.querySelectorAll("[data-preset]").forEach((b) =>
      b.addEventListener("click", () => applyPreset(b.dataset.preset)),
    );
  }

  function renderSnapshots() {
    const pane = $('.pane[data-pane="snapshots"]');
    pane.innerHTML = `
      <h4>Save current session</h4>
      <form class="save-snap">
        <input name="name" placeholder="snapshot-name" />
        <button type="submit">Save</button>
      </form>
      <h4>Restore</h4>
      <ul class="snaps">${(state.snapshots || [])
        .map(
          (s) => `<li>
            <code>${escape(s)}</code>
            <button data-snap="${escape(s)}" type="button">Load</button>
          </li>`,
        )
        .join("")}</ul>
      ${(state.snapshots || []).length === 0 ? `<p class="muted">No snapshots saved yet.</p>` : ""}
    `;
    pane.querySelector(".save-snap").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const name = new FormData(ev.target).get("name") || "";
      await fetch(`${MOUNT}/api/snapshot/save`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      refresh();
    });
    pane.querySelectorAll("[data-snap]").forEach((b) =>
      b.addEventListener("click", () => loadSnapshot(b.dataset.snap)),
    );
  }

  // ------- actions
  async function jump(waypoint) {
    const url = `${state.mountUrl}${encodeURIComponent(waypoint)}`;
    location.assign(url);
  }
  async function applyPreset(name) {
    // Use a real form POST so the response (a 302 redirect) is followed by
    // the browser, taking the user to the preset's `target` waypoint.
    const f = document.createElement("form");
    f.method = "POST";
    f.action = `${MOUNT}/api/preset/apply`;
    f.style.display = "none";
    f.enctype = "application/x-www-form-urlencoded";
    // We need JSON for the API; use fetch+follow instead.
    const r = await fetch(`${MOUNT}/api/preset/apply`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
      redirect: "follow",
    });
    if (r.redirected) location.assign(r.url);
    else location.reload();
  }
  async function loadSnapshot(name) {
    await fetch(`${MOUNT}/api/snapshot/load`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    });
    location.reload();
  }

  // ------- utilities
  function escape(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
    );
  }
  function lastScript() {
    const all = document.getElementsByTagName("script");
    return all[all.length - 1];
  }

  // First load: peek at state so the badge can tint based on whether we are
  // on a waypoint. Cheap, small, safe.
  refresh().catch(() => {});
})();
