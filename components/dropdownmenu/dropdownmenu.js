(function () {
  // shadcn's dropdown menu on Base UI's Menu: a root menu with its MenuTrigger
  // (components/baseui/menu_root.js). Base UI's MenuTrigger renders no
  // identifier: a menu trigger is whatever has aria-haspopup="menu" and links
  // a menu popup (data-templ-controls). The element may carry another
  // component's slot (sidebar.MenuButton).
  window.templ.menuRoot.create({
    slot: "dropdown-menu",
    event: "dropdownmenu",
    trigger: '[aria-haspopup="menu"][data-templ-controls]',
    // shadcn's DropdownMenuSubContent.
    subPositioning: { side: "right", align: "start", sideOffset: 0, alignOffset: -3 },
  });
})();
