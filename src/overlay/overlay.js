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
      // Drive the autoplay loop on every page load. No-op unless a play
      // session is active in sessionStorage.
      maybeAutoplay();
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
    const dir = state.paths?.presetsDir || "";
    if (presets.length === 0) {
      pane.innerHTML = `
        <p class="muted">No presets found.</p>
        <p class="small">Looked in <code>${escape(dir)}</code>.</p>
        <p class="small">Drop <code>.yaml</code>, <code>.yml</code> or <code>.json</code> files here:</p>
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
      <p class="small muted">From <code>${escape(dir)}</code></p>
      <ul class="presets">${presets
        .map(
          (p) => `<li>
            <code>${escape(p)}</code>
            <button data-preset="${escape(p)}" type="button" title="Seed data then auto-submit every page until the journey's target">Play \u25b6</button>
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
    const dir = state.paths?.snapshotsDir || "";
    pane.innerHTML = `
      <h4>Save current session</h4>
      <form class="save-snap">
        <input name="name" placeholder="snapshot-name" />
        <button type="submit">Save</button>
      </form>
      <p class="small muted">Saved to <code>${escape(dir)}</code></p>
      <h4>Restore</h4>
      <ul class="snaps">${(state.snapshots || [])
        .map(
          (s) => `<li>
            <code>${escape(s)}</code>
            <button data-snap="${escape(s)}" type="button" title="Restore data then auto-submit every page until the journey's target">Play \u25b6</button>
          </li>`,
        )
        .join("")}</ul>
      ${(state.snapshots || []).length === 0 ? `<p class="muted">No snapshots saved yet.</p>` : ""}
    `;
    pane.querySelector(".save-snap").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const name = new FormData(ev.target).get("name") || "";
      const r = await fetch(`${MOUNT}/api/snapshot/save`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      try {
        const j = await r.json();
        if (j?.path) console.log("[casa-dev-overlay] snapshot saved \u2192", j.path);
        if (j?.error) console.error("[casa-dev-overlay] snapshot save failed:", j);
      } catch { /* noop */ }
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
    const r = await fetch(`${MOUNT}/api/preset/apply`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, mode: "play" }),
    });
    const j = await r.json().catch(() => ({}));
    startAutoplay(j);
  }
  async function loadSnapshot(name) {
    const r = await fetch(`${MOUNT}/api/snapshot/load`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, mode: "play" }),
    });
    const j = await r.json().catch(() => ({}));
    startAutoplay(j);
  }

  // ------- autoplay: walk every waypoint, submitting the page form each time.
  const PLAY_KEY = "__casa-dev-overlay-autoplay";
  const MAX_STEPS = 100;

  function startAutoplay({ first, target, order } = {}) {
    if (!first) {
      alert("Auto-play: no waypoints to walk. Apply data first or check your Plan.");
      return;
    }
    sessionStorage.setItem(
      PLAY_KEY,
      JSON.stringify({
        target: target || null,
        order: Array.isArray(order) ? order : [],
        steps: 0,
        lastWaypoint: null,
      }),
    );
    location.assign(`${state.mountUrl}${encodeURIComponent(first)}`);
  }

  function abortAutoplay(reason) {
    sessionStorage.removeItem(PLAY_KEY);
    // eslint-disable-next-line no-console
    if (reason) console.warn("[casa-dev-overlay] autoplay stopped:", reason);
  }

  function autoplayBanner(msg) {
    let el = wrap.querySelector(".casa-dt-autoplay");
    if (!el) {
      el = document.createElement("div");
      el.className = "casa-dt-autoplay";
      wrap.appendChild(el);
    }
    el.innerHTML =
      `<span>\u25b6 ${escape(msg)}</span>` +
      `<button type="button" data-stop-autoplay title="Stop here and let me drive">\u2016 pause</button>`;
    el.querySelector("[data-stop-autoplay]").onclick = () => {
      abortAutoplay("user");
      el.remove();
    };
  }

  function maybeAutoplay() {
    const raw = sessionStorage.getItem(PLAY_KEY);
    if (!raw) return;
    let play;
    try { play = JSON.parse(raw); } catch { return abortAutoplay("bad state"); }

    const here = state?.waypoint;
    if (!here) return abortAutoplay("not on a waypoint");

    if (play.target && here === play.target) {
      sessionStorage.removeItem(PLAY_KEY);
      autoplayBanner(`reached ${here}`);
      return;
    }
    if (play.lastWaypoint === here) {
      autoplayBanner(`stuck on ${here} (validation error?)`);
      return abortAutoplay(`stuck on ${here}`);
    }
    if (++play.steps > MAX_STEPS) {
      autoplayBanner(`hit ${MAX_STEPS}-step limit`);
      return abortAutoplay("step limit");
    }

    // Find the page form: CASA wraps its waypoint forms in <main>, but the
    // first non-overlay <form> with a CSRF input is good enough.
    const form = Array.from(document.querySelectorAll("form")).find(
      (f) => !host.contains(f),
    );
    if (!form) {
      autoplayBanner(`no form on ${here}`);
      return abortAutoplay("no form");
    }

    play.lastWaypoint = here;
    sessionStorage.setItem(PLAY_KEY, JSON.stringify(play));
    autoplayBanner(`submitting ${here} \u2026`);
    // small delay so the user can see what's happening
    setTimeout(() => form.submit(), 150);
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
