const stateAttribute = "data-tsukuyomi-scroll-state";
const delayProperty = "--tsukuyomi-scroll-delay";

export function createScrollReveal(root) {
  const document = root.ownerDocument;
  const { documentElement, defaultView } = document;
  if (!defaultView?.IntersectionObserver) return { observe() {}, disconnect() {} };

  const motion = defaultView.matchMedia?.("(prefers-reduced-motion: reduce)");
  const visible = new WeakSet();
  const tracked = new Set();
  let targets = new Set();

  const observer = new defaultView.IntersectionObserver((entries) => {
    const incoming = entries.filter(({ target, isIntersecting }) =>
      isIntersecting && tracked.has(target) && target.getAttribute(stateAttribute) === "pending");
    incoming.sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top
      || a.boundingClientRect.left - b.boundingClientRect.left);
    for (const [index, { target }] of incoming.entries()) {
      observer.unobserve(target);
      visible.add(target);
      target.style.setProperty(delayProperty, `${Math.min(index * 65, 130)}ms`);
      target.setAttribute(stateAttribute, "entering");
    }
  }, { root: document });

  function show(element) {
    if (!tracked.delete(element)) return;
    observer.unobserve(element);
    element.removeAttribute(stateAttribute);
    element.style.removeProperty(delayProperty);
  }

  function update() {
    const reduced = motion?.matches;
    for (const element of tracked) {
      if (reduced || !targets.has(element)) show(element);
    }
    if (reduced) return;

    const viewportBottom = documentElement.clientHeight || defaultView.innerHeight;
    for (const element of targets) {
      if (tracked.has(element) || visible.has(element) || !root.contains(element)
          || !element.getClientRects().length) continue;
      const { top } = element.getBoundingClientRect();
      // Leave content that is already on screen immediately readable.
      if (top < viewportBottom) {
        visible.add(element);
        continue;
      }
      tracked.add(element);
      element.setAttribute(stateAttribute, "pending");
      observer.observe(element);
    }
  }

  function onFocus(event) {
    const element = event.target.closest?.(`[${stateAttribute}]`);
    if (!tracked.has(element)) return;
    visible.add(element);
    show(element);
  }

  function onAnimationEnd(event) {
    if (event.animationName === "tsukuyomi-scroll-in") show(event.target);
  }

  motion?.addEventListener?.("change", update);
  root.addEventListener("focusin", onFocus);
  root.addEventListener("animationend", onAnimationEnd);
  root.addEventListener("animationcancel", onAnimationEnd);

  return {
    observe(elements) {
      targets = new Set(elements);
      update();
    },
    disconnect() {
      observer.disconnect();
      for (const element of tracked) show(element);
      targets.clear();
      motion?.removeEventListener?.("change", update);
      root.removeEventListener("focusin", onFocus);
      root.removeEventListener("animationend", onAnimationEnd);
      root.removeEventListener("animationcancel", onAnimationEnd);
    },
  };
}
