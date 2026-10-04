import * as React from "react"
export default React.forwardRef<HTMLAnchorElement, any>(function Link({ href, prefetch, replace, scroll, ...props }, ref) {
  return <a ref={ref} href={typeof href === "string" ? href : href?.pathname} {...props} />
})
