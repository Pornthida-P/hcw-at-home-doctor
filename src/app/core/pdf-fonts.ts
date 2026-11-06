import { jsPDF } from 'jspdf';
import {
  THAI_PDF_CLUSTERS,
  THAI_PDF_FONT_FAMILY,
  THAI_PDF_PUA_TO_UNICODE,
  THAI_PDF_SPECIAL_BASES,
} from './thai-pdf-shaping';

/**
 * Unicode (Thai + Latin) font support for the jsPDF exports.
 *
 * The built-in jsPDF fonts (Helvetica...) only cover WinAnsi, so Thai text was
 * exported as garbage. We embed "Sarabun HCW PDF" (a modified version of the
 * SIL OFL 1.1 font Sarabun, see assets/fonts/OFL-Sarabun.txt) and, because jsPDF does
 * no OpenType shaping, every Thai cluster is pre-shaped with the table
 * in thai-pdf-shaping.ts: tone marks over
 * upper vowels, marks on tall consonants (ป ฝ ฟ), ฎ ฏ ญ ฐ + lower vowels... are
 * replaced by pre-positioned glyphs. The PDF ToUnicode map is then patched so
 * that copy/paste and text extraction return the original Thai characters.
 */
export type PdfFontStyle = 'normal' | 'bold' | 'italic';

const FONT_FILES: { [style in PdfFontStyle]: string } = {
  normal: 'SarabunHCWPDF-Regular.ttf',
  bold: 'SarabunHCWPDF-Bold.ttf',
  italic: 'SarabunHCWPDF-Italic.ttf',
};
const FONT_BASE_URL = 'assets/fonts/';
const FALLBACK_FAMILY = 'Helvetica';

let fontDataCache: Promise<{ [style: string]: string } | null> | null = null;

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(
      null,
      Array.from(bytes.subarray(i, i + chunk))
    );
  }
  return btoa(binary);
}

function loadFontData(): Promise<{ [style: string]: string } | null> {
  if (!fontDataCache) {
    fontDataCache = Promise.all(
      (Object.keys(FONT_FILES) as PdfFontStyle[]).map(async style => {
        const response = await fetch(FONT_BASE_URL + FONT_FILES[style]);
        if (!response.ok) {
          throw new Error(`Cannot load PDF font ${FONT_FILES[style]}: ${response.status}`);
        }
        return [style, arrayBufferToBase64(await response.arrayBuffer())] as [string, string];
      })
    )
      .then(entries => {
        const data: { [style: string]: string } = {};
        entries.forEach(([style, base64]) => (data[style] = base64));
        return data;
      })
      .catch(err => {
        console.error('PDF Unicode font could not be loaded, falling back to Helvetica', err);
        fontDataCache = null; // retry on next export
        return null;
      });
  }
  return fontDataCache;
}

const isThaiConsonant = (c: number) => c >= 0x0e01 && c <= 0x0e2e;
const isThaiCombining = (c: number) =>
  c === 0x0e31 || (c >= 0x0e34 && c <= 0x0e3a) || (c >= 0x0e47 && c <= 0x0e4e);

/** Replace Thai clusters by pre-positioned glyphs of the Sarabun HCW PDF font. */
export function shapeThaiForPdf(text: string): string {
  if (!text || !/[\u0e00-\u0e7f]/.test(text)) {
    return text;
  }
  let out = '';
  let i = 0;
  while (i < text.length) {
    const code = text.charCodeAt(i);
    if (!isThaiConsonant(code)) {
      out += text[i++];
      continue;
    }
    const base = text[i];
    let j = i + 1;
    while (j < text.length && isThaiCombining(text.charCodeAt(j))) {
      j++;
    }
    if (j < text.length && text.charCodeAt(j) === 0x0e33) {
      j++; // SARA AM
    } else if (j === i + 1 && j < text.length && text.charCodeAt(j) === 0x0e45 && (base === 'ฤ' || base === 'ฦ')) {
      j++; // ฤๅ ฦๅ
    }
    const marks = text.substring(i + 1, j);
    const special = THAI_PDF_SPECIAL_BASES.indexOf(base) !== -1;
    const codes = THAI_PDF_CLUSTERS[(special ? base : '\u0e01') + marks];
    if (!codes) {
      out += text.substring(i, j);
    } else {
      // the base glyph of a "normal" consonant is never replaced
      out += special && codes[0] ? String.fromCharCode(codes[0]) : base;
      for (let k = 1; k < codes.length; k++) {
        out += codes[k] ? String.fromCharCode(codes[k]) : marks[k - 1];
      }
    }
    i = j;
  }
  return out;
}

export interface PdfFontHandle {
  /** font family actually used ("SarabunHCWPDF" or "Helvetica" as fallback) */
  family: string;
  unicode: boolean;
  setFont(style?: PdfFontStyle): void;
  /** Must be called just before doc.save()/doc.output(). */
  finalize(): void;
}

/**
 * Registers the Unicode fonts on the document and wraps doc.text() so that
 * every string is Thai-shaped. Falls back to Helvetica if the fonts cannot be
 * downloaded (the export still works, without Thai support).
 */
export async function setupPdfFonts(doc: jsPDF): Promise<PdfFontHandle> {
  const data = await loadFontData();
  let family = FALLBACK_FAMILY;
  if (data) {
    try {
      (Object.keys(FONT_FILES) as PdfFontStyle[]).forEach(style => {
        doc.addFileToVFS(FONT_FILES[style], data[style]);
        doc.addFont(FONT_FILES[style], THAI_PDF_FONT_FAMILY, style);
      });
      family = THAI_PDF_FONT_FAMILY;
    } catch (err) {
      console.error('PDF Unicode font registration failed, falling back to Helvetica', err);
    }
  }
  const unicode = family === THAI_PDF_FONT_FAMILY;

  if (unicode) {
    const originalText = doc.text.bind(doc);
    (doc as any).text = (text: string | string[], ...args: any[]) => {
      const shaped = Array.isArray(text)
        ? text.map(t => shapeThaiForPdf(String(t)))
        : shapeThaiForPdf(text == null ? '' : String(text));
      return originalText(shaped, ...args);
    };
  }

  return {
    family,
    unicode,
    setFont(style: PdfFontStyle = 'normal') {
      if (unicode) {
        doc.setFont(family, style);
      } else {
        doc.setFont(family, style === 'italic' ? 'italic' : 'normal', style === 'bold' ? 700 : 400);
      }
    },
    finalize() {
      if (unicode) {
        fixThaiToUnicode(doc);
      }
    },
  };
}

/** Map the pre-shaped glyphs back to their original Thai code points in ToUnicode. */
export function fixThaiToUnicode(doc: jsPDF): void {
  try {
    const fontList = doc.getFontList();
    const internal: any = (doc as any).internal;
    Object.keys(fontList).forEach(name => {
      (fontList[name] || []).forEach((style: string) => {
        const font = internal.getFont(name, style);
        const map = font && font.metadata && font.metadata.toUnicode;
        if (!map) {
          return;
        }
        Object.keys(map).forEach(glyphId => {
          const original = THAI_PDF_PUA_TO_UNICODE[map[glyphId]];
          if (original) {
            map[glyphId] = original;
          }
        });
      });
    });
  } catch (err) {
    console.warn('Could not fix PDF ToUnicode map', err);
  }
}
