(function () {
  const DEFAULT_CLASS = "hl";

  function replaceChildrenSafe(el, children) {
    if (!el) return;
    if (typeof el.replaceChildren === "function") {
      el.replaceChildren(...children);
      return;
    }
    while (el.firstChild) el.removeChild(el.firstChild);
    for (const c of children) el.appendChild(c);
  }

  function normalizeHighlights(highlights, { defaultClassName = DEFAULT_CLASS } = {}) {
    const list = Array.isArray(highlights) ? highlights : [];
    const out = [];
    for (const h of list) {
      if (typeof h === "string") {
        const term = h;
        if (!term) continue;
        out.push({ term, className: defaultClassName, color: null });
        continue;
      }
      if (h && typeof h === "object") {
        const term = String(h.term ?? h.text ?? "");
        if (!term) continue;
        const className = String(h.className || defaultClassName);
        const color = h.color == null ? null : String(h.color);
        out.push({ term, className, color });
      }
    }
    out.sort((a, b) => b.term.length - a.term.length);
    return out;
  }

  const DEFAULT_DICTIONARY = {
    phase: [
      { term: "WAIT", color: "#94a3b8" },
      { term: "NIGHT", color: "#a78bfa" },
      { term: "DEBATE", color: "#60a5fa" },
      { term: "VOTE", color: "#fbbf24" },
      { term: "RESULT", color: "#34d399" },
      { term: "REVEAL", color: "#22d3ee" },
      { term: "ENDING", color: "#fb7185" },
      { term: "대기", color: "#94a3b8" },
      { term: "밤", color: "#a78bfa" },
      { term: "토론", color: "#60a5fa" },
      { term: "투표", color: "#fbbf24" },
      { term: "결과", color: "#34d399" },
      { term: "공개", color: "#22d3ee" },
      { term: "엔딩", color: "#fb7185" },
    ],
    role: [
      { term: "늑대인간", color: "#fb7185" },
      { term: "werewolf", color: "#fb7185" },
      { term: "alpha_wolf", color: "#fb7185" },
      { term: "알파 늑대", color: "#fb7185" },
      { term: "mystic_wolf", color: "#fb7185" },
      { term: "신비한 늑대", color: "#fb7185" },
      { term: "dream_wolf", color: "#fb7185" },
      { term: "꿈 늑대", color: "#fb7185" },

      { term: "minion", color: "#fb7185" },
      { term: "하수인", color: "#fb7185" },
      { term: "미니언", color: "#fb7185" },

      { term: "예언자", color: "#22d3ee" },
      { term: "seer", color: "#22d3ee" },
      { term: "apprentice_seer", color: "#67e8f9" },
      { term: "견습 예언자", color: "#67e8f9" },

      { term: "paranormal_investigator", color: "#60a5fa" },
      { term: "초현상 수사관", color: "#60a5fa" },
      { term: "witch", color: "#a78bfa" },
      { term: "마녀", color: "#a78bfa" },
      { term: "revealer", color: "#22d3ee" },
      { term: "폭로자", color: "#22d3ee" },
      { term: "mason", color: "#2dd4bf" },
      { term: "프리메이슨", color: "#2dd4bf" },
      { term: "메이슨", color: "#2dd4bf" },

      { term: "villager", color: "#e5e7eb" },
      { term: "마을주민", color: "#e5e7eb" },
      { term: "hunter", color: "#fbbf24" },
      { term: "사냥꾼", color: "#fbbf24" },
      { term: "tanner", color: "#f59e0b" },
      { term: "무두장이", color: "#f59e0b" },
      { term: "insomniac", color: "#60a5fa" },
      { term: "불면증", color: "#60a5fa" },

      { term: "robber", color: "#f59e0b" },
      { term: "강도", color: "#f59e0b" },
      { term: "도둑", color: "#f59e0b" },
      { term: "troublemaker", color: "#fbbf24" },
      { term: "문제아", color: "#fbbf24" },
      { term: "장난꾸러기", color: "#fbbf24" },
      { term: "drunk", color: "#34d399" },
      { term: "주정뱅이", color: "#34d399" },
      { term: "술꾼", color: "#34d399" },

      { term: "village_idiot", color: "#fbbf24" },
      { term: "마을 바보", color: "#fbbf24" },

      { term: "doppelganger", color: "#c4b5fd" },
      { term: "도플갱어", color: "#c4b5fd" },
      { term: "thing", color: "#2dd4bf" },
      { term: "더 씽", color: "#2dd4bf" },

      { term: "중앙 카드", color: "#e5e7eb" },
      { term: "센터", color: "#e5e7eb" },
    ],
    user: [
      { term: "호스트", color: "#c4b5fd" },
      { term: "방장", color: "#c4b5fd" },
      { term: "본인", color: "#e9d5ff" },
      { term: "AI", color: "#cbd5e1" },
      { term: "봇", color: "#cbd5e1" },
      { term: "Bot", color: "#cbd5e1" },
      { term: "닉네임", color: "#fda4af" },
      { term: "좌석", color: "#fbbf24" },
      { term: "시트", color: "#fbbf24" },
    ],
    game: [
      { term: "시나리오", color: "#a7f3d0" },
      { term: "에피소드", color: "#a7f3d0" },
      { term: "입장", color: "#34d399" },
      { term: "입장하기", color: "#34d399" },
      { term: "게임 시작", color: "#34d399" },
      { term: "게임 종료", color: "#fb7185" },
      { term: "나가기", color: "#fb7185" },
      { term: "퇴장", color: "#fb7185" },
      { term: "추방", color: "#fb7185" },
      { term: "시나리오 선택", color: "#a7f3d0" },
      { term: "투표 결과", color: "#fbbf24" },
      { term: "재접속", color: "#60a5fa" },
      { term: "나레이션", color: "#fda4af" },
      { term: "TTS", color: "#fda4af" },
      { term: "BGM", color: "#c4b5fd" },
      { term: "LLM", color: "#c4b5fd" },
      { term: "모달", color: "#e9d5ff" },
      { term: "그리드", color: "#e9d5ff" },
      { term: "카드", color: "#e5e7eb" },
    ],
    tech: [
      { term: "Web Audio API", color: "#c4b5fd" },
      { term: "HTML", color: "#93c5fd" },
      { term: "CSS", color: "#a7f3d0" },
      { term: "JavaScript", color: "#fde68a" },
      { term: "Python", color: "#fde68a" },
      { term: "Docker", color: "#93c5fd" },
      { term: "JSON", color: "#e5e7eb" },
      { term: "MVP", color: "#e9d5ff" },
    ],
  };

  function dictionaryToHighlights(dictionary, { categories = null, defaultClassName = DEFAULT_CLASS } = {}) {
    const dict = dictionary && typeof dictionary === "object" ? dictionary : {};
    const wanted = Array.isArray(categories) && categories.length ? new Set(categories.map(String)) : null;
    const out = [];
    for (const [cat, entries] of Object.entries(dict)) {
      if (wanted && !wanted.has(String(cat))) continue;
      const list = Array.isArray(entries) ? entries : [];
      for (const e of list) {
        if (!e) continue;
        const term = String(e.term ?? e.text ?? "");
        if (!term) continue;
        out.push({
          term,
          className: String(e.className || defaultClassName),
          color: e.color == null ? null : String(e.color),
          category: String(cat),
        });
      }
    }
    out.sort((a, b) => b.term.length - a.term.length);
    return out;
  }

  function pickDictionaryHighlights(text, { dictionary = DEFAULT_DICTIONARY, categories = null, defaultClassName = DEFAULT_CLASS } = {}) {
    const src = String(text ?? "");
    if (!src) return [];
    const rules = dictionaryToHighlights(dictionary, { categories, defaultClassName });
    const out = [];
    const seen = new Set();
    for (const r of rules) {
      if (!r.term || !src.includes(r.term)) continue;
      const key = `${r.term}::${r.className || ""}::${r.color || ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(r);
    }
    return out;
  }

  function formatHighlightedText(text, highlights, { defaultClassName = DEFAULT_CLASS } = {}) {
    const src = String(text ?? "");
    const rules = normalizeHighlights(highlights, { defaultClassName });
    const frag = document.createDocumentFragment();

    if (!rules.length) {
      frag.appendChild(document.createTextNode(src));
      return { fragment: frag, plainText: src };
    }

    let i = 0;
    while (i < src.length) {
      let match = null;
      for (const r of rules) {
        if (!r.term) continue;
        if (src.startsWith(r.term, i)) {
          match = r;
          break;
        }
      }
      if (!match) {
        frag.appendChild(document.createTextNode(src[i]));
        i += 1;
        continue;
      }
      const span = document.createElement("span");
      span.className = match.className || defaultClassName;
      span.textContent = match.term;
      if (match.color) span.style.setProperty("--hl", match.color);
      frag.appendChild(span);
      i += match.term.length;
    }

    return { fragment: frag, plainText: src };
  }

  function applyHighlightedText(el, text, highlights, { defaultClassName = DEFAULT_CLASS, plainTextAttr = null } = {}) {
    if (!el) return;
    const { fragment, plainText } = formatHighlightedText(text, highlights, { defaultClassName });
    replaceChildrenSafe(el, [fragment]);
    if (plainTextAttr) el.setAttribute(String(plainTextAttr), plainText);
    return { plainText };
  }

  function stripHtmlToText(html) {
    const s = String(html ?? "");
    if (!s) return "";
    const div = document.createElement("div");
    div.innerHTML = s;
    return div.textContent || "";
  }

  function applyHighlightedHtml(el, html, highlights, { defaultClassName = DEFAULT_CLASS, plainTextAttr = null } = {}) {
    if (!el) return;
    const s = String(html ?? "");
    el.innerHTML = s;

    const rules = normalizeHighlights(highlights, { defaultClassName });
    if (!rules.length) {
      if (plainTextAttr) el.setAttribute(String(plainTextAttr), stripHtmlToText(s));
      return { plainText: stripHtmlToText(s) };
    }

    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const nodes = [];
    let n = walker.nextNode();
    while (n) {
      nodes.push(n);
      n = walker.nextNode();
    }

    for (const textNode of nodes) {
      const value = textNode.nodeValue || "";
      if (!value) continue;
      let hasAny = false;
      for (const r of rules) {
        if (r.term && value.includes(r.term)) {
          hasAny = true;
          break;
        }
      }
      if (!hasAny) continue;
      const { fragment } = formatHighlightedText(value, rules, { defaultClassName });
      textNode.parentNode?.replaceChild(fragment, textNode);
    }

    const plainText = el.textContent || "";
    if (plainTextAttr) el.setAttribute(String(plainTextAttr), plainText);
    return { plainText };
  }

  window.TextHighlight = {
    replaceChildrenSafe,
    normalizeHighlights,
    DEFAULT_DICTIONARY,
    dictionaryToHighlights,
    pickDictionaryHighlights,
    formatHighlightedText,
    applyHighlightedText,
    stripHtmlToText,
    applyHighlightedHtml,
    DEFAULT_CLASS,
  };
})();
