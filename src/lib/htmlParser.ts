/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Question } from "../types";
import { convertHtmlWithDevLys } from "./krutiConverter";
import { overrideLegacyFontsInHtml } from "./langUtils";

/**
 * Universal HTML parser using DOMParser to extract MCQs, options, and explanations
 * from diverse HTML formats safely and without raising errors if structure is unfamiliar.
 * 
 * Special attention is paid to Rajasthan exam patterns which feature 5 options (including
 * Option E - "vuqÙkfjr iz'u" / "अनुत्तरित प्रश्न") and DevLys / Kruti Dev legacy encoded Hindi.
 */
export function parseUniversalHTML(htmlString: string, targetExam: string): Question[] {
  const questions: Question[] = [];
  if (!htmlString) return questions;

  try {
    // ------------------------------------------
    // 1. EXTRACTION OF GLOBAL STYLESHEETS
    // ------------------------------------------
    // Many legacy files embed style sheets (with @font-face containing links to DevLys/Kruti Dev fonts).
    // Extracting all style elements and prepending them to parsed questions & options guarantees that the fonts render correctly
    // in the user interface (e.g. DangerouslySetInnerHTML).
    const stylesFound: string[] = [];
    const styleMatches = htmlString.match(/<style[^>]*>[\s\S]*?<\/style>/gi);
    if (styleMatches) {
      styleMatches.forEach((s) => {
        if (!stylesFound.includes(s)) stylesFound.push(s);
      });
    }
    const globalStylesHeader = stylesFound.join("\n");

    // Helper to run classification heuristic matching based on Hindi/English text features
    const classifyTextSubject = (text: string): string => {
      const lower = (text || "").toLowerCase();
      if (
        lower.includes("commission") || lower.includes("article") || lower.includes("constitution") || 
        lower.includes("act") || lower.includes("section") || lower.includes("polity") || 
        lower.includes("governance") || lower.includes("court") || lower.includes("rights") ||
        lower.includes("parliament") || lower.includes("president") || lower.includes("assembly") ||
        lower.includes("panchayat") || lower.includes("amendment") || lower.includes("अनुच्छेद") ||
        lower.includes("संविधान") || lower.includes("अधिनियम") || lower.includes("चुनाव") ||
        lower.includes("संसद") || lower.includes("राष्ट्रपति") || lower.includes("न्यायालय") ||
        lower.includes("अधिकार") || lower.includes("राज्यपाल") || lower.includes("मुख्यमंत्री") ||
        lower.includes("पंचायत") || lower.includes("iz'kfLr") // DevLys term for Prashasti (Polity/History)
      ) {
        return "Polity & Constitution";
      }
      if (
        lower.includes("history") || lower.includes("battle") || lower.includes("dynasty") || 
        lower.includes("king") || lower.includes("rule") || lower.includes("ancient") || 
        lower.includes("medieval") || lower.includes("modern") || lower.includes("struggle") || 
        lower.includes("empire") || lower.includes("archaeology") || lower.includes("fort") ||
        lower.includes("maharana") || lower.includes("mughal") || lower.includes("british") ||
        lower.includes("revolt") || lower.includes("इतिहास") || lower.includes("युद्ध") ||
        lower.includes("वंश") || lower.includes("राजा") || lower.includes("साम्राज्य") ||
        lower.includes("किला") || lower.includes("अभिलेख") || lower.includes("क्रांति") ||
        lower.includes("स्वतंत्रता") || lower.includes("आंदोलन") ||
        lower.includes("'kkld") || lower.includes("neu") || lower.includes("mYys[k") || // DevLys tokens
        lower.includes("dsg") || lower.includes("fp=") || lower.includes("psgjks")      // DevLys tokens
      ) {
        return "History";
      }
      if (
        lower.includes("river") || lower.includes("mountain") || lower.includes("soil") || 
        lower.includes("climate") || lower.includes("district") || lower.includes("forest") || 
        lower.includes("map") || lower.includes("geography") || lower.includes("lake") || 
        lower.includes("ocean") || lower.includes("monsoon") || lower.includes("rainfall") ||
        lower.includes("desert") || lower.includes("crop") || lower.includes("plains") ||
        lower.includes("नदी") || lower.includes("पर्वत") || lower.includes("मिट्टी") ||
        lower.includes("जलवायु") || lower.includes("जिला") || lower.includes("वन") ||
        lower.includes("नक्शा") || lower.includes("झील") || lower.includes("महासागर") ||
        lower.includes("मरुस्थल") || lower.includes("फसल") || lower.includes("क्षेत्रफल") ||
        lower.includes("जनसंख्या") || lower.includes("वनस्पति") || lower.includes("अरावली") ||
        lower.includes("'kSyh") || lower.includes("esokM") || lower.includes("cwanh") || // DevLys tokens
        lower.includes("vyoj") || lower.includes("t;iqj")
      ) {
        return "Geography";
      }
      if (
        lower.includes("rs") || lower.includes("budget") || lower.includes("gst") || 
        lower.includes("growth") || lower.includes("scheme") || lower.includes("percent") || 
        lower.includes("crore") || lower.includes("lakh") || lower.includes("economy") || 
        lower.includes("finance") || lower.includes("gdp") || lower.includes("bank") ||
        lower.includes("trade") || lower.includes("tax") || lower.includes("industry") ||
        lower.includes("revenue") || lower.includes("बजट") || lower.includes("जीएसटी") ||
        lower.includes("योजना") || lower.includes("विकास") || lower.includes("बैंक") ||
        lower.includes("कर") || lower.includes("आय") || lower.includes("व्यय") ||
        lower.includes("उद्योग") || lower.includes("आर्थिक") || lower.includes("वित्तीय")
      ) {
        return "Economy & Finance";
      }
      if (
        lower.includes("science") || lower.includes("temp") || lower.includes("cell") || 
        lower.includes("energy") || lower.includes("chemical") || lower.includes("physics") || 
        lower.includes("biology") || lower.includes("isotope") || lower.includes("atom") || 
        lower.includes("metal") || lower.includes("space") || lower.includes("satellite") ||
        lower.includes("disease") || lower.includes("technology") || lower.includes("electron") ||
        lower.includes("acid") || lower.includes("विज्ञान") || lower.includes("भौतिक") ||
        lower.includes("रसायन") || lower.includes("जीव") || lower.includes("ऊर्जा") ||
        lower.includes("रोग") || lower.includes("उपग्रह") || lower.includes("कोशिका") ||
        lower.includes("तत्व") || lower.includes("परमाणु") || lower.includes("धातु")
      ) {
        return "General Science & Tech";
      }
      if (
        lower.includes("current") || lower.includes("minister") || lower.includes("award") || 
        lower.includes("news") || lower.includes("summit") || lower.includes("2024") || 
        lower.includes("2025") || lower.includes("2026") || lower.includes("launch") || 
        lower.includes("sports") || lower.includes("contemporary") || lower.includes("समसामयिकी") ||
        lower.includes("खेल") || lower.includes("पुरस्कार") || lower.includes("शिखर सम्मेलन") ||
        lower.includes("योजना लॉन्च")
      ) {
        return "Current Affairs";
      }
      return "General Knowledge";
    };

    // Helper to find regex match data
    const findRegexIndex = (str: string, regex: RegExp): { index: number; length: number } | null => {
      const match = str.match(regex);
      if (match && match.index !== undefined) {
        return { index: match.index, length: match[0].length };
      }
      return null;
    };

    // Helper to extract clean text from html for classification search
    const cleanTextOnly = (html: string): string => {
      return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    };

    // Helper to clean conversational preamble from question text (e.g. "still there are error...")
    const cleanQuestionPreamble = (qText: string): string => {
      if (!qText) return "";
      const lines = qText.split(/\r?\n/);
      const cleanedLines: string[] = [];
      let foundActualQuestionStart = false;

      for (let line of lines) {
        const trimmedLine = line.trim();
        if (!trimmedLine) {
          if (cleanedLines.length > 0) cleanedLines.push(line);
          continue;
        }

        if (!foundActualQuestionStart) {
          const lower = trimmedLine.toLowerCase();
          if (
            lower.includes("still there are error") ||
            lower.includes("parsed successfully") ||
            lower.includes("here is") ||
            lower.includes("create this type of") ||
            lower.includes("pasted below") ||
            lower.includes("mcq to parse") ||
            lower.includes("following question") ||
            lower.includes("please parse") ||
            lower.includes("fix the parser") ||
            lower.includes("the current mcq") ||
            (trimmedLine.length < 120 && /^(still|error|parsing|parse|here|create|type|test|hi|hello|hey|assist|solve|this|correct|wrong|bad|good)\b/i.test(trimmedLine) && !trimmedLine.includes("?"))
          ) {
            continue; // Skip conversational preamble line
          }
          foundActualQuestionStart = true;
        }

        cleanedLines.push(line);
      }

      return cleanedLines.join("\n").trim();
    };

    // Helper to locate closing tags for paragraphs
    const findOptionEndIndex = (html: string, startIndex: number, limit: number): number => {
      const remnant = html.substring(startIndex, limit);
      // Scan for paragraph/div closures
      const closeMatch = remnant.match(/<\/(?:p|div|span|b|font)>\s*/i);
      if (closeMatch && closeMatch.index !== undefined) {
        return startIndex + closeMatch.index + closeMatch[0].length;
      }
      
      // If there are initial newlines/spaces, skip them before finding the line boundary break
      const firstNonWhitespaceMatch = remnant.match(/[^\s\r\n]/);
      if (firstNonWhitespaceMatch && firstNonWhitespaceMatch.index !== undefined) {
        const contentRemnant = remnant.substring(firstNonWhitespaceMatch.index);
        const nlIdx = contentRemnant.indexOf("\n");
        if (nlIdx !== -1) {
          return startIndex + firstNonWhitespaceMatch.index + nlIdx + 1;
        }
      } else {
        const nlIdx = remnant.indexOf("\n");
        if (nlIdx !== -1) {
          return startIndex + nlIdx + 1;
        }
      }
      
      return limit;
    };

    // =========================================================================
    // TEXT-NODE-BASED MULTI-OPTION PARSER
    // =========================================================================
    // Specifically looks for 'A', 'B', 'C', 'D' identifiers within text nodes
    // using a robust regex scan, ensuring that options ending/starting with 'E'
    // or 'vuqÙkfjr iz'u' are handled as valid options.
    const textNodeQuestions: Question[] = [];
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(htmlString, "text/html");

      // 1. Collect all non-empty text nodes in order
      const textNodes: { node: Text; text: string; parent: HTMLElement }[] = [];
      const walk = doc.createTreeWalker(doc.body || doc, NodeFilter.SHOW_TEXT, null);
      let node;
      while (node = walk.nextNode()) {
        const text = (node.nodeValue || "");
        if (text.trim()) {
          textNodes.push({
            node: node as Text,
            text: text,
            parent: node.parentElement as HTMLElement
          });
        }
      }

      // 2. Scan text nodes for option identifiers
      const optARegex = /^\s*(?:[\(\[\\{]?A[\)\]\\}][\s\.\-\:]*|A[\.\-\:]+\s*|A\s*$)/i;
      const optBRegex = /^\s*(?:[\(\[\\{]?B[\)\]\\}][\s\.\-\:]*|B[\.\-\:]+\s*|B\s*$)/i;
      const optCRegex = /^\s*(?:[\(\[\\{]?C[\)\]\\}][\s\.\-\:]*|C[\.\-\:]+\s*|C\s*$)/i;
      const optDRegex = /^\s*(?:[\(\[\\{]?D[\)\]\\}][\s\.\-\:]*|D[\.\-\:]+\s*|D\s*$)/i;
      const optERegex = /^\s*(?:[\(\[\\{]?E[\)\]\\}][\s\.\-\:]*|E[\.\-\:]+\s*|E\s*$)/i;

      const isOptionEMarker = (text: string): boolean => {
        const clean = text.trim().toLowerCase();
        if (optERegex.test(text)) return true;
        if (
          clean.includes("vuqùkfjr") || 
          clean.includes("vuqÙkfjr") || 
          clean.includes("vuqukfjr") || 
          (clean.includes("vuq") && clean.includes("iz'u"))
        ) return true;
        if (clean.includes("अनुत्तरित") || clean.includes("unanswered")) return true;
        return false;
      };

      interface ScannedMarker {
        type: "A" | "B" | "C" | "D" | "E";
        nodeIndex: number;
        matchLength: number;
        text: string;
        parent: HTMLElement;
      }

      const markers: ScannedMarker[] = [];
      for (let i = 0; i < textNodes.length; i++) {
        const text = textNodes[i].text;
        if (optARegex.test(text)) {
          const m = text.match(optARegex);
          markers.push({ type: "A", nodeIndex: i, matchLength: m ? m[0].length : 0, text, parent: textNodes[i].parent });
        } else if (optBRegex.test(text)) {
          const m = text.match(optBRegex);
          markers.push({ type: "B", nodeIndex: i, matchLength: m ? m[0].length : 0, text, parent: textNodes[i].parent });
        } else if (optCRegex.test(text)) {
          const m = text.match(optCRegex);
          markers.push({ type: "C", nodeIndex: i, matchLength: m ? m[0].length : 0, text, parent: textNodes[i].parent });
        } else if (optDRegex.test(text)) {
          const m = text.match(optDRegex);
          markers.push({ type: "D", nodeIndex: i, matchLength: m ? m[0].length : 0, text, parent: textNodes[i].parent });
        } else if (isOptionEMarker(text)) {
          let matchLen = 0;
          const m = text.match(optERegex);
          if (m) {
            matchLen = m[0].length;
          } else {
            const vuqMatch = text.match(/^\s*(?:vuqÙkfjr\s*iz'u|vuqùkfjr\s*iz'u|अनुत्तरित\s*प्रश्न|unanswered\s*question)/i);
            if (vuqMatch) {
              matchLen = vuqMatch[0].length;
            }
          }
          markers.push({ type: "E", nodeIndex: i, matchLength: matchLen, text, parent: textNodes[i].parent });
        }
      }

      // Group markers into questions
      const aMarkers = markers.filter(m => m.type === "A");
      let lastQuestionEndNodeIdx = 0;

      for (let i = 0; i < aMarkers.length; i++) {
        const currentA = aMarkers[i];
        const nextA = aMarkers[i + 1];
        const limitNodeIdx = nextA ? nextA.nodeIndex : textNodes.length;

        // Find B, C, D, E within the range of this question
        const group = markers.filter(m => m.nodeIndex > currentA.nodeIndex && m.nodeIndex < limitNodeIdx);
        const currentB = group.find(m => m.type === "B");
        const currentC = group.find(m => m.type === "C" && (!currentB || m.nodeIndex > currentB.nodeIndex));
        const currentD = group.find(m => m.type === "D" && (!currentC || m.nodeIndex > currentC.nodeIndex));
        const currentE = group.find(m => m.type === "E" && (!currentD || m.nodeIndex > currentD.nodeIndex));

        if (currentB && currentC && currentD) {
          // Helper functions to extract and slice HTML nicely
          const extractRangeHtml = (
            startM: ScannedMarker,
            endM: ScannedMarker | undefined,
            limIdx: number
          ): string => {
            const startIdx = startM.nodeIndex;
            const endIdx = endM ? endM.nodeIndex : limIdx;

            if (startM.parent === (endM ? endM.parent : null)) {
              const parentHtml = startM.parent.innerHTML;
              const startOffset = parentHtml.indexOf(startM.text);
              const endOffset = endM ? parentHtml.indexOf(endM.text) : parentHtml.length;
              if (startOffset !== -1 && endOffset !== -1 && endOffset > startOffset) {
                return parentHtml.substring(startOffset + startM.matchLength, endOffset).trim();
              }
            }

            let htmlParts: string[] = [];
            const processedParents = new Set<HTMLElement>();
            for (let idx = startIdx; idx < endIdx; idx++) {
              const parent = textNodes[idx].parent;
              if (!processedParents.has(parent)) {
                processedParents.add(parent);
                let part = parent.innerHTML;
                if (idx === startIdx) {
                  const offset = part.indexOf(startM.text);
                  if (offset !== -1) {
                    part = part.substring(offset + startM.matchLength);
                  } else {
                    part = part.replace(/^\s*[\(\[\\{]?[A-E][\)\]\\}]?[\s\.\-\:]*/i, "");
                    part = part.replace(/^\s*(?:vuqÙkfjr\s*iz'u|vuqùkfjr\s*iz'u|अनुत्तरित\s*प्रश्न|unanswered\s*question)/i, "");
                  }
                }
                if (endM && idx === endIdx - 1) {
                  const offset = part.indexOf(endM.text);
                  if (offset !== -1) {
                    part = part.substring(0, offset);
                  }
                }
                htmlParts.push(part.trim());
              }
            }
            if (htmlParts.length === 0 || htmlParts.join("").trim() === "") {
              let textParts: string[] = [];
              for (let idx = startIdx; idx < endIdx; idx++) {
                let t = textNodes[idx].text;
                if (idx === startIdx) t = t.substring(startM.matchLength);
                textParts.push(t);
              }
              return textParts.join(" ");
            }
            return htmlParts.join(" ");
          };

          const extractQuestionHtml = (startIdx: number, aM: ScannedMarker): string => {
            const endIdx = aM.nodeIndex;
            let htmlParts: string[] = [];
            const processedParents = new Set<HTMLElement>();
            for (let idx = startIdx; idx < endIdx; idx++) {
              const parent = textNodes[idx].parent;
              if (!processedParents.has(parent)) {
                processedParents.add(parent);
                let part = parent.innerHTML;
                if (idx === endIdx - 1) {
                  const offset = part.indexOf(aM.text);
                  if (offset !== -1) {
                    part = part.substring(0, offset);
                  }
                }
                htmlParts.push(part.trim());
              }
            }
            if (htmlParts.length === 0 || htmlParts.join("").trim() === "") {
              let textParts: string[] = [];
              for (let idx = startIdx; idx < endIdx; idx++) {
                textParts.push(textNodes[idx].text);
              }
              return textParts.join(" ");
            }
            return htmlParts.join(" ");
          };

          const extractExplanationHtml = (startIdx: number, limIdx: number): string => {
            let htmlParts: string[] = [];
            const processedParents = new Set<HTMLElement>();
            for (let idx = startIdx; idx < limIdx; idx++) {
              const parent = textNodes[idx].parent;
              if (!processedParents.has(parent)) {
                processedParents.add(parent);
                htmlParts.push(parent.innerHTML.trim());
              }
            }
            if (htmlParts.length === 0 || htmlParts.join("").trim() === "") {
              let textParts: string[] = [];
              for (let idx = startIdx; idx < limIdx; idx++) {
                textParts.push(textNodes[idx].text);
              }
              return textParts.join(" ");
            }
            return htmlParts.join(" ");
          };

          // Determine End Index of last Option (Option D or Option E)
          let lastOptEndNodeIdx = limitNodeIdx;
          if (currentE) {
            lastOptEndNodeIdx = currentE.nodeIndex + 1;
          } else {
            lastOptEndNodeIdx = currentD.nodeIndex + 1;
          }

          const rawQ = extractQuestionHtml(lastQuestionEndNodeIdx, currentA);
          const rawA = extractRangeHtml(currentA, currentB, limitNodeIdx);
          const rawB = extractRangeHtml(currentB, currentC, limitNodeIdx);
          const rawC = extractRangeHtml(currentC, currentD, limitNodeIdx);
          
          let rawD = "";
          let rawE = "";
          if (currentE) {
            rawD = extractRangeHtml(currentD, currentE, limitNodeIdx);
            rawE = extractRangeHtml(currentE, undefined, limitNodeIdx);
          } else {
            rawD = extractRangeHtml(currentD, undefined, limitNodeIdx);
          }

          const cleanHtml = (str: string) => {
            if (!str) return "";
            let res = str.replace(/^(?:<br\s*\/?>|\s)+/gi, "").replace(/(?:<br\s*\/?>|\s)+$/gi, "");
            if (globalStylesHeader && !res.includes("<style>")) {
              res = globalStylesHeader + "\n" + res;
            }
            return res;
          };

          const qParsed = cleanHtml(cleanQuestionPreamble(rawQ));
          const optA = cleanHtml(rawA);
          const optB = cleanHtml(rawB);
          const optC = cleanHtml(rawC);
          const optD = cleanHtml(rawD);
          const optE = rawE ? cleanHtml(rawE) : undefined;

          const options: string[] = [optA, optB, optC, optD].filter(Boolean);
          if (optE) {
            options.push(optE);
          }

          while (options.length < 4) {
            options.push(globalStylesHeader + `\n<p>Option ${options.length + 1}</p>`);
          }

          // Scan range of nodes for correct answer keys
          let correctIdx = 0;
          let blockText = "";
          for (let idx = currentA.nodeIndex; idx < limitNodeIdx; idx++) {
            blockText += " " + textNodes[idx].text;
          }
          const cleanBlockText = cleanTextOnly(blockText);
          const ansMatch = cleanBlockText.match(/(?:Ans|Answer|Correct|Key|उत्तर|सही उत्तर|सही विकल्प|उत्तरमाला)[\s\.\-\:]*([A-Ea-e1-5अबसदयकखगघङ])/i);
          if (ansMatch) {
            const val = ansMatch[1].toUpperCase();
            if (["A", "1", "अ", "क"].includes(val)) correctIdx = 0;
            else if (["B", "2", "ब", "ख"].includes(val)) correctIdx = 1;
            else if (["C", "3", "स", "ग"].includes(val)) correctIdx = 2;
            else if (["D", "4", "द", "घ"].includes(val)) correctIdx = 3;
            else if (["E", "5", "य", "ङ"].includes(val)) correctIdx = 4;
          } else {
            const optTexts = [rawA, rawB, rawC, rawD];
            if (rawE) optTexts.push(rawE);
            for (let o = 0; o < optTexts.length; o++) {
              if (optTexts[o]) {
                const lowerOpt = optTexts[o].toLowerCase();
                if (lowerOpt.includes("correct") || lowerOpt.includes('class="correct"') || lowerOpt.includes('color:green') || lowerOpt.includes('data-correct="true"')) {
                  correctIdx = o;
                  break;
                }
              }
            }
          }

          let explanationText = "Preserving original legacy page fonts and decoding formatting sheets.";
          const rawExp = extractExplanationHtml(lastOptEndNodeIdx, limitNodeIdx);
          if (rawExp.trim()) {
            const epMatch = rawExp.match(/(?:Explanation|Exp|Desc|Description|स्पष्टीकरण|व्याख्या|विशेष)[\s\.\-\:]*([\s\S]*)$/i);
            if (epMatch) {
              explanationText = cleanHtml(epMatch[1].trim());
            } else {
              explanationText = cleanHtml(rawExp.trim());
            }
          }

          textNodeQuestions.push({
            id: `text-node-${Date.now()}-${i}-${Math.random().toString(36).substring(4)}`,
            question: qParsed,
            options: options,
            correctOptionIndex: correctIdx,
            explanation: explanationText,
            subject: classifyTextSubject(cleanTextOnly(qParsed)),
            topic: "Rajasthan GK",
            subtopic: "",
            difficulty: "medium",
            sourceType: "notes",
            timesAnswered: 0,
            timesCorrect: 0,
            targetExam: targetExam
          });

          lastQuestionEndNodeIdx = limitNodeIdx;
        }
      }
    } catch (err) {
      console.error("Text node scanner error:", err);
    }

    if (textNodeQuestions.length > 0) {
      return textNodeQuestions.map(q => {
        const qDecoded = convertHtmlWithDevLys(q.question);
        const optsDecoded = q.options.map(opt => convertHtmlWithDevLys(opt));
        const expDecoded = convertHtmlWithDevLys(q.explanation);

        return {
          ...q,
          question: overrideLegacyFontsInHtml(qDecoded),
          options: optsDecoded.map(opt => overrideLegacyFontsInHtml(opt)),
          explanation: overrideLegacyFontsInHtml(expDecoded)
        };
      });
    }

    // =========================================================================
    // PRO-LEVEL HIGH-FIDELITY SEGMENTER (Specifically designed for Rajasthan MCQ files)
    // =========================================================================
    // Check if we contain option markers like A<style, B<style, C<style, D<style, E<style
    // OR standalone marker lines like:
    // A
    // content
    // B
    // content
    const hasStructuredMarkers = 
      /A<style/i.test(htmlString) || 
      /E<style/i.test(htmlString) ||
      /(?:^|[\s\r\n>])A(?:\s*<(?:style|p|span|div|b|i|font|span)\b)/i.test(htmlString) ||
      /(?:^|[\s\r\n])A[\r\n]/i.test(htmlString); // Standalone A on newline

    if (hasStructuredMarkers) {
      // We will look for Option delimiter markers.
      // Delimiters can be inline (e.g. A<style... or A<p...) or standalone lines (e.g. \n\s*A\s*\n)
      const markerRegex = /(?:^|[\s\r\n>])([A-E])(?=\s*<style\b|\s*<(?:p|span|div|b|i|font)\b|[\s\r\n]*(?:$|[\r\n]))/gi;
      
      let match;
      const markers: { index: number; label: string; length: number }[] = [];
      
      markerRegex.lastIndex = 0;
      while ((match = markerRegex.exec(htmlString)) !== null) {
        const label = match[1].toUpperCase();
        const rawMatch = match[0];
        const labelIdx = rawMatch.toUpperCase().lastIndexOf(label);
        const index = match.index + labelIdx;
        markers.push({
          index,
          label,
          length: rawMatch.length - labelIdx
        });
      }

      // Filter duplicated markers (if regex matched something inside code tags or stylesheets)
      // Usually markers are outside tags.
      const outsideTagMarkers = markers.filter((m) => {
        // Simple sanity check: is this index inside a tag <...>?
        const before = htmlString.substring(0, m.index);
        const openCount = (before.match(/</g) || []).length;
        const closeCount = (before.match(/>/g) || []).length;
        return openCount === closeCount;
      });

      // Filter to keep only sequential mock matches (e.g., A followed by B, C, D, optional E)
      const aMarkers = outsideTagMarkers.filter(m => m.label === "A");

      if (aMarkers.length > 0) {
        const parsedList: Question[] = [];
        let currentQuestionStart = 0;

        for (let i = 0; i < aMarkers.length; i++) {
          const curA = aMarkers[i];
          const nextA = aMarkers[i + 1];
          const limit = nextA ? nextA.index : htmlString.length;

          // Gather markers for B, C, D, E of this MCQ in the slice [curA.index, limit]
          const curGroup = outsideTagMarkers.filter(m => m.index > curA.index && m.index < limit);
          
          const curB = curGroup.find(m => m.label === "B");
          const curC = curGroup.find(m => m.label === "C");
          const curD = curGroup.find(m => m.label === "D");
          const curE = curGroup.find(m => m.label === "E");

          if (curB && curC && curD) {
            // Option A text
            const optAEnd = curB.index;
            let optA = htmlString.substring(curA.index + curA.length, optAEnd).trim();

            // Option B text
            const optBEnd = curC.index;
            let optB = htmlString.substring(curB.index + curB.length, optBEnd).trim();

            // Option C text
            const optCEnd = curD.index;
            let optC = htmlString.substring(curC.index + curC.length, optCEnd).trim();

            let optD = "";
            let optE = "";
            let lastOptEndIdx = limit;

            if (curE) {
              const optDEnd = curE.index;
              optD = htmlString.substring(curD.index + curD.length, optDEnd).trim();

              lastOptEndIdx = findOptionEndIndex(htmlString, curE.index + curE.length, limit);
              optE = htmlString.substring(curE.index + curE.length, lastOptEndIdx).trim();
            } else {
              lastOptEndIdx = findOptionEndIndex(htmlString, curD.index + curD.length, limit);
              optD = htmlString.substring(curD.index + curD.length, lastOptEndIdx).trim();
            }

            // The Question text
            let qText = htmlString.substring(currentQuestionStart, curA.index).trim();
            
            // If the option starts with empty style tags or extra sibling whitespace, we can clean them
            const cleanHtml = (str: string) => {
              if (!str) return "";
              // Strip trailing line breaks or stray <br> tags at endpoints
              let res = str.replace(/^(?:<br\s*\/?>|\s)+/gi, "").replace(/(?:<br\s*\/?>|\s)+$/gi, "");
              // If there are dangling stylistic blocks, we retain them. If global styles are missing, prepend them
              if (globalStylesHeader && !res.includes("<style>")) {
                res = globalStylesHeader + "\n" + res;
              }
              return res;
            };

            const qParsedMin = cleanQuestionPreamble(qText);
            const qParsed = cleanHtml(qParsedMin);
            const ansA = cleanHtml(optA);
            const ansB = cleanHtml(optB);
            const ansC = cleanHtml(optC);
            const ansD = cleanHtml(optD);
            const ansE = optE ? cleanHtml(optE) : undefined;

            const cleanQPlain = cleanTextOnly(qParsedMin);
            const options: string[] = [ansA, ansB, ansC, ansD].filter(Boolean);
            if (ansE) options.push(ansE);

            while (options.length < 4) {
              options.push(globalStylesHeader + `\n<p>Option ${options.length + 1}</p>`);
            }

            // Identify Answer Heuristic
            let correctIdx = 0;
            const textToSearchAnswer = cleanTextOnly(htmlString.substring(currentQuestionStart, limit));
            const ansMatch = textToSearchAnswer.match(/(?:Ans|Answer|Correct|Key|उत्तर|सही उत्तर|सही विकल्प|उत्तरमाला)[\s\.\-\:]*([A-Ea-e1-5अबसदयकखगघङ])/i);
            
            if (ansMatch) {
              const val = ansMatch[1].toUpperCase();
              if (["A", "1", "अ", "क"].includes(val)) correctIdx = 0;
              else if (["B", "2", "ब", "ख"].includes(val)) correctIdx = 1;
              else if (["C", "3", "स", "ग"].includes(val)) correctIdx = 2;
              else if (["D", "4", "द", "घ"].includes(val)) correctIdx = 3;
              else if (["E", "5", "य", "ङ"].includes(val)) correctIdx = 4;
            } else {
              // Option text patterns matching
              if (optA.toLowerCase().includes("correct") || optA.includes('class="correct"') || optA.includes('color:green') || optA.includes('data-correct="true"')) correctIdx = 0;
              else if (optB.toLowerCase().includes("correct") || optB.includes('class="correct"') || optB.includes('color:green') || optB.includes('data-correct="true"')) correctIdx = 1;
              else if (optC.toLowerCase().includes("correct") || optC.includes('class="correct"') || optC.includes('color:green') || optC.includes('data-correct="true"')) correctIdx = 2;
              else if (optD.toLowerCase().includes("correct") || optD.includes('class="correct"') || optD.includes('color:green') || optD.includes('data-correct="true"')) correctIdx = 3;
              else if (optE && (optE.toLowerCase().includes("correct") || optE.includes('class="correct"') || optE.includes('color:green') || optE.includes('data-correct="true"'))) correctIdx = 4;
            }

            // Explanation parsing: Check if there's any text after Option D/E up to the next question limit
            let explanationText = "Dynamic evaluation preserving the original style encoding sheets.";
            const trailingSlice = htmlString.substring(lastOptEndIdx, limit).trim();
            if (trailingSlice) {
              const epMatch = trailingSlice.match(/(?:Explanation|Exp|Desc|Description|स्पष्टीकरण|व्याख्या|विशेष)[\s\.\-\:]*([\s\S]*)$/i);
              if (epMatch) {
                explanationText = cleanHtml(epMatch[1].trim());
              } else if (trailingSlice.length > 10 && !trailingSlice.includes("A<style") && !trailingSlice.includes("B<style")) {
                explanationText = cleanHtml(trailingSlice);
              }
            }

            parsedList.push({
              id: `pro-${Date.now()}-${i}-${Math.random().toString(36).substring(4)}`,
              question: qParsed,
              options: options,
              correctOptionIndex: correctIdx,
              explanation: explanationText,
              subject: classifyTextSubject(cleanQPlain),
              topic: "Rajasthan GK",
              subtopic: "",
              difficulty: "medium",
              sourceType: "notes",
              timesAnswered: 0,
              timesCorrect: 0,
              targetExam: targetExam
            });

            // Set start offset of succeeding question
            currentQuestionStart = limit;
            const extraMatch = htmlString.substring(lastOptEndIdx, limit).match(/<(?:br\s*\/?>|\/p|\/div|\/span)>\s*$/gi);
            if (!extraMatch && lastOptEndIdx < limit) {
              currentQuestionStart = lastOptEndIdx;
            }
          }
        }

        if (parsedList.length > 0) {
          return parsedList;
        }
      }
    }

    // ==========================================
    // DOM-BASED ELEMENT EXTRACTOR (Approach A)
    // ==========================================
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlString, "text/html");

    const blocks = doc.querySelectorAll(".question-block, .mcq, .quiz-question, .question-card");
    if (blocks.length > 0) {
      blocks.forEach((block, idx) => {
        const qEl = block.querySelector(".question, .question-text, .q-text, h3, h4");
        const optEls = block.querySelectorAll(".option, .opt, li");
        const expEl = block.querySelector(".explanation, .solution, .desc, .exp");

        if (qEl) {
          const rawQText = qEl.innerHTML.trim();
          const qCleanedText = cleanQuestionPreamble(rawQText);
          const qText = globalStylesHeader ? `${globalStylesHeader}\n${qCleanedText}` : qCleanedText;
          const options: string[] = [];
          
          optEls.forEach((opt) => {
            const rawOpt = opt.innerHTML.trim();
            if (rawOpt) {
              options.push(globalStylesHeader ? `${globalStylesHeader}\n${rawOpt}` : rawOpt);
            }
          });
          
          while (options.length < 4) {
            options.push(globalStylesHeader ? `${globalStylesHeader}\n<p>Option ${options.length + 1}</p>` : `Option ${options.length + 1}`);
          }

          let correctIdx = 0;
          optEls.forEach((opt, oIdx) => {
            if (
              opt.classList.contains("correct") || 
              opt.classList.contains("selected") || 
              opt.getAttribute("data-correct") === "true" ||
              opt.innerHTML.toLowerCase().includes("correct")
            ) {
              correctIdx = oIdx;
            }
          });

          const rawExp = expEl ? expEl.innerHTML.trim() : "Parsed from layout card";
          const explanation = globalStylesHeader ? `${globalStylesHeader}\n${rawExp}` : rawExp;

          questions.push({
            id: `dom-${Date.now()}-${idx}-${Math.random().toString(36).substring(4)}`,
            question: qText,
            options: options,
            correctOptionIndex: correctIdx,
            explanation: explanation,
            subject: classifyTextSubject(cleanTextOnly(qText)),
            topic: "Rajasthan General Knowledge",
            subtopic: "",
            difficulty: "medium",
            sourceType: "notes",
            timesAnswered: 0,
            timesCorrect: 0,
            targetExam: targetExam
          });
        }
      });
    }

    if (questions.length > 0) return questions;

    // ==========================================
    // PARAGRAPH-BY-PARAGRAPH EXTRACTOR (Approach B)
    // ==========================================
    const paragraphs = Array.from(doc.querySelectorAll("p, div, li, span, h1, h2, h3, h4"));
    let currentQText = "";
    let currentOptions: string[] = [];
    let currentCorrect = 0;
    let currentExplanation = "";

    // Regex matching options A, B, C, D, E or equivalents
    const optRegex = /^\s*[\(\[\\{]?(?:[A-Ea-e]|[1-5]|अ|ब|स|द|य|क|ख|ग|घ|ङ)[\)\]\\}]?[\s\.\-\:]*(.*)$/i;
    const ansRegex = /^\s*(?:Ans|Answer|Correct|Key|उत्तर|सही उत्तर|सही विकल्प|उत्तरमाला)[\s\.\-\:]*(.*)$/i;
    const expRegex = /^\s*(?:Explanation|Exp|Desc|Description|स्पष्टीकरण|व्याख्या|विशेष)[\s\.\-\:]*(.*)$/i;
    const qPrefixRegex = /^\s*(?:Question|Q\s*number|Q|प्रश्न|Prashna|Q\s*\d+)[\s\.\-\:\d\)]*[\s\.\-\:]+(.*)$/i;
    const numPrefixRegex = /^\s*(?:प्रश्न\s*)?(\d+)[\.\)\-\:]+\s*(.*)$/;

    paragraphs.forEach((p, idx) => {
      const text = (p.textContent || "").trim();
      if (!text) return;

      // Handle answer keys
      const ansMatch = text.match(ansRegex);
      if (ansMatch) {
        const value = ansMatch[1].trim().toUpperCase();
        if (["A", "1", "अ", "क"].includes(value)) currentCorrect = 0;
        else if (["B", "2", "ब", "ख"].includes(value)) currentCorrect = 1;
        else if (["C", "3", "स", "ग"].includes(value)) currentCorrect = 2;
        else if (["D", "4", "द", "घ"].includes(value)) currentCorrect = 3;
        else if (["E", "5", "य", "ङ"].includes(value)) currentCorrect = 4;
        return;
      }

      // Handle explanations
      const expMatch = text.match(expRegex);
      if (expMatch) {
         currentExplanation = expMatch[1].trim();
         return;
      }

      // Handle new questions
      let isNewQ = false;
      let matchedText = p.innerHTML.trim(); // Preserve HTML formatting inside paragraph

      const qMatch = text.match(qPrefixRegex);
      const numMatch = text.match(numPrefixRegex);

      if (qMatch) {
        isNewQ = true;
        matchedText = p.innerHTML.replace(qPrefixRegex, "$1").trim();
      } else if (numMatch) {
        const isListItem = currentOptions.length < 5 && (text.startsWith("1") || text.startsWith("2") || text.startsWith("3") || text.startsWith("4") || text.startsWith("5"));
        if (!isListItem) {
          isNewQ = true;
          matchedText = p.innerHTML.replace(numPrefixRegex, "$2").trim();
        }
      }

      if (isNewQ) {
        if (currentQText && currentOptions.length > 0) {
          while (currentOptions.length < 4) {
            currentOptions.push(globalStylesHeader ? `${globalStylesHeader}\n<p>Option ${currentOptions.length + 1}</p>` : `Option ${currentOptions.length + 1}`);
          }
          const questionCleaned = cleanQuestionPreamble(currentQText);
          questions.push({
            id: `dom-b-${Date.now()}-${idx}-${Math.random().toString(36).substring(4)}`,
            question: globalStylesHeader && !questionCleaned.includes("<style>") ? `${globalStylesHeader}\n${questionCleaned}` : questionCleaned,
            options: currentOptions.map(o => globalStylesHeader && !o.includes("<style>") ? `${globalStylesHeader}\n${o}` : o),
            correctOptionIndex: currentCorrect,
            explanation: currentExplanation || "Analyzed text paragraphs",
            subject: classifyTextSubject(cleanTextOnly(questionCleaned)),
            topic: "Rajasthan Knowledge Study",
            subtopic: "",
            difficulty: "medium",
            sourceType: "notes",
            timesAnswered: 0,
            timesCorrect: 0,
            targetExam: targetExam
          });
        }
        currentQText = matchedText;
        currentOptions = [];
        currentCorrect = 0;
        currentExplanation = "";
        return;
      }

      // Handle options
      const optMatch = text.match(optRegex);
      if (optMatch && currentOptions.length < 5) {
        const optionHtml = p.innerHTML.trim();
        if (optionHtml) {
          currentOptions.push(optionHtml);
          return;
        }
      }

      // Append HTML text context
      if (currentQText) {
        if (currentOptions.length === 0) {
          currentQText += " " + p.innerHTML;
        } else if (currentExplanation) {
          currentExplanation += " " + p.innerHTML;
        } else {
          const lIdx = currentOptions.length - 1;
          if (lIdx >= 0) {
            currentOptions[lIdx] += " " + p.innerHTML;
          } else {
            currentQText += " " + p.innerHTML;
          }
        }
      }
    });

    if (currentQText && currentOptions.length > 0) {
      while (currentOptions.length < 4) {
        currentOptions.push(globalStylesHeader ? `${globalStylesHeader}\n<p>Option ${currentOptions.length + 1}</p>` : `Option ${currentOptions.length + 1}`);
      }
      const questionCleanedLast = cleanQuestionPreamble(currentQText);
      questions.push({
        id: `dom-b-${Date.now()}-fin-${Math.random().toString(36).substring(4)}`,
        question: globalStylesHeader && !questionCleanedLast.includes("<style>") ? `${globalStylesHeader}\n${questionCleanedLast}` : questionCleanedLast,
        options: currentOptions.map(o => globalStylesHeader && !o.includes("<style>") ? `${globalStylesHeader}\n${o}` : o),
        correctOptionIndex: currentCorrect,
        explanation: currentExplanation || "Analyzed text paragraphs",
        subject: classifyTextSubject(cleanTextOnly(questionCleanedLast)),
        topic: "Rajasthan Knowledge Study",
        subtopic: "",
        difficulty: "medium",
        sourceType: "notes",
        timesAnswered: 0,
        timesCorrect: 0,
        targetExam: targetExam
      });
    }

  } catch (err) {
    console.error("DOMParser error extracting HTML components:", err);
  }

  // Pre-process and decode any legacy DevLys/Kruti Dev questions to native Unicode Hindi and override font families
  return questions.map(q => {
    const qDecoded = convertHtmlWithDevLys(q.question);
    const optsDecoded = q.options.map(opt => convertHtmlWithDevLys(opt));
    const expDecoded = convertHtmlWithDevLys(q.explanation);

    return {
      ...q,
      question: overrideLegacyFontsInHtml(qDecoded),
      options: optsDecoded.map(opt => overrideLegacyFontsInHtml(opt)),
      explanation: overrideLegacyFontsInHtml(expDecoded)
    };
  });
}
