// Port of @base-ui/react floating-ui-react/hooks/useClick.ts (1.6.0).
// Opens or closes a popup when its trigger is pressed.
//
//   const cleanup = window.templ.click.useClick(trigger, options)
//
//   event           "click" (default), "mousedown", or "mousedown-only"
//   toggle          a repeated press closes (default true), or a function
//                   read on every press
//   ignoreMouse     mouse presses do nothing (default false)
//   stickIfOpen     a popup opened by hover or focus stays on a click (default
//                   true), or a function read on every press
//   touchOpenDelay  ms before a touch opens (default 0)
//   isOpen()        whether the popup is open
//   isActiveTrigger()  whether this trigger opened it, default true
//   openEventType() the type of the event that opened it, if any
//   onOpenChange(open, event, pointerType)  requests the change
//
// With "mousedown" the open waits one frame, until the browser moved focus,
// instead of preventing the default, which would show :focus-visible.
(function () {
  "use strict";

  const TYPEABLE_SELECTOR = "input:not([type='hidden']):not([disabled]),[contenteditable]:not([contenteditable='false']),textarea:not([disabled])";
  const isMouseLikePointerType = (pointerType) => pointerType === "mouse" || pointerType === "pen";

  function useClick(trigger, options) {
    const {
      event: eventOption = "click",
      toggle = true,
      ignoreMouse = false,
      stickIfOpen = true,
      touchOpenDelay = 0,
      isOpen,
      isActiveTrigger = () => true,
      openEventType = () => null,
      onOpenChange,
    } = options;
    const read = (value) => (typeof value === "function" ? value() : value);
    let pointerType;
    let frame = 0;
    let touchOpenTimer = 0;

    function setOpenWithTouchDelay(nextOpen, event, type) {
      if (nextOpen && type === "touch" && touchOpenDelay > 0) {
        clearTimeout(touchOpenTimer);
        touchOpenTimer = setTimeout(() => onOpenChange(true, event, type), touchOpenDelay);
      } else {
        onOpenChange(nextOpen, event, type);
      }
    }

    function getNextOpen(isClickLikeOpenEvent) {
      const open = isOpen();
      // Moving between triggers always opens the newly active one.
      if (open && !isActiveTrigger()) return true;
      // A closed popup opens on the next press.
      if (!open) return true;
      // Non toggle mode never closes on a repeated press.
      if (!read(toggle)) return true;
      // A popup opened by hover or focus stays until a click like event closes it.
      const openType = openEventType();
      if (openType && read(stickIfOpen)) return !isClickLikeOpenEvent(openType);
      return false;
    }

    function onPointerDown(event) {
      pointerType = event.pointerType;
    }

    function onMouseDown(event) {
      const type = pointerType;
      if (event.button !== 0 || eventOption === "click" || (isMouseLikePointerType(type) && ignoreMouse)) return;
      const nextOpen = getNextOpen((openType) => openType === "click" || openType === "mousedown");
      // Focus is always set on typeable elements, which open at once.
      if (event.target instanceof Element && event.target.matches(TYPEABLE_SELECTOR)) {
        setOpenWithTouchDelay(nextOpen, event, type);
        return;
      }
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setOpenWithTouchDelay(nextOpen, event, type));
    }

    function onClick(event) {
      if (eventOption === "mousedown-only") return;
      const type = pointerType;
      if (eventOption === "mousedown" && type) {
        pointerType = undefined;
        return;
      }
      if (isMouseLikePointerType(type) && ignoreMouse) return;
      const nextOpen = getNextOpen((openType) => ["click", "mousedown", "keydown", "keyup"].includes(openType));
      setOpenWithTouchDelay(nextOpen, event, type);
    }

    function onKeyDown() {
      pointerType = undefined;
    }

    trigger.addEventListener("pointerdown", onPointerDown);
    trigger.addEventListener("mousedown", onMouseDown);
    trigger.addEventListener("click", onClick);
    trigger.addEventListener("keydown", onKeyDown);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(touchOpenTimer);
      trigger.removeEventListener("pointerdown", onPointerDown);
      trigger.removeEventListener("mousedown", onMouseDown);
      trigger.removeEventListener("click", onClick);
      trigger.removeEventListener("keydown", onKeyDown);
    };
  }

  window.templ = window.templ || {};
  window.templ.click = { useClick };
})();
