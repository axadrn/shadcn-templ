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
    // Children of their own are the caller's render function: theirs to update.
    if (valueEl && valueEl.childElementCount === 0) valueEl.textContent = Math.round(percentage) + '%';
  }

  // One shared observer translates aria-valuenow/aria-valuemax changes into
  // indicator width, value text, aria-valuetext and status attributes.
  const attrObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => updateProgress(mutation.target));
  });

  function observeBar(bar) {
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

  window.templ.lifecycle.register('[data-slot="progress"]', { init: observeBar });
})();
