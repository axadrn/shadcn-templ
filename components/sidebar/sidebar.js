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

  // shadcn's Sidebar renders its children in the mobile sheet below md and
  // in sidebar-inner otherwise: they render once and move between the two.
  function place(sidebar) {
    const sidebarId = sidebar.getAttribute("data-templ-sidebar-id");
    const inner = sidebar.querySelector('[data-slot="sidebar-inner"]');
    const portal = document.querySelector('[data-templ-sidebar-mobile-portal="' + sidebarId + '"]');
    if (!inner || !portal) return;

    const isMobile = window.matchMedia(MOBILE_QUERY).matches;
    const from = isMobile ? inner : portal;
    const to = isMobile ? portal : inner;
    if (from.firstChild) to.append(...from.childNodes);
    syncTooltips(sidebarId);

    // Mount/unmount the Sheet with open={openMobile}, as in shadcn's Sidebar.
    const popup = document.getElementById(sidebarId + "-mobile");
    const dialog = window.templ?.dialog;
    if (!popup || !dialog) return;
    if (isMobile && openMobileOf(sidebarId) && !dialog.isOpen(popup)) {
      dialog.open(popup);
    } else if (!isMobile && dialog.isOpen(popup)) {
      dialog.close(popup);
    }
  }

  window.templ.lifecycle.register(WRAPPER, { init: place });
  window.addEventListener("resize", () => document.querySelectorAll(WRAPPER).forEach(place));

  // SidebarMenuButton's TooltipContent: hidden={state !== "collapsed" ||
  // isMobile}, unless the tooltip prop sets hidden itself.
  function syncTooltips(sidebarId) {
    const wrapper = wrapperFor(sidebarId);
    const portal = document.querySelector('[data-templ-sidebar-mobile-portal="' + sidebarId + '"]');
    const hidden = wrapper?.getAttribute("data-state") !== "collapsed" || window.matchMedia(MOBILE_QUERY).matches;
    [wrapper, portal].forEach((root) => {
      root?.querySelectorAll("[data-templ-tooltip-trigger]").forEach((trigger) => {
        const popup = document.getElementById(trigger.getAttribute("data-templ-tooltip-trigger"));
        if (!popup || popup.hasAttribute("data-templ-tooltip-hidden")) return;
        popup.hidden = hidden;
      });
    });
  }

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

    syncTooltips(sidebarId);

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
