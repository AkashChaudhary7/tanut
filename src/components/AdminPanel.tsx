/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef } from "react";
import { Question, SourceDocument, GeneratedPromptConfig, HtmlMockTest } from "../types";
import {
  FileText,
  UploadCloud,
  Plus,
  Trash2,
  Sliders,
  Settings,
  HelpCircle,
  CheckCircle2,
  FilePlus,
  RefreshCw,
  Database,
  ArrowRight,
  Brain,
  Sparkles,
  Zap,
  MessageSquare,
  Search,
  Download,
  Upload,
  AlertCircle
} from "lucide-react";
import {
  saveQuestionToFirestore,
  deleteQuestionFromFirestore,
  batchSaveQuestions,
  getAllQuestions,
  batchDeleteQuestions,
  saveHtmlMockTestToFirestore,
  getHtmlMockTests
} from "../lib/firebaseService";
import { setItem, clearAll, removeItem } from "../lib/db";
import { initialQuestions } from "../dummyData";
import { parseUniversalHTML } from "../lib/htmlParser";
import { HTMLSafeContent } from "./HTMLSafeContent";

interface AdminPanelProps {
  questions: Question[];
  setQuestions: (qs: Question[]) => void;
  documents: SourceDocument[];
  setDocuments: (docs: SourceDocument[]) => void;
  promptConfig: GeneratedPromptConfig;
  setPromptConfig: (config: GeneratedPromptConfig) => void;
  activeExam: string;
  exams: any[];
  setExams: (exams: any[]) => void;
  setActiveExam: (name: string) => void;
  totalQuestionsCount: number;
  setTotalQuestionsCount: (count: number | ((prev: number) => number)) => void;
}

export default function AdminPanel({
  questions,
  setQuestions,
  documents,
  setDocuments,
  promptConfig,
  setPromptConfig,
  activeExam,
  exams,
  setExams,
  setActiveExam,
  totalQuestionsCount,
  setTotalQuestionsCount
}: AdminPanelProps) {
  const [activeTab, setActiveTab] = useState<"ai-generator" | "html-ingest" | "manual-builder" | "database">("ai-generator");
  const [syncStatus, setSyncStatus] = useState<"Synced" | "Syncing...">("Synced");
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<Set<string>>(new Set());
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  // Success alert triggers
  const triggerSuccessAlert = (message: string) => {
    setSaveSuccess(message);
    setTimeout(() => {
      setSaveSuccess(null);
    }, 4500);
  };

  // Utility logic for similarity index calculation (Jaccard & containment overlap)
  const getAlphanumericTokens = (text: string): string[] => {
    return text.toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .split(/\s+/)
      .filter(Boolean);
  };

  const calculateSimilarity = (q1: string, q2: string): number => {
    const t1 = getAlphanumericTokens(q1);
    const t2 = getAlphanumericTokens(q2);
    if (t1.length === 0 || t2.length === 0) return 0;
    
    const set1 = new Set(t1);
    const set2 = new Set(t2);
    
    let intersection = 0;
    set1.forEach(token => {
      if (set2.has(token)) intersection++;
    });
    
    const unionSize = set1.size + set2.size - intersection;
    const jaccard = intersection / unionSize;
    const overlap = intersection / Math.min(set1.size, set2.size);
    return Math.max(jaccard, overlap);
  };

  const isDuplicateQuestion = (newQuestionText: string): boolean => {
    return questions.some((existingQ) => calculateSimilarity(newQuestionText, existingQ.question) >= 0.70);
  };

  // State for raw AI MCQ Generator tab
  const [generatorText, setGeneratorText] = useState("");
  const [generatorTopic, setGeneratorTopic] = useState("General Study Concept");
  const [genDifficulty, setGenDifficulty] = useState<"easy" | "medium" | "hard">("medium");
  const [genNumQuestions, setGenNumQuestions] = useState(10);
  const [docGenModel, setDocGenModel] = useState("gemini-2.0-flash");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState<number | null>(null);
  const [generationProgressText, setGenerationProgressText] = useState("");

  const handleGenerateFromText = async () => {
    if (!generatorText.trim()) {
      alert("Please specify a topic outline, study context, or syllabus notes first inside the reference input block.");
      return;
    }

    setIsGenerating(true);
    setGenerationProgress(5);
    setGenerationProgressText("Connecting with Gemini AI API engine...");

    // Split requests into minor parallel block batches (max 10 questions per invocation to safeguard gateway bounds)
    const maxBatchSize = 10;
    const totalNeeded = genNumQuestions;
    const batchSizes: number[] = [];
    
    let remaining = totalNeeded;
    while (remaining > 0) {
      if (remaining >= maxBatchSize) {
        batchSizes.push(maxBatchSize);
        remaining -= maxBatchSize;
      } else {
        batchSizes.push(remaining);
        remaining = 0;
      }
    }

    let progressVal = 5;
    const progressInterval = setInterval(() => {
      progressVal = Math.min(98, progressVal + Math.floor(Math.random() * 4) + 1);
      setGenerationProgress(progressVal);
      if (progressVal < 30) {
        setGenerationProgressText("Evaluating textual reference structure...");
      } else if (progressVal < 60) {
        setGenerationProgressText(`Synthesizing professional MCQs concurrently (${batchSizes.length} concurrent branches)...`);
      } else if (progressVal < 85) {
        setGenerationProgressText("Reviewing option correctness and explanation depth...");
      } else {
        setGenerationProgressText("Formatting final JSON schema questions...");
      }
    }, 250);

    try {
      const promises = batchSizes.map(async (size, idx) => {
        const response = await fetch("/api/generate-mcqs-from-doc", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            documentContent: generatorText,
            documentName: generatorTopic,
            difficulty: genDifficulty,
            numQuestions: size,
            activeFocusExam: activeExam,
            model: docGenModel,
            isPYQ: false,
            batchIndex: idx
          })
        });
        if (!response.ok) {
          throw new Error(`Worker thread ${idx + 1} rejected with error.`);
        }
        return response.json();
      });

      const results = await Promise.all(promises);
      clearInterval(progressInterval);
      setGenerationProgress(100);

      let allIncomingQuestions: Question[] = [];
      let offlineDetected = false;

      results.forEach(res => {
        if (res.success && res.questions) {
          allIncomingQuestions = [...allIncomingQuestions, ...res.questions];
          if (res.isOfflineFallback) {
            offlineDetected = true;
          }
        }
      });

      if (allIncomingQuestions.length > 0) {
        let finalKept: Question[] = [];
        let deletedDuplicateCount = 0;

        allIncomingQuestions.forEach((incomingQ, idx) => {
          const cleanId = "gen-" + Date.now() + "-" + idx + "-" + Math.random().toString(36).substring(4);
          incomingQ.id = cleanId;

          let hasOverlapMatch = isDuplicateQuestion(incomingQ.question);

          if (!hasOverlapMatch) {
            finalKept.forEach((alreadyKeptQ) => {
              const similarity = calculateSimilarity(incomingQ.question, alreadyKeptQ.question);
              if (similarity >= 0.70) {
                hasOverlapMatch = true;
              }
            });
          }

          if (hasOverlapMatch) {
            deletedDuplicateCount++;
          } else {
            finalKept.push(incomingQ);
          }
        });

        if (finalKept.length > 0) {
          await batchSaveQuestions(finalKept);
          await setItem("database_wiped_flag", "false");
          const updated = [...finalKept, ...questions];
          setQuestions(updated);
          setTotalQuestionsCount(prev => prev + finalKept.length);
          
          triggerSuccessAlert(
            `🚀 Generation Completed! Successfully matched and synced ${finalKept.length} unique MCQs directly to database (Total database library size is now ${updated.length} questions).` +
            (deletedDuplicateCount > 0 ? ` Dropped ${deletedDuplicateCount} redundant matching duplicates.` : "") +
            (offlineDetected ? " [Note: Offline backup templates served as GEMINI_API_KEY is unset]" : "")
          );
        } else {
          triggerSuccessAlert("⚠️ All generated MCQs matched existing question signatures. Safe-guarded database index.");
        }
      } else {
        alert("Failed to synthesize MCQs. Verify if your backend is currently reachable and key variables are set.");
      }

    } catch (err: any) {
      alert("Error during MCQ generation execution: " + err.message);
    } finally {
      clearInterval(progressInterval);
      setGenerationProgress(null);
      setGenerationProgressText("");
      setIsGenerating(false);
    }
  };

  // State for HTML Ingestion Gateway tab
  const [htmlTests, setHtmlTests] = useState<HtmlMockTest[]>([]);
  const [htmlUploadProgress, setHtmlUploadProgress] = useState<number | null>(null);
  const [htmlUploadStatus, setHtmlUploadStatus] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const fetchHtmlTests = async () => {
    try {
      const tests = await getHtmlMockTests();
      setHtmlTests(tests);
    } catch (error) {
      console.error("Error fetching mock tests:", error);
    }
  };

  React.useEffect(() => {
    fetchHtmlTests();
  }, []);

  const handleHtmlFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    await processHtmlFilesList(Array.from(files) as File[]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files) as File[];
    if (files.length === 0) return;
    await processHtmlFilesList(files);
  };

  const processHtmlFilesList = async (files: File[]) => {
    setHtmlUploadProgress(5);
    setHtmlUploadStatus("Analyzing document structure...");
    
    const extractedQuestions: Question[] = [];

    const readFileAsText = (file: File): Promise<string> => {
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (ev) => resolve(ev.target?.result as string || "");
        reader.readAsText(file);
      });
    };

    const getSubjectFromQuestionText = (text: string): string => {
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
        lower.includes("पंचायत")
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
        lower.includes("स्वतंत्रता") || lower.includes("आंदोलन")
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
        lower.includes("जनसंख्या") || lower.includes("वनस्पति") || lower.includes("अरावली")
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
      if (
        lower.includes("reasoning") || lower.includes("logic") || lower.includes("number") || 
        lower.includes("series") || lower.includes("math") || lower.includes("ratio") || 
        lower.includes("proportion") || lower.includes("percentage") || lower.includes("average") || 
        lower.includes("age") || lower.includes("speed") || lower.includes("distance") || 
        lower.includes("coding") || lower.includes("decoding") || lower.includes("तर्क") || 
        lower.includes("गणित") || lower.includes("आयु") || lower.includes("प्रतिशत") || 
        lower.includes("औसत") || lower.includes("दूरी") || lower.includes("चाल") || 
        lower.includes("संख्या")
      ) {
        return "Logical Reasoning";
      }
      return "General Knowledge";
    };

    const parseContentToQuestions = async (content: string, fileName: string): Promise<Question[]> => {
      const parsedList: Question[] = [];
      const trimmed = content.trim();

      // Check first for Kaxa/Appx structured dynamic test URL matches
      // Pattern captures http ... .json links inside scripts or texts
      const urlPattern = /(https?:\/\/[^\s'"`]+\.json[^\s'"`]*|https?:\/\/[^\s'"`]+test_title_question[^\s'"`]+)/i;
      const urlMatches = content.match(urlPattern);
      if (urlMatches) {
        const fetchedUrl = urlMatches[0].replace(/['"`]/g, "").trim();
        try {
          console.log("Triggered async server proxy retrieval for dynamic URL: " + fetchedUrl);
          const response = await fetch(`/api/proxy-json-url?url=${encodeURIComponent(fetchedUrl)}`);
          if (response.ok) {
            const data = await response.json();
            const arr = Array.isArray(data) ? data : (data.questions || data.data || data.items || []);
            if (Array.isArray(arr) && arr.length > 0) {
              const fetchedList: Question[] = [];
              arr.forEach((qObj: any, idx: number) => {
                let options: string[] = [];
                if (Array.isArray(qObj.options)) {
                  options = qObj.options.map((o: any) => String(o).trim());
                } else if (qObj.optionA || qObj.optionB) {
                  options = [qObj.optionA || "", qObj.optionB || "", qObj.optionC || "", qObj.optionD || ""].filter(Boolean).map(o => String(o).trim());
                } else {
                  // extract option_1, option_2, ... option_10 or option1, option2...
                  for (let j = 1; j <= 10; j++) {
                    const opt = qObj[`option_${j}`] || qObj[`option${j}`] || qObj[`Option_${j}`] || qObj[`Option${j}`];
                    if (opt !== undefined && opt !== null && String(opt).trim() !== "") {
                      options.push(String(opt).trim());
                    }
                  }
                }

                while (options.length < 4) {
                  options.push(`Option ${options.length + 1}`);
                }

                let correctOptionIndex = 0;
                const ansValue = qObj.answer !== undefined ? qObj.answer : qObj.correctOptionIndex;
                if (ansValue !== undefined && ansValue !== null) {
                  if (typeof ansValue === "number") {
                    if (ansValue >= 1 && ansValue <= options.length) {
                      correctOptionIndex = ansValue - 1;
                    } else {
                      correctOptionIndex = ansValue;
                    }
                  } else {
                    const parsedAns = parseInt(String(ansValue), 10);
                    if (!isNaN(parsedAns) && parsedAns >= 1 && parsedAns <= options.length) {
                      correctOptionIndex = parsedAns - 1;
                    } else {
                      const letter = String(ansValue).trim().toUpperCase();
                      if (["A", "1", "अ", "क"].includes(letter)) correctOptionIndex = 0;
                      else if (["B", "2", "ब", "KH", "ख"].includes(letter)) correctOptionIndex = 1;
                      else if (["C", "3", "स", "ग"].includes(letter)) correctOptionIndex = 2;
                      else if (["D", "4", "द", "घ"].includes(letter)) correctOptionIndex = 3;
                    }
                  }
                }

                const questionText = qObj.question || qObj.questionText || qObj.text || "";
                if (questionText) {
                  fetchedList.push({
                    id: qObj.id || `fetched-${Date.now()}-${idx}-${Math.random().toString(36).substring(4)}`,
                    question: questionText,
                    options: options,
                    correctOptionIndex: correctOptionIndex,
                    explanation: qObj.solution || qObj.explanation || qObj.desc || qObj.description || "Linked remote database MCQ",
                    subject: qObj.subject || getSubjectFromQuestionText(questionText),
                    topic: qObj.topic || "General Awareness",
                    subtopic: qObj.subtopic || "",
                    difficulty: qObj.difficulty || "medium",
                    sourceType: qObj.sourceType || "notes",
                    timesAnswered: 0,
                    timesCorrect: 0,
                    targetExam: qObj.targetExam || activeExam
                  });
                }
              });

              if (fetchedList.length > 0) {
                return fetchedList;
              }
            }
          }
        } catch (err) {
          console.error("Server proxy error matching dynamic URL, falling back to local parses:", err);
        }
      }

      // 1. Check if the content is raw JSON format
      if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
        try {
          const data = JSON.parse(trimmed);
          const arr = Array.isArray(data) ? data : (data.questions || data.items || []);
          if (Array.isArray(arr)) {
            arr.forEach((qObj: any) => {
              if (qObj.question && (qObj.options || (qObj.optionA && qObj.optionB))) {
                parsedList.push({
                  id: qObj.id || `json-${Date.now()}-${Math.random().toString(36).substring(4)}`,
                  question: qObj.question,
                  options: Array.isArray(qObj.options) ? qObj.options : [qObj.optionA || "", qObj.optionB || "", qObj.optionC || "", qObj.optionD || ""].filter(Boolean),
                  correctOptionIndex: typeof qObj.correctOptionIndex === "number" ? qObj.correctOptionIndex : (typeof qObj.answer === "number" ? qObj.answer : 0),
                  explanation: qObj.explanation || qObj.desc || "Imported JSON MCQ",
                  subject: qObj.subject || getSubjectFromQuestionText(qObj.question),
                  topic: qObj.topic || "General",
                  subtopic: qObj.subtopic || "",
                  difficulty: qObj.difficulty || "medium",
                  sourceType: qObj.sourceType || "notes",
                  timesAnswered: 0,
                  timesCorrect: 0,
                  targetExam: qObj.targetExam || activeExam
                });
              }
            });
          }
          if (parsedList.length > 0) return parsedList;
        } catch (e) {
          // Not standard JSON, fallback of parser
        }
      }

      // 2. Try parsing questions from javascript quiz variables inside HTML <script> tags
      try {
        const scriptRegex = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
        let match;
        while ((match = scriptRegex.exec(content)) !== null) {
          const scriptText = match[1];
          // Locate arrays containing question objects
          const arrayMatch = scriptText.match(/\[\s*\{\s*["']?question["']?[\s\S]*?\}\s*\]/);
          if (arrayMatch) {
            const possibleJson = arrayMatch[0];
            const cleanJson = possibleJson
              .replace(/(['"])?([a-zA-Z0-9_]+)(['"])?\s*:/g, '"$2":')
              .replace(/'/g, '"')
              .replace(/,(\s*[\]\}])/g, "$1");
            try {
              const data = JSON.parse(cleanJson);
              if (Array.isArray(data)) {
                data.forEach((qObj: any) => {
                  if (qObj.question) {
                    parsedList.push({
                      id: qObj.id || `script-ing-${Date.now()}-${Math.random().toString(36).substring(4)}`,
                      question: qObj.question,
                      options: Array.isArray(qObj.options) ? qObj.options : [qObj.optionA || "", qObj.optionB || "", qObj.optionC || "", qObj.optionD || ""].filter(Boolean),
                      correctOptionIndex: typeof qObj.correctOptionIndex === "number" ? qObj.correctOptionIndex : 0,
                      explanation: qObj.explanation || "Parsed from quiz script",
                      subject: qObj.subject || getSubjectFromQuestionText(qObj.question),
                      topic: qObj.topic || "General",
                      subtopic: qObj.subtopic || "",
                      difficulty: qObj.difficulty || "medium",
                      sourceType: qObj.sourceType || "notes",
                      timesAnswered: 0,
                      timesCorrect: 0,
                      targetExam: qObj.targetExam || activeExam
                    });
                  }
                });
              }
            } catch(e) {}
          }
        }
      } catch (e) {}

      if (parsedList.length > 0) return parsedList;

      // 2.5 Try DOMParser-based universal HTML parser
      try {
        const domList = parseUniversalHTML(content, activeExam);
        if (domList && domList.length > 0) {
          return domList;
        }
      } catch (domErr) {
        console.error("parseUniversalHTML error:", domErr);
      }

      // 3. Fallback: Highly smart Text layout Line-by-line bilingual parser on HTML/DOM text
      const tempDiv = document.createElement("div");
      tempDiv.innerHTML = content;
      const textContent = tempDiv.textContent || tempDiv.innerText || content;

      const lines = textContent.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      
      let currentQ: {
        question: string;
        options: string[];
        correctOptionIndex: number;
        explanation: string;
      } | null = null;
      
      const optRegex = /^\s*[\(\[\\{]?(?:[A-Ea-e]|[1-5]|अ|ब|स|द|य|क|ख|ग|घ|ङ)[\)\]\\}]?[\s\.\-\:]*(.*)$/i;
      const ansRegex = /^\s*(?:Ans|Answer|Correct|Key|उत्तर|सही उत्तर|सही विकल्प|उत्तरमाला)[\s\.\-\:]*(.*)$/i;
      const expRegex = /^\s*(?:Explanation|Exp|Desc|Description|स्पष्टीकरण|व्याख्या|विशेष)[\s\.\-\:]*(.*)$/i;
      const qRegex = /^\s*(?:Question|Q\s*number|Q|प्रश्न|Prashna|Q\s*\d+)[\s\.\-\:\d\)]*[\s\.\-\:]+(.*)$/i;
      const numQRegex = /^\s*(?:प्रश्न\s*)?(\d+)[\.\)\-\:]+\s*(.*)$/;

      for (let idx = 0; idx < lines.length; idx++) {
        const line = lines[idx];
        
        const ansMatch = line.match(ansRegex);
        if (ansMatch && currentQ) {
          const rest = ansMatch[1].trim();
          const letterMatch = rest.match(/([A-E]|[a-e]|[1-5]|अ|ब|स|द|य|क|ख|ग|घ|ङ)/i);
          if (letterMatch) {
            const letter = letterMatch[1].toUpperCase();
            if (["A", "1", "अ", "क"].includes(letter)) currentQ.correctOptionIndex = 0;
            else if (["B", "2", "ब", "ख"].includes(letter)) currentQ.correctOptionIndex = 1;
            else if (["C", "3", "स", "ग"].includes(letter)) currentQ.correctOptionIndex = 2;
            else if (["D", "4", "द", "घ"].includes(letter)) currentQ.correctOptionIndex = 3;
            else if (["E", "5", "य", "ङ"].includes(letter)) currentQ.correctOptionIndex = 4;
          }
          continue;
        }
        
        const expMatch = line.match(expRegex);
        if (expMatch && currentQ) {
          currentQ.explanation = expMatch[1].trim();
          continue;
        }
        
        let isNewQ = false;
        let questionText = "";
        
        const qMatch = line.match(qRegex);
        const numQMatch = line.match(numQRegex);
        
        if (qMatch) {
          isNewQ = true;
          questionText = qMatch[1].trim();
        } else if (numQMatch) {
          const isListItemOption = currentQ && currentQ.options.length < 5 && (line.startsWith("1") || line.startsWith("2") || line.startsWith("3") || line.startsWith("4") || line.startsWith("5"));
          if (!isListItemOption) {
            isNewQ = true;
            questionText = numQMatch[2].trim();
          }
        }
        
        if (isNewQ) {
          if (currentQ && currentQ.question && currentQ.options.length > 0) {
            while (currentQ.options.length < 4) {
              currentQ.options.push(`Option ${currentQ.options.length + 1}`);
            }
            parsedList.push({
              id: `html-ing-${Date.now()}-${idx}-${Math.random().toString(36).substring(4)}`,
              question: currentQ.question,
              options: currentQ.options,
              correctOptionIndex: currentQ.correctOptionIndex,
              explanation: currentQ.explanation || "Extracted from source layout",
              subject: getSubjectFromQuestionText(currentQ.question),
              topic: "General Awareness",
              subtopic: "",
              difficulty: "medium",
              sourceType: "notes",
              timesAnswered: 0,
              timesCorrect: 0,
              targetExam: activeExam
            });
          }
          currentQ = {
            question: questionText,
            options: [],
            correctOptionIndex: 0,
            explanation: ""
          };
          continue;
        }
        
        const optMatch = line.match(optRegex);
        if (optMatch && currentQ && currentQ.options.length < 5) {
          const optText = optMatch[1].trim();
          if (optText) {
            currentQ.options.push(optText);
            continue;
          }
        }
        
        if (currentQ) {
          if (currentQ.options.length === 0) {
            currentQ.question += " " + line;
          } else if (currentQ.explanation) {
            currentQ.explanation += " " + line;
          } else {
            if (currentQ.options.length > 0) {
              const lastIdx = currentQ.options.length - 1;
              currentQ.options[lastIdx] += " " + line;
            } else {
              currentQ.question += " " + line;
            }
          }
        }
      }
      
      if (currentQ && currentQ.question && currentQ.options.length > 0) {
        while (currentQ.options.length < 4) {
          currentQ.options.push(`Option ${currentQ.options.length + 1}`);
        }
        parsedList.push({
          id: `html-ing-${Date.now()}-last-${Math.random().toString(36).substring(4)}`,
          question: currentQ.question,
          options: currentQ.options,
          correctOptionIndex: currentQ.correctOptionIndex,
          explanation: currentQ.explanation || "Extracted from source layout",
          subject: getSubjectFromQuestionText(currentQ.question),
          topic: "General Awareness",
          subtopic: "",
          difficulty: "medium",
          sourceType: "notes",
          timesAnswered: 0,
          timesCorrect: 0,
          targetExam: activeExam
        });
      }

      return parsedList;
    };

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setHtmlUploadStatus(`Parsing file ${i + 1}/${files.length}: ${file.name}...`);
        setHtmlUploadProgress(20 + Math.floor((i / files.length) * 60));

        const htmlContent = await readFileAsText(file);
        const parsedList = await parseContentToQuestions(htmlContent, file.name);
        
        parsedList.forEach((q, idx) => {
          q.id = `html-ing-${Date.now()}-${i}-${idx}-${Math.random().toString(36).substring(4)}`;
        });
        
        extractedQuestions.push(...parsedList);
      }

      if (extractedQuestions.length === 0) {
        setHtmlUploadProgress(null);
        setHtmlUploadStatus("");
        alert("The parser could not extract any questions from the provided HTML file. Ensure it contains a standard structured quiz layout.");
        return;
      }

      setHtmlUploadStatus(`Saving ${extractedQuestions.length} parsed items directly to Firestore...`);
      setHtmlUploadProgress(90);

      // Save directly to the Firestore database
      await batchSaveQuestions(extractedQuestions);
      await setItem("database_wiped_flag", "false");

      // Register mock test meta context
      const testMetaObj: HtmlMockTest = {
        id: "mock-" + Date.now() + "-" + Math.random().toString(36).substring(4),
        name: files.map(f => f.name).join(", "),
        htmlContent: `questions_parsed: ${extractedQuestions.length}`,
        uploadedAt: new Date().toISOString(),
        targetExam: activeExam
      };
      await saveHtmlMockTestToFirestore(testMetaObj);

      // Refresh react state pool
      const updatedQuestions = [...extractedQuestions, ...questions];
      setQuestions(updatedQuestions);
      setTotalQuestionsCount(prev => prev + extractedQuestions.length);
      await fetchHtmlTests();

      triggerSuccessAlert(`📂 Ingest Completed! Successfully extracted and synced ${extractedQuestions.length} MCQs to Firebase Firestore database.`);
    } catch (err: any) {
      alert("Error parsing HTML File structure: " + err.message);
    } finally {
      setHtmlUploadProgress(null);
      setHtmlUploadStatus("");
    }
  };

  // States for Manual MCQ Builder Form
  const [manualQuestion, setManualQuestion] = useState("");
  const [optA, setOptA] = useState("");
  const [optB, setOptB] = useState("");
  const [optC, setOptC] = useState("");
  const [optD, setOptD] = useState("");
  const [correctIdx, setCorrectIdx] = useState(0);
  const [explanation, setExplanation] = useState("");
  const [subject, setSubject] = useState("General Knowledge");
  const [topic, setTopic] = useState("General Awareness");
  const [subtopic, setSubtopic] = useState("General Subtopics");
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard">("medium");
  const [targetExam, setTargetExam] = useState(activeExam);
  const [isAutoFilling, setIsAutoFilling] = useState(false);

  const handleAIAutoFill = async () => {
    if (!manualQuestion.trim()) {
      alert("Please outline or write a brief concept topic inside the Question Draft field first.");
      return;
    }
    setIsAutoFilling(true);
    try {
      const response = await fetch("/api/ai-autofill-mcq", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: manualQuestion, activeExam })
      });
      const data = await response.json();
      if (data.success && data.draft) {
        if (data.draft.options && data.draft.options.length >= 4) {
          setOptA(data.draft.options[0]);
          setOptB(data.draft.options[1]);
          setOptC(data.draft.options[2]);
          setOptD(data.draft.options[3]);
        }
        if (data.draft.explanation) {
          setExplanation(data.draft.explanation);
        }
        if (typeof data.draft.correctOptionIndex === "number") {
          setCorrectIdx(data.draft.correctOptionIndex);
        }
        if (data.draft.subject) setSubject(data.draft.subject);
        if (data.draft.topic) setTopic(data.draft.topic);
        if (data.draft.subtopic) setSubtopic(data.draft.subtopic);
        triggerSuccessAlert("🌟 Manual MCQ successfully structured and filled via Gemini AI assistant!");
      } else {
        // Safe sandbox autogenerator draft templates
        setOptA("Operational administrative metric standards (Auto-fallback)");
        setOptB("Superficial localized structural policy blocks (Auto-fallback)");
        setOptC("Sub-optimal legacy evaluation system procedures (Auto-fallback)");
        setOptD("Focal target consistency thresholds (Auto-fallback)");
        setCorrectIdx(0);
        setExplanation("Standardized evaluation template representing our offline backup. Configure a real GEMINI_API_KEY to retrieve high-fidelity explanations.");
        triggerSuccessAlert("Offline backup choices formulated! Setup your GEMINI_API_KEY inside AI Studio to activate genuine AI MCQ drafting.");
      }
    } catch (err: any) {
      console.error(err);
      alert("Error calling draft autofill: " + err.message);
    } finally {
      setIsAutoFilling(false);
    }
  };

  const handleBuildMCQ = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualQuestion || !optA || !optB || !optC || !optD) {
      alert("Please populate the question statement and all four option alternatives.");
      return;
    }

    const newQ: Question = {
      id: "manual-" + Date.now() + "-" + Math.random().toString(36).substring(4),
      question: manualQuestion,
      options: [optA, optB, optC, optD],
      correctOptionIndex: correctIdx,
      explanation: explanation || "Verified through standard state civil syllabus guidelines.",
      subject: subject,
      topic: topic,
      subtopic: subtopic,
      difficulty: difficulty,
      sourceType: "notes",
      timesAnswered: 0,
      timesCorrect: 0,
      targetExam: targetExam
    };

    saveQuestionToFirestore(newQ).then(async () => {
        setSyncStatus("Syncing...");
        await setItem("database_wiped_flag", "false");
        const updated = [newQ, ...questions];
        setQuestions(updated);
        setTotalQuestionsCount(prev => prev + 1);
        triggerSuccessAlert(`Successfully added 1 manual custom MCQ directly to active Focus pool.`);
        setSyncStatus("Synced");
        
        // Reset states
        setManualQuestion("");
        setOptA("");
        setOptB("");
        setOptC("");
        setOptD("");
        setExplanation("");
    }).catch(err => {
        console.error(err);
        setSyncStatus("Synced");
        alert("Failed to save to database: " + err.message);
    });
  };

  // State & logic for Database Manager tab
  const [dbSearch, setDbSearch] = useState("");
  const fileImportRef = useRef<HTMLInputElement>(null);

  const handleExportDatabase = async () => {
    const allQs = await getAllQuestions();
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(allQs));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", `focus_question_vault_backup_${Date.now()}.json`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
    triggerSuccessAlert("Database questions vault successfully consolidated and downloaded.");
  };

  const handleImportDatabase = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
        try {
            const importedQuestions = JSON.parse(event.target?.result as string);
            if (!Array.isArray(importedQuestions)) {
              alert("Invalid format. Standard JSON backup must represent an array lists.");
              return;
            }
            if (!confirm(`You are importing file containing ${importedQuestions.length} MCQs directly into Firestore database. Merge duplicates?`)) return;
            
            await batchSaveQuestions(importedQuestions);
            await setItem("database_wiped_flag", "false");
            setSyncStatus("Syncing...");
            
            // Consolidate values inside react states
            const updated = [...importedQuestions, ...questions];
            setQuestions(updated);
            setTotalQuestionsCount(updated.length);

            triggerSuccessAlert(`Database imported and synced successfully (${importedQuestions.length} items added).`);
            setSyncStatus("Synced");
        } catch (err) {
            alert("Error importing legacy backup database file: " + err);
        }
    };
    reader.readAsText(file);
    if (fileImportRef.current) fileImportRef.current.value = "";
  };

  const handleDeduplicate = async () => {
    setSyncStatus("Syncing...");
    setHtmlUploadStatus("Analyzing overlaps...");
    
    let duplicatesFound: string[] = [];
    const keptList: Question[] = [];

    questions.forEach((q) => {
      let isDuplicate = false;
      keptList.forEach((existing) => {
        if (calculateSimilarity(q.question, existing.question) >= 0.70) {
          isDuplicate = true;
        }
      });
      if (isDuplicate) {
        duplicatesFound.push(q.id);
      } else {
        keptList.push(q);
      }
    });

    if (duplicatesFound.length === 0) {
      setSyncStatus("Synced");
      setHtmlUploadStatus("");
      alert("No duplicate entries or high semantic overlap signatures identified. Your database is perfectly lean!");
      return;
    }

    if (confirm(`Detected ${duplicatesFound.length} questions that share extreme similarity overlap with existing items. Purge clean?`)) {
      try {
        await batchDeleteQuestions(duplicatesFound);
        setQuestions(keptList);
        setTotalQuestionsCount(keptList.length);
        triggerSuccessAlert(`Successfully clean and purged ${duplicatesFound.length} redundant questions from Firestore!`);
      } catch (err: any) {
        alert("Fail deleting duplicates: " + err.message);
      }
    }
    setSyncStatus("Synced");
    setHtmlUploadStatus("");
  };

  const [isClassifying, setIsClassifying] = useState(false);

  const handleAutoClassifySubjects = async () => {
    if (questions.length === 0) {
      alert("No questions found in the database to classify.");
      return;
    }

    if (!confirm(`Do you want to use Multi-Model AI (Gemini) to analyze all ${questions.length} questions in the database and automatically classify them into standard academic subject categories (e.g., History, Geography, Polity, Science, Current Affairs)?`)) {
      return;
    }

    setIsClassifying(true);
    setSyncStatus("Syncing...");
    try {
      const response = await fetch("/api/ai-classify-subjects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questions: questions.map(q => ({ id: q.id, question: q.question })) })
      });

      const text = await response.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch (e) {
        console.error("Failed to parse API response as JSON. Response was:", text);
        throw new Error("Server returned an invalid response.");
      }

      if (data.success && data.classifications) {
        const classificationsMap = new Map<string, { subject: string; targetExam?: string }>();
        data.classifications.forEach((c: { id: string; subject: string; targetExam?: string }) => {
          classificationsMap.set(c.id, { subject: c.subject, targetExam: c.targetExam });
        });

        const updatedQuestions = questions.map(q => {
          const classification = classificationsMap.get(q.id);
          if (classification) {
            return { 
              ...q, 
              subject: classification.subject,
              targetExam: classification.targetExam || q.targetExam // Preserve or update
            };
          }
          return q;
        });

        await batchSaveQuestions(updatedQuestions);
        setQuestions(updatedQuestions);
        triggerSuccessAlert(`✨ Successfully classified all ${data.classifications.length} questions into standard subjects and shared-syllabus targets via Multi-Model Gemini AI!`);
      } else {
        alert("Failed to classify subjects via AI: " + (data.error || "Unknown error"));
      }
    } catch (err: any) {
      console.error(err);
      alert("Classification failed: " + err.message);
    } finally {
      setIsClassifying(false);
      setSyncStatus("Synced");
    }
  };

  const handleClearAllAddedQuestions = () => {
    if (confirm("Are you sure you want to permanently delete ALL added custom raw, manual, or AI-generated questions from the database? Default baseline questions will remain.")) {
      const initialIds = new Set(initialQuestions.map(q => q.id));
      const idsToDelete = questions
        .filter(q => !initialIds.has(q.id))
        .map(q => q.id);

      if (idsToDelete.length === 0) {
        alert("No custom or AI generated questions were identified for clearing.");
        return;
      }

      batchDeleteQuestions(idsToDelete).then(async () => {
          setSyncStatus("Syncing...");
          const filtered = questions.filter(q => !idsToDelete.includes(q.id));
          setQuestions(filtered);
          setTotalQuestionsCount(filtered.length);
          if (filtered.length === 0) {
            await setItem("database_wiped_flag", "true");
          }
          // Clear any active local cache files containing question references
          localStorage.removeItem("mistake_book");
          localStorage.removeItem("practice_sessions");
          localStorage.removeItem("performance_stats");
          await removeItem("mistake_book");
          await removeItem("target_active_practice_draft");

          triggerSuccessAlert(`Removed all ${idsToDelete.length} generated questions successfully.`);
          setSyncStatus("Synced");
      }).catch(err => {
         setSyncStatus("Synced");
         alert("Failed to delete questions: " + err.message);
      });
    }
  };

  const handleClearEverythingCheck = () => {
    if (confirm("WARNING: Are you sure you want to fully clear the database questions pool? This deletes every baseline question, making the app blank.")) {
      const idsToDelete = questions.map(q => q.id);
      batchDeleteQuestions(idsToDelete).then(async () => {
          setSyncStatus("Syncing...");
          setQuestions([]);
          setTotalQuestionsCount(0);
          await setItem("database_wiped_flag", "true");
          await clearAll();
          triggerSuccessAlert("Database wiped completely from Firestore and local cache storage.");
          setSyncStatus("Synced");
      }).catch(err => {
         setSyncStatus("Synced");
         alert("Failed to wipe: " + err.message);
      });
    }
  };

  const handleDeleteSingleQuestion = (id: string) => {
    deleteQuestionFromFirestore(id).then(() => {
        setSyncStatus("Syncing...");
        const filtered = questions.filter(q => q.id !== id);
        setQuestions(filtered);
        setTotalQuestionsCount(prev => Math.max(0, prev - 1));
        triggerSuccessAlert("Question index dropped from Firestore.");
        setSyncStatus("Synced");
    }).catch(err => {
        setSyncStatus("Synced");
        alert("Failed to delete item: " + err.message);
    });
  };

  const handleUpdateOptionIndex = (id: string, newIdx: number) => {
    const qTarget = questions.find(q => q.id === id);
    if (!qTarget) return;
    
    const updatedObj = { ...qTarget, correctOptionIndex: newIdx };
    saveQuestionToFirestore(updatedObj).then(() => {
        setSyncStatus("Syncing...");
        const res = questions.map(q => q.id === id ? updatedObj : q);
        setQuestions(res);
        triggerSuccessAlert("Correct choice index updated inside Firestore.");
        setSyncStatus("Synced");
    }).catch(err => {
        setSyncStatus("Synced");
        alert("Failed syncing correct option: " + err.message);
    });
  };

  // Filtered pool list based on manual DB search
  const filteredQuestions = questions.filter(q => {
    if (!dbSearch) return true;
    const s = dbSearch.toLowerCase();
    return q.question.toLowerCase().includes(s) || q.explanation.toLowerCase().includes(s) || q.topic.toLowerCase().includes(s);
  });

  return (
    <div id="ai-admin-root" className="bg-slate-950 border border-slate-900 rounded-3xl p-6 shadow-2xl relative overflow-hidden text-slate-100">
      
      {/* Decorative vector flare */}
      <div className="absolute top-0 right-0 w-80 h-80 bg-orange-500/5 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute -bottom-10 -left-10 w-80 h-80 bg-indigo-500/5 rounded-full blur-[100px] pointer-events-none" />

      {/* Header Info Band */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-900 pb-5 mb-6">
        <div>
          <div className="flex items-center gap-2">
            <Settings className="text-orange-500 animate-spin-slow" size={20} />
            <h2 className="text-lg font-extrabold text-slate-100 tracking-tight font-sans">
              Administrative Ingestion & Synthesis Hub
            </h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Build high-fidelity MCQs, ingest HTML raw mock tests directly, or synthesize smart syllabus targets.
          </p>
        </div>

        {/* Sync Indicator */}
        <div className="flex items-center gap-3 self-start md:self-auto">
          <div className="bg-slate-900/60 border border-slate-800 px-3 py-1.5 rounded-xl flex items-center gap-2 text-[10px] font-mono">
            <span className={`w-1.5 h-1.5 rounded-full ${syncStatus === 'Synced' ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500 animate-bounce'}`} />
            <span className="text-slate-300 font-bold">{syncStatus}</span>
          </div>
          <span className="text-xs font-mono text-slate-500 font-bold bg-slate-900 border border-slate-900 px-3 py-1.5 rounded-xl">
             Pool: {questions.length} Questions
          </span>
        </div>
      </div>

      {/* Floating Success Notification alert banner bar */}
      {saveSuccess && (
        <div className="mb-4 p-3.5 bg-emerald-950/40 border border-emerald-500/30 text-emerald-400 text-xs rounded-xl flex items-center gap-2.5 animate-fadeIn backdrop-blur-md">
          <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
          <p className="font-semibold leading-relaxed">{saveSuccess}</p>
        </div>
      )}

      {/* Workspace Menu Tabs */}
      <div className="flex border-b border-slate-900 overflow-x-auto gap-1 mb-6 scrollbar-thin">
        <button
          onClick={() => setActiveTab("ai-generator")}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-extrabold transition-all cursor-pointer border-b-2 font-sans ${
            activeTab === "ai-generator"
              ? "border-orange-500 text-orange-400 bg-orange-500/5 rounded-t-xl"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <Brain size={14} /> AI MCQ Generator
        </button>
        <button
          onClick={() => setActiveTab("html-ingest")}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-extrabold transition-all cursor-pointer border-b-2 font-sans ${
            activeTab === "html-ingest"
              ? "border-orange-500 text-orange-400 bg-orange-500/5 rounded-t-xl"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <UploadCloud size={14} /> HTML Mock Ingest
        </button>
        <button
          onClick={() => setActiveTab("manual-builder")}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-extrabold transition-all cursor-pointer border-b-2 font-sans ${
            activeTab === "manual-builder"
              ? "border-orange-500 text-orange-400 bg-orange-500/5 rounded-t-xl"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <FilePlus size={14} /> Manual MCQ Builder
        </button>
        <button
          onClick={() => setActiveTab("database")}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-extrabold transition-all cursor-pointer border-b-2 font-sans ${
            activeTab === "database"
              ? "border-orange-500 text-orange-400 bg-orange-500/5 rounded-t-xl"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <Database size={14} /> Database Manager
        </button>
      </div>

      {/* Tabs Layout blocks rendering */}
      <div className="space-y-6">

        {/* 1. AI MCQ Generator Tab */}
        {activeTab === "ai-generator" && (
          <div className="space-y-4 animate-fadeIn">
            <div className="bg-slate-900 border border-slate-900 p-5 rounded-2xl space-y-4">
              <div className="flex items-center gap-2">
                <Brain className="text-indigo-400 animate-pulse" size={18} />
                <h3 className="font-extrabold text-sm text-slate-200">Syllabus-to-MCQ AI Factory</h3>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed md:w-3/4">
                Paste study material, reference paragraphs, syllabus clauses, or detailed notes. Gemini AI will synthesize high-quality, exam-standard multiple choice questions complete with rigorous pedagogical explanations.
              </p>

              <div className="space-y-4 grid grid-cols-1 lg:grid-cols-3 lg:gap-6 lg:space-y-0 pt-2">
                
                {/* Left controls side */}
                <div className="lg:col-span-2 space-y-4">
                  <div>
                    <label className="block text-[10px] uppercase font-mono font-bold text-slate-400 mb-1.5 tracking-wider">
                      Reference Topic or Concept Heading
                    </label>
                    <input
                      type="text"
                      className="w-full bg-slate-950 border border-slate-900 focus:border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-100 outline-none"
                      placeholder="e.g., Fundamental Rights in Legislative Codes"
                      value={generatorTopic}
                      onChange={(e) => setGeneratorTopic(e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] uppercase font-mono font-bold text-slate-400 mb-1.5 tracking-wider">
                      Reference Content (Paste notes or text block here)
                    </label>
                    <textarea
                      rows={9}
                      className="w-full bg-slate-950 border border-slate-900 focus:border-slate-800 rounded-xl px-4 py-3 text-xs text-slate-100 outline-none font-sans leading-relaxed"
                      placeholder="Paste historical notes, subject rules, concept outlines, or past year questions..."
                      value={generatorText}
                      onChange={(e) => setGeneratorText(e.target.value)}
                    />
                  </div>
                </div>

                {/* Right hyperparameters parameters */}
                <div className="space-y-4 bg-slate-950/60 p-4 border border-slate-900 rounded-2xl self-start h-full">
                  <span className="block text-[10px] uppercase font-mono font-bold text-indigo-400 tracking-wider mb-2">
                    Evaluation Parameters
                  </span>

                  <div>
                    <label className="block text-[10px] font-mono font-bold text-slate-400 mb-1.5">
                      Target Active Exam
                    </label>
                    <div className="text-xs bg-slate-900 px-3.5 py-2.5 border border-slate-850 rounded-xl text-slate-300 font-bold truncate">
                      🎯 {activeExam}
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-mono font-bold text-slate-400 mb-1.5">
                      AI Model Select
                    </label>
                    <select
                      className="w-full bg-slate-900 border border-slate-850 rounded-xl px-3 py-2 text-xs text-slate-300 cursor-pointer outline-none"
                      value={docGenModel}
                      onChange={(e) => setDocGenModel(e.target.value)}
                    >
                      <option value="gemini-2.0-flash">Gemini 2.0 Flash (Top speed)</option>
                      <option value="gemini-1.5-pro">Gemini 1.5 Pro (Extreme logic)</option>
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-3.5">
                    <div>
                      <label className="block text-[10px] font-mono font-bold text-slate-400 mb-1.5">
                        Difficulty
                      </label>
                      <select
                        className="w-full bg-slate-900 border border-slate-850 rounded-xl px-3 py-2 text-xs text-slate-300 cursor-pointer outline-none"
                        value={genDifficulty}
                        onChange={(e) => setGenDifficulty(e.target.value as any)}
                      >
                        <option value="easy">Easy</option>
                        <option value="medium">Medium</option>
                        <option value="hard">Hard (Advanced)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] font-mono font-bold text-slate-400 mb-1.5">
                        Questions Volume
                      </label>
                      <select
                        className="w-full bg-slate-900 border border-slate-850 rounded-xl px-3 py-2 text-xs text-slate-300 cursor-pointer outline-none"
                        value={genNumQuestions}
                        onChange={(e) => setGenNumQuestions(Number(e.target.value))}
                      >
                        <option value={5}>5 Questions</option>
                        <option value={10}>10 Questions</option>
                        <option value={15}>15 Questions</option>
                        <option value={20}>20 Questions</option>
                        <option value={30}>30 Questions</option>
                      </select>
                    </div>
                  </div>

                  <div className="pt-2">
                    <button
                      onClick={handleGenerateFromText}
                      disabled={isGenerating || !generatorText.trim()}
                      className="w-full bg-indigo-600 hover:bg-indigo-500 active:scale-95 disabled:opacity-40 disabled:scale-100 text-white font-extrabold text-xs py-3 px-4 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-lg shadow-indigo-600/10"
                    >
                      {isGenerating ? (
                        <>
                          <RefreshCw size={14} className="animate-spin" /> Synthesizing...
                        </>
                      ) : (
                        <>
                          <Zap size={14} /> ⚡ Synthesize MCQs Pool
                        </>
                      )}
                    </button>
                  </div>
                </div>

              </div>

              {/* Concurrency generation progress tracking bars */}
              {isGenerating && (
                <div className="mt-4 p-4 bg-slate-950 border border-slate-900 rounded-xl space-y-2">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-400 font-medium font-sans flex items-center gap-1.5">
                      <GearAnimation /> {generationProgressText}
                    </span>
                    <span className="text-indigo-400 font-mono font-bold">{generationProgress}%</span>
                  </div>
                  <div className="w-full bg-slate-900 h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-indigo-500 h-full rounded-full transition-all duration-300"
                      style={{ width: `${generationProgress || 10}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 2. HTML Mock Ingest Tab */}
        {activeTab === "html-ingest" && (
          <div className="space-y-4 animate-fadeIn">
            <div className="bg-slate-900 border border-slate-900 p-5 rounded-2xl space-y-4">
              <div className="flex items-center gap-2">
                <UploadCloud className="text-emerald-400 animate-bounce" size={18} />
                <h3 className="font-extrabold text-sm text-slate-200">Universal Mock Test & Notes Ingestion</h3>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed md:w-3/4">
                Drag and drop raw HTML files, formatted JSON records, or plain `.txt` study material files. Our parser scans for JSON files, lists, JavaScript variables inside script tags, and bilingual (English/Hindi) line structures to build and save questions directly to Firebase Firestore matching the active exam.
              </p>

              {/* Upload Drop Zone Box */}
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center gap-3 cursor-pointer transition-all ${
                  isDragging
                    ? "border-emerald-500 bg-emerald-500/5 scale-[0.99]"
                    : "border-slate-800 hover:border-slate-700 bg-slate-950/40 hover:bg-slate-950/80"
                }`}
              >
                <input
                  type="file"
                  multiple
                  accept=".html,.htm,.txt,.json"
                  ref={fileInputRef}
                  onChange={handleHtmlFileSelect}
                  className="hidden"
                />
                <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl text-slate-400 group-hover:text-slate-200">
                  <UploadCloud size={24} />
                </div>
                <div className="text-center">
                  <p className="text-xs font-bold text-slate-300">
                    Drag and drop HTML, Text, or JSON files here, or <span className="text-emerald-400">click to browse</span>
                  </p>
                  <p className="text-[10px] text-slate-500 mt-1 uppercase tracking-wider font-mono">
                    supports .html, .htm, .txt, .json formats
                  </p>
                </div>
              </div>

              {/* Extract/Sync Progress indicator bar */}
              {htmlUploadProgress && (
                <div className="p-4 bg-slate-950 border border-slate-905 rounded-xl space-y-2">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-400 font-sans flex items-center gap-1.5">
                      <GearAnimation /> {htmlUploadStatus}
                    </span>
                    <span className="text-emerald-400 font-mono font-bold">{htmlUploadProgress}%</span>
                  </div>
                  <div className="w-full bg-slate-900 h-2 rounded-full overflow-hidden animate-pulse">
                    <div
                      className="bg-emerald-500 h-full rounded-full transition-all duration-300"
                      style={{ width: `${htmlUploadProgress}%` }}
                    />
                  </div>
                </div>
              )}

              {/* HTML mock archives records */}
              {htmlTests.length > 0 && (
                <div className="pt-2">
                  <div className="flex items-center gap-1.5 mb-3">
                    <CheckCircle2 className="text-emerald-500" size={14} />
                    <span className="text-[10px] uppercase font-mono font-bold text-slate-400 tracking-wider">
                       Ingested mock tests history archives
                    </span>
                  </div>
                  <div className="border border-slate-900 rounded-xl overflow-hidden divide-y divide-slate-900 bg-slate-950/40">
                    {htmlTests.map((test, index) => (
                      <div key={test.id || index} className="px-4 py-3 flex items-center justify-between text-xs font-sans">
                        <div>
                          <p className="font-bold text-slate-300 truncate max-w-md">{test.name}</p>
                          <div className="flex gap-2 text-[10px] text-slate-500 mt-0.5 font-mono">
                            <span>Exam: {test.targetExam}</span>
                            <span>•</span>
                            <span>Uploaded: {new Date(test.uploadedAt).toLocaleDateString()}</span>
                          </div>
                        </div>
                        <span className="bg-emerald-500/10 text-emerald-400 font-mono px-2 py-0.5 text-[10px] font-bold rounded-md border border-emerald-500/10">
                          +{test.htmlContent?.match(/questions_parsed:\s*(\d+)/)?.[1] || "Parsed"} Questions
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 3. Manual MCQ Builder Tab */}
        {activeTab === "manual-builder" && (
          <div className="space-y-4 animate-fadeIn">
            <form onSubmit={handleBuildMCQ} className="bg-slate-900 border border-slate-900 p-5 rounded-2xl space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FilePlus className="text-orange-500" size={18} />
                  <h3 className="font-extrabold text-sm text-slate-200 font-sans">Manual Syllabus MCQ Draftsman</h3>
                </div>

                <button
                  type="button"
                  onClick={handleAIAutoFill}
                  disabled={isAutoFilling || !manualQuestion.trim()}
                  className="bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-400 border border-indigo-500/20 text-[10px] uppercase font-mono tracking-wider px-3.5 py-1.5 rounded-xl cursor-pointer hover:text-indigo-300 transition-all flex items-center gap-1.5 disabled:opacity-40"
                >
                  {isAutoFilling ? (
                    <>
                      <RefreshCw size={12} className="animate-spin" /> Drafting choices...
                    </>
                  ) : (
                    <>
                      <Sparkles size={12} /> AI Auto-fill MCQ Draft
                    </>
                  )}
                </button>
              </div>

              {/* Form Input fields */}
              <div className="space-y-4 font-sans text-xs">
                <div>
                  <label className="block text-[10px] uppercase font-mono font-bold text-slate-400 mb-1.5 tracking-wider">
                     Question statement prompt / topic phrase
                  </label>
                  <textarea
                    rows={2}
                    className="w-full bg-slate-950 border border-slate-900 focus:border-slate-800 rounded-xl px-4 py-2.5 text-slate-100 outline-none leading-relaxed"
                    placeholder="Enter the complete question prompt. Or draft a brief concept outline first and click AI Auto-fill."
                    value={manualQuestion}
                    onChange={(e) => setManualQuestion(e.target.value)}
                    required
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] uppercase font-mono font-bold text-slate-400 mb-1.5 tracking-wider">
                      Option A
                    </label>
                    <input
                      type="text"
                      className="w-full bg-slate-950 border border-slate-900 focus:border-slate-800 rounded-xl px-4 py-2 text-slate-100 outline-none"
                      placeholder="Choice text option A"
                      value={optA}
                      onChange={(e) => setOptA(e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase font-mono font-bold text-slate-400 mb-1.5 tracking-wider">
                      Option B
                    </label>
                    <input
                      type="text"
                      className="w-full bg-slate-950 border border-slate-900 focus:border-slate-800 rounded-xl px-4 py-2 text-slate-100 outline-none"
                      placeholder="Choice text option B"
                      value={optB}
                      onChange={(e) => setOptB(e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase font-mono font-bold text-slate-400 mb-1.5 tracking-wider">
                      Option C
                    </label>
                    <input
                      type="text"
                      className="w-full bg-slate-950 border border-slate-900 focus:border-slate-800 rounded-xl px-4 py-2 text-slate-100 outline-none"
                      placeholder="Choice text option C"
                      value={optC}
                      onChange={(e) => setOptC(e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase font-mono font-bold text-slate-400 mb-1.5 tracking-wider">
                      Option D
                    </label>
                    <input
                      type="text"
                      className="w-full bg-slate-950 border border-slate-900 focus:border-slate-800 rounded-xl px-4 py-2 text-slate-100 outline-none"
                      placeholder="Choice text option D"
                      value={optD}
                      onChange={(e) => setOptD(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-[10px] uppercase font-mono font-bold text-slate-400 mb-1.5 tracking-wider">
                      Correct Answer Key
                    </label>
                    <div className="flex gap-1.5">
                      {[0, 1, 2, 3].map((val) => (
                        <button
                          key={val}
                          type="button"
                          onClick={() => setCorrectIdx(val)}
                          className={`flex-1 py-1.5 text-center leading-none rounded-lg text-xs font-bold font-mono transition-all border ${
                            correctIdx === val
                              ? "bg-orange-500 border-orange-400 text-white"
                              : "bg-slate-950 border-slate-900 text-slate-400 hover:text-slate-200"
                          }`}
                        >
                          {String.fromCharCode(65 + val)}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] uppercase font-mono font-bold text-slate-400 mb-1.5 tracking-wider">
                       Difficulty Standard
                    </label>
                    <select
                      className="w-full bg-slate-950 border border-slate-900 rounded-xl px-3 py-2 text-slate-300 cursor-pointer outline-none font-bold"
                      value={difficulty}
                      onChange={(e) => setDifficulty(e.target.value as any)}
                    >
                      <option value="easy">Easy</option>
                      <option value="medium">Medium</option>
                      <option value="hard">Hard</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] uppercase font-mono font-bold text-slate-400 mb-1.5 tracking-wider">
                      Target Placement Exam
                    </label>
                    <select
                      className="w-full bg-slate-950 border border-slate-900 rounded-xl px-3 py-2 text-slate-300 cursor-pointer outline-none font-bold"
                      value={targetExam || activeExam}
                      onChange={(e) => setTargetExam(e.target.value)}
                    >
                      {exams.map((e: any) => (
                        <option key={e.id || e.name} value={e.name}>{e.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
                  <div>
                    <label className="block text-[10px] uppercase font-mono font-bold text-slate-400 mb-1.5 tracking-wider">
                       Subject/Domain Focus
                    </label>
                    <input
                      type="text"
                      className="w-full bg-slate-950 border border-slate-900 rounded-xl px-4 py-2 text-slate-200 outline-none"
                      placeholder="e.g., Indian Polity"
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase font-mono font-bold text-slate-400 mb-1.5 tracking-wider">
                       Topic Core Reference
                    </label>
                    <input
                      type="text"
                      className="w-full bg-slate-950 border border-slate-900 rounded-xl px-4 py-2 text-slate-200 outline-none"
                      placeholder="e.g., Fundamental Rights"
                      value={topic}
                      onChange={(e) => setTopic(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase font-mono font-bold text-slate-400 mb-1.5 tracking-wider">
                       Subtopic Detailed Tag
                    </label>
                    <input
                      type="text"
                      className="w-full bg-slate-950 border border-slate-900 rounded-xl px-4 py-2 text-slate-200 outline-none"
                      placeholder="e.g., Article 14-16"
                      value={subtopic}
                      onChange={(e) => setSubtopic(e.target.value)}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] uppercase font-mono font-bold text-slate-400 mb-1.5 tracking-wider">
                     Pedagogical rationale explanation
                  </label>
                  <textarea
                    rows={2}
                    className="w-full bg-slate-950 border border-slate-900 focus:border-slate-800 rounded-xl px-4 py-2 text-slate-100 outline-none leading-relaxed"
                    placeholder="Provide a professional explanation explaining why the correct answer is correct based on academic sources..."
                    value={explanation}
                    onChange={(e) => setExplanation(e.target.value)}
                  />
                </div>

                <div className="pt-2 border-t border-slate-800 flex justify-end">
                  <button
                    type="submit"
                    className="bg-orange-600 hover:bg-orange-500 active:scale-95 text-white text-xs font-bold py-2.5 px-6 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 shadow-md shadow-orange-600/10"
                  >
                    <Plus size={14} /> Commit MCQ to Database
                  </button>
                </div>
              </div>
            </form>
          </div>
        )}

        {/* 4. Database Manager Tab */}
        {activeTab === "database" && (
          <div className="space-y-4 animate-fadeIn">
            
            {/* Database controls bar */}
            <div className="bg-slate-900 border border-slate-900 p-5 rounded-2xl space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Database className="text-orange-500" size={18} />
                  <h3 className="font-extrabold text-sm text-slate-200 font-sans">Interactive Database Manager panel</h3>
                </div>
                <div className="text-[10px] font-mono text-slate-500">
                  Total Questions: <span className="text-slate-300 font-bold">{questions.length}</span>
                </div>
              </div>

              {/* Grid actions */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                <button
                  type="button"
                  onClick={handleExportDatabase}
                  className="bg-slate-950 border border-slate-800 hover:bg-slate-900 hover:border-slate-700 text-slate-300 text-xs px-4 py-3 rounded-xl transition-all font-bold cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <Download size={14} className="text-slate-400" /> Export Database
                </button>

                <button
                  type="button"
                  onClick={() => fileImportRef.current?.click()}
                  className="bg-slate-950 border border-slate-800 hover:bg-slate-900 hover:border-slate-700 text-slate-300 text-xs px-4 py-3 rounded-xl transition-all font-bold cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <Upload size={14} className="text-slate-400" /> Import JSON Backup
                  <input
                    type="file"
                    accept=".json"
                    ref={fileImportRef}
                    onChange={handleImportDatabase}
                    className="hidden"
                  />
                </button>

                <button
                  type="button"
                  onClick={handleDeduplicate}
                  className="bg-slate-950 border border-slate-800 hover:bg-slate-900 hover:border-slate-705 text-indigo-400 text-xs px-4 py-3 rounded-xl transition-all font-bold cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <RefreshCw size={14} className="text-indigo-400" /> Deduplicate (Jaccard)
                </button>

                <button
                  type="button"
                  onClick={handleAutoClassifySubjects}
                  disabled={isClassifying}
                  className="bg-slate-950 border border-indigo-950/40 hover:bg-slate-900 border-indigo-500/20 text-indigo-400 text-xs px-4 py-3 rounded-xl transition-all font-bold cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  {isClassifying ? (
                    <RefreshCw size={14} className="animate-spin text-indigo-400" />
                  ) : (
                    <Sparkles size={14} className="text-indigo-400" />
                  )}
                  {isClassifying ? "Classifying..." : "Auto-Classify Subjects"}
                </button>

                <button
                  type="button"
                  onClick={handleClearAllAddedQuestions}
                  className="bg-rose-950/10 border border-rose-950/40 hover:bg-rose-950/20 text-rose-400 text-xs px-4 py-3 rounded-xl transition-all font-semibold cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <Trash2 size={13} className="text-rose-400" /> Wipe Generated MCQs
                </button>
              </div>

              {/* Danger zone fully wipe */}
              <div className="pt-2 border-t border-slate-850 flex items-center justify-between">
                <span className="text-[10px] text-slate-500 font-medium leading-normal flex items-center gap-1 shrink-0">
                  <AlertCircle size={12} className="text-rose-500 shrink-0" /> Full erase is non-reversible. Verify backups first!
                </span>
                <button
                  type="button"
                  onClick={handleClearEverythingCheck}
                  className="text-rose-500 hover:text-white hover:bg-rose-600 px-3 py-1 bg-slate-950 border border-rose-950/40 rounded-xl text-[10px] uppercase font-mono cursor-pointer transition-all"
                >
                  Wipe entire DB baseline
                </button>
              </div>
            </div>

            {/* Questions viewer list & search container */}
            <div className="bg-slate-900 border border-slate-900 p-5 rounded-2xl space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <span className="text-[10px] font-mono uppercase tracking-wider font-bold text-indigo-400 flex items-center gap-1.5">
                   Database Questions index browser
                </span>
                
                {/* Search box input */}
                <div className="relative w-full sm:w-80">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-500">
                    <Search size={14} />
                  </span>
                  <input
                    type="text"
                    className="w-full bg-slate-950 border border-slate-850 pl-9 pr-4 py-2 text-xs rounded-xl text-slate-100 outline-none placeholder-slate-500"
                    placeholder="Search query text, explanation, or topic..."
                    value={dbSearch}
                    onChange={(e) => setDbSearch(e.target.value)}
                  />
                </div>
              </div>

              {/* Questions table list */}
              {filteredQuestions.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-500 border border-dashed border-slate-800 rounded-xl">
                  No matching questions discovered in the database core pools.
                </div>
              ) : (
                <div className="space-y-3.5 max-h-[500px] overflow-y-auto scrollbar-thin divide-y divide-slate-850 font-sans">
                  {filteredQuestions.slice(0, 150).map((q, idx) => (
                    <div key={q.id || idx} className="pt-3.5 first:pt-0 pb-1 flex flex-col md:flex-row md:items-start justify-between gap-4 text-xs font-sans">
                      <div className="space-y-1.5 flex-1 pr-4">
                        <div className="flex flex-wrap items-center gap-2 text-[9px] font-mono leading-none">
                          <span className="bg-slate-950 text-orange-400 border border-slate-850 px-1.5 py-0.5 rounded-md uppercase font-bold">
                            {q.id.split("-")[0] || "Baseline"}
                          </span>
                          <span className="bg-slate-950 text-indigo-400 border border-slate-850 px-1.5 py-0.5 rounded-md font-bold text-[8px] truncate max-w-[120px]">
                            Tag: {q.topic}
                          </span>
                          <span className="bg-slate-950 text-slate-400 border border-slate-850 px-1.5 py-0.5 rounded-md font-bold">
                            Diff: {q.difficulty?.toUpperCase() || "MED"}
                          </span>
                          <span className="text-slate-500 font-bold truncate max-w-[150px]">
                            Exam: {q.targetExam}
                          </span>
                        </div>
                        
                        <p className="font-extrabold text-slate-200 leading-relaxed md:text-xs text-sm">
                          <HTMLSafeContent content={q.question} />
                        </p>
                        
                        {/* Options block lists */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2 pt-1 font-sans">
                          {q.options.map((opt, oIdx) => (
                            <div
                              key={oIdx}
                              onClick={() => handleUpdateOptionIndex(q.id, oIdx)}
                              className={`px-3 py-2 border rounded-xl text-left truncate cursor-pointer transition-all ${
                                q.correctOptionIndex === oIdx
                                  ? "bg-slate-950/80 border-orange-500/30 text-orange-400 font-semibold"
                                  : "bg-slate-950/30 border-slate-850 hover:border-slate-800 text-slate-400 hover:text-slate-200"
                              }`}
                            >
                              <span className="font-mono font-bold text-[10px] mr-1.5 bg-slate-900 border border-slate-800 px-1 rounded-md text-slate-500">
                                {String.fromCharCode(65 + oIdx)}
                              </span>
                              <HTMLSafeContent content={opt} className="inline-block truncate max-w-[90%]" />
                            </div>
                          ))}
                        </div>

                        {q.explanation && (
                          <div className="mt-3 p-3 bg-slate-955 border border-slate-900 rounded-xl leading-relaxed text-slate-400">
                            <span className="text-[9px] uppercase font-mono font-bold block text-slate-500 mb-1">Pedagogical rationale explanation</span>
                            <HTMLSafeContent content={q.explanation} />
                          </div>
                        )}
                      </div>

                      <div className="self-end md:self-start">
                        <button
                          type="button"
                          onClick={() => handleDeleteSingleQuestion(q.id)}
                          className="p-2 border border-rose-950/20 bg-rose-950/5 hover:bg-rose-900 text-rose-400 hover:text-white rounded-lg transition-all cursor-pointer font-sans"
                          title="Delete question permanently"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  ))}
                  {filteredQuestions.length > 150 && (
                    <p className="text-[10px] font-mono text-slate-500 text-center pt-3 border-t border-slate-850">
                       Discovered {filteredQuestions.length} matching rows. Truncating viewer to top 150 matching questions.
                    </p>
                  )}
                </div>
              )}
            </div>

          </div>
        )}

      </div>

    </div>
  );
}

// Gear rendering assist animation loops
function GearAnimation() {
  return (
    <span className="inline-block relative w-3 h-3 text-indigo-400">
      <RefreshCw size={12} className="animate-spin absolute inset-0" />
    </span>
  );
}
