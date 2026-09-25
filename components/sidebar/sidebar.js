(function () {
  "use strict";

  const SIDEBAR_COOKIE_NAME = "sidebar_state";
  const SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days
  const SIDEBAR_KEYBOARD_SHORTCUT = "b";
  const MOBILE_QUERY = "(max-width: 767px)";

  // shadcn has one SidebarProvider context; the port marker names each
  // sidebar so several can live on a page.
  const WRAPPER = "[data-templ-sidebar-id]";

  function wrapperFor(sidebarId) {
    return document.querySelector('[data-templ-sidebar-id="' + sidebarId + '"]');
  }

  // SidebarProvider.openMobile survives the Sheet's viewport-driven unmount.
  function openMobileOf(sidebarId) {
    return !!anyWrapper(sidebarId)?._templOpenMobile;
  }

  // SidebarProvider.setOpenMobile: state is independent of the mounted Sheet.
  function setOpenMobile(open, sidebarId) {
    const wrapper = anyWrapper(sidebarId);
    if (!wrapper) return;
    wrapper._templOpenMobile = !!open;
    if (!window.matchMedia(MOBILE_QUERY).matches) return;
    const popup = document.getElementById(wrapper.getAttribute("data-templ-sidebar-id") + "-mobile");
    const dialog = window.templ?.dialog;
    if (!popup || !dialog) return;
    if (open && !dialog.isOpen(popup)) dialog.open(popup);
    else if (!open && dialog.isOpen(popup)) dialog.close(popup);
  }

  // The sidebar content renders once and moves between the desktop container
  // and the mobile sheet, depending on the viewport.
  function init() {
    document.querySelectorAll("[data-templ-sidebar-content]").forEach((content) => {
      const sidebarId = content.getAttribute("data-templ-sidebar-content");
      const portal = document.querySelector(
        '[data-templ-sidebar-mobile-portal="' + sidebarId + '"]',
      );
      if (!portal) return;

      const isMobile = window.matchMedia(MOBILE_QUERY).matches;

      if (isMobile && content.parentElement !== portal) {
        portal.appendChild(content);
      } else if (!isMobile && content.parentElement === portal) {
        const inner = wrapperFor(sidebarId)?.querySelector('[data-slot="sidebar-inner"]');
        if (inner) inner.appendChild(content);
      }

      // Mount/unmount the Sheet with open={openMobile}, as in shadcn's Sidebar.
      const popup = document.getElementById(sidebarId + "-mobile");
      const dialog = window.templ?.dialog;
      if (!popup || !dialog) return;
      if (isMobile && openMobileOf(sidebarId) && !dialog.isOpen(popup)) {
        dialog.open(popup);
      } else if (!isMobile && dialog.isOpen(popup)) {
        dialog.close(popup);
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
  window.addEventListener("resize", init);
  // Re-init on any childList mutation, directly (never rAF-deferred: rAF
  // does not fire in hidden tabs or throttled iframes): swapped-in markup
  // wires itself.
  new MutationObserver(() => init()).observe(document.body, { childList: true, subtree: true });

  function toggleSidebar(sidebarId) {
    // shadcn's toggleSidebar: setOpenMobile((open) => !open) below md.
    if (window.matchMedia(MOBILE_QUERY).matches) {
      setOpenMobile(!openMobileOf(sidebarId), sidebarId);
      return;
    }

    const wrapper = wrapperFor(sidebarId);
    if (!wrapper) return;
    const mode = wrapper.getAttribute("data-templ-collapsible");
    if (mode === "none") return;

    const collapsed = wrapper.getAttribute("data-state") !== "collapsed";
    wrapper.setAttribute("data-state", collapsed ? "collapsed" : "expanded");
    // Like shadcn, data-collapsible carries the mode only while collapsed,
    // so icon/offcanvas selectors need no extra state check.
    wrapper.setAttribute("data-collapsible", collapsed ? mode : "");

    // Menu button tooltips only show while collapsed to icons.
    const tooltipsDisabled = !(collapsed && mode === "icon");
    // Tooltip triggers either carry Base UI's identifier or, disabled,
    // data-trigger-disabled (TooltipTrigger disabled prop).
    wrapper.querySelectorAll("[data-base-ui-tooltip-trigger], [data-trigger-disabled]").forEach((trigger) => {
      // An explicit tooltip.hidden pendant pins the state.
      if (trigger.hasAttribute("data-templ-tooltip-hidden")) return;
      trigger.toggleAttribute("data-trigger-disabled", tooltipsDisabled);
      trigger.toggleAttribute("data-base-ui-tooltip-trigger", !tooltipsDisabled);
    });

    document.cookie =
      SIDEBAR_COOKIE_NAME +
      "=" +
      (collapsed ? "false" : "true") +
      "; path=/; max-age=" +
      SIDEBAR_COOKIE_MAX_AGE;
  }

  document.addEventListener("click", (e) => {
    if (!(e.target instanceof Element)) return;
    // SidebarTrigger and SidebarRail; the port marker names their sidebar.
    const trigger = e.target.closest("[data-templ-sidebar-trigger]");
    if (!trigger) return;
    const targetId = trigger.getAttribute("data-templ-sidebar-trigger");
    if (targetId) toggleSidebar(targetId);
  });

  // Sheet onOpenChange={setOpenMobile}; unmount closes do not change state.
  document.addEventListener("dialog-open-change", (event) => {
    if (!(event.target instanceof Element)) return;
    const id = event.target.id;
    if (!id.endsWith("-mobile")) return;
    const sidebarId = id.slice(0, -"-mobile".length);
    if (wrapperFor(sidebarId)) setOpenMobile(event.detail.open, sidebarId);
  });

  // The useSidebar pendant: the same seven members as the React hook,
  // addressing the first sidebar unless a sidebarId is given.
  function anyWrapper(sidebarId) {
    return sidebarId
      ? wrapperFor(sidebarId)
      : document.querySelector(WRAPPER);
  }

  window.templ = window.templ || {};
  window.templ.sidebar = {
    state(sidebarId) {
      return anyWrapper(sidebarId)?.getAttribute("data-state") || null;
    },
    open(sidebarId) {
      return this.state(sidebarId) === "expanded";
    },
    setOpen(open, sidebarId) {
      const wrapper = anyWrapper(sidebarId);
      if (!wrapper) return;
      if (this.open(sidebarId) !== open) {
        toggleSidebar(wrapper.getAttribute("data-templ-sidebar-id"));
      }
    },
    openMobile(sidebarId) {
      return openMobileOf(sidebarId);
    },
    setOpenMobile(open, sidebarId) {
      setOpenMobile(open, sidebarId);
    },
    isMobile() {
      return window.matchMedia(MOBILE_QUERY).matches;
    },
    // The subscription half of useSidebar().isMobile: calls fn with the
    // current value now and again whenever it changes, like a re-render.
    // fn returns false when its elements are gone (the unmount pendant),
    // which unsubscribes it.
    onMobileChange(fn) {
      const query = window.matchMedia(MOBILE_QUERY);
      const listener = () => {
        if (fn(query.matches) === false) query.removeEventListener("change", listener);
      };
      query.addEventListener("change", listener);
      listener();
    },
    toggleSidebar(sidebarId) {
      const wrapper = anyWrapper(sidebarId);
      if (wrapper) toggleSidebar(wrapper.getAttribute("data-templ-sidebar-id"));
    },
  };

  // Cmd/Ctrl + shortcut key toggles the sidebar.
  document.addEventListener("keydown", (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.key.length !== 1) return;
    const wrapper = document.querySelector(WRAPPER);
    if (!wrapper || e.key.toLowerCase() !== SIDEBAR_KEYBOARD_SHORTCUT) return;
    e.preventDefault();
    toggleSidebar(wrapper.getAttribute("data-templ-sidebar-id"));
  });
})();
