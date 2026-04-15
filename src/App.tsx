/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Play, 
  RotateCcw, 
  BarChart3, 
  Settings as SettingsIcon, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Brain,
  ChevronRight,
  Info,
  Download,
  History as HistoryIcon,
  Trash2,
  TrendingUp,
  Mic,
  MicOff,
  LayoutDashboard
} from 'lucide-react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  AreaChart,
  Area,
  ScatterChart,
  Scatter,
  ZAxis,
  BarChart,
  Bar,
  Legend,
  Cell
} from 'recharts';
import { COMMON_WORDS_EN, COMMON_WORDS_CN, CATEGORIZED_WORDS_EN, CATEGORIZED_WORDS_CN, ExperimentState, TrialSettings, TrialResult, ExperimentMode, ExperimentLanguage, SessionRecord, ListType, DistractorMode } from './constants';
import { GoogleGenAI, Type } from "@google/genai";
import { MemoryNetwork } from './components/MemoryNetwork';
import { MemorySankey } from './components/MemorySankey';
import { MemoryChord } from './components/MemoryChord';

// --- Gemini Setup ---
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const hasValidGeminiKey = !!process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY';

function createSessionId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `session_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

// --- Components ---

const Header = () => (
  <header className="border-b border-zinc-800 pb-4 mb-8 flex items-center justify-between">
    <div className="flex items-center gap-3">
      <div className="w-10 h-10 bg-zinc-900 flex items-center justify-center rounded border border-zinc-700">
        <Brain className="text-zinc-100" size={24} />
      </div>
      <div>
        <h1 className="text-xl font-bold tracking-tight text-zinc-900 uppercase">自由回忆实验室</h1>
        <p className="text-xs font-mono text-zinc-500 uppercase tracking-widest">认知心理学实验 v1.1</p>
      </div>
    </div>
    <div className="flex items-center gap-4 text-[10px] font-mono text-zinc-400 uppercase tracking-tighter">
      <span>状态：运行中</span>
      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
    </div>
  </header>
);

const Card = ({ children, className = "", ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={`bg-white border border-zinc-200 rounded-lg shadow-sm overflow-hidden ${className}`} {...props}>
    {children}
  </div>
);

const CollapsibleSection = ({ 
  title, 
  icon: Icon, 
  children, 
  isOpen, 
  onToggle 
}: { 
  title: string; 
  icon: any; 
  children: React.ReactNode; 
  isOpen: boolean; 
  onToggle: () => void;
}) => (
  <div className="border-b border-zinc-100 last:border-0">
    <button 
      onClick={onToggle}
      className="w-full flex items-center justify-between p-4 hover:bg-zinc-50 transition-colors group"
    >
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-lg transition-colors ${isOpen ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-500 group-hover:bg-zinc-200'}`}>
          <Icon size={18} />
        </div>
        <span className={`text-sm font-bold transition-colors ${isOpen ? 'text-zinc-900' : 'text-zinc-500'}`}>{title}</span>
      </div>
      <ChevronRight 
        size={18} 
        className={`text-zinc-400 transition-transform duration-300 ${isOpen ? 'rotate-90' : ''}`} 
      />
    </button>
    <AnimatePresence initial={false}>
      {isOpen && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.3, ease: "easeInOut" }}
          className="overflow-hidden"
        >
          <div className="p-4 pt-0 space-y-6">
            {children}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  </div>
);

// --- Main App ---

export default function App() {
  const canUseLocalStorage = useMemo(() => {
    try {
      const testKey = '__free_memory_storage_test__';
      localStorage.setItem(testKey, '1');
      localStorage.removeItem(testKey);
      return true;
    } catch {
      return false;
    }
  }, []);

  const [state, setState] = useState<ExperimentState>('IDLE');
  const [settings, setSettings] = useState<TrialSettings>({
    wordCount: 15,
    intervalMs: 1500,
    stayDurationMs: 1000,
    delaySeconds: 0,
    mode: 'RECALL',
    language: 'CN',
    useAI: hasValidGeminiKey,
    listType: 'RANDOM',
    distractorMode: 'NONE'
  });
  
  const [currentTrial, setCurrentTrial] = useState<TrialResult | null>(null);
  const [currentWordIndex, setCurrentWordIndex] = useState(-1);
  const [delayCountdown, setDelayCountdown] = useState(0);
  const [recallInput, setRecallInput] = useState("");
  const [selectedWords, setSelectedWords] = useState<string[]>([]);
  const [interferenceNumber, setInterferenceNumber] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [history, setHistory] = useState<SessionRecord[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [isSubDelay, setIsSubDelay] = useState(false);
  const [expandedSections, setExpandedSections] = useState<string[]>(['params']);
  const [isListening, setIsListening] = useState(false);
  const [isWordVisible, setIsWordVisible] = useState(false);
  const [confidenceRatings, setConfidenceRatings] = useState<number[]>([]);
  const recognitionRef = useRef<any>(null);

  // --- Persistence ---
  useEffect(() => {
    if (!canUseLocalStorage) return;

    try {
      const saved = localStorage.getItem('experiment_history');
      if (saved) {
        setHistory(JSON.parse(saved));
      }
    } catch (e) {
      console.error("Failed to load history", e);
    }
  }, [canUseLocalStorage]);

  useEffect(() => {
    if (!canUseLocalStorage) return;

    try {
      localStorage.setItem('experiment_history', JSON.stringify(history));
    } catch (e) {
      console.error("Failed to persist history", e);
    }
  }, [history, canUseLocalStorage]);

  // --- Logic ---

  const generateWordsWithAI = async (count: number, lang: ExperimentLanguage, listType: ListType = 'RANDOM') => {
    let prompt = "";
    if (listType === 'RANDOM') {
      prompt = lang === 'EN' 
        ? `Generate a list of ${count} common English nouns for a memory experiment. Ensure they are distinct, concrete, and easy to visualize. Return as a JSON array of strings.`
        : `生成 ${count} 个常用的中文名词用于记忆实验。确保这些词语具体、易于想象且互不相同。以 JSON 字符串数组的形式返回。`;
    } else if (listType === 'CATEGORIZED') {
      prompt = lang === 'EN'
        ? `Generate a list of ${count} English nouns for a memory experiment. The words MUST come from exactly 3-4 distinct semantic categories (e.g., Animals, Tools, Fruits). Return as a JSON object where keys are category names and values are arrays of words. Total words must be ${count}.`
        : `生成 ${count} 个中文名词用于记忆实验。单词必须来自 3-4 个不同的语义范畴（例如：动物、工具、水果）。以 JSON 对象形式返回，键为范畴名称，值为单词数组。总单词数必须为 ${count}。`;
    } else if (listType === 'DRM') {
      prompt = lang === 'EN'
        ? `Generate a list of ${count} English nouns for a DRM (Deese-Roediger-McDermott) false memory experiment. 
           1. Choose 2-3 "critical lures" (words that will NOT be presented, e.g., "Sleep", "Sweet").
           2. For each lure, generate 5-7 highly associated words (e.g., for "Sleep": bed, rest, awake, tired, dream).
           3. Total presented words must be ${count}.
           Return as a JSON object: { "criticalLures": ["Lure1", "Lure2"], "presentedWords": ["Word1", "Word2", ...], "categories": ["Cat1", "Cat1", ...] }`
        : `为 DRM (错误记忆) 实验生成 ${count} 个中文名词。
           1. 选择 2-3 个“核心诱饵”词（这些词不会被呈现，例如：“睡眠”、“甜”）。
           2. 为每个诱饵词生成 5-7 个高度相关的词（例如：“睡眠”的相关词：床、休息、清醒、疲倦、做梦）。
           3. 总呈现单词数必须为 ${count}。
           以 JSON 对象形式返回：{ "criticalLures": ["诱饵1", "诱饵2"], "presentedWords": ["词1", "词2", ...], "categories": ["范畴1", "范畴1", ...] }`;
    }

    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: listType === 'RANDOM' 
            ? { type: Type.ARRAY, items: { type: Type.STRING } }
            : { 
                type: Type.OBJECT, 
                additionalProperties: { type: Type.ARRAY, items: { type: Type.STRING } } 
              }
        }
      });

      const data = JSON.parse(response.text || (listType === 'RANDOM' ? "[]" : "{}"));
      
      if (listType === 'RANDOM') {
        const words = data as string[];
        return { words: words.length >= count ? words.slice(0, count) : [...words, ...COMMON_WORDS_EN.slice(0, count - words.length)], categories: [] };
      } else if (listType === 'CATEGORIZED') {
        const catMap = data as Record<string, string[]>;
        const words: string[] = [];
        const categories: string[] = [];
        Object.entries(catMap).forEach(([cat, catWords]) => {
          catWords.forEach(w => {
            words.push(w);
            categories.push(cat);
          });
        });
        return { words: words.slice(0, count), categories: categories.slice(0, count) };
      } else {
        // DRM
        return { 
          words: data.presentedWords.slice(0, count), 
          categories: data.categories.slice(0, count),
          criticalLures: data.criticalLures 
        };
      }
    } catch (error) {
      console.error("AI Generation failed:", error);
      const fallback = lang === 'EN' ? COMMON_WORDS_EN : COMMON_WORDS_CN;
      const shuffled = [...fallback].sort(() => 0.5 - Math.random()).slice(0, count);
      return { words: shuffled, categories: [] };
    }
  };

  const startExperiment = async () => {
    setIsGenerating(true);
    let selected: string[] = [];
    let categories: string[] = [];
    let allPool: string[] = [];
    let criticalLures: string[] = [];

    if (settings.useAI && hasValidGeminiKey) {
      const result = await generateWordsWithAI(settings.wordCount, settings.language, settings.listType);
      selected = result.words;
      categories = result.categories;
      criticalLures = (result as any).criticalLures || [];
      allPool = selected;
    } else {
      if (settings.listType === 'DRM') {
        // Fallback for DRM if AI fails or not used
        criticalLures = settings.language === 'EN' ? ["Sleep", "Sweet"] : ["睡眠", "甜"];
        const drmPool: Record<string, string[]> = settings.language === 'EN' ? {
          "Sleep": ["Bed", "Rest", "Awake", "Tired", "Dream", "Night", "Blanket", "Snore"],
          "Sweet": ["Sugar", "Candy", "Sour", "Honey", "Soda", "Chocolate", "Heart", "Cake"]
        } : {
          "睡眠": ["床", "休息", "清醒", "疲倦", "做梦", "夜晚", "毯子", "打鼾"],
          "甜": ["糖", "糖果", "酸", "蜂蜜", "苏打", "巧克力", "心脏", "蛋糕"]
        };
        
        criticalLures.forEach(lure => {
          const words = drmPool[lure].slice(0, Math.floor(settings.wordCount / criticalLures.length));
          words.forEach(w => {
            selected.push(w);
            categories.push(lure);
          });
        });
        allPool = selected;
      } else if (settings.listType === 'CATEGORIZED') {
        const source = settings.language === 'EN' ? CATEGORIZED_WORDS_EN : CATEGORIZED_WORDS_CN;
        const catKeys = Object.keys(source).sort(() => 0.5 - Math.random()).slice(0, 3);
        const wordsPerCat = Math.floor(settings.wordCount / catKeys.length);
        
        catKeys.forEach(cat => {
          const catWords = [...source[cat]].sort(() => 0.5 - Math.random()).slice(0, wordsPerCat);
          catWords.forEach(w => {
            selected.push(w);
            categories.push(cat);
          });
        });
        
        // Fill remaining if any
        if (selected.length < settings.wordCount) {
          const extraCat = catKeys[0];
          const extraWords = source[extraCat].filter(w => !selected.includes(w)).slice(0, settings.wordCount - selected.length);
          extraWords.forEach(w => {
            selected.push(w);
            categories.push(extraCat);
          });
        }
        
        // Shuffle the presentation order but keep track of categories
        const combined = selected.map((w, i) => ({ word: w, cat: categories[i] }));
        combined.sort(() => 0.5 - Math.random());
        selected = combined.map(c => c.word);
        categories = combined.map(c => c.cat);
        allPool = selected;
      } else {
        const wordList = settings.language === 'EN' ? COMMON_WORDS_EN : COMMON_WORDS_CN;
        const shuffled = [...wordList].sort(() => 0.5 - Math.random());
        selected = shuffled.slice(0, settings.wordCount);
        allPool = shuffled;
      }
    }
    
    // For recognition, pick distractors
    let recognitionOptions: string[] = [];
    if (settings.mode === 'RECOGNITION') {
      if (settings.useAI && hasValidGeminiKey) {
        const distractorsResult = await generateWordsWithAI(Math.max(20, settings.wordCount * 2), settings.language, 'RANDOM');
        recognitionOptions = [...selected, ...distractorsResult.words].sort(() => 0.5 - Math.random());
      } else {
        const remaining = allPool.filter(w => !selected.includes(w));
        const distractors = remaining.slice(0, Math.max(20, settings.wordCount * 2));
        recognitionOptions = [...selected, ...distractors].sort(() => 0.5 - Math.random());
      }
    }
    
    setCurrentTrial({
      presentedWords: selected,
      recalledWords: [],
      recallSuccess: new Array(selected.length).fill(false),
      recognitionOptions,
      selectedWords: [],
      wordCategories: categories.length > 0 ? categories : undefined,
      criticalLures: criticalLures.length > 0 ? criticalLures : undefined
    });
    
    setIsGenerating(false);
    setState('PRESENTING');
    setCurrentWordIndex(0);
  };

  // Presentation Loop
  useEffect(() => {
    if (state === 'PRESENTING' && currentTrial) {
      if (currentWordIndex < settings.wordCount) {
        setIsWordVisible(true);

        const hideTimer = setTimeout(() => {
          setIsWordVisible(false);
        }, settings.stayDurationMs);

        const nextTimer = setTimeout(() => {
          if (settings.distractorMode === 'CONTINUOUS' && settings.delaySeconds > 0) {
            setIsSubDelay(true);
            setDelayCountdown(settings.delaySeconds);
            setInterferenceNumber(Math.floor(Math.random() * 900) + 100);
          } else {
            setCurrentWordIndex(prev => prev + 1);
          }
        }, settings.intervalMs);

        return () => {
          clearTimeout(hideTimer);
          clearTimeout(nextTimer);
        };
      } else {
        if (settings.distractorMode === 'END' && settings.delaySeconds > 0) {
          setState('DELAY');
          setDelayCountdown(settings.delaySeconds);
          setInterferenceNumber(Math.floor(Math.random() * 900) + 100);
        } else {
          setState(settings.mode === 'RECALL' ? 'RECALLING' : 'RECOGNIZING');
        }
      }
    }
  }, [state, currentWordIndex, settings, currentTrial]);

  // Sub-Delay Loop (for Continuous Distractor)
  useEffect(() => {
    if (isSubDelay && delayCountdown > 0) {
      const timer = setTimeout(() => {
        setDelayCountdown(prev => prev - 1);
      }, 1000);
      return () => clearTimeout(timer);
    } else if (isSubDelay && delayCountdown === 0) {
      setIsSubDelay(false);
      setCurrentWordIndex(prev => prev + 1);
    }
  }, [isSubDelay, delayCountdown]);

  // Delay Loop
  useEffect(() => {
    if (state === 'DELAY' && delayCountdown > 0) {
      const timer = setTimeout(() => {
        setDelayCountdown(prev => prev - 1);
      }, 1000);
      return () => clearTimeout(timer);
    } else if (state === 'DELAY' && delayCountdown === 0) {
      setState(settings.mode === 'RECALL' ? 'RECALLING' : 'RECOGNIZING');
    }
  }, [state, delayCountdown, settings.mode]);

  const finishRecall = () => {
    stopListening();
    if (!currentTrial) return;
    
    // Process recalled words
    const inputWords = recallInput
      .split(/[\s,，、]+/)
      .map(w => w.trim().toLowerCase())
      .filter(w => w.length > 0);
    
    const success = currentTrial.presentedWords.map(presented => 
      inputWords.includes(presented.toLowerCase())
    );

    // Detect false memories and critical lures
    const falseMemories = inputWords.filter(w => 
      !currentTrial.presentedWords.map(p => p.toLowerCase()).includes(w.toLowerCase())
    );
    
    // Track recall order
    const recallOrder: number[] = [];
    const seen = new Set<string>();
    inputWords.forEach(word => {
      if (!seen.has(word)) {
        const index = currentTrial.presentedWords.findIndex(p => p.toLowerCase() === word.toLowerCase());
        if (index !== -1) {
          recallOrder.push(index);
          seen.add(word);
        }
      }
    });
    
    const result: TrialResult = {
      ...currentTrial,
      recalledWords: inputWords,
      recallSuccess: success,
      recallOrder,
      falseMemories
    };
    
    setCurrentTrial(result);
    setConfidenceRatings(new Array(inputWords.length).fill(80)); // Default 80%
    setState('CONFIDENCE_RATING');
  };

  const finishRecognition = () => {
    if (!currentTrial) return;
    
    const success = currentTrial.presentedWords.map(presented => 
      selectedWords.includes(presented)
    );
    
    const recallOrder = selectedWords
      .map(word => currentTrial.presentedWords.indexOf(word))
      .filter(index => index !== -1);
    
    const result: TrialResult = {
      ...currentTrial,
      selectedWords,
      recallSuccess: success,
      recallOrder
    };
    
    setCurrentTrial(result);
    setConfidenceRatings(new Array(selectedWords.length).fill(80));
    setState('CONFIDENCE_RATING');
  };

  const submitConfidenceScores = () => {
    if (!currentTrial) return;

    const result: TrialResult = {
      ...currentTrial,
      confidenceScores: confidenceRatings
    };

    setCurrentTrial(result);

    // Save to history
    const record: SessionRecord = {
      id: createSessionId(),
      timestamp: Date.now(),
      settings,
      result
    };
    setHistory(prev => [record, ...prev]);
    
    setState('RESULTS');
  };

  const toggleWordSelection = (word: string) => {
    setSelectedWords(prev => 
      prev.includes(word) ? prev.filter(w => w !== word) : [...prev, word]
    );
  };

  const startListening = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("您的浏览器不支持语音识别。");
      return;
    }

    if (!recognitionRef.current) {
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = true;
      recognitionRef.current.interimResults = true;
      recognitionRef.current.lang = settings.language === 'EN' ? 'en-US' : 'zh-CN';

      recognitionRef.current.onresult = (event: any) => {
        let interimTranscript = '';
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          } else {
            interimTranscript += event.results[i][0].transcript;
          }
        }

        if (finalTranscript) {
          setRecallInput(prev => {
            const separator = prev.trim() ? (settings.language === 'EN' ? ' ' : '，') : '';
            return prev + separator + finalTranscript;
          });
        }
      };

      recognitionRef.current.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current.onerror = (event: any) => {
        console.error("Speech recognition error", event.error);
        setIsListening(false);
      };
    }

    recognitionRef.current.start();
    setIsListening(true);
  };

  const stopListening = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
    }
  };

  const reset = () => {
    stopListening();
    setState('IDLE');
    setCurrentTrial(null);
    setCurrentWordIndex(-1);
    setRecallInput("");
    setSelectedWords([]);
    setConfidenceRatings([]);
    setIsWordVisible(false);
  };

  // --- Render Helpers ---


  const renderStats = () => {
    if (history.length === 0) {
      return (
        <Card className="p-12 text-center text-zinc-400">
          <LayoutDashboard size={48} className="mx-auto mb-4 opacity-20" />
          <p>暂无数据进行统计分析</p>
        </Card>
      );
    }

    // 1. Language Comparison
    const langStats = (['CN', 'EN'] as const).map(lang => {
      const sessions = history.filter(h => h.settings.language === lang);
      if (sessions.length === 0) return null;
      const avgAcc = sessions.reduce((acc, s) => {
        const correct = s.result.recallSuccess.filter(Boolean).length;
        return acc + (correct / s.settings.wordCount);
      }, 0) / sessions.length;
      return { name: lang === 'CN' ? '中文 (母语)' : '英文 (非母语)', accuracy: avgAcc * 100 };
    }).filter((item): item is { name: string; accuracy: number } => item !== null);

    // 2. Distractor Mode Comparison
    const distractorStats = (['NONE', 'END', 'CONTINUOUS'] as const).map(mode => {
      const sessions = history.filter(h => h.settings.distractorMode === mode);
      if (sessions.length === 0) return null;
      
      const avgAcc = sessions.reduce((acc, s) => {
        const correct = s.result.recallSuccess.filter(Boolean).length;
        return acc + (correct / s.settings.wordCount);
      }, 0) / sessions.length;

      const avgRecency = sessions.reduce((acc, s) => {
        const last3 = s.result.recallSuccess.slice(-3);
        const correct = last3.filter(Boolean).length;
        return acc + (correct / 3);
      }, 0) / sessions.length;

      return { 
        name: mode === 'NONE' ? '无干扰' : mode === 'END' ? '末尾干扰' : '连续干扰', 
        accuracy: avgAcc * 100,
        recency: avgRecency * 100
      };
    }).filter((item): item is { name: string; accuracy: number; recency: number } => item !== null);

    // 3. List Type Comparison
    const listTypeStats = (['RANDOM', 'CATEGORIZED'] as const).map(type => {
      const sessions = history.filter(h => h.settings.listType === type);
      if (sessions.length === 0) return null;

      const avgAcc = sessions.reduce((acc, s) => {
        const correct = s.result.recallSuccess.filter(Boolean).length;
        return acc + (correct / s.settings.wordCount);
      }, 0) / sessions.length;

      const avgClustering = sessions.reduce((acc, s) => {
        if (!s.result.wordCategories || !s.result.recallOrder || s.result.recallOrder.length <= 1) return acc;
        let repetitions = 0;
        const recalledCats = s.result.recallOrder.map(idx => s.result.wordCategories![idx]);
        for (let i = 1; i < recalledCats.length; i++) {
          if (recalledCats[i] === recalledCats[i-1]) repetitions++;
        }
        const uniqueCats = new Set(recalledCats).size;
        const maxPossibleReps = recalledCats.length - uniqueCats;
        const ratio = maxPossibleReps > 0 ? (repetitions / maxPossibleReps) : 0;
        return acc + ratio;
      }, 0) / sessions.length;

      return { 
        name: type === 'RANDOM' ? '随机词表' : '范畴词表', 
        accuracy: avgAcc * 100,
        clustering: avgClustering * 100
      };
    }).filter((item): item is { name: string; accuracy: number; clustering: number } => item !== null);

    return (
      <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Language Comparison */}
          <Card className="p-6">
            <h3 className="text-sm font-bold text-zinc-900 mb-6 flex items-center gap-2">
              <Brain size={16} className="text-emerald-500" />
              语言背景对比 (母语 vs 非母语)
            </h3>
            <div className="h-[250px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={langStats}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#a1a1aa' }} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: '#a1a1aa' }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} />
                  <Tooltip 
                    cursor={{ fill: '#f8f8f8' }}
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                  />
                  <Bar dataKey="accuracy" name="平均正确率" radius={[4, 4, 0, 0]}>
                    {langStats.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={index === 0 ? '#10b981' : '#3b82f6'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* List Type Comparison */}
          <Card className="p-6">
            <h3 className="text-sm font-bold text-zinc-900 mb-6 flex items-center gap-2">
              <TrendingUp size={16} className="text-purple-500" />
              词表结构对比 (随机 vs 范畴)
            </h3>
            <div className="h-[250px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={listTypeStats}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#a1a1aa' }} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: '#a1a1aa' }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} />
                  <Tooltip 
                    cursor={{ fill: '#f8f8f8' }}
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                  />
                  <Legend verticalAlign="top" align="right" iconType="circle" wrapperStyle={{ fontSize: '10px', paddingBottom: '20px' }} />
                  <Bar dataKey="accuracy" name="平均正确率" fill="#18181b" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="clustering" name="群集率" fill="#a1a1aa" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>

        {/* Distractor Mode Comparison */}
        <Card className="p-6">
          <h3 className="text-sm font-bold text-zinc-900 mb-6 flex items-center gap-2">
            <Clock size={16} className="text-amber-500" />
            干扰范式对比 (对近因效应的影响)
          </h3>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={distractorStats} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#a1a1aa' }} axisLine={false} tickLine={false} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: '#a1a1aa' }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} />
                <Tooltip 
                  cursor={{ fill: '#f8f8f8' }}
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                />
                <Legend verticalAlign="top" align="right" iconType="circle" wrapperStyle={{ fontSize: '10px', paddingBottom: '20px' }} />
                <Bar dataKey="accuracy" name="总平均正确率" fill="#18181b" radius={[4, 4, 0, 0]} />
                <Bar dataKey="recency" name="近因指数 (末尾3词正确率)" fill="#f59e0b" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-6 text-[11px] text-zinc-500 leading-relaxed bg-zinc-50 p-4 rounded-lg">
            <strong>实验结论参考：</strong> 典型的实验结果显示，“末尾干扰”会显著降低“近因指数”，因为干扰任务清空了短时记忆。而“连续干扰”下，近因效应往往会重新出现，这支持了基于时间线索的提取理论。
          </p>
        </Card>
      </div>
    );
  };

  const renderIdle = () => {
    // Calculate cumulative serial position data
    const cumulativeData: { position: number, accuracy: number, count: number }[] = [];
    if (history.length > 0) {
      history.forEach(session => {
        session.result.recallSuccess.forEach((success, index) => {
          const pos = index + 1;
          let entry = cumulativeData.find(d => d.position === pos);
          if (!entry) {
            entry = { position: pos, accuracy: 0, count: 0 };
            cumulativeData.push(entry);
          }
          entry.count++;
          if (success) entry.accuracy++;
        });
      });
      cumulativeData.sort((a, b) => a.position - b.position);
      cumulativeData.forEach(d => {
        d.accuracy = (d.accuracy / d.count) * 100;
      });
    }

    return (
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-4xl mx-auto space-y-6"
      >
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-2xl font-bold text-zinc-900">实验配置</h2>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => {
                setShowStats(!showStats);
                if (showHistory) setShowHistory(false);
              }}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${showStats ? 'bg-zinc-900 text-white' : 'bg-white border border-zinc-200 text-zinc-600 hover:bg-zinc-50'}`}
            >
              <LayoutDashboard size={16} />
              {showStats ? '返回配置' : '统计中心'}
            </button>
            <button 
              onClick={() => {
                setShowHistory(!showHistory);
                if (showStats) setShowStats(false);
              }}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${showHistory ? 'bg-zinc-900 text-white' : 'bg-white border border-zinc-200 text-zinc-600 hover:bg-zinc-50'}`}
            >
              <HistoryIcon size={16} />
              {showHistory ? '返回配置' : '查看历史记录'}
            </button>
          </div>
        </div>

        {showStats ? renderStats() : showHistory ? (
          <div className="space-y-6">
            {history.length === 0 ? (
              <Card className="p-12 text-center text-zinc-400">
                <HistoryIcon size={48} className="mx-auto mb-4 opacity-20" />
                <p>暂无历史记录</p>
              </Card>
            ) : (
              <>
                {cumulativeData.length > 0 && (
                  <Card className="p-8 border-l-4 border-l-emerald-500">
                    <h3 className="text-lg font-bold text-zinc-900 mb-6 flex items-center gap-2">
                      <BarChart3 size={20} className="text-emerald-500" />
                      累积系列位置曲线 (标准 U 型曲线)
                    </h3>
                    <div className="h-[300px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={cumulativeData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                          <defs>
                            <linearGradient id="colorCumulative" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#10b981" stopOpacity={0.1}/>
                              <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                          <XAxis 
                            dataKey="position" 
                            tick={{ fontSize: 10, fill: '#a1a1aa' }}
                            label={{ value: '单词位置', position: 'insideBottom', offset: -5, fontSize: 10, fill: '#a1a1aa' }}
                          />
                          <YAxis 
                            domain={[0, 100]}
                            tick={{ fontSize: 10, fill: '#a1a1aa' }}
                            tickFormatter={(v) => `${v}%`}
                          />
                          <Tooltip 
                            content={({ active, payload }) => {
                              if (active && payload && payload.length) {
                                const data = payload[0].payload;
                                return (
                                  <div className="bg-white border border-zinc-200 p-2 shadow-xl rounded text-[10px] font-mono">
                                    <p className="font-bold text-zinc-900">位置: {data.position}</p>
                                    <p className="text-emerald-600">平均正确率: {data.accuracy.toFixed(1)}%</p>
                                    <p className="text-zinc-400 text-[8px]">样本数: {data.count}</p>
                                  </div>
                                );
                              }
                              return null;
                            }}
                          />
                          <Area 
                            type="monotone" 
                            dataKey="accuracy" 
                            stroke="#10b981" 
                            strokeWidth={3}
                            fillOpacity={1} 
                            fill="url(#colorCumulative)" 
                            dot={{ r: 4, fill: '#10b981', stroke: 'white', strokeWidth: 2 }}
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                    <p className="mt-4 text-[11px] text-zinc-500 leading-relaxed">
                      该曲线展示了您在多次实验中，不同位置单词的平均回忆概率。典型的结果是两头高、中间低的 <strong>U 型曲线</strong>，分别对应首因效应（Primacy Effect）和近因效应（Recency Effect）。
                    </p>
                  </Card>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {history.map(record => {
                  const correct = record.result.recallSuccess.filter(Boolean).length;
                  const rate = ((correct / record.settings.wordCount) * 100).toFixed(1);
                  return (
                    <Card key={record.id} className="p-4 hover:border-zinc-400 transition-colors group">
                      <div className="flex justify-between items-start mb-3">
                        <div className="text-[10px] font-mono text-zinc-400 uppercase">
                          {new Date(record.timestamp).toLocaleString()}
                        </div>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            setHistory(prev => prev.filter(h => h.id !== record.id));
                          }}
                          className="opacity-0 group-hover:opacity-100 p-1 text-zinc-400 hover:text-rose-500 transition-all"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`px-1.5 py-0.5 rounded-[4px] text-[10px] font-bold uppercase ${record.settings.language === 'CN' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}`}>
                          {record.settings.language}
                        </span>
                        <span className="text-xs font-bold text-zinc-700">
                          {record.settings.mode === 'RECALL' ? '自由回忆' : '再认任务'}
                        </span>
                      </div>
                      <div className="flex items-end justify-between">
                        <div>
                          <div className="text-2xl font-bold text-zinc-900">{rate}%</div>
                          <div className="text-[10px] text-zinc-400 uppercase tracking-widest">正确率 ({correct}/{record.settings.wordCount})</div>
                        </div>
                        <button 
                          onClick={() => {
                            setSettings(record.settings);
                            setCurrentTrial(record.result);
                            setState('RESULTS');
                          }}
                          className="text-[10px] font-bold text-zinc-900 underline underline-offset-4"
                        >
                          查看详情
                        </button>
                      </div>
                    </Card>
                  );
                })}
              </div>
              
              {history.length > 1 && (
                <Card className="p-8">
                  <h3 className="text-lg font-bold text-zinc-900 mb-6 flex items-center gap-2">
                    <TrendingUp size={20} className="text-zinc-400" />
                    历史表现趋势
                  </h3>
                  <div className="h-[300px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={[...history].reverse()} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                        <XAxis 
                          dataKey="timestamp" 
                          tickFormatter={(t) => new Date(t).toLocaleDateString()}
                          tick={{ fontSize: 10, fill: '#a1a1aa' }}
                        />
                        <YAxis 
                          domain={[0, 100]}
                          tick={{ fontSize: 10, fill: '#a1a1aa' }}
                          tickFormatter={(v) => `${v}%`}
                        />
                        <Tooltip 
                          content={({ active, payload }) => {
                            if (active && payload && payload.length) {
                              const data = payload[0].payload as SessionRecord;
                              const correct = data.result.recallSuccess.filter(Boolean).length;
                              const rate = ((correct / data.settings.wordCount) * 100).toFixed(1);
                              return (
                                <div className="bg-white border border-zinc-200 p-2 shadow-xl rounded text-[10px] font-mono">
                                  <p className="font-bold text-zinc-900">{new Date(data.timestamp).toLocaleString()}</p>
                                  <p className="text-zinc-500">模式: {data.settings.mode}</p>
                                  <p className="text-emerald-600">正确率: {rate}%</p>
                                  {data.result.confidenceScores && (
                                    <p className="text-blue-600">自信度: {(data.result.confidenceScores.reduce((a, b) => a + b, 0) / data.result.confidenceScores.length).toFixed(1)}%</p>
                                  )}
                                </div>
                              );
                            }
                            return null;
                          }}
                        />
                        <Line 
                          type="monotone" 
                          dataKey={(record: SessionRecord) => (record.result.recallSuccess.filter(Boolean).length / record.settings.wordCount) * 100} 
                          stroke="#18181b" 
                          strokeWidth={2}
                          dot={{ r: 4, fill: '#18181b' }}
                          name="正确率"
                        />
                        <Line 
                          type="monotone" 
                          dataKey={(record: SessionRecord) => {
                            if (!record.result.confidenceScores || record.result.confidenceScores.length === 0) return null;
                            return record.result.confidenceScores.reduce((a, b) => a + b, 0) / record.result.confidenceScores.length;
                          }} 
                          stroke="#3b82f6" 
                          strokeWidth={2}
                          strokeDasharray="5 5"
                          dot={{ r: 3, fill: '#3b82f6' }}
                          name="平均自信度"
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </Card>
              )}
            </>
          )}
        </div>
      ) : (
        <>
          <Card className="p-8">
        <div className="flex items-start gap-4 mb-6">
          <div className="p-3 bg-zinc-100 rounded-lg">
            <Info className="text-zinc-600" size={24} />
          </div>
          <div>
            <h2 className="text-lg font-bold text-zinc-900 mb-1">实验说明</h2>
            <p className="text-sm text-zinc-600 leading-relaxed">
              本实验探讨母语与非母语对短时记忆和长时记忆系统的影响。
              一系列单词（中文或英文）将逐个呈现，您的任务是尽可能多地记住它们。
              在呈现结束后，您需要回忆或从列表中认出这些单词。
            </p>
          </div>
        </div>

        <div className="space-y-4 mb-6">
          <CollapsibleSection 
            title="词库生成 (Word Generation)" 
            icon={Brain}
            isOpen={expandedSections.includes('wordGen')}
            onToggle={() => setExpandedSections(prev => prev.includes('wordGen') ? prev.filter(s => s !== 'wordGen') : [...prev, 'wordGen'])}
          >
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <label className="text-[10px] font-mono text-zinc-400 uppercase tracking-widest block">词库来源</label>
                <div className="grid grid-cols-2 gap-2">
                  <button 
                    onClick={() => setSettings({...settings, useAI: true})}
                    className={`py-2 text-xs font-bold rounded border transition-all flex items-center justify-center gap-2 ${settings.useAI ? 'bg-zinc-900 text-white border-zinc-900' : 'bg-white text-zinc-500 border-zinc-200 hover:border-zinc-400'}`}
                  >
                    <Brain size={14} />
                    AI 动态生成
                  </button>
                  <button 
                    onClick={() => setSettings({...settings, useAI: false})}
                    className={`py-2 text-xs font-bold rounded border transition-all ${!settings.useAI ? 'bg-zinc-900 text-white border-zinc-900' : 'bg-white text-zinc-500 border-zinc-200 hover:border-zinc-400'}`}
                  >
                    静态词库
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-mono text-zinc-400 uppercase tracking-widest block">词表结构</label>
                <div className="grid grid-cols-3 gap-2">
                  <button 
                    onClick={() => setSettings({...settings, listType: 'RANDOM'})}
                    className={`py-2 text-[10px] font-bold rounded border transition-all ${settings.listType === 'RANDOM' ? 'bg-zinc-900 text-white border-zinc-900' : 'bg-white text-zinc-500 border-zinc-200 hover:border-zinc-400'}`}
                  >
                    随机词表
                  </button>
                  <button 
                    onClick={() => setSettings({...settings, listType: 'CATEGORIZED'})}
                    className={`py-2 text-[10px] font-bold rounded border transition-all ${settings.listType === 'CATEGORIZED' ? 'bg-zinc-900 text-white border-zinc-900' : 'bg-white text-zinc-500 border-zinc-200 hover:border-zinc-400'}`}
                  >
                    范畴词表
                  </button>
                  <button 
                    onClick={() => setSettings({...settings, listType: 'DRM'})}
                    className={`py-2 text-[10px] font-bold rounded border transition-all ${settings.listType === 'DRM' ? 'bg-zinc-900 text-white border-zinc-900' : 'bg-white text-zinc-500 border-zinc-200 hover:border-zinc-400'}`}
                  >
                    DRM (错误记忆)
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-mono text-zinc-400 uppercase tracking-widest block">实验语言</label>
                <div className="grid grid-cols-2 gap-2">
                  <button 
                    onClick={() => setSettings({...settings, language: 'CN'})}
                    className={`py-2 text-xs font-bold rounded border transition-all ${settings.language === 'CN' ? 'bg-zinc-900 text-white border-zinc-900' : 'bg-white text-zinc-500 border-zinc-200 hover:border-zinc-400'}`}
                  >
                    中文 (CN)
                  </button>
                  <button 
                    onClick={() => setSettings({...settings, language: 'EN'})}
                    className={`py-2 text-xs font-bold rounded border transition-all ${settings.language === 'EN' ? 'bg-zinc-900 text-white border-zinc-900' : 'bg-white text-zinc-500 border-zinc-200 hover:border-zinc-400'}`}
                  >
                    English (EN)
                  </button>
                </div>
              </div>
            </div>
          </CollapsibleSection>

          <CollapsibleSection 
            title="实验参数 (Experiment Parameters)" 
            icon={SettingsIcon}
            isOpen={expandedSections.includes('params')}
            onToggle={() => setExpandedSections(prev => prev.includes('params') ? prev.filter(s => s !== 'params') : [...prev, 'params'])}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-[10px] font-mono text-zinc-400 uppercase tracking-widest block">实验模式</label>
                <div className="grid grid-cols-2 gap-2">
                  <button 
                    onClick={() => setSettings({...settings, mode: 'RECALL'})}
                    className={`py-2 text-xs font-bold rounded border transition-all ${settings.mode === 'RECALL' ? 'bg-zinc-900 text-white border-zinc-900' : 'bg-white text-zinc-500 border-zinc-200 hover:border-zinc-400'}`}
                  >
                    自由回忆
                  </button>
                  <button 
                    onClick={() => setSettings({...settings, mode: 'RECOGNITION'})}
                    className={`py-2 text-xs font-bold rounded border transition-all ${settings.mode === 'RECOGNITION' ? 'bg-zinc-900 text-white border-zinc-900' : 'bg-white text-zinc-500 border-zinc-200 hover:border-zinc-400'}`}
                  >
                    再认任务
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-mono text-zinc-400 uppercase tracking-widest block">单词数量</label>
                <select 
                  value={settings.wordCount}
                  onChange={(e) => setSettings({...settings, wordCount: parseInt(e.target.value)})}
                  className="w-full bg-zinc-50 border border-zinc-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-500"
                >
                  {[10, 15, 20, 25, 30].map(n => <option key={n} value={n}>{n} 个单词</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-mono text-zinc-400 uppercase tracking-widest block">呈现间隔 (ms)</label>
                <select 
                  value={settings.intervalMs}
                  onChange={(e) => {
                    const interval = parseInt(e.target.value);
                    setSettings({
                      ...settings, 
                      intervalMs: interval,
                      stayDurationMs: Math.min(settings.stayDurationMs, interval)
                    });
                  }}
                  className="w-full bg-zinc-50 border border-zinc-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-500"
                >
                  {[500, 1000, 1500, 2000, 3000].map(n => <option key={n} value={n}>{n} ms</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-mono text-zinc-400 uppercase tracking-widest block">停留时长 (ms)</label>
                <select 
                  value={settings.stayDurationMs}
                  onChange={(e) => setSettings({...settings, stayDurationMs: parseInt(e.target.value)})}
                  className="w-full bg-zinc-50 border border-zinc-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-500"
                >
                  {[200, 500, 800, 1000, 1500, 2000].filter(n => n <= settings.intervalMs).map(n => <option key={n} value={n}>{n} ms</option>)}
                </select>
              </div>
            </div>
          </CollapsibleSection>

          <CollapsibleSection 
            title="干扰任务 (Distractor Task)" 
            icon={Clock}
            isOpen={expandedSections.includes('distractor')}
            onToggle={() => setExpandedSections(prev => prev.includes('distractor') ? prev.filter(s => s !== 'distractor') : [...prev, 'distractor'])}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-[10px] font-mono text-zinc-400 uppercase tracking-widest block">分心任务范式</label>
                <div className="grid grid-cols-3 gap-2">
                  <button 
                    onClick={() => setSettings({...settings, distractorMode: 'NONE'})}
                    className={`py-2 text-[10px] font-bold rounded border transition-all ${settings.distractorMode === 'NONE' ? 'bg-zinc-900 text-white border-zinc-900' : 'bg-white text-zinc-500 border-zinc-200 hover:border-zinc-400'}`}
                  >
                    无分心
                  </button>
                  <button 
                    onClick={() => setSettings({...settings, distractorMode: 'END'})}
                    className={`py-2 text-[10px] font-bold rounded border transition-all ${settings.distractorMode === 'END' ? 'bg-zinc-900 text-white border-zinc-900' : 'bg-white text-zinc-500 border-zinc-200 hover:border-zinc-400'}`}
                  >
                    末尾分心
                  </button>
                  <button 
                    onClick={() => setSettings({...settings, distractorMode: 'CONTINUOUS'})}
                    className={`py-2 text-[10px] font-bold rounded border transition-all ${settings.distractorMode === 'CONTINUOUS' ? 'bg-zinc-900 text-white border-zinc-900' : 'bg-white text-zinc-500 border-zinc-200 hover:border-zinc-400'}`}
                  >
                    连续分心
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-mono text-zinc-400 uppercase tracking-widest block">延迟/干扰时长 (秒)</label>
                <select 
                  value={settings.delaySeconds}
                  onChange={(e) => setSettings({...settings, delaySeconds: parseInt(e.target.value)})}
                  className="w-full bg-zinc-50 border border-zinc-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-500"
                >
                  {[0, 5, 10, 20, 30].map(n => <option key={n} value={n}>{n}秒 {n > 0 ? '(干扰任务)' : ''}</option>)}
                </select>
              </div>
            </div>
          </CollapsibleSection>
        </div>

        <button 
          onClick={startExperiment}
          disabled={isGenerating}
          className="w-full bg-zinc-900 text-white font-bold py-4 rounded-lg flex items-center justify-center gap-2 hover:bg-zinc-800 transition-colors group disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isGenerating ? (
            <>
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              AI 正在生成词库...
            </>
          ) : (
            <>
              <Play size={20} className="group-hover:scale-110 transition-transform" />
              开始实验
            </>
          )}
        </button>
      </Card>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="p-4 border-l-4 border-l-emerald-500">
          <h3 className="text-xs font-bold text-zinc-900 mb-1 flex items-center gap-2">
            <CheckCircle2 size={14} className="text-emerald-500" />
            首因效应
          </h3>
          <p className="text-[11px] text-zinc-500">由于信息转入长时记忆，列表开头的项目回忆效果更好。</p>
        </Card>
        <Card className="p-4 border-l-4 border-l-blue-500">
          <h3 className="text-xs font-bold text-zinc-900 mb-1 flex items-center gap-2">
            <CheckCircle2 size={14} className="text-blue-500" />
            近因效应
          </h3>
          <p className="text-[11px] text-zinc-500">由于项目仍保存在短时记忆中，列表末尾的项目回忆效果更好。</p>
        </Card>
      </div>
      </>
      )}
    </motion.div>
  );
};

  const renderPresenting = () => (
    <div className="flex flex-col items-center justify-center min-h-[400px] space-y-12">
      {isSubDelay ? (
        <div className="flex flex-col items-center space-y-8 animate-in fade-in zoom-in duration-300">
          <div className="p-6 bg-amber-50 border border-amber-200 rounded-2xl space-y-4 max-w-sm text-center">
            <Clock className="mx-auto text-amber-500" size={32} />
            <h2 className="text-xl font-bold text-amber-900">连续干扰</h2>
            <p className="text-xs text-amber-700">
              请从 <span className="font-bold text-base">{interferenceNumber}</span> 开始以 3 为间隔倒数。
            </p>
          </div>
          <div className="relative w-24 h-24 flex items-center justify-center">
            <svg className="absolute inset-0 w-full h-full -rotate-90">
              <circle cx="48" cy="48" r="44" fill="none" stroke="#e5e5e5" strokeWidth="6" />
              <motion.circle 
                cx="48" cy="48" r="44" fill="none" stroke="#f59e0b" strokeWidth="6"
                strokeDasharray="276"
                initial={{ strokeDashoffset: 0 }}
                animate={{ strokeDashoffset: 276 * (1 - delayCountdown / settings.delaySeconds) }}
                transition={{ duration: 1, ease: "linear" }}
              />
            </svg>
            <span className="text-3xl font-bold text-zinc-900">{delayCountdown}</span>
          </div>
        </div>
      ) : (
        <>
          <div className="w-full max-w-md bg-zinc-200 h-1 rounded-full overflow-hidden">
            <motion.div 
              className="bg-zinc-900 h-full"
              initial={{ width: 0 }}
              animate={{ width: `${(currentWordIndex / settings.wordCount) * 100}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
          
          <AnimatePresence mode="wait">
            {currentWordIndex < settings.wordCount ? (
              <motion.div
                key={currentWordIndex}
                initial={{ opacity: 0, scale: 0.9, y: 10 }}
                animate={{ opacity: isWordVisible ? 1 : 0, scale: isWordVisible ? 1 : 0.9, y: isWordVisible ? 0 : 10 }}
                exit={{ opacity: 0, scale: 1.1, y: -10 }}
                className="text-7xl font-bold tracking-tighter text-zinc-900"
              >
                {isWordVisible ? currentTrial?.presentedWords[currentWordIndex] : ""}
              </motion.div>
            ) : (
              <div className="text-zinc-400 font-mono animate-pulse uppercase tracking-widest">处理中...</div>
            )}
          </AnimatePresence>
        </>
      )}
      
      <div className="text-xs font-mono text-zinc-400 uppercase tracking-widest">
        第 {Math.min(currentWordIndex + 1, settings.wordCount)} 个单词，共 {settings.wordCount} 个
      </div>
    </div>
  );

  const renderDelay = () => (
    <div className="flex flex-col items-center justify-center min-h-[400px] space-y-8 text-center">
      <div className="p-6 bg-amber-50 border border-amber-200 rounded-2xl space-y-4 max-w-sm">
        <Clock className="mx-auto text-amber-500" size={48} />
        <h2 className="text-2xl font-bold text-amber-900">干扰任务</h2>
        <p className="text-sm text-amber-700">
          为了防止复述，请从 <span className="font-bold text-lg">{interferenceNumber}</span> 开始大声以 3 为间隔倒数。
        </p>
      </div>
      
      <div className="relative w-32 h-32 flex items-center justify-center">
        <svg className="absolute inset-0 w-full h-full -rotate-90">
          <circle 
            cx="64" cy="64" r="60" 
            fill="none" stroke="#e5e5e5" strokeWidth="8" 
          />
          <motion.circle 
            cx="64" cy="64" r="60" 
            fill="none" stroke="#f59e0b" strokeWidth="8"
            strokeDasharray="377"
            initial={{ strokeDashoffset: 0 }}
            animate={{ strokeDashoffset: 377 * (1 - delayCountdown / settings.delaySeconds) }}
            transition={{ duration: 1, ease: "linear" }}
          />
        </svg>
        <span className="text-4xl font-bold text-zinc-900">{delayCountdown}</span>
      </div>
    </div>
  );

  const renderRecalling = () => (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="max-w-2xl mx-auto space-y-6"
    >
      <Card className="p-8">
        <div className="flex items-center gap-3 mb-6">
          <RotateCcw className="text-zinc-400" size={20} />
          <h2 className="text-xl font-bold text-zinc-900">回忆阶段</h2>
        </div>
        
        <p className="text-sm text-zinc-600 mb-4">
          请输入您记住的所有单词。使用空格、逗号或换行符分隔。
        </p>
        
        <div className="relative mb-6">
          <textarea 
            autoFocus
            value={recallInput}
            onChange={(e) => setRecallInput(e.target.value)}
            placeholder={settings.language === 'EN' ? "Enter words here..." : "在此输入单词..."}
            className="w-full h-48 bg-zinc-50 border border-zinc-200 rounded-lg p-4 text-lg focus:outline-none focus:ring-2 focus:ring-zinc-900 transition-all resize-none"
          />
          <button
            onClick={isListening ? stopListening : startListening}
            className={`absolute bottom-4 right-4 p-3 rounded-full shadow-lg transition-all ${
              isListening ? 'bg-red-500 text-white animate-pulse' : 'bg-zinc-900 text-white hover:bg-zinc-800'
            }`}
            title={isListening ? "停止录音" : "语音输入"}
          >
            {isListening ? <MicOff size={20} /> : <Mic size={20} />}
          </button>
        </div>
        
        <button 
          onClick={finishRecall}
          className="w-full bg-zinc-900 text-white font-bold py-4 rounded-lg flex items-center justify-center gap-2 hover:bg-zinc-800 transition-colors"
        >
          提交结果
          <ChevronRight size={20} />
        </button>
      </Card>
    </motion.div>
  );

  const renderRecognizing = () => (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="max-w-3xl mx-auto space-y-6"
    >
      <Card className="p-8">
        <div className="flex items-center gap-3 mb-6">
          <CheckCircle2 className="text-zinc-400" size={20} />
          <h2 className="text-xl font-bold text-zinc-900">再认阶段</h2>
        </div>
        
        <p className="text-sm text-zinc-600 mb-6">
          请从下面的列表中选出刚才呈现过的单词。
        </p>
        
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 mb-8">
          {currentTrial?.recognitionOptions?.map((word, i) => (
            <button
              key={i}
              onClick={() => toggleWordSelection(word)}
              className={`py-3 px-4 rounded-lg border text-sm font-medium transition-all ${
                selectedWords.includes(word)
                  ? 'bg-zinc-900 text-white border-zinc-900 shadow-md'
                  : 'bg-zinc-50 text-zinc-600 border-zinc-200 hover:border-zinc-400'
              }`}
            >
              {word}
            </button>
          ))}
        </div>
        
        <div className="flex items-center justify-between gap-4">
          <div className="text-xs font-mono text-zinc-400 uppercase tracking-widest">
            已选择: {selectedWords.length} / {settings.wordCount}
          </div>
          <button 
            onClick={finishRecognition}
            className="bg-zinc-900 text-white font-bold py-4 px-8 rounded-lg flex items-center justify-center gap-2 hover:bg-zinc-800 transition-colors"
          >
            提交结果
            <ChevronRight size={20} />
          </button>
        </div>
      </Card>
    </motion.div>
  );

  const renderConfidenceRating = () => {
    const wordsToRate = settings.mode === 'RECALL' ? currentTrial?.recalledWords : currentTrial?.selectedWords;
    if (!wordsToRate) return null;

    return (
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-2xl mx-auto space-y-6"
      >
        <Card className="p-8">
          <div className="flex items-center gap-3 mb-6">
            <TrendingUp className="text-zinc-400" size={20} />
            <h2 className="text-xl font-bold text-zinc-900">自信度评价 (JOL/RCJ)</h2>
          </div>
          
          <p className="text-sm text-zinc-600 mb-8">
            请评价您对每一个回忆出的单词的自信程度（0% 表示完全不确定，100% 表示非常确定）。
          </p>
          
          <div className="space-y-8 mb-10">
            {wordsToRate.map((word, i) => (
              <div key={i} className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-zinc-900 uppercase tracking-tight">{word}</span>
                  <span className="text-xs font-mono font-bold text-zinc-500">{confidenceRatings[i]}%</span>
                </div>
                <input 
                  type="range" 
                  min="0" 
                  max="100" 
                  step="5"
                  value={confidenceRatings[i]}
                  onChange={(e) => {
                    const newRatings = [...confidenceRatings];
                    newRatings[i] = parseInt(e.target.value);
                    setConfidenceRatings(newRatings);
                  }}
                  className="w-full h-1.5 bg-zinc-100 rounded-lg appearance-none cursor-pointer accent-zinc-900"
                />
              </div>
            ))}
          </div>
          
          <button 
            onClick={submitConfidenceScores}
            className="w-full bg-zinc-900 text-white font-bold py-4 rounded-lg flex items-center justify-center gap-2 hover:bg-zinc-800 transition-colors shadow-lg"
          >
            完成并查看分析
            <ChevronRight size={20} />
          </button>
        </Card>
      </motion.div>
    );
  };

  const renderResults = () => {
    if (!currentTrial) return null;
    
    const chartData = currentTrial.presentedWords.map((word, index) => ({
      position: index + 1,
      word,
      recalled: currentTrial.recallSuccess[index] ? 1 : 0,
    }));

    const totalRecalled = currentTrial.recallSuccess.filter(Boolean).length;
    const recallRate = ((totalRecalled / settings.wordCount) * 100).toFixed(1);

    // Clustering Analysis
    let clusteringScore = 0;
    let clusteringRatio = 0;
    if (currentTrial.wordCategories && currentTrial.recallOrder && currentTrial.recallOrder.length > 1) {
      let repetitions = 0;
      const recalledCats = currentTrial.recallOrder.map(idx => currentTrial.wordCategories![idx]);
      
      for (let i = 1; i < recalledCats.length; i++) {
        if (recalledCats[i] === recalledCats[i-1]) {
          repetitions++;
        }
      }
      
      const uniqueCats = new Set(recalledCats).size;
      const maxPossibleReps = recalledCats.length - uniqueCats;
      
      clusteringScore = repetitions;
      clusteringRatio = maxPossibleReps > 0 ? (repetitions / maxPossibleReps) : 0;
    }

    const scatterData = (currentTrial.recallOrder || []).map((originalIndex, recallIndex) => ({
      recallOrder: recallIndex + 1,
      originalPosition: originalIndex + 1,
      word: currentTrial.presentedWords[originalIndex]
    }));

    const exportToCSV = () => {
      if (!currentTrial) return;

      const headers = ["Position", "Word", "Status", "Experiment Mode", "Language", "Delay (s)", "Interval (ms)"];
      const rows = currentTrial.presentedWords.map((word, index) => [
        index + 1,
        word,
        currentTrial.recallSuccess[index] ? "Recalled/Recognized" : "Missed",
        settings.mode,
        settings.language,
        settings.delaySeconds,
        settings.intervalMs
      ]);

      // Add summary info
      rows.push([]);
      rows.push(["Summary Statistics"]);
      rows.push(["Total Words", settings.wordCount]);
      rows.push(["Total Correct", totalRecalled]);
      rows.push(["Accuracy Rate", `${recallRate}%`]);
      
      const primacyCount = currentTrial.recallSuccess.slice(0, 3).filter(Boolean).length;
      const recencyCount = currentTrial.recallSuccess.slice(-3).filter(Boolean).length;
      rows.push(["Primacy Score (First 3)", `${primacyCount}/3`]);
      rows.push(["Recency Score (Last 3)", `${recencyCount}/3`]);

      const csvContent = [
        headers.join(","),
        ...rows.map(row => row.map(cell => `"${cell}"`).join(","))
      ].join("\n");

      const blob = new Blob(["\ufeff" + csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      
      link.setAttribute("href", url);
      link.setAttribute("download", `experiment_results_${timestamp}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    };

    return (
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-4xl mx-auto space-y-8"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-zinc-900">实验结果</h2>
          <button 
            onClick={exportToCSV}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-zinc-200 rounded-lg text-sm font-medium text-zinc-600 hover:bg-zinc-50 hover:border-zinc-300 transition-all shadow-sm"
          >
            <Download size={16} />
            导出 CSV 数据
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <Card className="p-6 flex flex-col items-center justify-center text-center space-y-2">
            <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-widest">
              {settings.mode === 'RECALL' ? '回忆总数' : '认出总数'}
            </span>
            <span className="text-4xl font-bold text-zinc-900">{totalRecalled} / {settings.wordCount}</span>
          </Card>
          <Card className="p-6 flex flex-col items-center justify-center text-center space-y-2">
            <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-widest">
              {settings.mode === 'RECALL' ? '回忆率' : '再认率'}
            </span>
            <span className="text-4xl font-bold text-zinc-900">{recallRate}%</span>
          </Card>
          <Card className="p-6 flex flex-col items-center justify-center text-center space-y-2">
            <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-widest">
              平均自信度
            </span>
            <span className="text-4xl font-bold text-zinc-900">
              {currentTrial.confidenceScores ? (currentTrial.confidenceScores.reduce((a, b) => a + b, 0) / currentTrial.confidenceScores.length).toFixed(0) : 0}%
            </span>
          </Card>
          <Card className="p-6 flex flex-col items-center justify-center text-center space-y-2">
            <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-widest">延迟条件</span>
            <span className="text-4xl font-bold text-zinc-900">{settings.delaySeconds}s</span>
          </Card>
        </div>

        <Card className="p-8">
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-lg font-bold text-zinc-900 flex items-center gap-2">
              <Brain size={20} className="text-zinc-400" />
              记忆结构图谱 (D3 关联网络)
            </h3>
            <p className="text-[10px] font-mono text-zinc-400 uppercase tracking-widest">可拖拽节点探索关联</p>
          </div>
          <MemoryNetwork result={currentTrial} />
          <div className="mt-6 p-4 bg-zinc-50 rounded-lg">
            <h4 className="text-[10px] font-mono text-zinc-400 uppercase mb-2 tracking-widest">图谱解读</h4>
            <p className="text-[11px] text-zinc-600 leading-relaxed">
              该力导向图展示了您的记忆提取路径。<strong>实线</strong>连接了您连续回忆出的单词，<strong>虚线</strong>连接了属于同一范畴的单词。
              如果实线与虚线重合，说明您成功利用了语义组织策略（群集）。
            </p>
          </div>
        </Card>

        <Card className="p-8">
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-lg font-bold text-zinc-900 flex items-center gap-2">
              <Brain size={20} className="text-zinc-400" />
              语义转换弦图 (Chord Diagram)
            </h3>
            <p className="text-[10px] font-mono text-zinc-400 uppercase tracking-widest">量化群集效应</p>
          </div>
          <MemoryChord result={currentTrial} />
          <div className="mt-6 p-4 bg-zinc-50 rounded-lg">
            <h4 className="text-[10px] font-mono text-zinc-400 uppercase mb-2 tracking-widest">弦图解读</h4>
            <p className="text-[11px] text-zinc-600 leading-relaxed">
              圆环上的每个色块代表一个<strong>语义范畴</strong>。内部的连线（弦）代表您在回忆时从一个范畴跳跃到另一个范畴。
              <strong>自指向的粗弦</strong>（同一颜色的回路）越多，说明您的“群集（Clustering）”效应越强，即您倾向于连续回忆同一范畴的单词。
            </p>
          </div>
        </Card>

        <Card className="p-8">
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-lg font-bold text-zinc-900 flex items-center gap-2">
              <RotateCcw size={20} className="text-zinc-400" />
              记忆流向图 (Sankey Diagram)
            </h3>
            <p className="text-[10px] font-mono text-zinc-400 uppercase tracking-widest">追踪提取动态</p>
          </div>
          <MemorySankey result={currentTrial} />
          <div className="mt-6 p-4 bg-zinc-50 rounded-lg">
            <h4 className="text-[10px] font-mono text-zinc-400 uppercase mb-2 tracking-widest">流向解读</h4>
            <p className="text-[11px] text-zinc-600 leading-relaxed">
              左侧代表单词在列表中的<strong>原始呈现位置</strong>，右侧代表您的<strong>回忆顺序</strong>。
              {settings.delaySeconds === 0 ? (
                "在无延迟时，如果您看到大量线条从左侧底部连向右侧顶部，这说明您优先提取了最后看到的单词（近因效应）。"
              ) : (
                "在有干扰时，观察线条是否变得更加交错，或者是否更倾向于从左侧顶部开始（首因效应优先）。"
              )}
            </p>
          </div>
        </Card>

        <Card className="p-8">
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-lg font-bold text-zinc-900 flex items-center gap-2">
              <BarChart3 size={20} className="text-zinc-400" />
              系列位置曲线
            </h3>
            <div className="flex items-center gap-4 text-[10px] font-mono uppercase tracking-tighter">
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 bg-zinc-900 rounded-sm"></div>
                <span>{settings.mode === 'RECALL' ? '已回忆' : '已认出'}</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 bg-zinc-200 rounded-sm"></div>
                <span>{settings.mode === 'RECALL' ? '未回忆' : '未认出'}</span>
              </div>
            </div>
          </div>
          
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorRecalled" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#18181b" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#18181b" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                <XAxis 
                  dataKey="position" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 10, fill: '#a1a1aa', fontFamily: 'monospace' }}
                  label={{ value: '系列位置', position: 'insideBottom', offset: -5, fontSize: 10, fill: '#a1a1aa' }}
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  ticks={[0, 1]} 
                  tickFormatter={(val) => val === 1 ? '是' : '否'}
                  tick={{ fontSize: 10, fill: '#a1a1aa', fontFamily: 'monospace' }}
                />
                <Tooltip 
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      return (
                        <div className="bg-white border border-zinc-200 p-2 shadow-xl rounded text-[10px] font-mono">
                          <p className="font-bold text-zinc-900 uppercase">{data.word}</p>
                          <p className="text-zinc-500">位置: {data.position}</p>
                          <p className={data.recalled ? "text-emerald-600" : "text-rose-600"}>
                            {data.recalled ? (settings.mode === 'RECALL' ? "已回忆" : "已认出") : (settings.mode === 'RECALL' ? "未回忆" : "未认出")}
                          </p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Area 
                  type="monotone" 
                  dataKey="recalled" 
                  stroke="#18181b" 
                  strokeWidth={2}
                  fillOpacity={1} 
                  fill="url(#colorRecalled)" 
                  dot={(props: any) => {
                    const { cx, cy, payload } = props;
                    return (
                      <circle 
                        key={payload.position}
                        cx={cx} cy={cy} r={4} 
                        fill={payload.recalled ? "#10b981" : "#ef4444"} 
                        stroke="white" strokeWidth={2} 
                      />
                    );
                  }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          
          <div className="mt-8 pt-8 border-t border-zinc-100 grid grid-cols-1 md:grid-cols-2 gap-8">
            <div>
              <h4 className="text-xs font-bold text-zinc-900 uppercase mb-4 tracking-widest">结果分析</h4>
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className={`mt-1 w-2 h-2 rounded-full ${chartData.slice(0, 3).some(d => d.recalled) ? 'bg-emerald-500' : 'bg-zinc-300'}`}></div>
                  <p className="text-[11px] text-zinc-600">
                    <span className="font-bold text-zinc-900">首因效应:</span> {chartData.slice(0, 3).filter(d => d.recalled).length} / 3 个单词已{settings.mode === 'RECALL' ? '回忆' : '认出'}。 
                    {settings.intervalMs >= 2000 ? " 较长的间隔通常会改善此效应。" : " 较短的间隔可能会削弱此效应。"}
                  </p>
                </div>
                <div className="flex items-start gap-3">
                  <div className={`mt-1 w-2 h-2 rounded-full ${chartData.slice(-3).some(d => d.recalled) ? 'bg-emerald-500' : 'bg-zinc-300'}`}></div>
                  <p className="text-[11px] text-zinc-600">
                    <span className="font-bold text-zinc-900">近因效应:</span> {chartData.slice(-3).filter(d => d.recalled).length} / 3 个单词已{settings.mode === 'RECALL' ? '回忆' : '认出'}。
                    {settings.delaySeconds > 0 ? " 干扰任务通常会消除此效应。" : " 无延迟可保留短时记忆。"}
                  </p>
                </div>
              </div>
            </div>
            
            <div className="bg-zinc-50 rounded-lg p-4">
              <h4 className="text-[10px] font-mono text-zinc-400 uppercase mb-2 tracking-widest">单词详情</h4>
              <div className="flex flex-wrap gap-2">
                {currentTrial.presentedWords.map((word, i) => {
                  const cat = currentTrial.wordCategories?.[i];
                  return (
                    <span 
                      key={i} 
                      title={cat ? `范畴: ${cat}` : undefined}
                      className={`px-2 py-1 rounded text-[10px] font-medium border flex items-center gap-1 ${
                        currentTrial.recallSuccess[i] 
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-700' 
                          : 'bg-zinc-100 border-zinc-200 text-zinc-400 line-through'
                      }`}
                    >
                      {word}
                      {cat && <span className="text-[8px] opacity-50 bg-zinc-200 px-1 rounded">{cat}</span>}
                    </span>
                  );
                })}
              </div>
            </div>
          </div>
        </Card>

        {settings.listType === 'DRM' && currentTrial.falseMemories && currentTrial.falseMemories.length > 0 && (
          <Card className="p-8 border-l-4 border-l-amber-500">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-zinc-900 flex items-center gap-2">
                <Brain size={20} className="text-amber-500" />
                DRM 错误记忆分析 (False Memory)
              </h3>
              <div className="text-right">
                <div className="text-2xl font-bold text-amber-600">{currentTrial.falseMemories.length}</div>
                <div className="text-[10px] text-zinc-400 uppercase tracking-widest">错误记忆总数</div>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-4">
                <div className="p-4 bg-amber-50 rounded-lg">
                  <h4 className="text-xs font-bold text-amber-900 uppercase mb-2">什么是 DRM 范式？</h4>
                  <p className="text-[11px] text-amber-700 leading-relaxed">
                    DRM (Deese-Roediger-McDermott) 范式通过呈现一组与某个“核心诱饵”高度相关的词，诱导大脑产生虚假记忆。
                    即使核心诱饵从未出现，大脑在处理相关词时也会自动激活它，导致您“确信”自己看到了它。
                  </p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="mt-1 w-2 h-2 rounded-full bg-amber-500"></div>
                  <p className="text-[11px] text-zinc-600">
                    <span className="font-bold text-zinc-900">核心诱饵检测:</span> 
                    {currentTrial.criticalLures?.some(lure => currentTrial.falseMemories?.some(fm => fm.toLowerCase() === lure.toLowerCase())) 
                      ? " 成功诱发！您回忆出了核心诱饵词，这证明了语义关联对记忆的重构作用。" 
                      : " 未诱发核心诱饵。您的监控过程可能非常严谨，成功区分了关联激活与实际呈现。"}
                  </p>
                </div>
              </div>
              
              <div className="space-y-4">
                <h4 className="text-[10px] font-mono text-zinc-400 uppercase tracking-widest">检测到的错误记忆</h4>
                <div className="flex flex-wrap gap-2">
                  {currentTrial.falseMemories.map((word, i) => {
                    const isLure = currentTrial.criticalLures?.some(lure => lure.toLowerCase() === word.toLowerCase());
                    return (
                      <span key={i} className={`px-2 py-1 rounded text-[10px] font-bold border ${isLure ? 'bg-amber-100 border-amber-300 text-amber-700 ring-2 ring-amber-200 ring-offset-1' : 'bg-zinc-50 border-zinc-200 text-zinc-600'}`}>
                        {word} {isLure && '🎯 (核心诱饵)'}
                      </span>
                    );
                  })}
                </div>
                {currentTrial.criticalLures && (
                  <div className="mt-4">
                    <h5 className="text-[9px] font-mono text-zinc-400 uppercase mb-1">本场实验的核心诱饵：</h5>
                    <div className="flex gap-2">
                      {currentTrial.criticalLures.map((lure, i) => (
                        <span key={i} className="text-[10px] text-zinc-400 italic">"{lure}"</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </Card>
        )}

        {currentTrial.confidenceScores && (
          <Card className="p-8 border-l-4 border-l-blue-500">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-zinc-900 flex items-center gap-2">
                <TrendingUp size={20} className="text-blue-500" />
                元记忆监控分析 (Metamemory Calibration)
              </h3>
              <div className="text-right">
                <div className="text-2xl font-bold text-blue-600">
                  {(currentTrial.confidenceScores.reduce((a, b) => a + b, 0) / currentTrial.confidenceScores.length).toFixed(1)}%
                </div>
                <div className="text-[10px] text-zinc-400 uppercase tracking-widest">平均自信度</div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-4">
                <div className="p-4 bg-blue-50 rounded-lg">
                  <h4 className="text-xs font-bold text-blue-900 uppercase mb-2">什么是元记忆？</h4>
                  <p className="text-[11px] text-blue-700 leading-relaxed">
                    元记忆（Metamemory）是指个人对自身记忆过程的知识和监控。
                    通过对比“自信度”与“实际正确率”，我们可以评估您的监控准确性。
                  </p>
                </div>
                
                {(() => {
                  const recalledWordsCount = settings.mode === 'RECALL' ? currentTrial.recalledWords.length : currentTrial.selectedWords?.length || 0;
                  const correctRecalled = currentTrial.recallSuccess.filter(Boolean).length;
                  const actualAccuracy = (correctRecalled / recalledWordsCount) * 100;
                  const avgConfidence = currentTrial.confidenceScores!.reduce((a, b) => a + b, 0) / currentTrial.confidenceScores!.length;
                  const bias = avgConfidence - actualAccuracy;

                  return (
                    <div className="flex items-start gap-3">
                      <div className={`mt-1 w-2 h-2 rounded-full ${Math.abs(bias) < 15 ? 'bg-emerald-500' : 'bg-amber-500'}`}></div>
                      <p className="text-[11px] text-zinc-600">
                        <span className="font-bold text-zinc-900">监控偏差:</span> 
                        {bias > 15 ? " 您表现出明显的“过度自信”倾向。" : bias < -15 ? " 您表现出明显的“低估自己”倾向。" : " 您的自我监控非常精准。"}
                      </p>
                    </div>
                  );
                })()}
              </div>

              <div className="space-y-4">
                <h4 className="text-[10px] font-mono text-zinc-400 uppercase tracking-widest">自信度与准确性分布</h4>
                <div className="h-[150px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={currentTrial.confidenceScores.map((score, i) => {
                      const word = settings.mode === 'RECALL' ? currentTrial.recalledWords[i] : currentTrial.selectedWords![i];
                      const isCorrect = currentTrial.presentedWords.some(p => p.toLowerCase() === word.toLowerCase());
                      return { word, score, isCorrect };
                    })}>
                      <XAxis dataKey="word" hide />
                      <YAxis domain={[0, 100]} hide />
                      <Tooltip 
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const data = payload[0].payload;
                            return (
                              <div className="bg-white border border-zinc-200 p-2 shadow-xl rounded text-[10px] font-mono">
                                <p className="font-bold text-zinc-900 uppercase">{data.word}</p>
                                <p className="text-zinc-500">自信度: {data.score}%</p>
                                <p className={data.isCorrect ? "text-emerald-600" : "text-rose-600"}>
                                  {data.isCorrect ? "实际正确" : "实际错误"}
                                </p>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <Bar dataKey="score">
                        {currentTrial.confidenceScores.map((score, i) => {
                          const word = settings.mode === 'RECALL' ? currentTrial.recalledWords[i] : currentTrial.selectedWords![i];
                          const isCorrect = currentTrial.presentedWords.some(p => p.toLowerCase() === word.toLowerCase());
                          return <Cell key={i} fill={isCorrect ? "#10b981" : "#ef4444"} fillOpacity={0.6} />;
                        })}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <p className="text-[9px] text-zinc-400 italic">
                  * 绿色柱子代表实际正确的词，红色代表错误记忆。柱子高度代表您的自信度。
                </p>
              </div>
            </div>
          </Card>
        )}

        {settings.listType === 'CATEGORIZED' && (
          <Card className="p-8 border-l-4 border-l-purple-500">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-zinc-900 flex items-center gap-2">
                <Brain size={20} className="text-purple-500" />
                范畴群集分析 (Clustering)
              </h3>
              <div className="text-right">
                <div className="text-2xl font-bold text-purple-600">{(clusteringRatio * 100).toFixed(1)}%</div>
                <div className="text-[10px] text-zinc-400 uppercase tracking-widest">群集率 (Clustering Ratio)</div>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-4">
                <div className="p-4 bg-purple-50 rounded-lg">
                  <h4 className="text-xs font-bold text-purple-900 uppercase mb-2">什么是群集？</h4>
                  <p className="text-[11px] text-purple-700 leading-relaxed">
                    群集是指在回忆时，被试倾向于将属于同一语义范畴的单词连续回忆出来的现象。这反映了大脑利用语义联系对信息进行组织和检索的策略。
                  </p>
                </div>
                <div className="flex items-start gap-3">
                  <div className={`mt-1 w-2 h-2 rounded-full ${clusteringRatio > 0.5 ? 'bg-emerald-500' : 'bg-amber-500'}`}></div>
                  <p className="text-[11px] text-zinc-600">
                    <span className="font-bold text-zinc-900">观测结果:</span> 您在回忆中出现了 {clusteringScore} 次范畴重复。
                    {clusteringRatio > 0.6 ? " 您的群集率很高，说明您强烈依赖语义组织策略。" : " 您的群集率处于中等水平。"}
                  </p>
                </div>
              </div>
              
              <div className="space-y-4">
                <h4 className="text-[10px] font-mono text-zinc-400 uppercase tracking-widest">回忆路径 (语义流)</h4>
                <div className="flex flex-wrap gap-2">
                  {currentTrial.recallOrder?.map((origIdx, i) => {
                    const cat = currentTrial.wordCategories?.[origIdx];
                    const prevCat = i > 0 ? currentTrial.wordCategories?.[currentTrial.recallOrder![i-1]] : null;
                    const isClustered = cat && cat === prevCat;
                    return (
                      <div key={i} className="flex items-center gap-1">
                        {i > 0 && <ChevronRight size={10} className="text-zinc-300" />}
                        <span className={`px-2 py-1 rounded text-[10px] font-bold border ${isClustered ? 'bg-purple-100 border-purple-300 text-purple-700' : 'bg-zinc-50 border-zinc-200 text-zinc-600'}`}>
                          {currentTrial.presentedWords[origIdx]}
                          <span className="ml-1 text-[8px] opacity-50">({cat || '?'})</span>
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </Card>
        )}

        <Card className="p-8">
          <div className="mb-8">
            <h3 className="text-lg font-bold text-zinc-900 flex items-center gap-2">
              <RotateCcw size={20} className="text-zinc-400" />
              回忆顺序与原始位置关联
            </h3>
            <p className="text-[11px] text-zinc-500 mt-1">探讨提取策略：您是按顺序回忆，还是先回忆末尾的单词？</p>
          </div>
          
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis 
                  type="number" 
                  dataKey="originalPosition" 
                  name="原始位置" 
                  domain={[1, settings.wordCount]}
                  tick={{ fontSize: 10, fill: '#a1a1aa', fontFamily: 'monospace' }}
                  label={{ value: '原始位置', position: 'insideBottom', offset: -10, fontSize: 10, fill: '#a1a1aa' }}
                />
                <YAxis 
                  type="number" 
                  dataKey="recallOrder" 
                  name="回忆顺序" 
                  domain={[1, totalRecalled]}
                  tick={{ fontSize: 10, fill: '#a1a1aa', fontFamily: 'monospace' }}
                  label={{ value: '回忆顺序', angle: -90, position: 'insideLeft', fontSize: 10, fill: '#a1a1aa' }}
                />
                <ZAxis type="category" dataKey="word" name="单词" />
                <Tooltip 
                  cursor={{ strokeDasharray: '3 3' }}
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      return (
                        <div className="bg-white border border-zinc-200 p-2 shadow-xl rounded text-[10px] font-mono">
                          <p className="font-bold text-zinc-900 uppercase">{data.word}</p>
                          <p className="text-zinc-500">原始位置: {data.originalPosition}</p>
                          <p className="text-zinc-900">回忆顺序: {data.recallOrder}</p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Scatter name="Recall Data" data={scatterData} fill="#18181b" line={{ stroke: '#18181b', strokeWidth: 1, strokeDasharray: '5 5' }} />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
          
          <div className="mt-6 p-4 bg-zinc-50 rounded-lg">
            <h4 className="text-[10px] font-mono text-zinc-400 uppercase mb-2 tracking-widest">策略解读</h4>
            <p className="text-[11px] text-zinc-600 leading-relaxed">
              {settings.delaySeconds === 0 ? (
                "在无延迟条件下，如果您先写下列表末尾的单词（散点集中在右下角），这反映了典型的近因效应提取策略。"
              ) : (
                "在有干扰任务的情况下，近因效应通常消失。观察散点是否更倾向于按原始位置顺序排列（从左下到右上的对角线）。"
              )}
            </p>
          </div>
        </Card>

        <button 
          onClick={reset}
          className="w-full bg-zinc-100 text-zinc-600 font-bold py-4 rounded-lg flex items-center justify-center gap-2 hover:bg-zinc-200 transition-colors"
        >
          <RotateCcw size={20} />
          重新开始实验
        </button>
      </motion.div>
    );
  };

  return (
    <div className="min-h-screen bg-[#E4E3E0] text-zinc-900 p-4 md:p-8 font-sans selection:bg-zinc-900 selection:text-white">
      <div className="max-w-5xl mx-auto">
        <Header />
        
        <main className="relative">
          <AnimatePresence mode="wait">
            {state === 'IDLE' && renderIdle()}
            {state === 'PRESENTING' && renderPresenting()}
            {state === 'DELAY' && renderDelay()}
            {state === 'RECALLING' && renderRecalling()}
            {state === 'RECOGNIZING' && renderRecognizing()}
            {state === 'CONFIDENCE_RATING' && renderConfidenceRating()}
            {state === 'RESULTS' && renderResults()}
          </AnimatePresence>
        </main>
        
        <footer className="mt-16 pt-8 border-t border-zinc-300 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-[10px] font-mono text-zinc-400 uppercase tracking-widest">
            &copy; 2026 认知研究系统。保留所有权利。
          </p>
          <div className="flex gap-6 text-[10px] font-mono text-zinc-400 uppercase tracking-widest">
            <span className="hover:text-zinc-600 cursor-pointer transition-colors">文档</span>
            <span className="hover:text-zinc-600 cursor-pointer transition-colors">隐私政策</span>
            <span className="hover:text-zinc-600 cursor-pointer transition-colors">联系实验室</span>
          </div>
        </footer>
      </div>
    </div>
  );
}
