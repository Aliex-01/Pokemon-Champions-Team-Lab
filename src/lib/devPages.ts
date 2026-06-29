// Visibilidad de páginas ocultas: visibles en localhost (import.meta.env.DEV) o
// para un usuario administrador (user.isAdmin, definido por ADMIN_EMAILS en
// Cloudflare). En el build público quedan ocultas.
export const canSeeDevPages = (isAdmin: boolean) => import.meta.env.DEV || isAdmin;
