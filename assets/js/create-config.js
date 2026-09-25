/* 1:1 vendored data for the /create builder (shadcn@4.16.0, apps/v4).
   Sources:
     registry/styles.tsx                       -> STYLES (JSX icons as plain svg strings)
     registry/base-colors.ts                   -> BASE_COLORS (names, THEMES order)
     registry/config.ts                        -> MENU_ACCENTS, MENU_COLORS, RADII,
                                                  DEFAULT_CONFIG, PRESETS, getThemesForBaseColor
     app/(app)/(create)/lib/shuffle-presets.ts -> SHUFFLE_PRESETS
     app/(app)/(create)/lib/fonts.ts           -> FONTS order, FONT_HEADING_OPTIONS
     lib/font-definitions.ts                   -> per-font family/variables/dependency
     app/(app)/(create)/lib/randomize-biases.ts -> CHART_COLOR_PAIRINGS, RANDOMIZE_BIASES, applyBias
   Theme variable sets live in create-themes.js (window.templCreateThemes). */
(function () {
  "use strict";

  // registry/styles.tsx STYLES. Icons are the JSX svgs as plain markup,
  // attributes kebab-cased (strokeWidth -> stroke-width).
  const STYLES = [
    {
      name: "vega",
      title: "Vega",
      description: "Clean, neutral, and familiar",
      icon: '<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 24 24" fill="none" role="img" color="currentColor"><path d="M2.5 12C2.5 7.52166 2.5 5.28249 3.89124 3.89124C5.28249 2.5 7.52166 2.5 12 2.5C16.4783 2.5 18.7175 2.5 20.1088 3.89124C21.5 5.28249 21.5 7.52166 21.5 12C21.5 16.4783 21.5 18.7175 20.1088 20.1088C18.7175 21.5 16.4783 21.5 12 21.5C7.52166 21.5 5.28249 21.5 3.89124 20.1088C2.5 18.7175 2.5 16.4783 2.5 12Z" stroke="currentColor" stroke-width="2"></path></svg>',
    },
    {
      name: "nova",
      title: "Nova",
      description: "Reduced padding and margins",
      icon: '<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 24 24" fill="none" role="img" color="currentColor"><path d="M2 12C2 9.19974 2 7.79961 2.54497 6.73005C3.02433 5.78924 3.78924 5.02433 4.73005 4.54497C5.79961 4 7.19974 4 10 4H14C16.8003 4 18.2004 4 19.27 4.54497C20.2108 5.02433 20.9757 5.78924 21.455 6.73005C22 7.79961 22 9.19974 22 12C22 14.8003 22 16.2004 21.455 17.27C20.9757 18.2108 20.2108 18.9757 19.27 19.455C18.2004 20 16.8003 20 14 20H10C7.19974 20 5.79961 20 4.73005 19.455C3.78924 18.9757 3.02433 18.2108 2.54497 17.27C2 16.2004 2 14.8003 2 12Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"></path></svg>',
    },
    {
      name: "maia",
      title: "Maia",
      description: "Rounded, with generous spacing.",
      icon: '<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 24 24" fill="none" role="img" color="currentColor"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" stroke-linejoin="round"></circle></svg>',
    },
    {
      name: "lyra",
      title: "Lyra",
      description: "Boxy and sharp. For mono fonts.",
      icon: '<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 24 24" fill="none" role="img" color="currentColor"><path d="M7.84308 3.80211C9.8718 2.6007 10.8862 2 12 2C13.1138 2 14.1282 2.6007 16.1569 3.80211L16.8431 4.20846C18.8718 5.40987 19.8862 6.01057 20.4431 7C21 7.98943 21 9.19084 21 11.5937V12.4063C21 14.8092 21 16.0106 20.4431 17C19.8862 17.9894 18.8718 18.5901 16.8431 19.7915L16.1569 20.1979C14.1282 21.3993 13.1138 22 12 22C10.8862 22 9.8718 21.3993 7.84308 20.1979L7.15692 19.7915C5.1282 18.5901 4.11384 17.9894 3.55692 17C3 16.0106 3 14.8092 3 12.4063V11.5937C3 9.19084 3 7.98943 3.55692 7C4.11384 6.01057 5.1282 5.40987 7.15692 4.20846L7.84308 3.80211Z" stroke="currentColor" stroke-width="2"></path></svg>',
    },
    {
      name: "mira",
      title: "Mira",
      description: "Made for compact interfaces.",
      icon: '<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 24 24" fill="none" role="img" color="currentColor"><path d="M5.92089 5.92089C8.15836 3.68342 9.2771 2.56468 10.5857 2.19562C11.5105 1.93479 12.4895 1.93479 13.4143 2.19562C14.7229 2.56468 15.8416 3.68342 18.0791 5.92089C20.3166 8.15836 21.4353 9.2771 21.8044 10.5857C22.0652 11.5105 22.0652 12.4895 21.8044 13.4143C21.4353 14.7229 20.3166 15.8416 18.0791 18.0791C15.8416 20.3166 14.7229 21.4353 13.4143 21.8044C12.4895 22.0652 11.5105 22.0652 10.5857 21.8044C9.2771 21.4353 8.15836 20.3166 5.92089 18.0791C3.68342 15.8416 2.56468 14.7229 2.19562 13.4143C1.93479 12.4895 1.93479 11.5105 2.19562 10.5857C2.56468 9.2771 3.68342 8.15836 5.92089 5.92089Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"></path></svg>',
    },
    {
      name: "luma",
      title: "Luma",
      description: "Fluid, luminous, and soft.",
      icon: '<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 24 24" fill="none" role="img" color="currentColor"><path d="M2 12C2 8.134 5.134 5 9 5H15C18.866 5 22 8.134 22 12C22 15.866 18.866 19 15 19H9C5.134 19 2 15.866 2 12Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"></path></svg>',
    },
    {
      name: "sera",
      title: "Sera",
      description: "Editorial and typographic.",
      icon: '<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 24 24" fill="none" role="img" color="currentColor"><rect x="3" y="3" width="18" height="18" stroke="currentColor" stroke-width="2"></rect></svg>',
    },
    {
      name: "rhea",
      title: "Rhea",
      description: "Like Luma but compact.",
      icon: '<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 24 24" fill="none" role="img" color="currentColor"><path d="M3 12C3 9.79086 4.79086 8 7 8H17C19.2091 8 21 9.79086 21 12C21 14.2091 19.2091 16 17 16H7C4.79086 16 3 14.2091 3 12Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"></path></svg>',
    },
  ];

  // registry/base-colors.ts. The filter names, which equal the THEMES order.
  const BASE_COLORS = [
    "neutral",
    "stone",
    "zinc",
    "mauve",
    "olive",
    "mist",
    "taupe",
  ];

  // registry/config.ts MENU_ACCENTS.
  const MENU_ACCENTS = [
    { value: "subtle", label: "Subtle" },
    { value: "bold", label: "Bold" },
  ];

  // registry/config.ts MENU_COLORS.
  const MENU_COLORS = [
    { value: "default", label: "Default" },
    { value: "inverted", label: "Inverted" },
    { value: "default-translucent", label: "Default Translucent" },
    { value: "inverted-translucent", label: "Inverted Translucent" },
  ];

  // registry/config.ts RADII.
  const RADII = [
    { name: "default", label: "Default", value: "" },
    { name: "none", label: "None", value: "0" },
    { name: "small", label: "Small", value: "0.45rem" },
    { name: "medium", label: "Medium", value: "0.625rem" },
    { name: "large", label: "Large", value: "0.875rem" },
  ];

  // registry/config.ts DEFAULT_CONFIG.
  const DEFAULT_CONFIG = {
    base: "base",
    style: "nova",
    baseColor: "neutral",
    theme: "neutral",
    chartColor: "neutral",
    iconLibrary: "lucide",
    font: "inter",
    fontHeading: "inherit",
    item: "Item",
    rtl: false,
    pointer: false,
    menuAccent: "subtle",
    menuColor: "default",
    radius: "default",
    template: "next",
  };

  // registry/config.ts PRESETS. Comments and grouping as in the source.
  const PRESETS = [
    // Radix.
    {
      name: "radix-vega",
      title: "Vega (Radix)",
      description: "Vega / Lucide / Inter",
      base: "radix",
      style: "vega",
      baseColor: "neutral",
      theme: "neutral",
      chartColor: "neutral",
      iconLibrary: "lucide",
      font: "inter",
      fontHeading: "inherit",
      item: "Item",
      rtl: false,
      menuAccent: "subtle",
      menuColor: "default",
      radius: "default",
    },
    {
      name: "radix-nova",
      title: "Nova (Radix)",
      description: "Nova / Lucide / Geist",
      base: "radix",
      style: "nova",
      baseColor: "neutral",
      theme: "neutral",
      chartColor: "neutral",
      iconLibrary: "lucide",
      font: "geist",
      fontHeading: "inherit",
      item: "Item",
      rtl: false,
      menuAccent: "subtle",
      menuColor: "default",
      radius: "default",
    },
    {
      name: "radix-maia",
      title: "Maia (Radix)",
      description: "Maia / Hugeicons / Figtree",
      base: "radix",
      style: "maia",
      baseColor: "neutral",
      theme: "neutral",
      chartColor: "neutral",
      iconLibrary: "hugeicons",
      font: "figtree",
      fontHeading: "inherit",
      item: "Item",
      rtl: false,
      menuAccent: "subtle",
      menuColor: "default",
      radius: "default",
    },
    {
      name: "radix-lyra",
      title: "Lyra (Radix)",
      description: "Lyra / Tabler / JetBrains Mono",
      base: "radix",
      style: "lyra",
      baseColor: "neutral",
      theme: "neutral",
      chartColor: "neutral",
      iconLibrary: "phosphor",
      font: "jetbrains-mono",
      fontHeading: "inherit",
      item: "Item",
      rtl: false,
      menuAccent: "subtle",
      menuColor: "default",
      radius: "default",
    },
    {
      name: "radix-mira",
      title: "Mira (Radix)",
      description: "Mira / Hugeicons / Inter",
      base: "radix",
      style: "mira",
      baseColor: "neutral",
      theme: "neutral",
      chartColor: "neutral",
      iconLibrary: "hugeicons",
      font: "inter",
      fontHeading: "inherit",
      item: "Item",
      rtl: false,
      menuAccent: "subtle",
      menuColor: "default",
      radius: "default",
    },
    {
      name: "radix-luma",
      title: "Luma (Radix)",
      description: "Luma / Lucide / Inter",
      base: "radix",
      style: "luma",
      baseColor: "neutral",
      theme: "neutral",
      chartColor: "neutral",
      iconLibrary: "lucide",
      font: "inter",
      fontHeading: "inherit",
      item: "Item",
      rtl: false,
      menuAccent: "subtle",
      menuColor: "default",
      radius: "default",
    },
    // Aria.
    {
      name: "aria-vega",
      title: "Vega (Aria)",
      description: "Vega / Lucide / Inter",
      base: "aria",
      style: "vega",
      baseColor: "neutral",
      theme: "neutral",
      chartColor: "neutral",
      iconLibrary: "lucide",
      font: "inter",
      fontHeading: "inherit",
      item: "Item",
      rtl: false,
      menuAccent: "subtle",
      menuColor: "default",
      radius: "default",
    },
    {
      name: "base-nova",
      title: "Nova (Base)",
      description: "Nova / Lucide / Geist",
      base: "base",
      style: "nova",
      baseColor: "neutral",
      theme: "neutral",
      chartColor: "neutral",
      iconLibrary: "lucide",
      font: "geist",
      fontHeading: "inherit",
      item: "Item",
      rtl: false,
      menuAccent: "subtle",
      menuColor: "default",
      radius: "default",
    },
    {
      name: "base-maia",
      title: "Maia (Base)",
      description: "Maia / Hugeicons / Figtree",
      base: "base",
      style: "maia",
      baseColor: "neutral",
      theme: "neutral",
      chartColor: "neutral",
      iconLibrary: "hugeicons",
      font: "figtree",
      fontHeading: "inherit",
      item: "Item",
      rtl: false,
      menuAccent: "subtle",
      menuColor: "default",
      radius: "default",
    },
    {
      name: "base-lyra",
      title: "Lyra (Base)",
      description: "Lyra / Tabler / JetBrains Mono",
      base: "base",
      style: "lyra",
      baseColor: "neutral",
      theme: "neutral",
      chartColor: "neutral",
      iconLibrary: "phosphor",
      font: "jetbrains-mono",
      fontHeading: "inherit",
      item: "Item",
      rtl: false,
      menuAccent: "subtle",
      menuColor: "default",
      radius: "default",
    },
    {
      name: "base-mira",
      title: "Mira (Base)",
      description: "Mira / Hugeicons / Inter",
      base: "base",
      style: "mira",
      baseColor: "neutral",
      theme: "neutral",
      chartColor: "neutral",
      iconLibrary: "hugeicons",
      font: "inter",
      fontHeading: "inherit",
      item: "Item",
      rtl: false,
      menuAccent: "subtle",
      menuColor: "default",
      radius: "default",
    },
    {
      name: "base-luma",
      title: "Luma (Base)",
      description: "Luma / Lucide / Inter",
      base: "base",
      style: "luma",
      baseColor: "neutral",
      theme: "neutral",
      chartColor: "neutral",
      iconLibrary: "lucide",
      font: "inter",
      fontHeading: "inherit",
      item: "Item",
      rtl: false,
      menuAccent: "subtle",
      menuColor: "default",
      radius: "default",
    },
    // Base.
    {
      name: "base-vega",
      title: "Vega (Base)",
      description: "Vega / Lucide / Inter",
      base: "base",
      style: "vega",
      baseColor: "neutral",
      theme: "neutral",
      chartColor: "neutral",
      iconLibrary: "lucide",
      font: "inter",
      fontHeading: "inherit",
      item: "Item",
      rtl: false,
      menuAccent: "subtle",
      menuColor: "default",
      radius: "default",
    },
    {
      name: "aria-nova",
      title: "Nova (Aria)",
      description: "Nova / Lucide / Geist",
      base: "aria",
      style: "nova",
      baseColor: "neutral",
      theme: "neutral",
      chartColor: "neutral",
      iconLibrary: "lucide",
      font: "geist",
      fontHeading: "inherit",
      item: "Item",
      rtl: false,
      menuAccent: "subtle",
      menuColor: "default",
      radius: "default",
    },
    {
      name: "aria-maia",
      title: "Maia (Aria)",
      description: "Maia / Hugeicons / Figtree",
      base: "aria",
      style: "maia",
      baseColor: "neutral",
      theme: "neutral",
      chartColor: "neutral",
      iconLibrary: "hugeicons",
      font: "figtree",
      fontHeading: "inherit",
      item: "Item",
      rtl: false,
      menuAccent: "subtle",
      menuColor: "default",
      radius: "default",
    },
    {
      name: "aria-lyra",
      title: "Lyra (Aria)",
      description: "Lyra / Tabler / JetBrains Mono",
      base: "aria",
      style: "lyra",
      baseColor: "neutral",
      theme: "neutral",
      chartColor: "neutral",
      iconLibrary: "phosphor",
      font: "jetbrains-mono",
      fontHeading: "inherit",
      item: "Item",
      rtl: false,
      menuAccent: "subtle",
      menuColor: "default",
      radius: "default",
    },
    {
      name: "aria-mira",
      title: "Mira (Aria)",
      description: "Mira / Hugeicons / Inter",
      base: "aria",
      style: "mira",
      baseColor: "neutral",
      theme: "neutral",
      chartColor: "neutral",
      iconLibrary: "hugeicons",
      font: "inter",
      fontHeading: "inherit",
      item: "Item",
      rtl: false,
      menuAccent: "subtle",
      menuColor: "default",
      radius: "default",
    },
    {
      name: "aria-luma",
      title: "Luma (Aria)",
      description: "Luma / Lucide / Inter",
      base: "aria",
      style: "luma",
      baseColor: "neutral",
      theme: "neutral",
      chartColor: "neutral",
      iconLibrary: "lucide",
      font: "inter",
      fontHeading: "inherit",
      item: "Item",
      rtl: false,
      menuAccent: "subtle",
      menuColor: "default",
      radius: "default",
    },
    // Rhea.
    {
      name: "radix-rhea",
      title: "Rhea (Radix)",
      description: "Rhea / Lucide / Inter",
      base: "radix",
      style: "rhea",
      baseColor: "neutral",
      theme: "neutral",
      chartColor: "neutral",
      iconLibrary: "lucide",
      font: "inter",
      fontHeading: "inherit",
      item: "Item",
      rtl: false,
      menuAccent: "subtle",
      menuColor: "default",
      radius: "default",
    },
    {
      name: "base-rhea",
      title: "Rhea (Base)",
      description: "Rhea / Lucide / Inter",
      base: "base",
      style: "rhea",
      baseColor: "neutral",
      theme: "neutral",
      chartColor: "neutral",
      iconLibrary: "lucide",
      font: "inter",
      fontHeading: "inherit",
      item: "Item",
      rtl: false,
      menuAccent: "subtle",
      menuColor: "default",
      radius: "default",
    },
    {
      name: "aria-rhea",
      title: "Rhea (Aria)",
      description: "Rhea / Lucide / Inter",
      base: "aria",
      style: "rhea",
      baseColor: "neutral",
      theme: "neutral",
      chartColor: "neutral",
      iconLibrary: "lucide",
      font: "inter",
      fontHeading: "inherit",
      item: "Item",
      rtl: false,
      menuAccent: "subtle",
      menuColor: "default",
      radius: "default",
    },
    // Sera.
    {
      name: "radix-sera",
      title: "Sera (Radix)",
      description: "Sera / Lucide / Noto Sans + Playfair Display",
      base: "radix",
      style: "sera",
      baseColor: "taupe",
      theme: "taupe",
      chartColor: "taupe",
      iconLibrary: "lucide",
      font: "noto-sans",
      fontHeading: "playfair-display",
      item: "Item",
      rtl: false,
      menuAccent: "subtle",
      menuColor: "default",
      radius: "default",
    },
    {
      name: "base-sera",
      title: "Sera (Base)",
      description: "Sera / Lucide / Noto Sans + Playfair Display",
      base: "base",
      style: "sera",
      baseColor: "taupe",
      theme: "taupe",
      chartColor: "taupe",
      iconLibrary: "lucide",
      font: "noto-sans",
      fontHeading: "playfair-display",
      item: "Item",
      rtl: false,
      menuAccent: "subtle",
      menuColor: "default",
      radius: "default",
    },
    {
      name: "aria-sera",
      title: "Sera (Aria)",
      description: "Sera / Lucide / Noto Sans + Playfair Display",
      base: "aria",
      style: "sera",
      baseColor: "taupe",
      theme: "taupe",
      chartColor: "taupe",
      iconLibrary: "lucide",
      font: "noto-sans",
      fontHeading: "playfair-display",
      item: "Item",
      rtl: false,
      menuAccent: "subtle",
      menuColor: "default",
      radius: "default",
    },
  ];

  // app/(app)/(create)/lib/shuffle-presets.ts.
  // Curated preset codes from https://dialectcn.xyz.
  const SHUFFLE_PRESETS = [
    "b6sUj34d9",
    "b2tqYzpa88",
    "b1W4tDrk",
    "b1aIuQ2XC",
    "b7jsW1RxJ5",
    "b870VEw0in",
    "b3Zheoix4U",
    "b1x9M2c4aI",
    "b1W7jDEW",
    "b51GFh7y6",
    "b2fms620zo",
    "b1Q5GC",
    "buKEvLs",
    "b5rR41Mtnc",
    "b6tOz2I0x",
    "b2hNTREGRN",
    "bdIJ7Sq",
    "b6TqMNb5Wb",
    "bJIirQ",
    "b4aRK5K0fb",
    "b5HCiD38LI",
    "bdHjvCi",
    "b7QDHijUjj",
    "b4ZVZIPi9h",
    "b1W4bcno",
  ];

  // Font picker entries in the exact order of app/(app)/(create)/lib/fonts.ts,
  // per-font data from lib/font-definitions.ts.
  const FONTS = [
    { value: "geist", name: "Geist", type: "sans", registryVariable: "--font-sans", previewVariable: "--font-geist-sans", family: "'Geist Variable', sans-serif", dependency: "@fontsource-variable/geist" },
    { value: "inter", name: "Inter", type: "sans", registryVariable: "--font-sans", previewVariable: "--font-inter", family: "'Inter Variable', sans-serif", dependency: "@fontsource-variable/inter" },
    { value: "noto-sans", name: "Noto Sans", type: "sans", registryVariable: "--font-sans", previewVariable: "--font-noto-sans", family: "'Noto Sans Variable', sans-serif", dependency: "@fontsource-variable/noto-sans" },
    { value: "nunito-sans", name: "Nunito Sans", type: "sans", registryVariable: "--font-sans", previewVariable: "--font-nunito-sans", family: "'Nunito Sans Variable', sans-serif", dependency: "@fontsource-variable/nunito-sans" },
    { value: "figtree", name: "Figtree", type: "sans", registryVariable: "--font-sans", previewVariable: "--font-figtree", family: "'Figtree Variable', sans-serif", dependency: "@fontsource-variable/figtree" },
    { value: "roboto", name: "Roboto", type: "sans", registryVariable: "--font-sans", previewVariable: "--font-roboto", family: "'Roboto Variable', sans-serif", dependency: "@fontsource-variable/roboto" },
    { value: "raleway", name: "Raleway", type: "sans", registryVariable: "--font-sans", previewVariable: "--font-raleway", family: "'Raleway Variable', sans-serif", dependency: "@fontsource-variable/raleway" },
    { value: "dm-sans", name: "DM Sans", type: "sans", registryVariable: "--font-sans", previewVariable: "--font-dm-sans", family: "'DM Sans Variable', sans-serif", dependency: "@fontsource-variable/dm-sans" },
    { value: "public-sans", name: "Public Sans", type: "sans", registryVariable: "--font-sans", previewVariable: "--font-public-sans", family: "'Public Sans Variable', sans-serif", dependency: "@fontsource-variable/public-sans" },
    { value: "outfit", name: "Outfit", type: "sans", registryVariable: "--font-sans", previewVariable: "--font-outfit", family: "'Outfit Variable', sans-serif", dependency: "@fontsource-variable/outfit" },
    { value: "oxanium", name: "Oxanium", type: "sans", registryVariable: "--font-sans", previewVariable: "--font-oxanium", family: "'Oxanium Variable', sans-serif", dependency: "@fontsource-variable/oxanium" },
    { value: "manrope", name: "Manrope", type: "sans", registryVariable: "--font-sans", previewVariable: "--font-manrope", family: "'Manrope Variable', sans-serif", dependency: "@fontsource-variable/manrope" },
    { value: "space-grotesk", name: "Space Grotesk", type: "sans", registryVariable: "--font-sans", previewVariable: "--font-space-grotesk", family: "'Space Grotesk Variable', sans-serif", dependency: "@fontsource-variable/space-grotesk" },
    { value: "montserrat", name: "Montserrat", type: "sans", registryVariable: "--font-sans", previewVariable: "--font-montserrat", family: "'Montserrat Variable', sans-serif", dependency: "@fontsource-variable/montserrat" },
    { value: "ibm-plex-sans", name: "IBM Plex Sans", type: "sans", registryVariable: "--font-sans", previewVariable: "--font-ibm-plex-sans", family: "'IBM Plex Sans Variable', sans-serif", dependency: "@fontsource-variable/ibm-plex-sans" },
    { value: "source-sans-3", name: "Source Sans 3", type: "sans", registryVariable: "--font-sans", previewVariable: "--font-source-sans-3", family: "'Source Sans 3 Variable', sans-serif", dependency: "@fontsource-variable/source-sans-3" },
    { value: "instrument-sans", name: "Instrument Sans", type: "sans", registryVariable: "--font-sans", previewVariable: "--font-instrument-sans", family: "'Instrument Sans Variable', sans-serif", dependency: "@fontsource-variable/instrument-sans" },
    { value: "geist-mono", name: "Geist Mono", type: "mono", registryVariable: "--font-mono", previewVariable: "--font-geist-mono", family: "'Geist Mono Variable', monospace", dependency: "@fontsource-variable/geist-mono" },
    { value: "jetbrains-mono", name: "JetBrains Mono", type: "mono", registryVariable: "--font-mono", previewVariable: "--font-jetbrains-mono", family: "'JetBrains Mono Variable', monospace", dependency: "@fontsource-variable/jetbrains-mono" },
    { value: "noto-serif", name: "Noto Serif", type: "serif", registryVariable: "--font-serif", previewVariable: "--font-noto-serif", family: "'Noto Serif Variable', serif", dependency: "@fontsource-variable/noto-serif" },
    { value: "roboto-slab", name: "Roboto Slab", type: "serif", registryVariable: "--font-serif", previewVariable: "--font-roboto-slab", family: "'Roboto Slab Variable', serif", dependency: "@fontsource-variable/roboto-slab" },
    { value: "merriweather", name: "Merriweather", type: "serif", registryVariable: "--font-serif", previewVariable: "--font-merriweather", family: "'Merriweather Variable', serif", dependency: "@fontsource-variable/merriweather" },
    { value: "lora", name: "Lora", type: "serif", registryVariable: "--font-serif", previewVariable: "--font-lora", family: "'Lora Variable', serif", dependency: "@fontsource-variable/lora" },
    { value: "playfair-display", name: "Playfair Display", type: "serif", registryVariable: "--font-serif", previewVariable: "--font-playfair-display", family: "'Playfair Display Variable', serif", dependency: "@fontsource-variable/playfair-display" },
    { value: "eb-garamond", name: "EB Garamond", type: "serif", registryVariable: "--font-serif", previewVariable: "--font-eb-garamond", family: "'EB Garamond Variable', serif", dependency: "@fontsource-variable/eb-garamond" },
    { value: "instrument-serif", name: "Instrument Serif", type: "serif", registryVariable: "--font-serif", previewVariable: "--font-instrument-serif", family: "'Instrument Serif', serif", dependency: "@fontsource/instrument-serif" },
  ];

  // app/(app)/(create)/lib/fonts.ts FONT_HEADING_OPTIONS.
  const FONT_HEADING_OPTIONS = [
    {
      name: "Inherit",
      value: "inherit",
      font: null,
      type: "default",
    },
    ...FONTS,
  ];

  // app/(app)/(create)/lib/randomize-biases.ts.
  // Theme -> chart color pairings for randomization.
  const CHART_COLOR_PAIRINGS = {
    red: ["teal", "sky"],
    orange: ["teal", "blue"],
    amber: ["cyan", "indigo"],
    yellow: ["sky", "violet"],
    lime: ["indigo", "pink"],
    green: ["purple", "rose"],
    emerald: ["purple", "red"],
    teal: ["fuchsia", "red"],
    cyan: ["rose", "amber"],
    sky: ["red", "yellow"],
    blue: ["orange", "yellow"],
    indigo: ["amber", "yellow"],
    violet: ["yellow", "lime"],
    purple: ["green", "lime"],
    fuchsia: ["lime", "teal"],
    pink: ["green", "cyan"],
    rose: ["emerald", "sky"],
  };

  // Configuration for randomization biases.
  // Add biases here to influence random selection based on context.
  const RANDOMIZE_BIASES = {
    baseColors: (baseColors) => {
      return baseColors.filter((c) => c.name !== "gray");
    },
    fonts: (fonts, context) => {
      // When style is lyra, only use mono fonts.
      if (context.style === "lyra") {
        return fonts.filter((font) => font.value === "jetbrains-mono");
      }

      return fonts;
    },
    radius: (radii, context) => {
      // When style is lyra, always use "none" radius.
      if (context.style === "lyra") {
        return radii.filter((radius) => radius.name === "none");
      }

      // Rhea does not support the "large" radius.
      if (context.style === "rhea") {
        return radii.filter((radius) => radius.name !== "large");
      }

      return radii;
    },
    chartColors: (chartColors, context) => {
      // When theme has a pairing, restrict chart colors to the paired values.
      const pairing = context.theme ? CHART_COLOR_PAIRINGS[context.theme] : null;
      if (pairing) {
        const filtered = chartColors.filter((c) => pairing.includes(c.name));
        if (filtered.length > 0) {
          return filtered;
        }
      }

      return chartColors;
    },
  };

  // Applies biases to a list of items based on the current context.
  function applyBias(items, context, biasFilter) {
    if (!biasFilter) {
      return items;
    }

    return biasFilter(items, context);
  }

  // registry/config.ts getThemesForBaseColor, over window.templCreateThemes.
  function getThemesForBaseColor(baseColorName) {
    const baseColorNames = BASE_COLORS;

    return window.templCreateThemes.filter((theme) => {
      if (theme.name === baseColorName) {
        return true;
      }
      return !baseColorNames.includes(theme.name);
    });
  }

  const api = {
    STYLES,
    BASE_COLORS,
    MENU_ACCENTS,
    MENU_COLORS,
    RADII,
    DEFAULT_CONFIG,
    PRESETS,
    SHUFFLE_PRESETS,
    FONTS,
    FONT_HEADING_OPTIONS,
    CHART_COLOR_PAIRINGS,
    RANDOMIZE_BIASES,
    applyBias,
    getThemesForBaseColor,
  };

  if (typeof window !== "undefined") {
    window.templCreateConfig = api;
  }
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})();
