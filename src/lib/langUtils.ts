/**
 * Language and script detection utilities for Rajasthan exam content.
 * Helps identify native Hindi Devanagari script vs Latin script,
 * and handles font styling / overrides dynamically for better rendering.
 */

/**
 * Detects if a text block contains Devanagari characters (Native Hindi).
 */
export function hasDevanagari(text: string): boolean {
  if (!text) return false;
  return /[\u0900-\u097F]/.test(text);
}

/**
 * Detects if a text block contains Latin (English) characters.
 */
export function hasLatin(text: string): boolean {
  if (!text) return false;
  return /[a-zA-Z]/.test(text);
}

/**
 * Detects the dominant/active script within a text block.
 */
export function detectScript(text: string): "devanagari" | "latin" | "both" | "none" {
  const dev = hasDevanagari(text);
  const lat = hasLatin(text);
  if (dev && lat) return "both";
  if (dev) return "devanagari";
  if (lat) return "latin";
  return "none";
}

/**
 * Retuns a pristine font-family stack and styling class based on text script detection.
 */
export function getFontFamilyClass(text: string): string {
  const script = detectScript(text);
  if (script === "devanagari" || script === "both") {
    // Inter handles dual Latin/Hindi beautifully, falling back to standard Devanagari system fonts
    return "font-sans antialiased tracking-wide leading-relaxed";
  }
  return "font-sans antialiased leading-normal";
}

/**
 * Injects clean styling rules and strips legacy font references like DevLys / Kruti Dev from HTML.
 */
export function overrideLegacyFontsInHtml(html: string): string {
  if (!html) return "";

  // Strip font faces and clean style overrides
  let cleaned = html
    .replace(/font-family\s*:\s*['"]?DevLys\s*0?1?0?['"]?;?/gi, "font-family: 'Inter', sans-serif;")
    .replace(/font-family\s*:\s*['"]?Kruti\s*Dev\s*0?1?0?['"]?;?/gi, "font-family: 'Inter', sans-serif;")
    .replace(/@font-face\s*\{[\s\S]*?font-family\s*:\s*['"]?DevLys[\s\S]*?\}/gi, "")
    .replace(/@font-face\s*\{[\s\S]*?font-family\s*:\s*['"]?Kruti[\s\S]*?\}/gi, "");

  // Clean inline dark text color statements that render text invisible in dark themes
  cleaned = cleaned
    .replace(/color\s*:\s*['"]?(black|#000000|#000|rgb\(\s*0\s*,\s*0\s*,\s*0\s*\))['"]?;?/gi, "color: inherit;")
    .replace(/color\s*:\s*['"]?#[1-3][1-3][1-3]['"]?;?/gi, "color: inherit;");

  // If Devanagari is detected in the HTML, ensure it wraps with elegant spacing and sans-serif overrides
  if (hasDevanagari(cleaned)) {
    // Add custom helper tag or attribute class if needed, or wrap inline spans
    cleaned = cleaned.replace(
      /(<span[^>]*style=["'][^"']*)(["'])/gi,
      `$1; font-family: 'Inter', system-ui, sans-serif; letter-spacing: 0.02em;$2`
    );
  }

  return cleaned;
}
