(function () {
  const hasGsap = () => typeof window !== "undefined" && !!window.gsap;
  const LOCK_ATTR = "data-btn-locked-label";
  const READY_CLASS = "btn--ready";
  const SOFT_DISABLED_CLASS = "btn--softDisabled";

  function tap(el) {
    if (!el) return;
    if (hasGsap()) {
      const gsap = window.gsap;
      gsap.killTweensOf(el);
      const tl = gsap.timeline({ defaults: { overwrite: "auto" } });
      tl.to(el, { scale: 0.985, duration: 0.08, ease: "power2.out" }, 0);
      tl.to(el, { scale: 1, duration: 0.24, ease: "elastic.out(1, 0.55)" }, 0.08);
      tl.to(el, { "--btn-glow": 1, duration: 0.08, ease: "power2.out" }, 0);
      tl.to(el, { "--btn-glow": 0, duration: 0.28, ease: "power3.out" }, 0.08);
      tl.to(el, { "--btn-fill": 1, duration: 0.10, ease: "power2.out" }, 0);
      tl.to(el, { "--btn-fill": 0, duration: 0.36, ease: "power3.out" }, 0.10);
      return;
    }
    el.animate([{ transform: "scale(1)" }, { transform: "scale(0.985)" }, { transform: "scale(1)" }], {
      duration: 260,
      easing: "ease-out",
    });
  }

  function installGlobalButtonFeedback({
    selector = ".btn, .iconbtn",
    ignoreSelector = "input, textarea, select",
  } = {}) {
    if (typeof document === "undefined") return;
    if (document.documentElement.dataset.btnTapInstalled === "1") return;
    document.documentElement.dataset.btnTapInstalled = "1";

    document.addEventListener(
      "pointerdown",
      (e) => {
        if (e.button != null && e.button !== 0) return;
        const target = e.target;
        if (!(target instanceof Element)) return;
        if (target.closest(ignoreSelector)) return;
        const btn = target.closest(selector);
        if (!btn) return;
        if (btn.hasAttribute("disabled") || btn.getAttribute("aria-disabled") === "true") return;
        tap(btn);
      },
      { passive: true }
    );
  }

  function setLabel(btn, label, { lock = false, force = false } = {}) {
    if (!btn) return;
    if (!force && btn.getAttribute(LOCK_ATTR) === "1") return;
    const plain = String(label ?? "");
    (window.TextHighlight?.replaceChildrenSafe || ((el, ch) => el.replaceChildren(...ch)))(btn, [document.createTextNode(plain)]);
    if (lock) btn.setAttribute(LOCK_ATTR, "1");
  }

  function setHighlightedLabel(btn, text, highlights, { lock = false, force = false } = {}) {
    if (!btn) return;
    if (!force && btn.getAttribute(LOCK_ATTR) === "1") return;
    const plainText = String(text ?? "");
    if (window.TextHighlight?.applyHighlightedText) {
      window.TextHighlight.applyHighlightedText(btn, plainText, highlights, {
        defaultClassName: "btn__hl",
        plainTextAttr: "data-btn-plain-label",
      });
    } else {
      btn.textContent = plainText;
      btn.setAttribute("data-btn-plain-label", plainText);
    }
    if (lock) btn.setAttribute(LOCK_ATTR, "1");
  }

  function lockLabel(btn, label) {
    setLabel(btn, label, { lock: true, force: true });
  }

  function lockHighlightedLabel(btn, text, highlights) {
    setHighlightedLabel(btn, text, highlights, { lock: true, force: true });
  }

  function unlockLabel(btn) {
    if (!btn) return;
    btn.removeAttribute(LOCK_ATTR);
  }

  function setEnabled(btn, enabled, { soft = false } = {}) {
    if (!btn) return;
    const on = !!enabled;

    // "Soft" disable keeps the button clickable so we can show feedback (bounce/pulse) on invalid attempts.
    // We still mark aria-disabled for accessibility and style.
    if (soft) {
      btn.disabled = false;
      btn.setAttribute("aria-disabled", on ? "false" : "true");
      btn.classList.toggle(SOFT_DISABLED_CLASS, !on);
      btn.classList.toggle(READY_CLASS, on);
      return;
    }

    btn.disabled = !on;
    btn.setAttribute("aria-disabled", on ? "false" : "true");
    btn.classList.remove(SOFT_DISABLED_CLASS);
    btn.classList.toggle(READY_CLASS, on);
  }

  window.ButtonUI = {
    installGlobalButtonFeedback,
    setLabel,
    setHighlightedLabel,
    lockLabel,
    lockHighlightedLabel,
    unlockLabel,
    setEnabled,
  };
})();
