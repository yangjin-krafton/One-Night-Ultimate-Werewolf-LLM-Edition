(function () {
  const hasGsap = () => typeof window !== "undefined" && !!window.gsap;

  const WOLF_TEAM = new Set(["werewolf", "alpha_wolf", "mystic_wolf", "dream_wolf", "minion"]);

  function startTrackMotion(arenaEl, itemEls, { speed = 0.035 } = {}) {
    if (!arenaEl || !Array.isArray(itemEls) || !itemEls.length) return () => {};
    const gsap = window.gsap || null;
    let raf = 0;
    const start = performance.now();

    const pointOnRoundedRect = ({ w, h, r, s }) => {
      const top = Math.max(0, w - 2 * r);
      const side = Math.max(0, h - 2 * r);
      const arc = (Math.PI / 2) * r;
      const perim = 2 * (top + side) + 4 * arc;
      let t = ((s % perim) + perim) % perim;

      if (t < top) return { x: r + t, y: 0, z: 0.2 };
      t -= top;

      if (t < arc) {
        const a = (t / arc) * (Math.PI / 2);
        return { x: r + top + Math.sin(a) * r, y: (1 - Math.cos(a)) * r, z: 0.25 };
      }
      t -= arc;

      if (t < side) return { x: w, y: r + t, z: 0.7 };
      t -= side;

      if (t < arc) {
        const a = (t / arc) * (Math.PI / 2);
        return { x: w - (1 - Math.cos(a)) * r, y: r + side + Math.sin(a) * r, z: 0.9 };
      }
      t -= arc;

      if (t < top) return { x: w - r - t, y: h, z: 0.85 };
      t -= top;

      if (t < arc) {
        const a = (t / arc) * (Math.PI / 2);
        return { x: r - Math.sin(a) * r, y: h - (1 - Math.cos(a)) * r, z: 0.7 };
      }
      t -= arc;

      if (t < side) return { x: 0, y: h - r - t, z: 0.3 };
      t -= side;

      const a = (t / arc) * (Math.PI / 2);
      return { x: (1 - Math.cos(a)) * r, y: r - Math.sin(a) * r, z: 0.25 };
    };

    const tick = () => {
      const rect = arenaEl.getBoundingClientRect();
      const w = Math.max(1, rect.width);
      const h = Math.max(1, rect.height);
      const t = (performance.now() - start) / 1000;

      const sample = itemEls[0];
      const cw = (sample?.offsetWidth || 0) + 10;
      const ch = (sample?.offsetHeight || 0) + 10;
      const insetX = Math.min(w * 0.18, Math.max(18, cw * 0.55));
      const insetY = Math.min(h * 0.18, Math.max(18, ch * 0.55));
      const innerW = Math.max(1, w - insetX * 2);
      const innerH = Math.max(1, h - insetY * 2);
      const r = Math.min(innerW, innerH) * 0.18;
      const top = Math.max(0, innerW - 2 * r);
      const side = Math.max(0, innerH - 2 * r);
      const arc = (Math.PI / 2) * r;
      const perim = 2 * (top + side) + 4 * arc;

      itemEls.forEach((el) => {
        const base = Number(el.dataset.orbitBase || 0);
        const s = (base + t * speed) * perim;
        const p = pointOnRoundedRect({ w: innerW, h: innerH, r, s });
        const x = insetX + p.x;
        const y = insetY + p.y;
        const z = p.z;
        const depth = -z * 14;
        const flipMul = Math.max(1, Number(el.dataset.flipMul || 1));
        const scale = (0.82 + z * 0.14) * flipMul;

        const ew = el.offsetWidth || 0;
        const eh = el.offsetHeight || 0;
        const tx = x - ew / 2;
        const ty = y - eh / 2;

        if (gsap) {
          // Do not overwrite rotation (flip rotateY), only update position/scale.
          window.gsap.set(el, { x: tx, y: ty, z: depth, scale });
        } else {
          // Use individual transform properties so we don't clobber rotateY flips (which use `transform`).
          // translate/scale are supported in modern browsers and compose with `transform`.
          try {
            el.style.translate = `${tx}px ${ty}px ${depth}px`;
            el.style.scale = String(scale);
          } catch (e) {
            // Fallback: preserve any existing rotateY by appending translate/scale (best-effort).
            const existing = el.style.transform || "";
            const cleaned = existing.replace(/translate3d\\([^)]*\\)\\s*/g, "").replace(/scale\\([^)]*\\)\\s*/g, "").trim();
            el.style.transform = `${cleaned ? cleaned + " " : ""}translate3d(${tx}px, ${ty}px, ${depth}px) scale(${scale})`.trim();
          }
        }
        el.style.zIndex = String(Math.round(10 + z * 90));
        el.style.opacity = String(0.72 + z * 0.28);
      });
    };

    let stopped = false;
    const frame = () => {
      if (stopped) return;
      tick();
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      stopped = true;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    };
  }

  function buildRoleNameHtml({ roleId, getRoleDisplayName, escapeHtml, isMe = false }) {
    const title = escapeHtml(getRoleDisplayName(roleId || ""));
    const tab = isMe ? `<div class="meTab meTab--night">본인</div>` : "";
    return `${tab}<div class="nightChoiceReveal"><div class="nightChoiceReveal__title">${title}</div></div>`;
  }

  function buildProfileHtml({ player, escapeHtml, isMe = false }) {
    const seat = escapeHtml(String(player?.seat ?? ""));
    const avatar = escapeHtml(player?.avatar || "👤");
    const name = escapeHtml(player?.name || "");
    return `
      ${isMe ? '<div class="meTab meTab--night">본인</div>' : ''}
      <div class="nightChoiceReveal">
        <div class="nightChoiceReveal__profile">
          <div class="nightChoiceReveal__seat">${seat}</div>
          <div class="nightChoiceReveal__avatar">${avatar}</div>
          <div class="nightChoiceReveal__name">${name}</div>
        </div>
      </div>
    `;
  }

  function animateRotateY(el, { fromDeg = 0, toDeg = 180, durationMs = 400, onMid } = {}) {
    if (!el) return () => {};
    el.style.transformStyle = "preserve-3d";
    let raf = 0;
    let stopped = false;
    let midCalled = false;
    const start = performance.now();

    const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

    const tick = () => {
      if (stopped) return;
      const t = Math.min(1, Math.max(0, (performance.now() - start) / Math.max(1, durationMs)));
      const e = easeInOut(t);
      const deg = fromDeg + (toDeg - fromDeg) * e;
      el.style.rotate = `0 1 0 ${deg}deg`;
      if (!midCalled && t >= 0.5) {
        midCalled = true;
        try {
          onMid?.();
        } catch (e2) {
          // ignore
        }
      }
      if (t >= 1) {
        el.style.rotate = `0 1 0 ${toDeg}deg`;
        raf = 0;
        return;
      }
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);

    return () => {
      stopped = true;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    };
  }

  function flipRevealRole(el, { roleId, isWerewolf, getRoleDisplayName, escapeHtml }) {
    if (!el) return;
    const rid = String(roleId || "");
    if (!rid) return;
    if (!el.dataset.frontHtml) el.dataset.frontHtml = el.innerHTML;
    el.dataset.revealedRoleId = rid;
    el.dataset.flipMul = "1.2";

    const applyReveal = () => {
      el.classList.add("nightChoiceCard--revealed");
      el.classList.toggle("nightChoiceCard--werewolf", !!isWerewolf);
      // Once revealed, remove the blocked (🚫) overlay so the role name stays readable.
      el.classList.remove("nightChoice--blocked");
      el.innerHTML = buildRoleNameHtml({ roleId: rid, getRoleDisplayName, escapeHtml, isMe: el.dataset.isMe === "1" });
    };

    if (hasGsap()) {
      const gsap = window.gsap;
      gsap.killTweensOf(el);
      gsap.set(el, { transformPerspective: 900, transformStyle: "preserve-3d" });
      gsap.timeline({ defaults: { overwrite: "auto" } })
        .to(el, { rotateY: 90, duration: 0.18, ease: "power2.in" }, 0)
        .add(applyReveal, 0.18)
        .to(el, { rotateY: 180, duration: 0.22, ease: "power2.out" }, 0.18);
      return;
    }
    // No-GSAP path: animate rotateY via the individual `rotate` property so it composes with orbit translate/scale.
    animateRotateY(el, { fromDeg: 0, toDeg: 180, durationMs: 400, onMid: applyReveal });
  }

  function flipRevealProfile(el, { player, getRoleDisplayName, escapeHtml }) {
    if (!el || !player) return;
    if (!el.dataset.frontHtml) el.dataset.frontHtml = el.innerHTML;
    el.dataset.flipMul = "1.2";

    const applyReveal = () => {
      el.classList.add("nightChoiceCard--revealed");
      el.classList.remove("nightChoiceCard--werewolf");
      el.classList.remove("nightChoice--blocked");
      el.innerHTML = buildProfileHtml({ player, escapeHtml, getRoleDisplayName, isMe: el.dataset.isMe === "1" });
    };

    if (hasGsap()) {
      const gsap = window.gsap;
      gsap.killTweensOf(el);
      gsap.set(el, { transformPerspective: 900, transformStyle: "preserve-3d" });
      gsap.timeline({ defaults: { overwrite: "auto" } })
        .to(el, { rotateY: 90, duration: 0.18, ease: "power2.in" }, 0)
        .add(applyReveal, 0.18)
        .to(el, { rotateY: 180, duration: 0.22, ease: "power2.out" }, 0.18);
      return;
    }
    animateRotateY(el, { fromDeg: 0, toDeg: 180, durationMs: 400, onMid: applyReveal });
  }

  function flipRevealBack(el, { label = "중앙 카드", escapeHtml } = {}) {
    if (!el) return;
    if (!el.dataset.frontHtml) el.dataset.frontHtml = el.innerHTML;
    el.dataset.flipMul = "1.2";

    const applyReveal = () => {
      el.classList.add("nightChoiceCard--revealed");
      el.classList.remove("nightChoiceCard--werewolf");
      el.classList.remove("nightChoice--blocked");
      const t = escapeHtml ? escapeHtml(String(label || "")) : String(label || "");
      el.innerHTML = `
        ${el.dataset.isMe === "1" ? '<div class="meTab meTab--night">본인</div>' : ''}
        <div class="nightChoiceReveal">
          <div class="nightChoiceCard__avatar">🂠</div>
          <div class="nightChoiceReveal__title">${t}</div>
        </div>
      `;
    };

    if (hasGsap()) {
      const gsap = window.gsap;
      gsap.killTweensOf(el);
      gsap.set(el, { transformPerspective: 900, transformStyle: "preserve-3d" });
      gsap.timeline({ defaults: { overwrite: "auto" } })
        .to(el, { rotateY: 90, duration: 0.18, ease: "power2.in" }, 0)
        .add(applyReveal, 0.18)
        .to(el, { rotateY: 180, duration: 0.22, ease: "power2.out" }, 0.18);
      return;
    }
    animateRotateY(el, { fromDeg: 0, toDeg: 180, durationMs: 400, onMid: applyReveal });
  }

  function flipRevertRole(el) {
    if (!el || !el.dataset.frontHtml) return;
    const restore = () => {
      el.classList.remove("nightChoiceCard--revealed");
      el.classList.remove("nightChoiceCard--werewolf");
      el.innerHTML = el.dataset.frontHtml;
      delete el.dataset.frontHtml;
      delete el.dataset.revealedRoleId;
      el.dataset.flipMul = "1";
    };
    if (hasGsap()) {
      const gsap = window.gsap;
      gsap.killTweensOf(el);
      gsap.timeline({ defaults: { overwrite: "auto" } })
        .to(el, { rotateY: 90, duration: 0.18, ease: "power2.in" }, 0)
        .add(restore, 0.18)
        .to(el, { rotateY: 0, duration: 0.22, ease: "power2.out" }, 0.18);
      return;
    }
    // No-GSAP path: rotate back to 0 and restore content mid-way.
    animateRotateY(el, { fromDeg: 180, toDeg: 0, durationMs: 400, onMid: restore });
  }

  function swapEls(a, b, { duration = 0.32, flip = false, liftZ = true, onComplete } = {}) {
    if (!a || !b || a === b) return;
    const gsap = window.gsap || null;
    const ra = a.getBoundingClientRect();
    const rb = b.getBoundingClientRect();
    const dxA = rb.left - ra.left;
    const dyA = rb.top - ra.top;
    const dxB = ra.left - rb.left;
    const dyB = ra.top - rb.top;
    if (gsap) {
      gsap.killTweensOf([a, b]);

      if (liftZ) gsap.set([a, b], { zIndex: 40 });

      const rotA = Number(gsap.getProperty(a, "rotationY") || 0);
      const rotB = Number(gsap.getProperty(b, "rotationY") || 0);

      const tl = gsap.timeline({ defaults: { overwrite: "auto" } });
      tl.to(a, { x: `+=${dxA}`, y: `+=${dyA}`, duration, ease: "power2.inOut" }, 0);
      tl.to(b, { x: `+=${dxB}`, y: `+=${dyB}`, duration, ease: "power2.inOut" }, 0);

      let callbackTime = duration;
      if (flip) {
        const half = Math.max(0.08, duration * 0.5);
        callbackTime = Math.max(callbackTime, half * 2);
        tl.to(a, { rotationY: rotA + 90, duration: half, ease: "power2.in" }, 0);
        tl.to(a, { rotationY: rotA, duration: half, ease: "power2.out" }, half);
        tl.to(b, { rotationY: rotB + 90, duration: half, ease: "power2.in" }, 0);
        tl.to(b, { rotationY: rotB, duration: half, ease: "power2.out" }, half);
      }

      tl.add(() => {
          const aNext = a.nextSibling;
          const bNext = b.nextSibling;
          const pa = a.parentNode;
          const pb = b.parentNode;
          if (!pa || !pb) return;
          pa.insertBefore(b, aNext);
          pb.insertBefore(a, bNext);
          // Keep track-motion continuity by swapping orbit bases (if present).
          const ba = a.dataset.orbitBase;
          const bb = b.dataset.orbitBase;
          if (ba != null || bb != null) {
            a.dataset.orbitBase = bb ?? "";
            b.dataset.orbitBase = ba ?? "";
          }
          gsap.set([a, b], { clearProps: "x,y,zIndex" });
          if (typeof onComplete === "function") onComplete();
        }, callbackTime);
      return;
    }
    const aNext = a.nextSibling;
    const bNext = b.nextSibling;
    const pa = a.parentNode;
    const pb = b.parentNode;
    if (!pa || !pb) return;
    pa.insertBefore(b, aNext);
    pb.insertBefore(a, bNext);
    const ba = a.dataset.orbitBase;
    const bb = b.dataset.orbitBase;
    if (ba != null || bb != null) {
      a.dataset.orbitBase = bb ?? "";
      b.dataset.orbitBase = ba ?? "";
    }
    if (typeof onComplete === "function") onComplete();
  }

  function isWolfTeam(roleId) {
    return WOLF_TEAM.has(String(roleId || ""));
  }

  function setInteractive(el, enabled) {
    if (!el) return;
    const on = !!enabled;
    el.toggleAttribute("disabled", !on);
    el.setAttribute("aria-disabled", on ? "false" : "true");
    el.classList.toggle("nightChoice--disabled", !on);
  }

  function setBlockedBadge(el, show) {
    if (!el) return;
    el.classList.toggle("nightChoice--blocked", !!show);
  }

  window.NightBoardUI = {
    startTrackMotion,
    flipRevealRole,
    flipRevealProfile,
    flipRevealBack,
    flipRevertRole,
    swapEls,
    isWolfTeam,
    setInteractive,
    setBlockedBadge,
    createRuleOnlyPanel: ({ text = "", escapeHtml }) => {
      const el = document.createElement("div");
      el.className = "nightRuleOnly nightRuleOnly--center";
      const t = String(text || "");
      const textEl = document.createElement("div");
      textEl.className = "nightRuleOnly__text";
      if (window.TextHighlight?.applyHighlightedText && window.TextHighlight?.pickDictionaryHighlights) {
        const highlights = window.TextHighlight.pickDictionaryHighlights(t);
        window.TextHighlight.applyHighlightedText(textEl, t, highlights, { defaultClassName: "hl" });
      } else if (escapeHtml) {
        textEl.innerHTML = escapeHtml(t);
      } else {
        textEl.textContent = t;
      }
      el.appendChild(textEl);
      return el;
    },
  };
})();
