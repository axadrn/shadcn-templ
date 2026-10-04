// Port of what @base-ui/react menu (1.6.0) shares between shadcn's dropdown
// menu and context menu: MenuRoot's list navigation and typeahead,
// MenuPositioner's internal backdrop, MenuPopup's state attributes, the items
// (useMenuItem with useButton), groups, and SubmenuRoot with
// SubmenuTrigger. A component script creates its menu from its slot names and
// keeps its own trigger and root open: MenuTrigger for the dropdown menu,
// ContextMenu.Trigger for the context menu.
//
// A menu's element is its positioner (no slot upstream) around the
// [data-slot=<slot>-content] popup, inside the portal node. A submenu is its
// trigger: SubmenuRoot renders no element, the trigger links its popup in
// data-templ-controls.
(function () {
  "use strict";

  const ITEM_SELECTOR = '[role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"]';

  // MenuSubmenuTrigger's defaults: hover opens after 100 ms at rest, the
  // close has no delay.
  const SUBMENU_DELAY = 100;
  const SUBMENU_CLOSE_DELAY = 0;

  // config: slot ("dropdown-menu"), event (the custom event prefix,
  // "dropdownmenu"), subPositioning (the submenu's MenuPositioner props),
  // onItemPress(positioner, event) closes the root menu.
  function create(config) {
    const { slot, event: eventPrefix, subPositioning, onItemPress } = config;
    const POPUP = '[data-slot="' + slot + '-content"]';
    const SUB_TRIGGER = '[data-slot="' + slot + '-sub-trigger"]';
    const SUB_CONTENT = '[data-slot="' + slot + '-sub-content"]';
    const GROUP = '[data-slot="' + slot + '-group"], [data-slot="' + slot + '-radio-group"]';
    const LABEL = '[data-slot="' + slot + '-label"]';

    // ----- parts ---------------------------------------------------------------

    function isPositioner(el) {
      return !!el?.querySelector?.(":scope > " + POPUP);
    }

    function popupFor(positioner) {
      return positioner.querySelector(":scope > " + POPUP);
    }

    // The root positioner of a popup id, or null.
    function positionerById(id) {
      const popup = id && document.getElementById(id);
      return popup?.matches(POPUP) && isPositioner(popup.parentElement) ? popup.parentElement : null;
    }

    function allPositioners() {
      return [...document.querySelectorAll(POPUP)].map((p) => p.parentElement).filter(isPositioner);
    }

    // The root positioner of the menu an element sits in, portaled submenus
    // included.
    function positionerOf(target) {
      for (let node = target; node; node = window.templ.portal.treeParent(node)) {
        if (node.matches?.(POPUP) && isPositioner(node.parentElement)) return node.parentElement;
      }
      return null;
    }

    function isOpen(positioner) {
      return !!positioner && positioner.hasAttribute("data-open");
    }

    // The positioner's parent is the portal node, which moves to <body> on
    // open and is unmounted while the menu is (MenuPortal).
    function portalNodeOf(positioner) {
      return positioner.parentElement;
    }

    // An explicit Portal part (shadcn's <slot>-portal) around a submenu's
    // content mounts with it, the content's own portal node inside it.
    function outerPortalOf(positioner) {
      if (positioner._templOuterPortal === undefined) {
        const outer = portalNodeOf(positioner).parentElement
          ?.closest('[data-slot="' + slot + '-portal"], ' + SUB_CONTENT + ", " + POPUP);
        positioner._templOuterPortal = outer?.matches('[data-slot="' + slot + '-portal"]') ? outer : null;
      }
      return positioner._templOuterPortal;
    }

    function mountPortal(positioner) {
      // Base UI mounts the popup fresh on every open: no tab order the portal
      // saved from the previous one (FloatingPortal's disableFocusInside).
      positioner.querySelectorAll("[data-tabindex]").forEach((el) => el.removeAttribute("data-tabindex"));
      const outer = outerPortalOf(positioner);
      if (outer) {
        window.templ.portal.render(outer);
        outer.hidden = false;
      }
      const node = portalNodeOf(positioner);
      window.templ.portal.render(node);
      node.hidden = false;
      positioner.hidden = false;
    }

    function unmountPortal(positioner) {
      positioner.hidden = true;
      portalNodeOf(positioner).hidden = true;
      const outer = outerPortalOf(positioner);
      if (outer) outer.hidden = true;
    }

    // ----- state attributes -----------------------------------------------------

    // MenuRoot's instantType, rendered as data-instant on the positioner and
    // the popup: "click" for a press without a pointer (a keyboard click or a
    // context menu key), "dismiss" for Escape, none otherwise.
    function setInstant(positioner, popup, details) {
      const { reason, event, open } = details || {};
      let instant = null;
      if ((reason === "trigger-press" || reason === "item-press") && event?.detail === 0 && event.isTrusted) {
        instant = "click";
      } else if (!open && (reason === "escape-key" || reason == null)) {
        instant = "dismiss";
      }
      [positioner, popup].forEach((el) => {
        if (instant) el.setAttribute("data-instant", instant);
        else el.removeAttribute("data-instant");
      });
    }

    // MenuPositioner's InternalBackdrop while a modal menu is mounted, with a
    // hole over the cutout (the dropdown trigger).
    function mountBackdrop(positioner, cutout) {
      window.templ.internalBackdrop.mount(positioner, cutout);
    }

    // CheckboxItemIndicator and RadioItemIndicator, inside shadcn's
    // indicator span. It renders the item's state and mounts while checked.
    function indicatorOf(item) {
      return item.querySelector(":scope > span > span[aria-hidden]");
    }

    function setChecked(item, checked) {
      item.toggleAttribute("data-checked", checked);
      item.toggleAttribute("data-unchecked", !checked);
      item.setAttribute("aria-checked", checked ? "true" : "false");
      const indicator = indicatorOf(item);
      if (indicator) indicator.hidden = !checked;
    }

    // Base UI renders an id on every item, label and submenu trigger, and
    // a group names its label.
    function wireIds(popup) {
      let n = 0;
      popup.querySelectorAll(ITEM_SELECTOR + ", " + LABEL).forEach((el) => {
        if (!el.id) el.id = popup.id + "-" + ++n;
      });
      popup.querySelectorAll(GROUP).forEach((group) => {
        const label = [...group.querySelectorAll(LABEL)].find((l) => l.closest(GROUP) === group);
        if (label && !group.hasAttribute("aria-labelledby")) group.setAttribute("aria-labelledby", label.id);
      });
    }

    // ----- list navigation and typeahead ---------------------------------------

    // The menu an item belongs to: the root popup or a submenu's popup.
    function containerOf(el) {
      return el.closest(SUB_CONTENT + ", " + POPUP);
    }

    // The menu's list, disabled items included (Base UI's menus pass an empty
    // disabledIndices, so disabled items are highlighted too).
    function itemsIn(popup) {
      return [...popup.querySelectorAll(ITEM_SELECTOR)].filter((item) => containerOf(item) === popup);
    }

    // The item's highlight, with the roving tabindex of useMenuItemCommonProps.
    // A submenu trigger also stays in the tab order while its submenu is open.
    function highlight(popup, index) {
      popup._templActiveIndex = index;
      itemsIn(popup).forEach((item, i) => {
        item.toggleAttribute("data-highlighted", i === index);
        indicatorOf(item)?.toggleAttribute("data-highlighted", i === index);
        item.tabIndex = i === index || isOpenSubTrigger(item) ? 0 : -1;
      });
    }

    function isOpenSubTrigger(item) {
      return item.matches(SUB_TRIGGER) && item.getAttribute("aria-expanded") === "true";
    }

    // MenuSubmenuTrigger's onBlur: focus that leaves it, into its submenu too,
    // clears the parent menu's highlight.
    function onSubTriggerBlur(event) {
      const trigger = event.currentTarget;
      if (trigger.hasAttribute("data-highlighted")) highlight(containerOf(trigger), null);
    }

    function setSubTriggerOpen(trigger, open) {
      trigger.setAttribute("aria-expanded", open ? "true" : "false");
      trigger.toggleAttribute("data-popup-open", open);
      // SubmenuTrigger renders aria-controls while its submenu is open.
      if (open) trigger.setAttribute("aria-controls", trigger.getAttribute("data-templ-controls"));
      else trigger.removeAttribute("aria-controls");
      trigger.tabIndex = open || trigger.hasAttribute("data-highlighted") ? 0 : -1;
    }

    // MenuRoot's useListNavigation and useTypeahead for one menu popup.
    // options are the root's: { nested, parentOrientation, openOnArrowKeyDown }.
    function startListNavigation(popup, reference, isPopupOpen, onOpenChange, options) {
      const items = () => itemsIn(popup);
      const activeIndex = () => popup._templActiveIndex ?? null;
      popup._templNav = window.templ.listNavigation.useListNavigation({
        floating: popup,
        reference,
        items,
        activeIndex,
        onNavigate: (index) => highlight(popup, index),
        onOpenChange,
        isOpen: isPopupOpen,
        loopFocus: true,
        disabledIndices: [],
        // MenuRoot's rtl: useDirection.
        rtl: window.templ.direction.useDirection(popup) === "rtl",
        ...options,
      });
      popup._templTypeahead = window.templ.typeahead.useTypeahead({
        elements: [reference, popup],
        labels: () => items().map((item) => item.textContent.trim()),
        items,
        activeIndex,
        isOpen: isPopupOpen,
        onMatch(index) {
          if (!isPopupOpen() || index === activeIndex()) return;
          highlight(popup, index);
          popup._templNav.sync();
        },
        resetMs: 500,
      });
    }

    function stopListNavigation(popup) {
      popup._templNav?.cleanup();
      popup._templTypeahead?.cleanup();
      popup._templNav = null;
      popup._templTypeahead = null;
    }

    // ----- root ------------------------------------------------------------------

    // What every root open does once positioned: the enter transition, the
    // list navigation and the submenus' declared state.
    function afterRootOpen(positioner, details) {
      const popup = popupFor(positioner);
      setInstant(positioner, popup, { ...details, open: true });
      window.templ.transition.open({ positioner, parts: [popup] });
      popup._templNav?.open();
      popup._templTypeahead?.reset();
      syncSubState(positioner);
    }

    // What every root close does: submenus close at once, the backdrop goes
    // inert, the exit transition runs, then the menu unmounts (its focus
    // manager returns focus then, through onUnmount).
    function closeRoot(positioner, details, onUnmount) {
      const popup = popupFor(positioner);
      popup._templAllowMouseEnter = false;
      popup._templNav?.close();
      popup._templTypeahead?.reset();
      setInstant(positioner, popup, { ...details, open: false });
      positioner._templSubs?.forEach(closeSubNow);
      window.templ.internalBackdrop.inert(positioner);
      window.templ.transition.close({ positioner, parts: [popup] }, popup, () => {
        onUnmount();
        window.templ.internalBackdrop.remove(positioner);
        unmountPortal(positioner);
      });
    }

    // Every submenu of the tree, collected before they portal.
    function initRoot(positioner) {
      const popup = popupFor(positioner);
      wireIds(popup);
      positioner._templSubs = [...popup.querySelectorAll(SUB_TRIGGER)];
      positioner._templSubs.forEach(initSub);
    }

    function destroyRoot(positioner) {
      stopListNavigation(popupFor(positioner));
      positioner._templSubs?.forEach(destroySub);
      window.templ.internalBackdrop.remove(positioner);
      window.templ.portal.remove(portalNodeOf(positioner));
    }

    // ----- submenus -------------------------------------------------------------

    // A submenu is its trigger. The popup portals on open, so the link is kept
    // from the declaration.
    function subContentOf(sub) {
      if (!sub._templSubContent) {
        const popup = document.getElementById(sub.getAttribute("data-templ-controls") || "");
        if (popup?.matches(SUB_CONTENT)) {
          sub._templSubContent = popup;
          popup._templSub = sub;
        }
      }
      return sub._templSubContent || null;
    }

    // The store's open state, set when the change is requested.
    function isSubOpen(sub) {
      return !!sub._templIsOpen;
    }

    // The parent menu's popup: the root popup or a submenu's popup.
    function parentPopupOf(sub) {
      return containerOf(sub);
    }

    // The subs whose parent menu is this popup.
    function childSubsOf(popup, all) {
      return all.filter((sub) => parentPopupOf(sub) === popup);
    }

    function subsOfTree(sub) {
      return positionerOf(sub)?._templSubs || [];
    }

    // A submenu's MenuRoot: list navigation nested in its parent menu, the
    // trigger's useClick and useHoverReferenceInteraction, the popup's
    // useHoverFloatingInteraction.
    function initSub(sub) {
      const content = subContentOf(sub);
      if (!content) return;
      const positioner = content.parentElement;
      sub.addEventListener("blur", onSubTriggerBlur);
      startListNavigation(content, sub, () => isSubOpen(sub),
        (open) => requestSubOpenChange(sub, open), { nested: true, parentOrientation: "vertical" });
      const hover = window.templ.hover;
      const disabled = () => sub.getAttribute("aria-disabled") === "true";
      // hoverEnabled of the submenu's store: off after the pointer moved in its
      // popup or one of its own submenus opened, on again once it closes.
      const hoverEnabled = () => sub._templHoverEnabled !== false;
      sub._templHover = hover.createHoverInteraction({
        isOpen: () => isSubOpen(sub),
        onOpenChange: (open, reason, event) => requestSubOpenChange(sub, open, { reason, event }),
        openEventType: () => sub._templOpenEventType ?? null,
        domReference: () => sub,
        floating: () => (positioner.hidden ? null : positioner),
        placement: () => positioner.getAttribute("data-side") || "right",
        triggers: () => [sub],
        // The scope Base UI resolves for a submenu: the parent menu's popup,
        // through its data-rootownerid.
        parentFloating: () => parentPopupOf(sub),
      });
      sub._templCleanups = [
        window.templ.click.useClick(sub, {
          event: "mousedown",
          toggle: false,
          ignoreMouse: true,
          stickIfOpen: false,
          isOpen: () => isSubOpen(sub),
          openEventType: () => sub._templOpenEventType ?? null,
          onOpenChange(nextOpen, event) {
            if (!disabled()) requestSubOpenChange(sub, nextOpen, { reason: "trigger-press", event });
          },
        }),
        hover.useHoverReferenceInteraction(sub, sub._templHover, {
          enabled: () => hoverEnabled() && !disabled(),
          handleClose: hover.safePolygon({ blockPointerEvents: true }),
          mouseOnly: true,
          move: true,
          restMs: SUBMENU_DELAY,
          delay: { open: SUBMENU_DELAY, close: SUBMENU_CLOSE_DELAY },
          // The menu opened under a resting pointer: no submenu opens until it moves.
          shouldOpen: () => parentPopupOf(sub)?._templAllowMouseEnter === true,
          isClosing: () => window.templ.transition.isEnding(content),
        }),
        hover.useHoverFloatingInteraction(sub._templHover, { enabled: hoverEnabled, closeDelay: SUBMENU_CLOSE_DELAY }),
      ];
    }

    function destroySub(sub) {
      const content = subContentOf(sub);
      if (!content) return;
      sub.removeEventListener("blur", onSubTriggerBlur);
      closeSubNow(sub);
      sub._templCleanups?.forEach((cleanup) => cleanup());
      sub._templCleanups = null;
      sub._templHover?.dispose();
      sub._templHover = null;
      stopListNavigation(content);
    }

    // The submenu's MenuPopup focus manager: non modal, no initial focus, focus
    // returns to the submenu trigger.
    function startSubFocusManager(sub) {
      const content = subContentOf(sub);
      if (content._templFocus) {
        content._templFocus.open();
        return;
      }
      content._templFocus = window.templ.focusManager.useFloatingFocusManager({
        floating: content.parentElement,
        reference: sub,
        modal: false,
        initialFocus: false,
        restoreFocus: true,
        previousFocusableElement: sub,
        onOpenChange: (open, reason, event) => requestSubOpenChange(sub, open, { reason, event }),
      });
    }

    function stopSubFocusManager(content) {
      content._templFocus?.unmount();
      content._templFocus = null;
    }

    function stopSubPositioning(content) {
      content._templPositionCleanup?.();
      content._templPositionCleanup = null;
    }

    function openSub(sub, details = {}) {
      const content = subContentOf(sub);
      if (!content) return;
      const positioner = content.parentElement;
      sub._templIsOpen = true;
      sub._templOpenEventType = details.event?.type ?? null;
      mountPortal(positioner);
      // The submenu's MenuRoot useDismiss: Escape closes only the submenu
      // (closeParentOnEsc is false).
      content._templDismiss ??= window.templ.dismiss.useDismiss({
        floating: positioner,
        reference: sub,
        onOpenChange: (open, reason, event) => requestSubOpenChange(sub, open, { reason, event }),
      });
      startSubFocusManager(sub);
      sub._templHover?.openChange(true, details.reason);
      stopSubPositioning(content);
      const positioning = window.templ.anchorPositioning.useAnchorPositioning({
        anchor: sub,
        positioner,
        parts: [positioner, content],
        ...subPositioning,
      });
      content._templPositionCleanup = positioning.cleanup;
      positioning.positioned.then(() => {
        if (positioner.hidden) return; // closed meanwhile
        setInstant(positioner, content, { ...details, open: true });
        window.templ.transition.open({ positioner, parts: [content] });
        setSubTriggerOpen(sub, true);
        content._templNav?.open();
        content._templTypeahead?.reset();
      });
    }

    // The store's reset when a submenu closes: hover on again, no pointer move
    // seen in its popup yet.
    function resetSubState(sub, content) {
      sub._templIsOpen = false;
      sub._templOpenEventType = null;
      sub._templHoverEnabled = true;
      content._templAllowMouseEnter = false;
    }

    // Closes with the exit animation. details { reason, event } of the close,
    // for the focus manager and the hover interaction.
    function closeSub(sub, details = {}) {
      const content = subContentOf(sub);
      if (!content) return;
      const positioner = content.parentElement;
      resetSubState(sub, content);
      sub._templHover?.openChange(false, details.reason);
      content._templDismiss?.();
      content._templDismiss = null;
      content._templFocus?.close(details);
      content._templNav?.close();
      content._templTypeahead?.reset();
      setInstant(positioner, content, { ...details, open: false });
      window.templ.transition.close({ positioner, parts: [content] }, content, () => {
        stopSubPositioning(content);
        stopSubFocusManager(content);
        unmountPortal(positioner);
      });
      setSubTriggerOpen(sub, false);
    }

    // Closes immediately (used when the whole menu goes away).
    function closeSubNow(sub) {
      const content = subContentOf(sub);
      if (!content) return;
      const positioner = content.parentElement;
      const wasOpen = isSubOpen(sub);
      resetSubState(sub, content);
      if (wasOpen) sub._templHover?.openChange(false);
      stopSubPositioning(content);
      content._templDismiss?.();
      content._templDismiss = null;
      content._templNav?.close();
      stopSubFocusManager(content);
      unmountPortal(positioner);
      window.templ.transition.reset({ positioner, parts: [content] }, false);
      setSubTriggerOpen(sub, false);
    }

    function requestSubOpenChange(sub, nextOpen, details = {}) {
      const content = subContentOf(sub);
      if (!content || isSubOpen(sub) === nextOpen) return false;
      const accepted = sub.dispatchEvent(
        new CustomEvent(eventPrefix + "-sub-open-change", {
          bubbles: true,
          cancelable: true,
          detail: { open: nextOpen },
        }),
      );
      // Controlled: the Base UI open prop on the SubmenuRoot, the owner commits.
      if (!accepted || content.parentElement.hasAttribute("data-templ-open")) return false;
      sub._templSubOpen = nextOpen;
      const all = subsOfTree(sub);
      const parentPopup = parentPopupOf(sub);
      if (nextOpen) {
        // MenuPositioner's menuopenchange: the parent menu stops closing on
        // hover, a sibling submenu closes.
        if (parentPopup?._templSub) parentPopup._templSub._templHoverEnabled = false;
        childSubsOf(parentPopup, all).forEach((other) => {
          if (other !== sub) requestSubOpenChange(other, false, { reason: "sibling-open" });
        });
        openSub(sub, details);
      } else {
        // A submenu closes with its parent.
        childSubsOf(content, all).forEach((child) => requestSubOpenChange(child, false, details));
        closeSub(sub, details);
      }
      return true;
    }

    function syncSubState(positioner) {
      positioner._templSubs?.forEach((sub) => {
        const content = subContentOf(sub);
        if (!content) return;
        const subPositioner = content.parentElement;
        // Last requested state, else the server's open or defaultOpen.
        const shouldOpen = sub._templSubOpen ?? (
          subPositioner.getAttribute("data-templ-open") === "true" ||
          subPositioner.hasAttribute("data-templ-default-open"));
        if (shouldOpen && !isSubOpen(sub)) openSub(sub);
        else if (!shouldOpen && isSubOpen(sub)) closeSubNow(sub);
      });
    }

    // ----- events -----------------------------------------------------------------

    // The popup's onMouseMove and onClick in MenuRoot, and the items'
    // itemhover: a pointer move allows hover opening in that menu, turns off
    // the hover close of a submenu, and a move over another item of the parent
    // menu closes the open submenu there.
    function menuPopupOf(target) {
      const popup = target.closest?.(SUB_CONTENT + ", " + POPUP);
      if (!popup) return null;
      return popup.matches(SUB_CONTENT) || isPositioner(popup.parentElement) ? popup : null;
    }

    document.addEventListener("mousemove", (e) => {
      if (!(e.target instanceof Element)) return;
      const popup = menuPopupOf(e.target);
      if (!popup) return;
      popup._templAllowMouseEnter = true;
      if (popup._templSub) popup._templSub._templHoverEnabled = false;
      const item = e.target.closest(ITEM_SELECTOR);
      if (!item || containerOf(item) !== popup) return;
      childSubsOf(popup, positionerOf(popup)?._templSubs || []).forEach((sub) => {
        if (isSubOpen(sub) && sub !== item) {
          requestSubOpenChange(sub, false, { reason: "sibling-open", event: e });
        }
      });
    });

    function isDisabled(item) {
      return item.getAttribute("aria-disabled") === "true";
    }

    // useButton on a non native item: Enter clicks on keydown, Space too
    // (a composite item), unless typeahead took the Space. A link item clicks
    // natively on Enter.
    document.addEventListener("keydown", (e) => {
      const item = e.target;
      if (!(item instanceof Element) || !item.matches(ITEM_SELECTOR) || !menuPopupOf(item)) return;
      if (item.matches(SUB_TRIGGER) || isDisabled(item)) return;
      if (e.key === " ") {
        if (e.defaultPrevented) return;
        e.preventDefault();
        item.click();
      } else if (e.key === "Enter" && item.tagName !== "A") {
        e.preventDefault();
        item.click();
      }
    });

    document.addEventListener("click", (e) => {
      if (!(e.target instanceof Element)) return;
      const popup = menuPopupOf(e.target);
      if (!popup) return;
      if (popup._templSub) popup._templSub._templHoverEnabled = false;

      // Checkbox items toggle and keep the menu open.
      const checkbox = e.target.closest('[data-slot="' + slot + '-checkbox-item"]');
      if (checkbox) {
        if (isDisabled(checkbox)) return;
        const on = checkbox.hasAttribute("data-checked");
        const accepted = checkbox.dispatchEvent(new CustomEvent(eventPrefix + "-checked-change", {
          bubbles: true,
          cancelable: true,
          detail: { checked: !on },
        }));
        if (accepted && !checkbox.hasAttribute("data-templ-checked")) setChecked(checkbox, !on);
        return;
      }

      // Radio items select within their group and keep the menu open.
      const radio = e.target.closest('[data-slot="' + slot + '-radio-item"]');
      if (radio) {
        if (isDisabled(radio)) return;
        const group = radio.closest('[data-slot="' + slot + '-radio-group"]');
        const accepted = (group || radio).dispatchEvent(new CustomEvent(eventPrefix + "-value-change", {
          bubbles: true,
          cancelable: true,
          detail: { value: radio.getAttribute("data-templ-value") },
        }));
        if (accepted && group && !group.hasAttribute("data-templ-value")) {
          group.querySelectorAll('[data-slot="' + slot + '-radio-item"]').forEach((r) => setChecked(r, false));
          setChecked(radio, true);
        }
        return;
      }

      // An item press closes the whole menu (closeOnClick).
      const item = e.target.closest('[data-slot="' + slot + '-item"]');
      if (item && !isDisabled(item) && item.getAttribute("data-templ-close-on-click") !== "false") {
        const positioner = positionerOf(item);
        if (positioner) onItemPress(positioner, e);
      }
    });

    return {
      POPUP,
      SUB_TRIGGER,
      isPositioner,
      popupFor,
      positionerById,
      allPositioners,
      positionerOf,
      isOpen,
      mountPortal,
      mountBackdrop,
      startListNavigation,
      stopListNavigation,
      afterRootOpen,
      closeRoot,
      closeSubs: (positioner) => positioner._templSubs?.forEach(closeSubNow),
      initRoot,
      destroyRoot,
    };
  }

  window.templ = window.templ || {};
  window.templ.menu = { create };
})();
