import DOMPurify from 'dompurify'

const ALLOWED_URI =
  /^(?:(?:https?|mailto|tel):|data:image\/(?:png|jpe?g|gif|webp|avif|svg\+xml);base64,|md-asset:|#|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i

export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_URI_REGEXP: ALLOWED_URI,
    ADD_ATTR: ['target', 'rel', 'loading'],
    FORBID_TAGS: ['style', 'iframe', 'frame', 'object', 'embed', 'form'],
    FORBID_ATTR: ['srcset']
  })
}
