(function () {
  'use strict';

  // Pendant of Base UI's status state: data-complete once value reaches max,
  // data-progressing otherwise, mirrored onto the root and every part.
  function setStatus(el, complete) {
    el.removeAttribute(complete ? 'data-progressing' : 'data-complete');
    el.setAttribute(complete ? 'data-complete' : 'data-progressing', '');
  }

  function updateProgress(progressBar) {
    const indicator = progressBar.querySelector('[data-slot="progress-indicator"]');
    if (!indicator) return;

    const value = parseFloat(progressBar.getAttribute('aria-valuenow') || '0');
    const max = parseFloat(progressBar.getAttribute('aria-valuemax') || '100') || 100;
    const percentage = Math.max(0, Math.min(100, (value / max) * 100));

    indicator.style.width = percentage + '%';
    progressBar.setAttribute('aria-valuetext', Math.round(percentage) + '%');

    const complete = value >= max;
    setStatus(progressBar, complete);
    progressBar
      .querySelectorAll('[data-slot^="progress-"]')
      .forEach((part) => setStatus(part, complete));

    const valueEl = progressBar.querySelector('[data-slot="progress-value"]');
    if (valueEl) valueEl.textContent = Math.round(percentage) + '%';
  }

  // One shared observer translates aria-valuenow/aria-valuemax changes into
  // indicator width, value text, aria-valuetext and status attributes.
  const attrObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => updateProgress(mutation.target));
  });

  function observeBar(bar) {
    if (bar._templProgress) return;
    bar._templProgress = true;

    // Pendant of Base UI's label registration: a Label child links itself to
    // the root via aria-labelledby.
    const label = bar.querySelector('[data-slot="progress-label"]');
    if (label && label.id && !bar.hasAttribute('aria-labelledby')) {
      bar.setAttribute('aria-labelledby', label.id);
    }

    updateProgress(bar);
    attrObserver.observe(bar, {
      attributes: true,
      attributeFilter: ['aria-valuenow', 'aria-valuemax'],
    });
  }

  // Bars present at load register immediately; bars swapped in later (e.g.
  // htmx) register via the childList observer.
  function init() {
    document.querySelectorAll('[data-slot="progress"]').forEach(observeBar);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  // Re-init on any childList mutation, directly (never rAF-deferred: rAF
  // does not fire in hidden tabs or throttled iframes): swapped-in markup
  // wires itself.
  new MutationObserver(() => init()).observe(document.body, { childList: true, subtree: true });
})();
