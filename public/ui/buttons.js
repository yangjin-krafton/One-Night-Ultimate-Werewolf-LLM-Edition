(function () {
  const hasGsap = () => typeof window !== "undefined" && !!window.gsap;

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

  window.ButtonUI = { installGlobalButtonFeedback };
})();
