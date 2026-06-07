/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Helper utility for simple state exam matching and shared-syllabus crossover logic
export function matchExamSimple(qTargetExam: string | undefined, activeExamName: string): boolean {
  if (!activeExamName) return true;
  if (!qTargetExam) return false;

  const activeUpper = activeExamName.trim().toUpperCase();
  const targets = qTargetExam.split(",").map(t => t.trim().toUpperCase());

  // Direct match in listed tags
  if (targets.includes(activeUpper)) return true;

  // Smart overlapping state administrative civil exams syllabus (e.g. RAS PRE, EO RO, RAJASTHAN GK)
  const sharedStateSet = ["EO RO", "RAS PRE", "RAJASTHAN GK"];
  if (sharedStateSet.includes(activeUpper)) {
    const hasSharedTarget = targets.some(t => sharedStateSet.includes(t));
    if (hasSharedTarget) {
      return true;
    }
  }

  return false;
}
