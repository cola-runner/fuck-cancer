// Mock content — mirrors the real app's data (王某 case, auto-imported leaflets,
// grounded chat with citations) so the design is evaluated against real shapes.

const CASES = [
  {
    id: "wang",
    name: "王某",
    relation: "父亲",
    diagnosis: "结直肠癌 IIIB 期 · 术后",
    docCount: 5,
    autoCount: 4,
    updated: "今天",
    accent: "sage",
  },
  {
    id: "li",
    name: "李某",
    relation: "母亲",
    diagnosis: "乳腺癌 II 期 · 化疗中",
    docCount: 8,
    autoCount: 6,
    updated: "3 天前",
    accent: "coral",
  },
];

const DOCS = [
  {
    id: "d0",
    kind: "note",
    title: "出院记录",
    meta: "你上传 · 今天",
    snippet: "结直肠癌术后，出院带药：卡培他滨片 1500mg 每日两次；华法林钠片 3mg 每日一次（房颤抗凝）⋯",
    status: "ready",
  },
  {
    id: "d1",
    kind: "official",
    drug: "卡培他滨",
    title: "卡培他滨片 · 官方说明书",
    source: "DailyMed · 美国 NIH",
    meta: "自动整理 · 含黑框警告",
    status: "ready",
    url: "dailymed.nlm.nih.gov",
  },
  {
    id: "d2",
    kind: "official",
    drug: "卡培他滨",
    title: "卡培他滨 用药安全更新",
    source: "FDA 官方",
    meta: "自动整理",
    status: "ready",
    url: "fda.gov",
  },
  {
    id: "d3",
    kind: "official",
    drug: "华法林",
    title: "华法林钠片 · 官方说明书",
    source: "DailyMed · 美国 NIH",
    meta: "自动整理 · 含相互作用",
    status: "ready",
    url: "dailymed.nlm.nih.gov",
  },
  {
    id: "d4",
    kind: "official",
    drug: "华法林",
    title: "Coumadin（华法林）说明书",
    source: "FDA 官方",
    meta: "正在整理⋯",
    status: "processing",
    url: "accessdata.fda.gov",
  },
];

const SUGGESTED = [
  "这两种药一起吃安全吗？",
  "手脚发红脱皮怎么办？",
  "化疗期间饮食要注意什么？",
];

const CHAT = [
  { role: "user", text: "病人同时在吃卡培他滨和华法林，一起吃有什么风险？要注意什么？" },
  {
    role: "assistant",
    // intentionally concise for the mock; real answer is longer
    paras: [
      { lead: "需要特别小心。", rest: "卡培他滨会增强华法林的抗凝效果，两者合用可能引起严重出血，官方说明书将此列为黑框警告。" },
      { lead: "为什么。", rest: "卡培他滨会让华法林在体内的浓度升高，临床观察到 INR 最高升至原来的 2.8 倍。" },
      { lead: "怎么做。", rest: "需要比平时更频繁地监测 INR，并由医生及时调整华法林剂量；这种风险在停用卡培他滨后一个月内仍可能出现。" },
    ],
    note: "以下内容仅供参考，请以主治医生的判断为准。",
    cites: [
      { n: 1, title: "卡培他滨说明书 · 黑框警告", source: "DailyMed", quote: "与维生素 K 拮抗剂（如华法林）合用会增加出血风险，可致死。" },
      { n: 2, title: "卡培他滨说明书 · 7.2 相互作用", source: "DailyMed", quote: "S-华法林 AUC 增加 57%，清除率下降 37%，INR 最高升至 2.8 倍。" },
      { n: 3, title: "华法林说明书 · 5.1 出血", source: "DailyMed", quote: "如出现牙龈出血、黑便、血尿等迹象，应立即联系医生。" },
    ],
  },
];

Object.assign(window, { CASES, DOCS, SUGGESTED, CHAT });
