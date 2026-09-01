// English Start Profile — Этап 5: START DIAGNOSTIC, объективная проверка
// языковых навыков. Отдельный модуль от анкетирования (Этап 4) — не
// использует QuestionnaireAttempt/QuestionnaireAnswer и не смешивается
// с ними ни в данных, ни в интерфейсе.
//
// Банк заданий — статичный, курируемый контент в коде backend (по
// аналогии с questionnaire/definition.ts), а не в БД: правильные
// ответы (`correctOptionIndex`) не должны быть доступны клиенту, и
// держать их в коде backend — самый простой способ гарантировать это
// структурно, а не полагаться на аккуратную сериализацию каждый раз.
// См. src/diagnostic/publicView.ts — единственное место, где эти
// объекты превращаются в то, что реально уходит студенту.
//
// Основные навыки этого этапа: Grammar, Vocabulary, Reading, Listening.
// Writing и Speaking — расширенная версия, сюда не входят (ТЗ Этапа 5).

export type Skill = "GRAMMAR" | "VOCABULARY" | "READING" | "LISTENING";
export type TargetLevel = "A1" | "A2" | "B1" | "B2";

export interface DiagnosticPassage {
  id: string;
  skill: "READING" | "LISTENING";
  contextType: string; // everyday | educational | professional
  titleRu: string;
  // Для Reading — сам текст. Для Listening — сценарий, который
  // озвучивается в браузере через Web Speech API (см. отчёт по этапу:
  // готовых аудиофайлов в проекте нет, а Web Speech API даёт реальное
  // прослушивание без внешней инфраструктуры записи/хранения аудио).
  contentEn: string;
}

export interface DiagnosticItem {
  id: string;
  skill: Skill;
  targetLevel: TargetLevel;
  // Независимая от targetLevel ось сложности (1 — легче, 5 — труднее)
  // — по требованию архитектуры задания в ТЗ. Два задания одного
  // уровня CEFR могут иметь разную сложность из-за близости
  // дистракторов друг к другу.
  difficulty: number;
  topic: string;
  diagnosticObjective: string;
  passageId?: string; // для Reading/Listening — задание относится к тексту/сценарию
  promptEn: string;
  optionsEn: string[];
  correctOptionIndex: number; // ВАЖНО: никогда не сериализовать это поле в ответ клиенту
}

export interface DiagnosticBlockDef {
  skill: Skill;
  titleRu: string;
  instructionRu: string;
}

export const DIAGNOSTIC_BLOCKS: DiagnosticBlockDef[] = [
  {
    skill: "GRAMMAR",
    titleRu: "Грамматика",
    instructionRu: "Выберите вариант, который правильно дополняет предложение.",
  },
  {
    skill: "VOCABULARY",
    titleRu: "Лексика",
    instructionRu: "Выберите слово или вариант, который лучше всего подходит по смыслу.",
  },
  {
    skill: "READING",
    titleRu: "Чтение",
    instructionRu: "Прочитайте текст на английском языке и ответьте на вопросы по его содержанию.",
  },
  {
    skill: "LISTENING",
    titleRu: "Аудирование",
    instructionRu:
      "Прослушайте короткий текст на английском языке (кнопка «Прослушать», можно нажимать несколько раз) и ответьте на вопросы по его содержанию.",
  },
];

export const DIAGNOSTIC_PASSAGES: DiagnosticPassage[] = [
  {
    id: "reading-welcome-week",
    skill: "READING",
    contextType: "educational",
    titleRu: "Текст 1 — объявление для студентов",
    contentEn:
      "Welcome Week starts on Monday, September 1st, and lasts for five days. All new students must collect their student cards from the main office before Wednesday. On Tuesday afternoon, there will be a short campus tour for anyone who wants to see the library, the sports centre, and the cafeteria. Students who join a club during Welcome Week get a free T-shirt. The office is open from 9 am to 4 pm every day except Sunday.",
  },
  {
    id: "reading-bank-profits",
    skill: "READING",
    contextType: "professional",
    titleRu: "Текст 2 — новость о банке",
    contentEn:
      "Northgate Bank announced yesterday that its profits increased by 12% in the last financial year, mainly because more customers switched to its online banking service. The bank's director said that the growth was also helped by lower costs after two smaller branches were closed in the spring. However, the director warned that competition from new digital-only banks is growing quickly, and Northgate Bank will need to invest more in technology next year to stay competitive. The bank plans to open a new customer service centre in the autumn, which will create around 40 jobs in the local area.",
  },
  {
    id: "listening-classroom-announcement",
    skill: "LISTENING",
    contextType: "educational",
    titleRu: "Аудио 1 — объявление о занятии",
    contentEn:
      "Hi everyone, this is a quick announcement about tomorrow's class. We will meet in Room 214 instead of Room 108, because the projector in Room 108 isn't working. Please arrive five minutes early, because we will start exactly at nine o'clock. Don't forget to bring your notebooks — we're doing a short vocabulary test at the beginning of the lesson.",
  },
  {
    id: "listening-financial-analyst",
    skill: "LISTENING",
    contextType: "professional",
    titleRu: "Аудио 2 — рассказ о работе",
    contentEn:
      "Good morning. My name is Elena, and I work as a financial analyst for a logistics company. My main job is to look at transport costs and find ways to save money for the company. Every morning, I check reports from our warehouses, and then I meet with the operations team to discuss any problems. I really enjoy this job, because every day brings a different challenge, and I can see the direct result of my work in the company's budget.",
  },
];

export const DIAGNOSTIC_ITEMS: DiagnosticItem[] = [
  // --- Grammar (12) ---------------------------------------------------
  {
    id: "grammar-be",
    skill: "GRAMMAR",
    targetLevel: "A1",
    difficulty: 1,
    topic: "be-verb",
    diagnosticObjective: "Present simple of 'to be' — third person singular",
    promptEn: "She ___ a teacher.",
    optionsEn: ["is", "are", "am", "be"],
    correctOptionIndex: 0,
  },
  {
    id: "grammar-have",
    skill: "GRAMMAR",
    targetLevel: "A1",
    difficulty: 1,
    topic: "have-verb",
    diagnosticObjective: "Present simple of 'to have' — plural subject",
    promptEn: "They ___ two dogs.",
    optionsEn: ["have", "has", "is", "are"],
    correctOptionIndex: 0,
  },
  {
    id: "grammar-present-simple",
    skill: "GRAMMAR",
    targetLevel: "A2",
    difficulty: 2,
    topic: "present-simple",
    diagnosticObjective: "Present simple with first person and adverb of frequency",
    promptEn: "I usually ___ up at 7 am.",
    optionsEn: ["wake", "wakes", "waking", "woke"],
    correctOptionIndex: 0,
  },
  {
    id: "grammar-present-continuous",
    skill: "GRAMMAR",
    targetLevel: "A2",
    difficulty: 2,
    topic: "present-continuous",
    diagnosticObjective: "Present continuous for an action happening now",
    promptEn: "Look! It ___ outside.",
    optionsEn: ["is raining", "rains", "rain", "rained"],
    correctOptionIndex: 0,
  },
  {
    id: "grammar-past-simple",
    skill: "GRAMMAR",
    targetLevel: "A2",
    difficulty: 2,
    topic: "past-simple",
    diagnosticObjective: "Past simple, irregular verb",
    promptEn: "She ___ to Paris last year.",
    optionsEn: ["go", "goes", "went", "gone"],
    correctOptionIndex: 2,
  },
  {
    id: "grammar-future-simple",
    skill: "GRAMMAR",
    targetLevel: "B1",
    difficulty: 3,
    topic: "future-simple",
    diagnosticObjective: "Future simple ('will') for a planned event",
    promptEn: "We ___ the meeting tomorrow.",
    optionsEn: ["will attend", "attends", "attended", "attending"],
    correctOptionIndex: 0,
  },
  {
    id: "grammar-modals-obligation",
    skill: "GRAMMAR",
    targetLevel: "B1",
    difficulty: 3,
    topic: "modals",
    diagnosticObjective: "Modal verb for prohibition ('must not')",
    promptEn: "You ___ smoke here — it isn't allowed.",
    optionsEn: ["must not", "don't have to", "can", "should"],
    correctOptionIndex: 0,
  },
  {
    id: "grammar-comparatives",
    skill: "GRAMMAR",
    targetLevel: "B1",
    difficulty: 3,
    topic: "comparatives",
    diagnosticObjective: "Comparative form of a two-syllable adjective",
    promptEn: "This bridge is ___ than the old one.",
    optionsEn: ["longer", "more long", "longest", "long"],
    correctOptionIndex: 0,
  },
  {
    id: "grammar-prepositions-time",
    skill: "GRAMMAR",
    targetLevel: "B1",
    difficulty: 3,
    topic: "prepositions",
    diagnosticObjective: "Preposition of time with a specific starting point",
    promptEn: "She has lived here ___ 2015.",
    optionsEn: ["since", "for", "from", "at"],
    correctOptionIndex: 0,
  },
  {
    id: "grammar-present-perfect",
    skill: "GRAMMAR",
    targetLevel: "B1",
    difficulty: 4,
    topic: "present-perfect",
    diagnosticObjective: "Present perfect with 'just' for a recently completed action",
    promptEn: "They ___ just finished the project.",
    optionsEn: ["have", "has", "had", "having"],
    correctOptionIndex: 0,
  },
  {
    id: "grammar-third-conditional",
    skill: "GRAMMAR",
    targetLevel: "B2",
    difficulty: 5,
    topic: "conditionals",
    diagnosticObjective: "Third conditional — unreal past condition and result",
    promptEn: "If she ___ earlier, she would have caught the train.",
    optionsEn: ["had left", "left", "would leave", "has left"],
    correctOptionIndex: 0,
  },
  {
    id: "grammar-passive-voice",
    skill: "GRAMMAR",
    targetLevel: "B2",
    difficulty: 4,
    topic: "passive-voice",
    diagnosticObjective: "Future passive voice",
    promptEn: "The report ___ by the finance team next week.",
    optionsEn: ["will be prepared", "prepares", "will prepare", "is preparing"],
    correctOptionIndex: 0,
  },

  // --- Vocabulary (10) --------------------------------------------------
  {
    id: "vocab-big-synonym",
    skill: "VOCABULARY",
    targetLevel: "A1",
    difficulty: 1,
    topic: "everyday-synonyms",
    diagnosticObjective: "Basic adjective synonym",
    promptEn: "Choose the word closest in meaning to 'big'.",
    optionsEn: ["large", "small", "quick", "quiet"],
    correctOptionIndex: 0,
  },
  {
    id: "vocab-bakery",
    skill: "VOCABULARY",
    targetLevel: "A1",
    difficulty: 1,
    topic: "everyday-vocabulary",
    diagnosticObjective: "Everyday place vocabulary",
    promptEn: "A place where you buy bread is called a ___.",
    optionsEn: ["bakery", "library", "garage", "airport"],
    correctOptionIndex: 0,
  },
  {
    id: "vocab-revise",
    skill: "VOCABULARY",
    targetLevel: "A2",
    difficulty: 2,
    topic: "study-vocabulary",
    diagnosticObjective: "Study-related verb in context",
    promptEn: "Before an exam, students often ___ their notes.",
    optionsEn: ["revise", "waste", "lose", "paint"],
    correctOptionIndex: 0,
  },
  {
    id: "vocab-clarify",
    skill: "VOCABULARY",
    targetLevel: "A2",
    difficulty: 2,
    topic: "study-vocabulary",
    diagnosticObjective: "Academic verb synonym",
    promptEn: "Choose the word closest in meaning to 'explain'.",
    optionsEn: ["clarify", "hide", "forget", "ignore"],
    correctOptionIndex: 0,
  },
  {
    id: "vocab-postponed",
    skill: "VOCABULARY",
    targetLevel: "B1",
    difficulty: 3,
    topic: "professional-vocabulary",
    diagnosticObjective: "Workplace verb in context",
    promptEn: "The meeting has been ___ until next week.",
    optionsEn: ["postponed", "attended", "opened", "painted"],
    correctOptionIndex: 0,
  },
  {
    id: "vocab-attached",
    skill: "VOCABULARY",
    targetLevel: "B1",
    difficulty: 3,
    topic: "business-correspondence",
    diagnosticObjective: "Formal email phrasing",
    promptEn: "Please find ___ the requested documents.",
    optionsEn: ["attached", "attaching", "attach", "attachment"],
    correctOptionIndex: 0,
  },
  {
    id: "vocab-revenue",
    skill: "VOCABULARY",
    targetLevel: "B1",
    difficulty: 3,
    topic: "financial-vocabulary",
    diagnosticObjective: "Basic financial term in context",
    promptEn: "The company's ___ grew by 10% this year.",
    optionsEn: ["revenue", "weather", "traffic", "weight"],
    correctOptionIndex: 0,
  },
  {
    id: "vocab-bankrupt",
    skill: "VOCABULARY",
    targetLevel: "B2",
    difficulty: 4,
    topic: "financial-vocabulary",
    diagnosticObjective: "Financial adjective synonym",
    promptEn: "Choose the word closest in meaning to 'insolvent'.",
    optionsEn: ["bankrupt", "wealthy", "famous", "generous"],
    correctOptionIndex: 0,
  },
  {
    id: "vocab-loss",
    skill: "VOCABULARY",
    targetLevel: "B2",
    difficulty: 4,
    topic: "financial-vocabulary",
    diagnosticObjective: "Financial antonym",
    promptEn: "The opposite of 'profit' is ___.",
    optionsEn: ["loss", "income", "revenue", "asset"],
    correctOptionIndex: 0,
  },
  {
    id: "vocab-bargain",
    skill: "VOCABULARY",
    targetLevel: "B2",
    difficulty: 4,
    topic: "business-vocabulary",
    diagnosticObjective: "Business verb synonym",
    promptEn: "Choose the word closest in meaning to 'negotiate'.",
    optionsEn: ["bargain", "ignore", "cancel", "deliver"],
    correctOptionIndex: 0,
  },

  // --- Reading (2 passages × 3 questions) --------------------------------
  {
    id: "reading-welcome-week-q1",
    skill: "READING",
    targetLevel: "A2",
    difficulty: 2,
    topic: "reading-main-idea",
    diagnosticObjective: "Main idea comprehension",
    passageId: "reading-welcome-week",
    promptEn: "What is this text mainly about?",
    optionsEn: [
      "Information for new students during their first week",
      "A list of exam dates",
      "Instructions for teachers",
      "A history of the college",
    ],
    correctOptionIndex: 0,
  },
  {
    id: "reading-welcome-week-q2",
    skill: "READING",
    targetLevel: "A2",
    difficulty: 2,
    topic: "reading-specific-info",
    diagnosticObjective: "Scanning for specific information",
    passageId: "reading-welcome-week",
    promptEn: "When must students collect their student cards?",
    optionsEn: ["Before Wednesday", "On Sunday", "After Welcome Week", "On Friday"],
    correctOptionIndex: 0,
  },
  {
    id: "reading-welcome-week-q3",
    skill: "READING",
    targetLevel: "B1",
    difficulty: 3,
    topic: "reading-inference",
    diagnosticObjective: "Inference — combining two details from the text",
    passageId: "reading-welcome-week",
    promptEn: "Why might a new student visit the office on Tuesday?",
    optionsEn: [
      "To join the campus tour and collect a student card",
      "To pay next year's tuition fees",
      "To apply for a teaching job",
      "To return library books",
    ],
    correctOptionIndex: 0,
  },
  {
    id: "reading-bank-profits-q1",
    skill: "READING",
    targetLevel: "B1",
    difficulty: 3,
    topic: "reading-main-idea",
    diagnosticObjective: "Main idea comprehension in a professional text",
    passageId: "reading-bank-profits",
    promptEn: "What is this news report mainly about?",
    optionsEn: [
      "A bank's recent profit growth and future plans",
      "A new law about online banking",
      "A bank that is closing completely",
      "An interview with a bank customer",
    ],
    correctOptionIndex: 0,
  },
  {
    id: "reading-bank-profits-q2",
    skill: "READING",
    targetLevel: "B1",
    difficulty: 3,
    topic: "reading-specific-info",
    diagnosticObjective: "Scanning for a cause-and-effect detail",
    passageId: "reading-bank-profits",
    promptEn: "Why did the bank's costs go down?",
    optionsEn: ["Two branches were closed", "Interest rates fell", "The bank hired fewer staff", "The government reduced taxes"],
    correctOptionIndex: 0,
  },
  {
    id: "reading-bank-profits-q3",
    skill: "READING",
    targetLevel: "B2",
    difficulty: 4,
    topic: "reading-inference",
    diagnosticObjective: "Inference about future plans from context",
    passageId: "reading-bank-profits",
    promptEn: "What can be inferred about Northgate Bank's future?",
    optionsEn: [
      "It expects competition to increase and plans to invest in technology",
      "It plans to close permanently next year",
      "It no longer offers online banking",
      "It has stopped hiring new staff",
    ],
    correctOptionIndex: 0,
  },

  // --- Listening (2 scripts × 2 questions) -------------------------------
  {
    id: "listening-classroom-q1",
    skill: "LISTENING",
    targetLevel: "A2",
    difficulty: 2,
    topic: "listening-gist",
    diagnosticObjective: "Listening for gist",
    passageId: "listening-classroom-announcement",
    promptEn: "What is this announcement mainly about?",
    optionsEn: [
      "A change of classroom and lesson details for tomorrow",
      "A cancelled class",
      "A change of teacher",
      "A school holiday",
    ],
    correctOptionIndex: 0,
  },
  {
    id: "listening-classroom-q2",
    skill: "LISTENING",
    targetLevel: "A2",
    difficulty: 2,
    topic: "listening-detail",
    diagnosticObjective: "Listening for a specific detail",
    passageId: "listening-classroom-announcement",
    promptEn: "What should students bring to the lesson?",
    optionsEn: ["Their notebooks", "A laptop", "A dictionary", "A calculator"],
    correctOptionIndex: 0,
  },
  {
    id: "listening-analyst-q1",
    skill: "LISTENING",
    targetLevel: "B1",
    difficulty: 3,
    topic: "listening-gist",
    diagnosticObjective: "Listening for gist in a professional monologue",
    passageId: "listening-financial-analyst",
    promptEn: "What does Elena do in her job?",
    optionsEn: [
      "She analyses transport costs to help the company save money",
      "She drives delivery trucks",
      "She manages a warehouse team",
      "She designs company software",
    ],
    correctOptionIndex: 0,
  },
  {
    id: "listening-analyst-q2",
    skill: "LISTENING",
    targetLevel: "B1",
    difficulty: 3,
    topic: "listening-detail",
    diagnosticObjective: "Listening for a specific detail",
    passageId: "listening-financial-analyst",
    promptEn: "Who does Elena meet with every morning?",
    optionsEn: ["The operations team", "The marketing team", "Company clients", "New job applicants"],
    correctOptionIndex: 0,
  },
];

export function getItemsForSkill(skill: Skill): DiagnosticItem[] {
  return DIAGNOSTIC_ITEMS.filter((i) => i.skill === skill);
}

export function findItem(id: string): DiagnosticItem | undefined {
  return DIAGNOSTIC_ITEMS.find((i) => i.id === id);
}

export function findPassage(id: string): DiagnosticPassage | undefined {
  return DIAGNOSTIC_PASSAGES.find((p) => p.id === id);
}

export const TOTAL_DIAGNOSTIC_ITEMS = DIAGNOSTIC_ITEMS.length;
