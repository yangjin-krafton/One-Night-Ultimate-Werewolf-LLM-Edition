(function () {
  const hasGsap = () => typeof window !== "undefined" && !!window.gsap;

  function el(tag, className) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    return node;
  }

  function setText(node, text) {
    node.textContent = text == null ? "" : String(text);
  }

  function enter(node, preset = "fadeUp") {
    if (!node) return;
    if (hasGsap()) {
      const gsap = window.gsap;
      if (preset === "playerGrid") {
        gsap.fromTo(
          node,
          { opacity: 0, y: 10, scale: 0.98 },
          { opacity: 1, y: 0, scale: 1, duration: 0.32, ease: "power2.out" }
        );
        return;
      }
      if (preset === "profile") {
        gsap.fromTo(
          node,
          { opacity: 0, y: 14, scale: 0.985 },
          { opacity: 1, y: 0, scale: 1, duration: 0.38, ease: "power3.out" }
        );
        return;
      }
      gsap.fromTo(node, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.28, ease: "power2.out" });
      return;
    }

    // WAAPI fallback
    const keyframes =
      preset === "profile"
        ? [{ opacity: 0, transform: "translateY(14px) scale(0.985)" }, { opacity: 1, transform: "translateY(0) scale(1)" }]
        : preset === "playerGrid"
          ? [{ opacity: 0, transform: "translateY(10px) scale(0.98)" }, { opacity: 1, transform: "translateY(0) scale(1)" }]
          : [{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "translateY(0)" }];
    node.animate(keyframes, { duration: 300, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)", fill: "both" });
  }

  function emphasis(node, preset = "pulse") {
    if (!node) return;
    if (hasGsap()) {
      const gsap = window.gsap;
      if (preset === "pulse") {
        gsap.fromTo(node, { scale: 1 }, { scale: 1.03, duration: 0.12, ease: "power2.out", yoyo: true, repeat: 1 });
        return;
      }
    }
    node.animate([{ transform: "scale(1)" }, { transform: "scale(1.03)" }, { transform: "scale(1)" }], {
      duration: 240,
      easing: "ease-out",
    });
  }

  function tap(node, preset = "tap") {
    if (!node) return;
    if (hasGsap()) {
      const gsap = window.gsap;
      if (preset === "tap") {
        gsap.killTweensOf(node);
        gsap.timeline({ defaults: { overwrite: "auto" } })
          .to(node, { "--tap-outline": "18px", duration: 0.08, ease: "power2.out" }, 0)
          .to(node, { scale: 0.985, duration: 0.08, ease: "power2.out" }, 0)
          .to(node, { "--tap-outline": "0px", duration: 0.22, ease: "power3.out" }, 0.08)
          .to(node, { scale: 1, duration: 0.22, ease: "elastic.out(1, 0.55)" }, 0.08);
        return;
      }
    }
    emphasis(node, "pulse");
  }

  function installGlobalTapFeedback({ selector = '[data-cardui="1"]', ignoreSelector = 'button, a, input, textarea, select, label' } = {}) {
    if (typeof document === "undefined") return;
    if (document.documentElement.dataset.carduiTapInstalled === "1") return;
    document.documentElement.dataset.carduiTapInstalled = "1";

    document.addEventListener(
      "pointerdown",
      (e) => {
        if (e.button != null && e.button !== 0) return; // only primary
        const target = e.target;
        if (!(target instanceof Element)) return;
        if (target.closest(ignoreSelector)) return;
        const card = target.closest(selector);
        if (!card) return;
        tap(card, "tap");
      },
      { passive: true }
    );
  }

  function staggerEnter(nodes, { preset = "fadeUp", stagger = 0.05 } = {}) {
    const list = Array.from(nodes || []).filter(Boolean);
    if (!list.length) return;
    if (hasGsap()) {
      const gsap = window.gsap;
      const fromVars =
        preset === "stack"
          ? { opacity: 0, y: 16, scale: 0.98, rotate: -1.2 }
          : preset === "fadeUp"
            ? { opacity: 0, y: 10 }
            : { opacity: 0, y: 8 };
      gsap.fromTo(
        list,
        fromVars,
        { opacity: 1, y: 0, scale: 1, rotate: 0, duration: 0.38, ease: "power3.out", stagger }
      );
      return;
    }
    list.forEach((n, idx) => enter(n, preset === "stack" ? "profile" : "fadeUp"));
  }

  function flip(node, { duration = 0.5 } = {}) {
    if (!node) return;
    node.style.transformStyle = "preserve-3d";
    if (hasGsap()) {
      const gsap = window.gsap;
      gsap.fromTo(node, { rotateY: 0 }, { rotateY: 180, duration, ease: "power2.inOut" });
      return;
    }
    node.animate([{ transform: "rotateY(0deg)" }, { transform: "rotateY(180deg)" }], {
      duration: Math.round(duration * 1000),
      easing: "ease-in-out",
      fill: "both",
    });
  }

  function attachSwipeMotion(deckEl, { cardSelector = ".info-card", contentSelector = ".info-card__content" } = {}) {
    if (!deckEl || deckEl.dataset.motionAttached === "1") return;
    deckEl.dataset.motionAttached = "1";

    const cards = Array.from(deckEl.querySelectorAll(cardSelector));
    const contents = cards.map((c) => c.querySelector(contentSelector)).filter(Boolean);
    if (!contents.length) return;

    // Lightweight scroll-based parallax/tilt for "swipe deck" feeling.
    const update = () => {
      const w = Math.max(1, deckEl.clientWidth || 1);
      const center = deckEl.scrollLeft + w / 2;
      for (const card of cards) {
        const content = card.querySelector(contentSelector);
        if (!content) continue;
        const cardCenter = card.offsetLeft + card.clientWidth / 2;
        const d = (cardCenter - center) / w; // approx -1..1
        const x = d * 14;
        const r = d * 2.4;
        const s = 1 - Math.min(0.06, Math.abs(d) * 0.06);
        content.style.transform = `translateX(${x}px) rotate(${r}deg) scale(${s})`;
      }
    };

    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        update();
      });
    };

    deckEl.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    update();
  }

  function createPlayerCard({
    player,
    isMe,
    isHost,
    isConnected,
    isVoted,
    roleLabel,
    applyPalette,
  }) {
    const card = el("div", "card");
    card.setAttribute("data-cardui", "1");
    if (isMe) card.classList.add("card--me");
    if (isHost) card.classList.add("card--host");
    if (isConnected) card.classList.add("card--connected");
    if (isVoted) card.setAttribute("data-voted", "true");
    if (typeof applyPalette === "function") applyPalette(card, player?.color || "#888");

    const top = el("div", "card__top");
    const seat = el("div", "seat");
    setText(seat, player?.seat ?? "");

    const badgeGroup = el("div", "badgeGroup");
    const badge = el("div", "badge");
    setText(badge, isHost ? "HOST" : isConnected ? "ON" : "OFF");
    badgeGroup.appendChild(badge);
    if (isMe) {
      const meBadge = el("div", "badge badge--me");
      setText(meBadge, "ME");
      badgeGroup.appendChild(meBadge);
    }

    top.appendChild(seat);
    top.appendChild(badgeGroup);

    const content = el("div", "card__content");
    const avatar = el("div", "card__avatar");
    setText(avatar, player?.avatar || "👤");
    const name = el("div", "name");
    setText(name, `${player?.name || ""}${isMe && roleLabel ? ` · ${roleLabel}` : ""}`);
    content.appendChild(avatar);
    content.appendChild(name);

    const bar = el("div", "card__bar");
    card.appendChild(top);
    card.appendChild(content);
    card.appendChild(bar);
    return card;
  }

  function createInfoCard({ tag, icon, title, text }) {
    const card = el("div", "info-card");
    card.setAttribute("data-cardui", "1");
    const content = el("div", "info-card__content");

    const tagEl = el("span", "info-card__tag");
    tagEl.innerHTML = tag == null ? "" : String(tag);
    const iconEl = el("div", "info-card__role-icon");
    iconEl.innerHTML = icon == null ? "" : String(icon);
    const h3 = el("h3");
    h3.innerHTML = title == null ? "" : String(title);
    const p = el("p");
    p.innerHTML = text == null ? "" : String(text);

    content.appendChild(tagEl);
    content.appendChild(iconEl);
    content.appendChild(h3);
    content.appendChild(p);
    card.appendChild(content);
    return card;
  }

  function createRoleCard({ icon, name, countText }) {
    const card = el("div", "roleCard");
    card.setAttribute("data-cardui", "1");
    const iconEl = el("div", "roleCard__icon");
    iconEl.innerHTML = icon == null ? "" : String(icon);
    const nameEl = el("div", "roleCard__name");
    nameEl.innerHTML = name == null ? "" : String(name);
    const countEl = el("div", "roleCard__count");
    countEl.innerHTML = countText == null ? "" : String(countText);
    card.appendChild(iconEl);
    card.appendChild(nameEl);
    card.appendChild(countEl);
    return card;
  }

  function createProfileCardLarge({ player, badgeText, applyPalette, extraClass }) {
    const card = el("div", "profileCardLarge");
    card.setAttribute("data-cardui", "1");
    if (extraClass) card.classList.add(extraClass);
    if (typeof applyPalette === "function") applyPalette(card, player?.color || "#888");

    const badge = el("div", "profileCardLarge__badge");
    setText(badge, badgeText || "");
    const seat = el("div", "profileCardLarge__seat");
    setText(seat, player?.seat ?? "");
    const avatar = el("div", "profileCardLarge__avatar");
    setText(avatar, player?.avatar || "👤");
    const name = el("div", "profileCardLarge__name");
    setText(name, player?.name || "");

    card.appendChild(badge);
    card.appendChild(seat);
    card.appendChild(avatar);
    card.appendChild(name);
    return card;
  }

  window.CardUI = {
    motion: { enter, emphasis, tap, installGlobalTapFeedback, staggerEnter, attachSwipeMotion, flip },
    createPlayerCard,
    createInfoCard,
    createRoleCard,
    createProfileCardLarge,
  };
})();
