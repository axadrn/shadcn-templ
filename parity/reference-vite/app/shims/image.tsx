import * as React from "react"
// Renders what next/image renders for an unoptimized source (no image server here).
export default function Image({ src, fill, priority, quality, placeholder, blurDataURL, unoptimized, loader, sizes, width, height, style, ...props }: any) {
  const url = typeof src === "string" ? src : src?.src
  const s = fill
    ? { position: "absolute", height: "100%", width: "100%", left: 0, top: 0, right: 0, bottom: 0, color: "transparent", ...style }
    : { color: "transparent", ...style }
  return (
    <img
      {...props}
      loading={priority ? undefined : "lazy"}
      width={fill ? undefined : width}
      height={fill ? undefined : height}
      decoding="async"
      data-nimg={fill ? "fill" : "1"}
      style={s}
      sizes={fill && !sizes ? "100vw" : sizes}
      srcSet={`${url} 1x`}
      src={url}
    />
  )
}
