(function () {
  // shadcn's menubar on Base UI's Menubar: a composite of MenuTriggers whose
  // menus are root menus (components/baseui/menu_root.js) with the menubar as
  // their parent. Once one menu is open (hasSubmenuOpen), hovering or focusing
  // another trigger opens its menu, the arrow keys of the menubar orientation
  // move from an open menu to the next one.
  const ROOT = '[data-slot="menubar"]';
  const TRIGGER = '[data-slot="menubar-trigger"]';

  function menubarOf(el) {
    return el?.closest?.(ROOT) ?? null;
  }

  function triggersOf(menubar) {
    return [...menubar.querySelectorAll(TRIGGER)].filter((t) => menubarOf(t) === menubar);
  }

  // The menubar a menu belongs to, through its trigger.
  function menubarOfContent(content) {
    return menubarOf(root.triggerFor(content));
  }

  function hasSubmenuOpen(menubar) {
    return menubar.hasAttribute("data-has-submenu-open");
  }

  const root = window.templ.menuRoot.create({
    slot: "menubar",
    event: "menubar",
    trigger: TRIGGER,
    // shadcn's DropdownMenuSubContent, which MenubarSubContent renders.
    subPositioning: { side: "right", align: "start", sideOffset: 0, alignOffset: -3 },
    parent: {
      // MenuPositioner's InternalBackdrop cuts out the whole menubar.
      cutout: (trigger) => menubarOf(trigger) ?? trigger,
      focusGuards: false,
      // MenuTrigger's useClick in a menubar: mousedown opens, a click on the
      // trigger of the open menu closes it.
      clickEvent: (trigger, isOpenedByTrigger) => (isOpenedByTrigger ? "click" : "mousedown"),
      // MenuRoot's parentOrientation.
      listNavigation: { nested: true, parentOrientation: "horizontal" },
      // MenuRoot's instantType: a switch between the menus of a menubar.
      instant: (reason) =>
        ["trigger-focus", "focus-out", "trigger-hover", "list-navigation", "sibling-open"].includes(reason) ? "group" : undefined,
      // MenubarContent's onSubmenuOpenChange.
      onOpenChange(content, open, details) {
        const menubar = menubarOfContent(content);
        if (!menubar) return;
        if (open) menubar.setAttribute("data-has-submenu-open", "");
        else if (details.reason !== "sibling-open" && details.reason !== "list-navigation") {
          menubar.removeAttribute("data-has-submenu-open");
        }
        content._templSyncClick?.();
      },
      // MenuRoot's keyboardEventRelay: the popup is portaled out of the
      // menubar, its keys reach the menubar's composite through the relay.
      keydown(event) {
        const content = event.currentTarget.parentElement;
        const menubar = menubarOfContent(content);
        if (!menubar || event.defaultPrevented) return;
        menubar._templComposite?.relayKeyboardEvent(event);
      },
      // MenubarContext.rootId, the popup's data-rootownerid.
      rootId: (trigger) => menubarOf(trigger)?.id,
    },
  });

  // Keys in a submenu reach the root menu's relay through the React tree,
  // the portal in between: relay what a menubar menu's submenus leave.
  document.addEventListener("keydown", (event) => {
    if (event.defaultPrevented || !(event.target instanceof Element)) return;
    const content = root.menu.positionerOf(event.target);
    if (!content || root.menu.popupFor(content).contains(event.target)) return;
    const menubar = menubarOfContent(content);
    menubar?._templComposite?.relayKeyboardEvent(event);
  });

  function contentOf(trigger) {
    return root.contentFor(trigger);
  }

  function openMenuOf(menubar) {
    return triggersOf(menubar).map(contentOf).find((c) => c && root.isOpen(c)) ?? null;
  }

  // Opens the menu of trigger in place of the open one (sibling-open).
  function switchTo(trigger, reason, event) {
    const content = contentOf(trigger);
    if (!content || root.isOpen(content)) return;
    if (trigger.getAttribute("aria-disabled") === "true") return;
    // useOpenInteractionType: a focus switch carries no interaction of the
    // new trigger, so its popup takes the focus itself.
    trigger._templOpenMethod = reason === "trigger-hover" ? "mouse" : "programmatic";
    root.requestOpenChange(content, true, { reason, event });
  }

  function init(menubar) {
    const composite = window.templ.composite.useCompositeRoot(menubar, {
      items: () => triggersOf(menubar),
      orientation: menubar.getAttribute("data-orientation") === "vertical" ? "vertical" : "horizontal",
      rtl: () => window.templ.direction.useDirection(menubar) === "rtl",
      loopFocus: true,
      enableHomeAndEndKeys: true,
      disabledIndices: [],
      highlightItemOnHover: () => hasSubmenuOpen(menubar),
    });
    menubar._templComposite = composite;

    // MenuTrigger's useFocus in a menubar with a menu open: focus opens.
    const onFocusIn = (event) => {
      const trigger = event.target.closest?.(TRIGGER);
      if (!trigger || menubarOf(trigger) !== menubar || !hasSubmenuOpen(menubar)) return;
      switchTo(trigger, "trigger-focus", event);
    };
    // MenuTrigger's useHoverReferenceInteraction in a menubar with a menu
    // open: hovering another trigger opens its menu.
    const onMouseOver = (event) => {
      const trigger = event.target.closest?.(TRIGGER);
      if (!trigger || menubarOf(trigger) !== menubar || !hasSubmenuOpen(menubar)) return;
      if (openMenuOf(menubar) === contentOf(trigger)) return;
      switchTo(trigger, "trigger-hover", event);
    };
    menubar.addEventListener("focusin", onFocusIn);
    menubar.addEventListener("mouseover", onMouseOver);
    menubar._templCleanup = () => {
      composite.cleanup();
      menubar.removeEventListener("focusin", onFocusIn);
      menubar.removeEventListener("mouseover", onMouseOver);
    };
  }

  window.templ.lifecycle.register(ROOT, {
    init,
    destroy(menubar) {
      menubar._templCleanup?.();
      menubar._templComposite = null;
    },
  });
})();
