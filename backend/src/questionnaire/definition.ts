// English Start Profile — Этап 4: START PROFILE, анкетирование.
//
// Единый источник истины для структуры анкеты (Q1–Q45 + одна условная
// подстановка Q25_ALT) на backend. Текст вопросов и вариантов ответов
// скопирован дословно из docs/SPEC.md (разделы 5–17) — см. требование
// "не изменяй смысл вопросов самостоятельно". `value` у каждого
// варианта — служебный машинный ключ (не часть текста вопроса),
// придуман для этого приложения, чтобы не хранить в БД кириллический
// текст как идентификатор.
//
// ВАЖНО: у frontend есть СВОЯ копия этого файла
// (frontend/src/questionnaire/definition.ts) для рендеринга анкеты.
// Обе копии должны совпадать по структуре и веткам — это осознанный
// компромисс (отдельные npm-пакеты без общего workspace); см.
// docs/STAGE_4_REPORT.md, раздел «Открытые вопросы», о том, что стоит
// вынести в общий пакет на одном из следующих этапов.

export type QuestionType =
  | "TEXT"
  | "TEXTAREA"
  | "SINGLE_CHOICE"
  | "MULTI_CHOICE"
  | "SCALE_1_5"
  | "MATRIX_SCALE_1_5";

export interface QuestionOption {
  value: string;
  label: string;
}

// Группы для последующего расчёта показателей (ТЗ Этапа 4, раздел
// "Аналитика"). Соответствуют индексам из docs/SPEC.md, раздел 24.
// Само вычисление индексов НЕ входит в этот этап — только разметка,
// чтобы будущий модуль аналитики мог выбрать нужные ответы без повторного
// разбора текста вопросов.
export type IndexGroup =
  | "PROFILE"
  | "LANGUAGE_EXPERIENCE"
  | "SELF_ASSESSMENT"
  | "MOTIVATION"
  | "LEARNING_AUTONOMY"
  | "BARRIERS"
  | "PROFESSIONAL_ORIENTATION"
  | "PARTICIPATION_POTENTIAL"
  | "COLLABORATION"
  | "DIGITAL_AI_LITERACY"
  | "GOAL_COMMITMENT"
  | "METACOGNITIVE";

export interface QuestionDef {
  code: string;
  type: QuestionType;
  label: string;
  required: boolean;
  indexGroup: IndexGroup;
  helperText?: string;
  options?: QuestionOption[];
  matrixItems?: QuestionOption[];
  maxSelections?: number;
  // Условный показ (ветвление, ТЗ Этапа 4 / docs/SPEC.md раздел 19).
  // Отсутствует -> вопрос виден всегда.
  visibleIf?: (answers: Record<string, unknown>) => boolean;
}

export interface BlockDef {
  id: string;
  title: string;
  questions: QuestionDef[];
}

function isSelected(value: unknown, target: string): boolean {
  return Array.isArray(value) && value.includes(target);
}

// --- Ветвление (docs/SPEC.md, раздел 19) --------------------------------
//
// Ветвление 1: "Практически нигде не встречаю английский" (Q9) -> не
//   показывать вопрос о том, что студент уже умеет делать (Q10).
// Ветвление 2: нет опыта конференций/конкурсов (Q28 = "ничего из
//   перечисленного") И не хочет пробовать (Q29 = "пока ничего") -> не
//   задавать более глубокий открытый вопрос (Q31). Точная фраза из ТЗ
//   ("Нет опыта конференций и пока не планирую") не совпадает буквально
//   ни с одним вариантом Q28/Q29 по отдельности — интерпретирована как
//   сочетание этих двух ответов; см. отчёт по этапу.
// Ветвление 3: "не использую ИИ" (Q35) -> не спрашивать про уверенность
//   в формулировании запроса (Q36).
// Ветвление 4: "точно не понадобится" (Q25) -> не разворачивать блок
//   про профессиональный английский (Q26, Q27), но задать один
//   отдельный вопрос "Что могло бы изменить ваше мнение?" (Q25_ALT).
const visibleIfNotQ9PracticallyNowhere = (answers: Record<string, unknown>) =>
  !isSelected(answers.Q9, "practically_nowhere");

const visibleIfProfessionalRelevant = (answers: Record<string, unknown>) => answers.Q25 !== "definitely_not";

const visibleIfQ25DefinitelyNot = (answers: Record<string, unknown>) => answers.Q25 === "definitely_not";

const visibleIfParticipationInterestExists = (answers: Record<string, unknown>) =>
  !(isSelected(answers.Q28, "none") && isSelected(answers.Q29, "nothing_yet"));

const visibleIfUsesAi = (answers: Record<string, unknown>) => !isSelected(answers.Q35, "not_using_ai");

export const QUESTIONNAIRE_BLOCKS: BlockDef[] = [
  {
    id: "profile",
    title: "Мой профиль",
    questions: [
      { code: "Q1", type: "TEXT", label: "Имя и фамилия", required: true, indexGroup: "PROFILE" },
      {
        code: "Q2",
        type: "SINGLE_CHOICE",
        label: "Специальность",
        required: true,
        indexGroup: "PROFILE",
        options: [
          { value: "finance", label: "Финансы и экономика" },
          { value: "banking", label: "Банковское дело" },
          { value: "logistics", label: "Логистика" },
          { value: "other_specialty", label: "Другая специальность" },
        ],
      },
      { code: "Q3", type: "TEXT", label: "Учебная группа", required: true, indexGroup: "PROFILE" },
      {
        code: "Q4",
        type: "TEXTAREA",
        label: "Почему вы выбрали эту специальность?",
        required: false,
        indexGroup: "PROFILE",
      },
    ],
  },
  {
    id: "english_experience",
    title: "Мой опыт английского",
    questions: [
      {
        code: "Q5",
        type: "SINGLE_CHOICE",
        label: "Сколько лет вы изучали английский до колледжа?",
        required: true,
        indexGroup: "LANGUAGE_EXPERIENCE",
        options: [
          { value: "less_3", label: "менее 3 лет" },
          { value: "y3_5", label: "3–5 лет" },
          { value: "y6_9", label: "6–9 лет" },
          { value: "more_9", label: "более 9 лет" },
          { value: "unsure", label: "затрудняюсь ответить" },
        ],
      },
      {
        code: "Q6",
        type: "SINGLE_CHOICE",
        label: "Когда вы в последний раз регулярно изучали английский?",
        required: true,
        indexGroup: "LANGUAGE_EXPERIENCE",
        options: [
          { value: "now", label: "сейчас / в этом году" },
          { value: "last_year", label: "в прошлом году" },
          { value: "y2_3_ago", label: "2–3 года назад" },
          { value: "more_3_ago", label: "более 3 лет назад" },
          { value: "dont_remember", label: "не помню" },
        ],
      },
      {
        code: "Q7",
        type: "MULTI_CHOICE",
        label: "Что у вас было кроме школьных уроков?",
        required: true,
        indexGroup: "LANGUAGE_EXPERIENCE",
        helperText: "Можно выбрать несколько.",
        options: [
          { value: "tutor", label: "репетитор" },
          { value: "courses", label: "языковые курсы" },
          { value: "self_study", label: "самостоятельное обучение" },
          { value: "apps", label: "приложения" },
          { value: "video", label: "видео/YouTube" },
          { value: "native_speakers", label: "общение с носителями языка" },
          { value: "games_social", label: "английский в играх/социальных сетях" },
          { value: "none", label: "ничего из перечисленного" },
          { value: "other", label: "другое" },
        ],
      },
      {
        code: "Q8",
        type: "MULTI_CHOICE",
        label: "Что больше всего мешало вам учить английский раньше?",
        required: true,
        indexGroup: "LANGUAGE_EXPERIENCE",
        helperText: "Можно выбрать до 2 вариантов.",
        maxSelections: 2,
        options: [
          { value: "no_purpose", label: "не понимал(а), зачем он нужен" },
          { value: "hard", label: "было трудно" },
          { value: "no_time", label: "не хватало времени" },
          { value: "no_practice", label: "не было практики" },
          { value: "fear_mistakes", label: "боялся(ась) ошибок" },
          { value: "disliked_format", label: "не нравился формат занятий" },
          { value: "forgot_fast", label: "быстро забывал(а) материал" },
          { value: "nothing_special", label: "ничего особенно не мешало" },
          { value: "other", label: "другое" },
        ],
      },
    ],
  },
  {
    id: "real_life_english",
    title: "Английский в реальной жизни",
    questions: [
      {
        code: "Q9",
        type: "MULTI_CHOICE",
        label: "Где вы встречаете английский в обычной жизни?",
        required: true,
        indexGroup: "LANGUAGE_EXPERIENCE",
        helperText: "Можно выбрать несколько.",
        options: [
          { value: "social_media", label: "социальные сети" },
          { value: "youtube_video", label: "YouTube/видео" },
          { value: "music", label: "музыка" },
          { value: "movies_series", label: "фильмы/сериалы" },
          { value: "games", label: "компьютерные игры" },
          { value: "apps_sites", label: "приложения и сайты" },
          { value: "instructions", label: "инструкции" },
          { value: "professional_materials", label: "профессиональные материалы" },
          { value: "correspondence", label: "переписка" },
          { value: "travel", label: "путешествия" },
          { value: "foreigners", label: "общение с иностранцами" },
          { value: "practically_nowhere", label: "практически нигде" },
        ],
      },
      {
        code: "Q10",
        type: "MULTI_CHOICE",
        label: "Что вы уже можете сделать на английском самостоятельно?",
        required: true,
        indexGroup: "LANGUAGE_EXPERIENCE",
        helperText: "Можно выбрать несколько.",
        visibleIf: visibleIfNotQ9PracticallyNowhere,
        options: [
          { value: "understand_simple_sign", label: "понять простую надпись или интерфейс" },
          { value: "find_info", label: "найти нужную информацию" },
          { value: "understand_main_idea_video", label: "понять основную мысль короткого видео" },
          { value: "read_simple_text", label: "прочитать простой текст" },
          { value: "write_short_message", label: "написать короткое сообщение" },
          { value: "write_letter", label: "написать письмо" },
          { value: "support_simple_conversation", label: "поддержать простой разговор" },
          { value: "talk_about_self", label: "рассказать о себе" },
          { value: "explain_opinion", label: "объяснить свою точку зрения" },
          { value: "short_presentation", label: "сделать короткую презентацию" },
          { value: "read_professional_text", label: "прочитать профессиональный текст" },
          { value: "almost_nothing", label: "пока практически ничего" },
        ],
      },
      {
        code: "Q11",
        type: "SINGLE_CHOICE",
        label: "Если вы встречаете незнакомое слово, что обычно делаете?",
        required: true,
        indexGroup: "LANGUAGE_EXPERIENCE",
        options: [
          { value: "use_translator", label: "сразу использую переводчик" },
          { value: "guess_context", label: "пытаюсь понять по контексту" },
          { value: "dictionary", label: "ищу в словаре" },
          { value: "ask_someone", label: "спрашиваю другого человека" },
          { value: "skip_word", label: "пропускаю слово" },
          { value: "guess_then_check", label: "пытаюсь догадаться и потом проверяю" },
        ],
      },
    ],
  },
  {
    id: "self_assessment",
    title: "Моя самооценка английского",
    questions: [
      {
        code: "Q12",
        type: "MATRIX_SCALE_1_5",
        label: "Насколько уверенно вы сейчас владеете следующими навыками?",
        required: true,
        indexGroup: "SELF_ASSESSMENT",
        helperText:
          "1 — почти не умею · 2 — умею только самое простое · 3 — справляюсь с несложными заданиями · 4 — чувствую себя достаточно уверенно · 5 — могу использовать навык самостоятельно и в сложных ситуациях",
        matrixItems: [
          { value: "reading", label: "Читать на английском" },
          { value: "listening", label: "Понимать английскую речь на слух" },
          { value: "speaking", label: "Говорить на английском" },
          { value: "writing", label: "Писать на английском" },
          { value: "professional", label: "Понимать профессиональные тексты" },
        ],
      },
      {
        code: "Q13",
        type: "SCALE_1_5",
        label: "Насколько комфортно вам говорить на английском, если вы можете ошибиться?",
        required: true,
        indexGroup: "SELF_ASSESSMENT",
        helperText: "1 — очень некомфортно · 5 — спокойно говорю и не боюсь ошибок",
      },
      {
        code: "Q14",
        type: "SINGLE_CHOICE",
        label: "Если вам дают текст на английском без перевода, что вы обычно делаете?",
        required: true,
        indexGroup: "SELF_ASSESSMENT",
        options: [
          { value: "general_meaning", label: "пытаюсь понять общий смысл" },
          { value: "partial_translate", label: "понимаю часть текста, но ищу перевод отдельных слов" },
          { value: "translate_each", label: "перевожу почти каждое предложение" },
          { value: "use_translator_immediately", label: "обычно сразу использую переводчик" },
          { value: "hard_to_say", label: "затрудняюсь сказать" },
        ],
      },
    ],
  },
  {
    id: "motivation",
    title: "Мотивация",
    questions: [
      {
        code: "Q15",
        type: "SINGLE_CHOICE",
        label: "Как вы сейчас относитесь к изучению английского?",
        required: true,
        indexGroup: "MOTIVATION",
        options: [
          { value: "really_interested", label: "мне действительно интересно" },
          { value: "understand_need_medium_interest", label: "понимаю, что это нужно, хотя интерес средний" },
          { value: "dont_understand_why", label: "пока не понимаю, зачем он мне" },
          { value: "dont_like_but_willing", label: "не люблю английский, но готов(а) попробовать" },
          { value: "dont_want", label: "не хочу им заниматься" },
        ],
      },
      {
        code: "Q16",
        type: "SINGLE_CHOICE",
        label: "Если бы английский не был обязательным предметом, вы бы продолжили его изучать?",
        required: true,
        indexGroup: "MOTIVATION",
        options: [
          { value: "definitely_yes", label: "точно да" },
          { value: "probably_yes", label: "скорее да" },
          { value: "dont_know", label: "не знаю" },
          { value: "probably_no", label: "скорее нет" },
          { value: "definitely_no", label: "точно нет" },
        ],
      },
      {
        code: "Q17",
        type: "MULTI_CHOICE",
        label: "Что для вас является главным результатом изучения английского?",
        required: true,
        indexGroup: "MOTIVATION",
        helperText: "Выберите до 3.",
        maxSelections: 3,
        options: [
          { value: "good_grades", label: "хорошие оценки" },
          { value: "passing_exam", label: "успешная сдача зачёта/экзамена" },
          { value: "communication", label: "возможность общаться" },
          { value: "future_profession", label: "будущая профессия" },
          { value: "career", label: "карьерные возможности" },
          { value: "travel", label: "путешествия" },
          { value: "access_info", label: "доступ к информации" },
          { value: "international_projects", label: "участие в международных проектах" },
          { value: "conferences_competitions", label: "участие в конференциях/конкурсах" },
          { value: "personal_growth", label: "личное развитие" },
          { value: "other", label: "другое" },
        ],
      },
      {
        code: "Q18",
        type: "MULTI_CHOICE",
        label: "Что сильнее всего мотивирует вас продолжать обучение?",
        required: true,
        indexGroup: "MOTIVATION",
        helperText: "Можно выбрать несколько.",
        options: [
          { value: "see_progress", label: "видеть собственный прогресс" },
          { value: "practical_use", label: "практическая польза" },
          { value: "interesting_tasks", label: "интересные задания" },
          { value: "high_grade", label: "высокая оценка" },
          { value: "teacher_praise", label: "похвала преподавателя" },
          { value: "competition", label: "соревнование" },
          { value: "work_with_others", label: "работа с другими студентами" },
          { value: "extra_benefits", label: "возможность получить дополнительные преимущества" },
          { value: "personal_goal", label: "личная цель" },
          { value: "other", label: "другое" },
        ],
      },
    ],
  },
  {
    id: "learning_style",
    title: "Как я учусь",
    questions: [
      {
        code: "Q19",
        type: "MULTI_CHOICE",
        label: "Что помогает вам лучше всего запоминать материал?",
        required: true,
        indexGroup: "LEARNING_AUTONOMY",
        helperText: "Выберите до 2.",
        maxSelections: 2,
        options: [
          { value: "teacher_explanation", label: "объяснение преподавателя и обсуждение" },
          { value: "reading_notes", label: "чтение и записи" },
          { value: "practice_tasks", label: "практические задания" },
          { value: "visuals", label: "схемы и визуальные материалы" },
          { value: "small_regular_review", label: "небольшие регулярные повторения" },
          { value: "video_audio", label: "видео и аудио" },
          { value: "practice_with_others", label: "практика с другими людьми" },
          { value: "other", label: "другое" },
        ],
      },
      {
        code: "Q20",
        type: "SINGLE_CHOICE",
        label: "Если у вас не получается сложное задание, что вы обычно делаете?",
        required: true,
        indexGroup: "LEARNING_AUTONOMY",
        options: [
          { value: "try_alone", label: "пытаюсь разобраться самостоятельно" },
          { value: "search_internet", label: "ищу объяснение в интернете" },
          { value: "ask_teacher", label: "спрашиваю преподавателя" },
          { value: "ask_classmates", label: "спрашиваю одногруппников" },
          { value: "use_ai", label: "использую ИИ" },
          { value: "postpone", label: "откладываю и возвращаюсь позже" },
          { value: "usually_give_up", label: "обычно бросаю" },
        ],
      },
      {
        code: "Q21",
        type: "SINGLE_CHOICE",
        label: "Сколько времени в неделю вы реально готовы уделять английскому вне занятий?",
        required: true,
        indexGroup: "LEARNING_AUTONOMY",
        options: [
          { value: "not_ready", label: "не готов(а)" },
          { value: "up_to_30", label: "до 30 минут" },
          { value: "m30_60", label: "30–60 минут" },
          { value: "h1_2", label: "1–2 часа" },
          { value: "more_2h", label: "более 2 часов" },
        ],
      },
      {
        code: "Q22",
        type: "SINGLE_CHOICE",
        label: "Как вы обычно организуете самостоятельную работу?",
        required: true,
        indexGroup: "LEARNING_AUTONOMY",
        options: [
          { value: "plan_myself", label: "сам(а) планирую и выполняю" },
          { value: "clear_instruction", label: "работаю по чёткой инструкции" },
          { value: "after_reminder", label: "начинаю после напоминания" },
          { value: "irregularly", label: "занимаюсь нерегулярно" },
          { value: "almost_never", label: "практически не занимаюсь самостоятельно" },
        ],
      },
    ],
  },
  {
    id: "barriers",
    title: "Барьеры и поддержка",
    questions: [
      {
        code: "Q23",
        type: "MULTI_CHOICE",
        label: "Что может сильнее всего мешать вам изучать английский в колледже?",
        required: true,
        indexGroup: "BARRIERS",
        helperText: "Выберите до 3.",
        maxSelections: 3,
        options: [
          { value: "lack_of_time", label: "нехватка времени" },
          { value: "material_difficulty", label: "сложность материала" },
          { value: "fear_mistakes", label: "страх ошибиться" },
          { value: "fear_speaking_public", label: "страх говорить перед группой" },
          { value: "listening_difficulty", label: "трудности с пониманием речи" },
          { value: "forget_words_fast", label: "быстро забываю слова" },
          { value: "hard_self_study", label: "трудно заниматься самостоятельно" },
          { value: "no_practical_benefit", label: "не понимаю практической пользы" },
          { value: "fear_failure", label: "боюсь не справиться" },
          { value: "no_interest", label: "отсутствие интереса" },
          { value: "none", label: "ничего из перечисленного" },
          { value: "other", label: "другое" },
        ],
      },
      {
        code: "Q24",
        type: "MULTI_CHOICE",
        label: "В чём вам особенно может понадобиться помощь преподавателя?",
        required: true,
        indexGroup: "BARRIERS",
        helperText: "Можно выбрать несколько.",
        options: [
          { value: "explain_complex", label: "объяснять сложные темы" },
          { value: "grammar_help", label: "помогать с грамматикой" },
          { value: "vocabulary_help", label: "помогать расширять словарный запас" },
          { value: "speaking_practice", label: "тренировать говорение" },
          { value: "listening_practice", label: "тренировать понимание речи" },
          { value: "writing_help", label: "помогать писать тексты" },
          { value: "more_practice", label: "давать больше практики" },
          { value: "presentation_prep", label: "помогать готовиться к выступлениям" },
          { value: "professional_english_help", label: "помогать с профессиональным английским" },
          { value: "planning_help", label: "помогать планировать самостоятельную работу" },
          { value: "dont_know_yet", label: "пока не знаю" },
        ],
      },
    ],
  },
  {
    id: "professional",
    title: "Английский и профессия",
    questions: [
      {
        code: "Q25",
        type: "SINGLE_CHOICE",
        label: "Как вы думаете, понадобится ли английский в вашей будущей профессии?",
        required: true,
        indexGroup: "PROFESSIONAL_ORIENTATION",
        options: [
          { value: "definitely_yes", label: "точно понадобится" },
          { value: "probably_yes", label: "скорее понадобится" },
          { value: "dont_know_yet", label: "пока не знаю" },
          { value: "probably_not", label: "скорее не понадобится" },
          { value: "definitely_not", label: "точно не понадобится" },
        ],
      },
      {
        code: "Q26",
        type: "MULTI_CHOICE",
        label: "Где английский может понадобиться в вашей профессии?",
        required: true,
        indexGroup: "PROFESSIONAL_ORIENTATION",
        helperText: "Можно выбрать несколько.",
        visibleIf: visibleIfProfessionalRelevant,
        options: [
          { value: "professional_literature", label: "профессиональная литература" },
          { value: "software_services", label: "программное обеспечение и цифровые сервисы" },
          { value: "documentation", label: "документация" },
          { value: "business_correspondence", label: "деловая переписка" },
          { value: "client_work", label: "работа с клиентами" },
          { value: "negotiations", label: "переговоры" },
          { value: "international_companies", label: "международные компании" },
          { value: "business_trips", label: "командировки" },
          { value: "presentations", label: "презентации" },
          { value: "conferences", label: "конференции" },
          { value: "working_with_prof_info", label: "работа с профессиональной информацией" },
          { value: "dont_know_yet", label: "пока не знаю" },
        ],
      },
      {
        code: "Q27",
        type: "SCALE_1_5",
        label: "Насколько вам интересен профессиональный английский?",
        required: true,
        indexGroup: "PROFESSIONAL_ORIENTATION",
        visibleIf: visibleIfProfessionalRelevant,
      },
      {
        code: "Q25_ALT",
        type: "TEXTAREA",
        label: "Что могло бы изменить ваше мнение?",
        required: false,
        indexGroup: "PROFESSIONAL_ORIENTATION",
        visibleIf: visibleIfQ25DefinitelyNot,
      },
    ],
  },
  {
    id: "participation",
    title: "Проекты, конкурсы и конференции",
    questions: [
      {
        code: "Q28",
        type: "MULTI_CHOICE",
        label: "Был ли у вас опыт участия в следующих видах деятельности?",
        required: true,
        indexGroup: "PARTICIPATION_POTENTIAL",
        helperText: "Можно выбрать несколько.",
        options: [
          { value: "conferences", label: "конференции" },
          { value: "olympiads", label: "олимпиады" },
          { value: "competitions", label: "конкурсы" },
          { value: "research_projects", label: "исследовательские проекты" },
          { value: "project_activity", label: "проектная деятельность" },
          { value: "publications", label: "публикации" },
          { value: "presentations", label: "презентации" },
          { value: "public_speaking", label: "публичные выступления" },
          { value: "none", label: "ничего из перечисленного" },
        ],
      },
      {
        code: "Q29",
        type: "MULTI_CHOICE",
        label: "Что вам было бы интересно попробовать в колледже?",
        required: true,
        indexGroup: "PARTICIPATION_POTENTIAL",
        helperText: "Можно выбрать несколько.",
        options: [
          { value: "conference", label: "конференция" },
          { value: "research_paper", label: "научный доклад" },
          { value: "publication", label: "публикация" },
          { value: "olympiad", label: "олимпиада" },
          { value: "competition", label: "конкурс" },
          { value: "research_project", label: "исследовательский проект" },
          { value: "presentation", label: "презентация" },
          { value: "speaking_in_english", label: "выступление на английском" },
          { value: "team_project", label: "командный проект" },
          { value: "mentoring", label: "наставничество" },
          { value: "nothing_yet", label: "пока ничего" },
        ],
      },
      {
        code: "Q30",
        type: "SINGLE_CHOICE",
        label: "Что сейчас сильнее всего мешает вам участвовать?",
        required: true,
        indexGroup: "PARTICIPATION_POTENTIAL",
        options: [
          { value: "dont_know_how", label: "не знаю, как это делать" },
          { value: "fear_speaking", label: "боюсь выступать" },
          { value: "not_enough_knowledge", label: "считаю, что пока недостаточно знаний" },
          { value: "not_enough_english", label: "недостаточно английского" },
          { value: "no_time", label: "не хватает времени" },
          { value: "dont_know_where", label: "не знаю, где искать возможности" },
          { value: "not_interested_yet", label: "пока не интересно" },
          { value: "nothing_stops_me", label: "ничего не мешает" },
          { value: "other", label: "другое" },
        ],
      },
      {
        code: "Q31",
        type: "TEXTAREA",
        label: "Есть ли тема, которой вам было бы интересно заниматься глубже?",
        required: false,
        indexGroup: "PARTICIPATION_POTENTIAL",
        visibleIf: visibleIfParticipationInterestExists,
      },
    ],
  },
  {
    id: "collaboration",
    title: "Командная работа и soft skills",
    questions: [
      {
        code: "Q32",
        type: "SINGLE_CHOICE",
        label: "Как вы относитесь к работе в команде?",
        required: true,
        indexGroup: "COLLABORATION",
        options: [
          { value: "love_teamwork", label: "люблю работать в команде" },
          { value: "willing_if_needed", label: "готов(а), если задача этого требует" },
          { value: "prefer_alone", label: "предпочитаю работать один/одна" },
          { value: "dislike_teamwork", label: "командная работа мне не нравится" },
        ],
      },
      {
        code: "Q33",
        type: "MULTI_CHOICE",
        label: "Какие навыки вы хотели бы развивать в колледже?",
        required: true,
        indexGroup: "COLLABORATION",
        helperText: "Выберите до 4.",
        maxSelections: 4,
        options: [
          { value: "public_speaking", label: "публичные выступления" },
          { value: "teamwork", label: "работа в команде" },
          { value: "argumentation", label: "аргументация" },
          { value: "critical_thinking", label: "критическое мышление" },
          { value: "mentoring", label: "наставничество" },
          { value: "communication", label: "коммуникация" },
          { value: "time_management", label: "тайм-менеджмент" },
          { value: "research_skills", label: "исследовательские навыки" },
          { value: "digital_literacy", label: "цифровая грамотность" },
          { value: "other", label: "другое" },
        ],
      },
    ],
  },
  {
    id: "digital_ai",
    title: "Цифровые инструменты и ИИ",
    questions: [
      {
        code: "Q34",
        type: "MULTI_CHOICE",
        label: "Какие цифровые инструменты вы используете для учёбы?",
        required: true,
        indexGroup: "DIGITAL_AI_LITERACY",
        helperText: "Можно выбрать несколько.",
        options: [
          { value: "search_engines", label: "поисковые системы" },
          { value: "online_dictionaries", label: "онлайн-словари и переводчики" },
          { value: "education_platforms", label: "образовательные платформы" },
          { value: "language_apps", label: "приложения для изучения языков" },
          { value: "neural_networks", label: "нейросети" },
          { value: "presentation_services", label: "сервисы для презентаций" },
          { value: "text_services", label: "сервисы для работы с текстом" },
          { value: "almost_nothing", label: "практически ничего кроме обычных программ" },
        ],
      },
      {
        code: "Q35",
        type: "MULTI_CHOICE",
        label: "Для чего вы используете ИИ?",
        required: true,
        indexGroup: "DIGITAL_AI_LITERACY",
        helperText: "Можно выбрать несколько.",
        options: [
          { value: "search_explain", label: "поиск и объяснение информации" },
          { value: "translation", label: "перевод" },
          { value: "text_correction", label: "исправление текста" },
          { value: "notes", label: "создание конспектов" },
          { value: "idea_generation", label: "генерация идей" },
          { value: "presentation_prep", label: "подготовка презентаций" },
          { value: "homework_help", label: "помощь с учебными заданиями" },
          { value: "project_creation", label: "создание проектов" },
          { value: "not_using_ai", label: "пока не использую ИИ" },
        ],
      },
      {
        code: "Q36",
        type: "SCALE_1_5",
        label: "Насколько уверенно вы умеете формулировать запрос для нейросети?",
        required: true,
        indexGroup: "DIGITAL_AI_LITERACY",
        helperText: "1 — практически не умею · 5 — умею получать нужный результат с помощью точного запроса",
        visibleIf: visibleIfUsesAi,
      },
    ],
  },
  {
    id: "goals",
    title: "Мои цели",
    questions: [
      {
        code: "Q37",
        type: "MULTI_CHOICE",
        label: "Какие цели на первый год обучения для вас наиболее важны?",
        required: true,
        indexGroup: "GOAL_COMMITMENT",
        helperText: "Выберите до 3.",
        maxSelections: 3,
        options: [
          { value: "improve_general_english", label: "улучшить общий английский" },
          { value: "understand_speech", label: "научиться понимать речь" },
          { value: "speak_confidently", label: "научиться говорить увереннее" },
          { value: "read_professional_texts", label: "научиться читать профессиональные тексты" },
          { value: "expand_professional_vocab", label: "расширить профессиональный словарный запас" },
          { value: "learn_to_write", label: "научиться писать на английском" },
          { value: "stop_fearing_english", label: "перестать бояться английского" },
          { value: "pass_tests", label: "успешно сдавать контрольные и зачёт" },
          { value: "participate_competitions", label: "участвовать в конкурсах" },
          { value: "participate_conferences", label: "участвовать в конференциях" },
          { value: "prepare_publication", label: "подготовить публикацию" },
          { value: "use_in_profession", label: "использовать английский в будущей профессии" },
        ],
      },
      {
        code: "Q38",
        type: "TEXTAREA",
        label: "Через год я хочу уметь...",
        required: true,
        indexGroup: "GOAL_COMMITMENT",
        helperText: "1–2 предложения.",
      },
      {
        code: "Q39",
        type: "SCALE_1_5",
        label: "Насколько вы готовы лично работать для достижения этой цели?",
        required: true,
        indexGroup: "GOAL_COMMITMENT",
        helperText: "1 — пока не готов(а) · 5 — готов(а) работать регулярно",
      },
      {
        code: "Q40",
        type: "MULTI_CHOICE",
        label: "Что конкретно вы готовы делать?",
        required: true,
        indexGroup: "GOAL_COMMITMENT",
        helperText: "Можно выбрать несколько.",
        options: [
          { value: "complete_tasks", label: "выполнять задания" },
          { value: "extra_study", label: "заниматься дополнительно" },
          { value: "learn_vocab_regularly", label: "регулярно учить лексику" },
          { value: "watch_listen_materials", label: "смотреть/слушать материалы на английском" },
          { value: "speak_in_class", label: "говорить на занятиях" },
          { value: "participate_projects", label: "участвовать в проектах" },
          { value: "participate_competitions_conferences", label: "участвовать в конкурсах/конференциях" },
          { value: "work_independently", label: "работать самостоятельно" },
          { value: "use_digital_tools", label: "использовать цифровые инструменты" },
          { value: "use_ai_for_learning", label: "использовать ИИ для обучения" },
        ],
      },
    ],
  },
  {
    id: "metacognitive",
    title: "Заключительные вопросы",
    questions: [
      { code: "Q41", type: "TEXTAREA", label: "Сейчас я умею...", required: true, indexGroup: "METACOGNITIVE" },
      {
        code: "Q42",
        type: "TEXTAREA",
        label: "Через год я хочу уметь...",
        required: true,
        indexGroup: "METACOGNITIVE",
      },
      { code: "Q43", type: "TEXTAREA", label: "Для этого я готов(а)...", required: true, indexGroup: "METACOGNITIVE" },
      {
        code: "Q44",
        type: "TEXTAREA",
        label: "Мне может понадобиться помощь в...",
        required: false,
        indexGroup: "METACOGNITIVE",
      },
      {
        code: "Q45",
        type: "TEXTAREA",
        label: "Что преподавателю важно знать о вас, чтобы помочь вам лучше учиться английскому?",
        required: false,
        indexGroup: "METACOGNITIVE",
      },
    ],
  },
];

export function getAllQuestions(): QuestionDef[] {
  return QUESTIONNAIRE_BLOCKS.flatMap((b) => b.questions);
}

export function findQuestion(code: string): QuestionDef | undefined {
  return getAllQuestions().find((q) => q.code === code);
}

export function isQuestionVisible(question: QuestionDef, answers: Record<string, unknown>): boolean {
  return !question.visibleIf || question.visibleIf(answers);
}

export function getVisibleQuestions(answers: Record<string, unknown>): QuestionDef[] {
  return getAllQuestions().filter((q) => isQuestionVisible(q, answers));
}

// "Отвечено" зависит от типа вопроса — пустая строка/пустой массив не
// считаются ответом, даже если запись в БД технически существует
// (черновик мог быть очищен пользователем).
export function hasAnswer(question: QuestionDef, value: unknown): boolean {
  if (value === undefined || value === null) return false;
  switch (question.type) {
    case "TEXT":
    case "TEXTAREA":
      return typeof value === "string" && value.trim().length > 0;
    case "SINGLE_CHOICE":
      return typeof value === "string" && value.length > 0;
    case "MULTI_CHOICE":
      return Array.isArray(value) && value.length > 0;
    case "SCALE_1_5":
      return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 5;
    case "MATRIX_SCALE_1_5": {
      if (typeof value !== "object" || value === null) return false;
      const items = question.matrixItems ?? [];
      return items.every((item) => {
        const v = (value as Record<string, unknown>)[item.value];
        return typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 5;
      });
    }
    default:
      return false;
  }
}

export const TOTAL_BLOCKS = QUESTIONNAIRE_BLOCKS.length;
