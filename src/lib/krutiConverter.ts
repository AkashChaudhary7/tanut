/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Mapping of legacy Kruti Dev / DevLys 010 keys to Unicode Hindi characters
const KRUTI_UNICODE_MAP: { [key: string]: string } = {
  "ñ": "ह्न", "ò": "हृ", "ó": "ह्य", "ô": "ह्व", "õ": "ह्ल", "ö": "द्र", "÷": "दृ", "ø": "प्र", "ù": "फ्र", "ú": "बृ",
  "û": "क्र", "ü": "ग्र", "ý": "प्र", "þ": "श्र", "ÿ": "श्र", "â": "इ", "ã": "ए", "ä": "ऑ", "å": "ऑ", "æ": "इ",
  "ç": "ए", "è": "ए", "é": "ए", "ê": "ए", "ë": "ए", "ì": "ए", "í": "ए", "î": "ए", "ï": "ए", "ð": "ए",
  "¡": "इ", "¢": "ऍ", "£": "ऑ", "¤": "रू", "¥": "ह्र", "¦": "ह्व", "§": "ह्य", "¨": "ह्ल", "©": "ह्न", "ª": "द्र",
  "«": "दृ", "¬": "प्र", "®": "फ्र", "¯": "बृ", "°": "क्र", "±": "ग्र", "²": "भ्र", "³": "सृ", "´": "श्र", "µ": "ज्र",
  "¶": "क्र", "·": "ग्र", "¸": "द्र", "¹": "प्र", "º": "फ्र", "»": "बृ", "¼": "(", "½": ")", "¾": "रू", "¿": "रू",
  "A": "ी", "B": "ब्", "C": "ब्", "D": "क्", "E": "क", "F": "थ्", "G": "थ", "H": "भ्", "I": "प्", "J": "श्",
  "K": "श", "L": "स्", "M": "ड", "N": "ल्", "O": "इ", "P": "ज्", "Q": "ज", "R": "त्", "S": "ै", "T": "ध्",
  "U": "ध", "V": "अ", "W": "ाॅ", "X": "ङ्", "Y": "ल्", "Z": "्र",
  "a": "ं", "b": "ौ", "c": "ब", "d": "क", "e": "म", "f": "ि", "g": "ह", "h": "ी", "i": "प", "j": "र",
  "k": "ा", "l": "स", "m": "उ", "n": "द", "o": "व", "p": "च", "q": "ु", "r": "त", "s": "े", "t": "ज",
  "u": "न", "v": "अ", "w": "ू", "x": "ग", "y": "ल", "z": "्र",
  "(": "द्न", ")": "द्य", "[": "ख्", "]": "ख", "{": "क्ष्", "}": "क्ष",
  ";": "य", ":": "रू", "<": "ढ", ">": "झ", "?": "घ्", "/": "ध्", "\\": "?", "|": "।",
  "&": "–", "%": "ः", "Ù": "त्त", "_": "द्",
  "=": "त्र", "~": "्", ".": "ण्", "+": "़",
  "'": "श्", "\"": "ष्"
};

// Halfs that combine with 'k' to form full consonants
const HALF_CONSONANT_COMBINATIONS: { [key: string]: string } = {
  "Dk": "क",
  "Fk": "थ",
  "Hk": "भ",
  "Lk": "स",
  "Rk": "त",
  "Tk": "ध",
  "Jk": "श",
  "Nk": "ल",
  "Yk": "ल",
  "[k": "ख",
  "{k": "क्ष",
  "Bk": "ब",
  "Ck": "ब",
  "Ùk": "त्त",
  "_k": "द",
  ".k": "ण",
  "/k": "ध",
  "?k": "घ",
  "'k": "श",
  "\"k": "ष"
};

/**
 * Shifts the Kruti Dev 'f' (ि) matra so that it follows the consonant/consonant cluster
 */
function shiftFMatra(text: string): string {
  let result = "";
  const halfConsonants = "BDFHJLNRTYZ[{(_";
  
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "f") {
      let j = i + 1;
      if (j < text.length) {
        while (j < text.length && (halfConsonants.includes(text[j]) || text[j] === "z" || text[j] === "Z")) {
          j++;
        }
        if (j < text.length) {
          j++; // main consonant
        }
        if (j < text.length && text[j] === "k") {
          j++; // AA modifier
        }
        const cluster = text.substring(i + 1, j);
        result += cluster + "f";
        i = j - 1;
      } else {
        result += "f";
      }
    } else {
      result += text[i];
    }
  }
  return result;
}

/**
 * Shifts the Kruti Dev 'Z' (reph superscript r) so that it is placed before the syllable
 */
function shiftZMatra(text: string): string {
  let chars = text.split("");
  const matras = "akhsSbuqwfWa";
  const halfConsonants = "BDFHJLNRTYZ[{(_";
  
  for (let i = 0; i < chars.length; i++) {
    if (chars[i] === "Z") {
      let j = i - 1;
      if (j >= 0) {
        while (j >= 0 && matras.includes(chars[j])) {
          j--;
        }
        if (j >= 0) {
          j--; // consonant
        }
        while (j >= 0 && halfConsonants.includes(chars[j])) {
          j--;
        }
        chars.splice(i, 1);
        chars.splice(j + 1, 0, "Z");
        i++;
      }
    }
  }
  return chars.join("");
}

/**
 * Checks if a block of text is highly likely to be natural English.
 * Prevents converting valid English proper nouns (like "Kumbhalgarh", "Fort", "Rajasthan")
 * into garbled Hindi when legacy Kruti Dev / DevLys detection runs.
 */
function isEnglishText(text: string): boolean {
  const normalized = text.toLowerCase().trim();
  
  // Comprehensive array of common words in English RAS/education questions
  const commonEnglishWords = new Set([
    "the", "and", "this", "that", "with", "from", "where", "which", "who", "their", "there", "these", "those", 
    "have", "for", "you", "your", "not", "but", "all", "any", "each", "every", "some", "more", "most", "few", 
    "many", "own", "other", "same", "such", "than", "too", "very", "can", "will", "should", "would", "could", 
    "may", "might", "must", "shall", "is", "of", "in", "by", "at", "on", "was", "were", "are", "been", "has", 
    "had", "do", "does", "did", "to", "fort", "palace", "built", "district", "heritage", "site", "architect", 
    "dynasty", "ruler", "king", "queen", "century", "located", "state", "india", "rajasthan", "museum", "temple", 
    "lake", "river", "mountain", "hills", "range", "city", "town", "village", "population", "area", "famous", 
    "known", "construction", "founder", "battle", "war", "treaty", "british", "mughal", "maratha", "rajput", 
    "option", "question", "correct", "wrong", "select", "choose", "marks", "exam", "paper", "test", "practice",
    "grade", "high", "low", "level", "year", "month", "day", "date", "time", "hour", "minute", "second",
    "rajsamand", "udaipur", "jaipur", "jodhpur", "bikaner", "ajmer", "kota", "alwar", "bharatpur", "sikar"
  ]);

  const words = normalized.split(/[^a-zA-Z]+/);
  let englishStats = 0;
  let totalCount = 0;
  
  for (const word of words) {
    if (!word || word.length < 2) continue;
    totalCount++;
    if (commonEnglishWords.has(word)) {
      englishStats++;
    }
  }

  // If even a single highly common English word is found, reject Kruti Dev conversion
  if (englishStats > 0) {
    return true;
  }

  // Common structural patterns in English transliterated names & educational text
  const englishPatterns = [
    /[a-z]ing\b/i,
    /[a-z]tion\b/i,
    /[a-z]able\b/i,
    /[a-z]ment\b/i,
    /[a-z]ness\b/i,
    /[a-z]less\b/i,
    /[a-z]ive\b/i,
    /[a-z]ous\b/i,
    /\bth[a-z]/i,
    /\bwh[a-z]/i,
    /\bch[a-z]/i,
    /\bsh[a-z]/i,
    /[a-z]fort\b/i,
    /[a-z]garh\b/i,  // e.g. Kumbhalgarh, Chittorgarh
    /[a-z]pur\b/i,   // e.g. Udaipur, Jaipur
    /[a-z]war\b/i,   // e.g. Mewar, Marwar
    /[a-z]ore\b/i,   // e.g. Indore, Ranthambore
    /[a-z]al\b/i     // e.g. Mandan
  ];

  for (const pattern of englishPatterns) {
    if (pattern.test(text)) {
      return true;
    }
  }

  return false;
}

/**
 * Detects if a text block contains Kruti Dev/DevLys encoded legacy Hindi character signatures
 */
export function isDevLysOrKruti(text: string): boolean {
  if (!text) return false;
  
  // If text contains substantial core Hindi Unicode characters, do not convert
  const hindiUnicodeRegex = /[\u0905-\u0939]/g;
  const matchesHindi = text.match(hindiUnicodeRegex);
  const hindiCount = matchesHindi ? new Set(matchesHindi).size : 0;
  
  // If more than 3 distinct core Hindi characters are found, we assume it is already translated Unicode
  if (hindiCount > 3) return false;

  const lower = text.toLowerCase().trim();
  if (!lower) return false;
  
  // If there are no alphabetical characters, don't convert
  if (!/[a-z]/i.test(lower)) return false;
  
  // Explicit font indicators in style or html
  if (/font-family\s*:\s*['"]?(DevLys|Kruti\s*Dev)/i.test(text)) {
    return true;
  }
  
  // Specific signature strings from Rajasthan exams and common Hindi DevLys words
  const patterns = [
    /\bds\b/i,          // ds (के)
    /\besa\b/i,         // esa (में)
    /\bdkSu\b/i,        // dkSu (कौन)
    /\bgs\\\b/i,        // gS\ (है?)
    /\bgs\b/i,          // gS (है)
    /\bvuq\b/i,         // vuq (अनु)
    /iz'u/i,            // iz'u (प्रश्न)
    /vuqÙkfjr/i,        // vuqÙkfjr (अनुत्तरित)
    /vuqùkfjr/i,        // vuqùkfjr
    /vuqukfjr/i,        // vuqukfjr
    /dksbZ/i,           // dksbZ (कोई)
    /fodYi/i,           // fodYi (विकल्प)
    /mÙkj/i,            // mÙkj (उत्तर)
    /jktlfkku/i,        // jktLFkku (राजस्थान)
    /eq\[;r%/i,         // eq[;r% (मुख्यतः)
    /mrpadnr/i,         // mRikfnr (उत्पादित)
    /\{ks=/i,           // {ks= (क्षेत्र)
    /\bfd;k\b/i,        // fd;k (किया)
    /\btkrk\b/i,        // tkrk (जाता)
    /\bhkkx\b/i,        // Hkkx (भाग)
    /\bnf\{k\.k\b/i,    // nf{k.k (दक्षिण)
    /fLFkr/i,           // fLFkr (स्थित)
    /LaLd/i,            // laLd (संस्कृत/संस्कृति)
    /LaLd`fr/i,         // laLd`fr (संस्कृति)
    /ftyk/i             // ftyk (जिला)
  ];

  for (const pattern of patterns) {
    if (pattern.test(lower)) {
      return true;
    }
  }

  // Reject transition if it is recognized as standard English text/proper noun
  if (isEnglishText(text)) {
    return false;
  }

  // Standard English words NEVER have lowercase letters followed directly by uppercase letters then lowercase
  // e.g. jktLFkku (lowercase-uppercase mix during Remington typing)
  const hasRemingtonCapitalMix = /[a-z]+[A-Z]+[a-z]+/g.test(text);
  if (hasRemingtonCapitalMix) {
    return true;
  }

  // Count matras and consonant density in Remington layout
  // f -> (ि), h -> (ी), k -> (ा), q -> (ु), w -> (ू), s -> (े), a -> (ं), b -> (ौ)
  const matraCount = (text.match(/[fhkqwsa]/g) || []).length;
  
  if (matraCount >= 2 && text.length > 3) {
    return true;
  }

  return false;
}

/**
 * Converts a Kruti Dev / DevLys 10 encoded text into real Unicode Hindi
 */
export function convertKrutiDevToUnicode(srcText: string): string {
  if (!srcText) return "";

  // 1. Shift positional matras ('f' goes after consonant, 'Z' goes before syllable)
  let text = shiftFMatra(srcText);
  text = shiftZMatra(text);

  // 2. Translate common combinations
  // e.g. k+S = ौ, k+s = ो
  text = text.replace(/kS/g, "ौ");
  text = text.replace(/ks/g, "ो");

  // Replace standard half consonant combinations that became full (e.g., Hk -> भ)
  for (const [key, val] of Object.entries(HALF_CONSONANT_COMBINATIONS)) {
    text = text.split(key).join(val);
  }

  // 3. Render character-by-character replacement
  let output = "";
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (KRUTI_UNICODE_MAP[char] !== undefined) {
      output += KRUTI_UNICODE_MAP[char];
    } else {
      output += char;
    }
  }

  // 4. Post-processing to clean up double matras or formatting quirks
  // E.g., reph (Z) replacement in output
  output = output.replace(/Z/g, "र्");
  
  // Correcting some common legacy double-matra combinations
  output = output.replace(/ाे/g, "ो");
  output = output.replace(/ाै/g, "ौ");
  output = output.replace(/ाि/g, "ि");
  output = output.replace(/ाी/g, "ी");

  return output;
}

/**
 * Parses and replaces DevLys/Kruti Dev legacy encoded content in HTML safely
 */
export function convertHtmlWithDevLys(html: string): string {
  if (!html) return "";

  // Helper to check if an element or its ancestors have legacy font styles
  const hasLegacyFontStyles = (el: HTMLElement | null): boolean => {
    let current: HTMLElement | null = el;
    while (current) {
      if (current.getAttribute) {
        const style = current.getAttribute("style");
        if (style && /font-family\s*:\s*['"]?(DevLys|Kruti)/i.test(style)) {
          return true;
        }
        const className = current.getAttribute("class");
        if (className && /font-family\s*:\s*['"]?(DevLys|Kruti)/i.test(className)) {
          return true;
        }
      }
      current = current.parentElement;
    }
    return false;
  };

  // Fast pre-check of the HTML content (loosened layout checker)
  const hasLegacyFont = /font-family\s*:\s*['"]?(DevLys|Kruti)/i.test(html) ||
                        /font-face[\s\S]*?(DevLys|Kruti)/i.test(html);
                        
  const htmlWithoutDevanagari = html.replace(/[\u0900-\u097F]/g, "");
  const hasLegacyPattern = hasLegacyFont || isDevLysOrKruti(htmlWithoutDevanagari);

  if (!hasLegacyPattern) {
    return html;
  }

  try {
    // If DOMParser is not available, do a regex-based fallback
    if (typeof DOMParser === "undefined") {
      return convertKrutiDevToUnicode(html);
    }

    const parser = new DOMParser();
    const doc = parser.parseFromString(`<div>${html}</div>`, "text/html");
    const container = doc.body.firstChild as HTMLElement;

    if (!container) return html;

    const processNode = (node: Node) => {
      if (node.nodeType === 3) { // TEXT_NODE
        const text = node.nodeValue || "";
        const parent = node.parentElement;
        const forceConvert = parent ? hasLegacyFontStyles(parent) : false;
        
        // Only convert if it doesn't already have real Hindi characters
        const hasHindiConsonants = /[\u0905-\u0939]/.test(text);
        if ((forceConvert && !hasHindiConsonants) || isDevLysOrKruti(text)) {
          node.nodeValue = convertKrutiDevToUnicode(text);
        }
      } else if (node.nodeType === 1) { // ELEMENT_NODE
        const el = node as HTMLElement;
        
        // Remove style blocks referencing DevLys/Kruti Dev font families to prevent rendering issues
        const style = el.getAttribute("style");
        if (style) {
          const cleanedStyle = style
            .replace(/font-family\s*:\s*['"]?DevLys\s*0?1?0?['"]?;?/gi, "")
            .replace(/font-family\s*:\s*['"]?Kruti\s*Dev\s*0?1?0?['"]?;?/gi, "");
          el.setAttribute("style", cleanedStyle);
        }

        if (el.tagName.toLowerCase() === "style") {
          let css = el.innerHTML;
          css = css
            .replace(/@font-face\s*\{[\s\S]*?font-family\s*:\s*['"]?DevLys[\s\S]*?\}/gi, "")
            .replace(/@font-face\s*\{[\s\S]*?font-family\s*:\s*['"]?Kruti[\s\S]*?\}/gi, "")
            .replace(/font-family\s*:\s*['"]?DevLys\s*0?1?0?['"]?;?/gi, "")
            .replace(/font-family\s*:\s*['"]?Kruti\s*Dev\s*0?1?0?['"]?;?/gi, "");
          el.innerHTML = css;
        }

        for (let i = 0; i < el.childNodes.length; i++) {
          processNode(el.childNodes[i]);
        }
      }
    };

    processNode(container);
    return container.innerHTML;
  } catch (err) {
    console.error("DOMParser error in convertHtmlWithDevLys:", err);
    // Fallback to direct string conversion
    return convertKrutiDevToUnicode(html);
  }
}

