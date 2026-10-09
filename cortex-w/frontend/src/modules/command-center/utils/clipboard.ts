/**
 * Copies text to the clipboard and reports whether it worked.
 *
 * The modern Clipboard API needs a secure context and permission, and is refused in some situations
 * (an http:// address on a LAN, an embedded browser, a denied permission). The older `execCommand('copy')`
 * route still works in most of those, so it is the fallback. Never throws.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to the legacy route
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
