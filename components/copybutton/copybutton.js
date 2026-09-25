(function () {
  "use strict";

  // Copy button click delegation
  document.addEventListener("click", (e) => {
    const copyButton = e.target.closest("[data-templ-copy-button]");
    if (!copyButton) return;

    const targetId = copyButton.dataset.templTargetId;
    if (!targetId) {
      console.error("CopyButton: No target-id specified");
      return;
    }

    const targetElement = document.getElementById(targetId);
    if (!targetElement) {
      console.error(`CopyButton: Element with id '${targetId}' not found`);
      return;
    }

    // Smart detection: use value for inputs/textareas, textContent for everything else
    let textToCopy = "";
    if (targetElement.value !== undefined) {
      textToCopy = targetElement.value;
    } else {
      textToCopy = targetElement.textContent || "";
    }

    // Get icon elements
    const iconClipboard = copyButton.querySelector(
      "[data-templ-copy-icon-clipboard]",
    );
    const iconCheck = copyButton.querySelector("[data-templ-copy-icon-check]");

    if (!iconClipboard || !iconCheck) return;

    const showCopied = () => {
      iconClipboard.style.display = "none";
      iconCheck.style.display = "inline";

      // Update tooltip text if it exists
      const tooltipText = copyButton
        .closest(".inline-block")
        ?.parentElement?.parentElement?.querySelector(
          "[data-templ-copy-tooltip-text]",
        );
      const originalText = tooltipText?.textContent;
      if (tooltipText) {
        tooltipText.textContent = "Copied!";
      }

      setTimeout(() => {
        iconClipboard.style.display = "inline";
        iconCheck.style.display = "none";
        // Restore original tooltip text
        if (tooltipText && originalText) {
          tooltipText.textContent = originalText;
        }
      }, 2000);
    };

    // Try to copy using modern API first
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard
        .writeText(textToCopy.trim())
        .then(showCopied)
        .catch((err) => {
          console.error("CopyButton: Failed to copy text", err);
          fallbackCopy(textToCopy.trim(), showCopied);
        });
    } else {
      // Fallback for older browsers or non-secure contexts
      fallbackCopy(textToCopy.trim(), showCopied);
    }
  });

  // Fallback copy method for older browsers
  function fallbackCopy(text, callback) {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.top = "-9999px";
    textArea.style.left = "-9999px";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();

    try {
      const successful = document.execCommand("copy");
      if (successful) {
        callback();
      } else {
        console.error("CopyButton: Fallback copy failed");
      }
    } catch (err) {
      console.error("CopyButton: Fallback copy error", err);
    }

    document.body.removeChild(textArea);
  }
})();
