export const useRouter = () => ({ push() {}, replace() {}, back() {}, refresh() {}, prefetch() {} })
export const usePathname = () => location.pathname
export const useSearchParams = () => new URLSearchParams(location.search)
export const useParams = () => ({})
export const notFound = () => { throw new Error("notFound") }
export const redirect = () => {}
