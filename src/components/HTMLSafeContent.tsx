/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { convertHtmlWithDevLys } from "../lib/krutiConverter";
import { overrideLegacyFontsInHtml, getFontFamilyClass } from "../lib/langUtils";

interface HTMLSafeContentProps {
  content: string;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Renders raw HTML securely if it contains tags, otherwise falls back to standard text.
 * Especially useful for displaying mock test questions containing inline style blocks
 * or DevLys/Kruti Dev legacy Hindi typography fonts.
 */
export const HTMLSafeContent: React.FC<HTMLSafeContentProps> = ({ content, className = "", style }) => {
  if (!content) return null;

  // Process and translate legacy encoded Hindi typography (DevLys / Kruti Dev)
  const decodedContent = convertHtmlWithDevLys(content);
  const processedContent = overrideLegacyFontsInHtml(decodedContent);
  const fontClass = getFontFamilyClass(processedContent);

  // Check if string contains HTML tokens
  const hasHtml = /<[a-z][\s\S]*>/i.test(processedContent) || processedContent.includes("<style>") || processedContent.includes("</span>") || processedContent.includes("</p>");

  if (hasHtml) {
    return (
      <span
        style={style}
        className={`${fontClass} ${className}`}
        dangerouslySetInnerHTML={{ __html: processedContent }}
      />
    );
  }

  return (
    <span style={style} className={`${fontClass} ${className}`}>
      {processedContent}
    </span>
  );
};
