/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export const COMMON_WORDS_EN = [
  "Apple", "Desk", "Mountain", "Lamp", "Bottle", "Window", "Guitar", "Ocean", 
  "Chair", "Paper", "Phone", "Tree", "Camera", "Wallet", "River", "Bridge",
  "Cloud", "Garden", "Pencil", "Coffee", "Mirror", "Street", "Planet", "Rocket",
  "Forest", "Island", "Desert", "Castle", "Market", "School", "Doctor", "Farmer",
  "Artist", "Writer", "Player", "Singer", "Dancer", "Baker", "Driver", "Pilot",
  "Hammer", "Needle", "Basket", "Candle", "Button", "Pocket", "Ticket", "Letter",
  "Silver", "Golden", "Yellow", "Purple", "Orange", "Bright", "Silent", "Strong",
  "Simple", "Modern", "Classic", "Famous", "Active", "Gentle", "Honest", "Clever"
];

export const COMMON_WORDS_CN = [
  "苹果", "书桌", "大山", "台灯", "瓶子", "窗户", "吉他", "海洋",
  "椅子", "报纸", "电话", "大树", "相机", "钱包", "河流", "大桥",
  "白云", "花园", "铅笔", "咖啡", "镜子", "街道", "行星", "火箭",
  "森林", "海岛", "沙漠", "城堡", "市场", "学校", "医生", "农民",
  "画家", "作家", "选手", "歌手", "舞者", "厨师", "司机", "机长",
  "铁锤", "缝针", "篮子", "蜡烛", "按钮", "口袋", "门票", "信件",
  "白银", "黄金", "黄色", "紫色", "橙色", "明亮", "安静", "强大",
  "简单", "现代", "经典", "著名", "活跃", "温柔", "诚实", "聪明"
];

export const CATEGORIZED_WORDS_EN: Record<string, string[]> = {
  "Animals": ["Lion", "Tiger", "Elephant", "Giraffe", "Zebra", "Monkey", "Rabbit", "Deer"],
  "Furniture": ["Chair", "Table", "Sofa", "Bed", "Desk", "Cabinet", "Shelf", "Bench"],
  "Transportation": ["Car", "Bus", "Train", "Plane", "Ship", "Bike", "Truck", "Rocket"],
  "Fruits": ["Apple", "Banana", "Orange", "Grape", "Mango", "Peach", "Berry", "Melon"]
};

export const CATEGORIZED_WORDS_CN: Record<string, string[]> = {
  "动物": ["狮子", "老虎", "大象", "长颈鹿", "斑马", "猴子", "兔子", "梅花鹿"],
  "家具": ["椅子", "桌子", "沙发", "床", "书桌", "柜子", "架子", "长凳"],
  "交通工具": ["汽车", "公交", "火车", "飞机", "轮船", "单车", "卡车", "火箭"],
  "水果": ["苹果", "香蕉", "橙子", "葡萄", "芒果", "桃子", "草莓", "西瓜"]
};

export type ExperimentMode = 'RECALL' | 'RECOGNITION';
export type ExperimentLanguage = 'EN' | 'CN';
export type ListType = 'RANDOM' | 'CATEGORIZED' | 'DRM';

export type ExperimentState = 'IDLE' | 'PRESENTING' | 'DELAY' | 'RECALLING' | 'RECOGNIZING' | 'CONFIDENCE_RATING' | 'RESULTS';

export type DistractorMode = 'NONE' | 'END' | 'CONTINUOUS';

export interface TrialSettings {
  wordCount: number;
  intervalMs: number; // Total cycle time per word
  stayDurationMs: number; // How long the word is visible
  delaySeconds: number;
  mode: ExperimentMode;
  language: ExperimentLanguage;
  useAI: boolean;
  listType: ListType;
  distractorMode: DistractorMode;
}

export interface TrialResult {
  presentedWords: string[];
  recalledWords: string[];
  recallSuccess: boolean[]; // true if word at index was recalled
  recallOrder?: number[]; // indices of presentedWords in the order they were recalled
  recognitionOptions?: string[]; // Words shown in recognition task
  selectedWords?: string[]; // Words selected by user in recognition task
  wordCategories?: string[]; // Category for each presented word
  criticalLures?: string[]; // DRM critical lures
  falseMemories?: string[]; // Words recalled but not presented
  confidenceScores?: number[]; // Confidence rating (0-100) for each recalled word
}

export interface SessionRecord {
  id: string;
  timestamp: number;
  settings: TrialSettings;
  result: TrialResult;
}
