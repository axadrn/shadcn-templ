// Copy button for markdown code blocks - styled like shadcn-templ CopyButton component
(function() {
  'use strict';

  // Lucide SVG icons (matching the icon component)
  const clipboardIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/></svg>';
  const checkIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';

  function initCopyButtons() {
    const codeBlocks = document.querySelectorAll('[data-code-block]');

    codeBlocks.forEach(block => {
      // Skip if copy button already exists
      if (block.querySelector('.docs-copy-btn')) return;

      const pre = block.querySelector('pre');
      if (!pre) return;

      // Create button wrapper
      const btnWrapper = document.createElement('div');
      btnWrapper.className = 'inline-block absolute top-2 right-2';

      // Create button matching the CopyButton component style
      const btn = document.createElement('button');
      btn.className = 'docs-copy-btn inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent hover:text-accent-foreground h-7 w-7 text-muted-foreground';
      btn.type = 'button';
      btn.setAttribute('aria-label', 'Copy code to clipboard');

      // Create icon spans
      const clipboardSpan = document.createElement('span');
      clipboardSpan.innerHTML = clipboardIcon;
      clipboardSpan.setAttribute('data-templ-copy-icon-clipboard', '');

      const checkSpan = document.createElement('span');
      checkSpan.innerHTML = checkIcon;
      checkSpan.setAttribute('data-templ-copy-icon-check', '');
      checkSpan.style.display = 'none';

      btn.appendChild(clipboardSpan);
      btn.appendChild(checkSpan);
      btnWrapper.appendChild(btn);

      // Copy functionality
      btn.addEventListener('click', async () => {
        const code = pre.textContent || '';

        try {
          await navigator.clipboard.writeText(code.trim());

          // Toggle icons (matching CopyButton behavior)
          clipboardSpan.style.display = 'none';
          checkSpan.style.display = 'inline';

          setTimeout(() => {
            clipboardSpan.style.display = 'inline';
            checkSpan.style.display = 'none';
          }, 2000);
        } catch (err) {
          console.error('Failed to copy:', err);
        }
      });

      block.appendChild(btnWrapper);
    });
  }

  // Initialize on page load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCopyButtons);
  } else {
    initCopyButtons();
  }
})();
