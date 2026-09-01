// English Start Profile — Этап 7: ПОЛНЫЙ ПРОФИЛЬ СТУДЕНТА.
//
// Вкладка «Обзор» отвечает на вопрос "почему это происходит", а не
// просто повторяет цифры Dashboard — этот файл превращает те же самые
// сохранённые данные (диагностика, анкета) в короткие текстовые
// формулировки: сильные стороны, зоны развития, потенциал,
// рекомендуемый фокус с обоснованием. Как и analytics/insights.ts,
// каждый вывод объясним и прослеживается до конкретных сохранённых
// данных (ТЗ Этапа 7, п.26) — никогда не "психологический диагноз" и
// никогда не вывод по одному-единственному ответу без остального
// контекста.
import { findQuestion } from "../questionnaire/definition";
import {
  BARRIERS_QUESTION_CODE,
  DASHBOARD_QUESTION_CODES,
  SELF_ASSESSMENT_QUESTION_CODE,
  skillLabelRu,
  type PotentialSignals,
  type SkillBreakdownEntry,
} from "./scoring";

// Дополнительные вопросы, нужные только вкладке «Обзор» профиля (сверх
// 9 кодов Dashboard) — готовность работать, предпочитаемые способы
// обучения, необходимая поддержка, опыт участия, комфорт в устной
// речи, главная цель, цели года, планируемые действия. Всё ещё
// значительно меньше 45 — сохраняем принцип "не тянуть лишнее"
// (ТЗ Этапа 6 п.19, повторено в Этапе 7 п.24), просто здесь "нужное"
// шире, чем для Dashboard.
export const PROFILE_QUESTION_CODES = Array.from(
  new Set([...DASHBOARD_QUESTION_CODES, "Q13", "Q19", "Q24", "Q28", "Q38", "Q39", "Q40"])
);

const STRONG_SKILL_THRESHOLD = 70;
const WEAK_SKILL_THRESHOLD = 50;
const STRONG_SCALE_THRESHOLD = 4;
const WEAK_SCALE_THRESHOLD = 2.5;

export interface ProfileInputs {
  diagnosticPercentage: number | null;
  skillBreakdown: SkillBreakdownEntry[] | null;
  selfAssessment: number | null;
  motivation: number | null;
  autonomy: number | null;
  answers: Record<string, unknown>; // PROFILE_QUESTION_CODES
}

function selfAssessmentMatrix(answers: Record<string, unknown>): Record<string, number> {
  const raw = answers[SELF_ASSESSMENT_QUESTION_CODE];
  if (!raw || typeof raw !== "object") return {};
  const items = findQuestion(SELF_ASSESSMENT_QUESTION_CODE)?.matrixItems ?? [];
  const result: Record<string, number> = {};
  for (const item of items) {
    const v = (raw as Record<string, unknown>)[item.value];
    if (typeof v === "number") result[item.value] = v;
  }
  return result;
}

const SELF_ASSESSMENT_LABELS_RU: Record<string, string> = {
  reading: "Чтение",
  listening: "Аудирование",
  speaking: "Говорение",
  writing: "Письмо",
  professional: "Профессиональный английский",
};

// Диагностика покрывает только Grammar/Vocabulary/Reading/Listening —
// у самооценки Reading/Listening есть объективная пара в диагностике,
// у Speaking/Writing/Professional объективной пары нет вообще (эти
// навыки не тестируются, см. Этап 5). Чтобы не дублировать один и тот
// же вывод дважды ("сильное чтение" из диагностики и из самооценки),
// самооценка формирует сильные/слабые стороны только для тех пунктов,
// у которых нет пересекающегося диагностического навыка.
const SELF_ASSESSMENT_SKILL_OVERLAP: Record<string, string> = { reading: "READING", listening: "LISTENING" };

function includesAny(value: unknown, targets: string[]): boolean {
  return Array.isArray(value) && targets.some((t) => value.includes(t));
}

export function hasProfessionalInterest(answers: Record<string, unknown>): boolean {
  return includesAny(answers.Q37, ["use_in_profession"]) || includesAny(answers.Q29, ["conference", "presentation"]);
}

export function hasPublicSpeakingSignal(answers: Record<string, unknown>): boolean {
  const q13 = answers.Q13;
  return (typeof q13 === "number" && q13 >= STRONG_SCALE_THRESHOLD) || includesAny(answers.Q28, ["public_speaking"]) || includesAny(answers.Q29, ["speaking_in_english"]);
}

interface Signal {
  label: string;
  weight: number; // относительная значимость для отбора топ-N, не для «Требуют внимания» (там своя шкала)
}

// --- Сильные стороны / зоны развития -----------------------------------

// Вес каждого сигнала нормализован к диапазону 0–1 ("насколько сильно
// он выражен относительно своего порога, по отношению к своей
// собственной шкале") — иначе сырой процент диагностики (0–100) всегда
// перевешивал бы самооценку/мотивацию/самостоятельность (1–5) просто
// потому, что их шкалы разного размера, и топ-4 состоял бы только из
// диагностических навыков, даже когда высокая мотивация — более яркий
// сигнал. Так навык с результатом 100% (полностью выше порога 70%,
// вес 1.0) сравним с самооценкой 5/5 (полностью выше порога 4, вес
// 1.0), а не выглядит "в 20 раз важнее" только из-за масштаба шкалы.
function normalizedAbove(value: number, threshold: number, max: number): number {
  return Math.max(0, (value - threshold) / (max - threshold));
}
function normalizedBelow(value: number, threshold: number, min: number): number {
  return Math.max(0, (threshold - value) / (threshold - min));
}

export function computeStrengths(inputs: ProfileInputs): string[] {
  const signals: Signal[] = [];
  const coveredSkills = new Set<string>();

  if (inputs.skillBreakdown) {
    for (const s of inputs.skillBreakdown) {
      if (s.percentage >= STRONG_SKILL_THRESHOLD) {
        signals.push({ label: `Сильный результат по навыку «${skillLabelRu(s.skill)}»`, weight: normalizedAbove(s.percentage, STRONG_SKILL_THRESHOLD, 100) });
      }
      coveredSkills.add(s.skill);
    }
  }
  const selfMatrix = selfAssessmentMatrix(inputs.answers);
  for (const [key, value] of Object.entries(selfMatrix)) {
    const overlap = SELF_ASSESSMENT_SKILL_OVERLAP[key];
    if (overlap && coveredSkills.has(overlap)) continue; // уже отражено через диагностику
    if (value >= STRONG_SCALE_THRESHOLD) {
      signals.push({ label: `Уверенность в навыке «${SELF_ASSESSMENT_LABELS_RU[key] ?? key}» (самооценка)`, weight: normalizedAbove(value, STRONG_SCALE_THRESHOLD, 5) });
    }
  }
  if (inputs.motivation !== null && inputs.motivation >= STRONG_SCALE_THRESHOLD) {
    signals.push({ label: "Высокая мотивация", weight: normalizedAbove(inputs.motivation, STRONG_SCALE_THRESHOLD, 5) });
  }
  if (inputs.autonomy !== null && inputs.autonomy >= STRONG_SCALE_THRESHOLD) {
    signals.push({ label: "Высокая учебная самостоятельность", weight: normalizedAbove(inputs.autonomy, STRONG_SCALE_THRESHOLD, 5) });
  }
  if (hasProfessionalInterest(inputs.answers)) {
    signals.push({ label: "Интерес к профессиональному английскому", weight: 0.5 }); // качественный сигнал без числовой шкалы — фиксированный средний вес
  }

  return signals
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 4)
    .map((s) => s.label);
}

const BARRIER_LABEL_FALLBACK: Record<string, string> = {
  lack_of_time: "нехватка времени",
  material_difficulty: "сложность материала",
  fear_mistakes: "страх ошибиться",
  fear_speaking_public: "страх говорить перед группой",
  listening_difficulty: "трудности с пониманием речи",
  forget_words_fast: "быстро забывает слова",
  hard_self_study: "трудно заниматься самостоятельно",
  no_practical_benefit: "не видит практической пользы",
  fear_failure: "боится не справиться",
  no_interest: "отсутствие интереса",
  other: "другое",
};

function barrierLabel(code: string): string {
  return findQuestion(BARRIERS_QUESTION_CODE)?.options?.find((o) => o.value === code)?.label ?? BARRIER_LABEL_FALLBACK[code] ?? code;
}

export function computeWeaknesses(inputs: ProfileInputs): string[] {
  const signals: Signal[] = [];
  const coveredSkills = new Set<string>();

  if (inputs.skillBreakdown) {
    for (const s of inputs.skillBreakdown) {
      if (s.percentage < WEAK_SKILL_THRESHOLD) {
        signals.push({ label: skillLabelRu(s.skill), weight: normalizedBelow(s.percentage, WEAK_SKILL_THRESHOLD, 0) });
      }
      coveredSkills.add(s.skill);
    }
  }
  const selfMatrix = selfAssessmentMatrix(inputs.answers);
  for (const [key, value] of Object.entries(selfMatrix)) {
    const overlap = SELF_ASSESSMENT_SKILL_OVERLAP[key];
    if (overlap && coveredSkills.has(overlap)) continue;
    if (value <= 2) {
      signals.push({ label: SELF_ASSESSMENT_LABELS_RU[key] ?? key, weight: normalizedBelow(value, 2, 1) });
    }
  }
  if (inputs.motivation !== null && inputs.motivation < WEAK_SCALE_THRESHOLD) {
    signals.push({ label: "Мотивация", weight: normalizedBelow(inputs.motivation, WEAK_SCALE_THRESHOLD, 1) });
  }
  if (inputs.autonomy !== null && inputs.autonomy < WEAK_SCALE_THRESHOLD) {
    signals.push({ label: "Учебная самостоятельность", weight: normalizedBelow(inputs.autonomy, WEAK_SCALE_THRESHOLD, 1) });
  }
  const barriers = inputs.answers[BARRIERS_QUESTION_CODE];
  if (Array.isArray(barriers)) {
    for (const code of barriers) {
      if (code === "none") continue;
      signals.push({ label: barrierLabel(code), weight: 0.5 }); // качественный сигнал без числовой шкалы — фиксированный средний вес
    }
  }

  return signals
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 4)
    .map((s) => s.label);
}

// --- Потенциал (несколько меток одновременно, в отличие от Dashboard,
// где для компактности списка группы выбирается только одна) ----------

const STRONG_MOTIVATION_THRESHOLD = 4;
const STRONG_AUTONOMY_THRESHOLD = 4;
const STRONG_DIAGNOSTIC_THRESHOLD = 70;

export function computePotentialBadges(inputs: ProfileInputs, potential: PotentialSignals): string[] {
  const strongMotivation = inputs.motivation !== null && inputs.motivation >= STRONG_MOTIVATION_THRESHOLD;
  const strongAutonomy = inputs.autonomy !== null && inputs.autonomy >= STRONG_AUTONOMY_THRESHOLD;
  const strongDiagnostic = inputs.diagnosticPercentage !== null && inputs.diagnosticPercentage >= STRONG_DIAGNOSTIC_THRESHOLD;
  if (!strongMotivation && !strongAutonomy && !strongDiagnostic) return [];

  const badges: string[] = [];
  if (potential.research) badges.push("Исследовательский потенциал");
  if (potential.conference) badges.push("Конференционный потенциал");
  if (potential.project) badges.push("Проектный потенциал");
  if (hasPublicSpeakingSignal(inputs.answers)) badges.push("Потенциал публичного выступления");
  return badges;
}

// --- Рекомендуемый фокус (максимум 3, каждая — с обоснованием) --------

export interface RecommendationEntry {
  label: string;
  reasonLines: string[];
  source: string;
}

const BARRIER_RECOMMENDATION: Record<string, string> = {
  lack_of_time: "Помочь спланировать регулярную самостоятельную работу",
  material_difficulty: "Подобрать задания текущего уровня сложности",
  fear_mistakes: "Увеличить практику устной речи в комфортной обстановке",
  fear_speaking_public: "Увеличить практику устной речи в комфортной обстановке",
  listening_difficulty: "Развивать аудирование",
  forget_words_fast: "Регулярно повторять лексику небольшими порциями",
  hard_self_study: "Поддержать планирование самостоятельной работы",
  no_practical_benefit: "Показать практическое применение английского в профессии",
  fear_failure: "Увеличить практику в комфортной, некритичной обстановке",
  no_interest: "Связать задания с профессиональными интересами студента",
};

export function computeRecommendedFocus(inputs: ProfileInputs): RecommendationEntry[] {
  const recommendations: RecommendationEntry[] = [];

  // 1) Самые слабые из ПРОТЕСТИРОВАННЫХ навыков — самый прямой,
  // прослеживаемый до числа источник рекомендации.
  if (inputs.skillBreakdown) {
    const weakSkills = [...inputs.skillBreakdown]
      .filter((s) => s.percentage < WEAK_SKILL_THRESHOLD)
      .sort((a, b) => a.percentage - b.percentage);
    const selfMatrix = selfAssessmentMatrix(inputs.answers);
    for (const s of weakSkills) {
      if (recommendations.length >= 3) break;
      const reasonLines = [`${skillLabelRu(s.skill)} — ${s.percentage}%`];
      const selfKey = Object.entries(SELF_ASSESSMENT_SKILL_OVERLAP).find(([, v]) => v === s.skill)?.[0];
      let source = "Start Diagnostic";
      if (selfKey && selfKey in selfMatrix) {
        reasonLines.push(`Самооценка (${SELF_ASSESSMENT_LABELS_RU[selfKey]}) — ${selfMatrix[selfKey]}/5`);
        source = "Start Profile + Start Diagnostic";
      }
      recommendations.push({ label: `Развивать «${skillLabelRu(s.skill)}»`, reasonLines, source });
    }
  }

  // 2) Барьеры, отмеченные студентом — сгруппированные по итоговой
  // рекомендации (несколько барьеров могут указывать на одну и ту же
  // практическую меру, например страх ошибиться и страх выступать
  // перед группой — оба про устную практику в безопасной обстановке).
  if (recommendations.length < 3) {
    const barriers = inputs.answers[BARRIERS_QUESTION_CODE];
    if (Array.isArray(barriers)) {
      const byLabel = new Map<string, string[]>();
      for (const code of barriers) {
        const recLabel = BARRIER_RECOMMENDATION[code];
        if (!recLabel) continue;
        if (!byLabel.has(recLabel)) byLabel.set(recLabel, []);
        byLabel.get(recLabel)!.push(barrierLabel(code));
      }
      for (const [label, sourceBarriers] of byLabel) {
        if (recommendations.length >= 3) break;
        if (recommendations.some((r) => r.label === label)) continue;
        recommendations.push({
          label,
          reasonLines: [`Отмеченный барьер: ${sourceBarriers.join(", ")}`],
          source: "Start Profile",
        });
      }
    }
  }

  // 3) Профессиональная лексика в устной практике — только если есть
  // и интерес к профессиональному английскому, и барьер, связанный с
  // говорением (иначе это была бы рекомендация "просто так", без
  // основания в данных).
  if (recommendations.length < 3 && hasProfessionalInterest(inputs.answers)) {
    const barriers = inputs.answers[BARRIERS_QUESTION_CODE];
    const hasSpeakingBarrier = Array.isArray(barriers) && barriers.some((c) => c === "fear_speaking_public" || c === "fear_mistakes");
    const selfMatrix = selfAssessmentMatrix(inputs.answers);
    const professionalSelf = selfMatrix.professional;
    if (hasSpeakingBarrier || (typeof professionalSelf === "number" && professionalSelf < STRONG_SCALE_THRESHOLD)) {
      const reasonLines = ["Интерес к профессиональному английскому отмечен в анкете"];
      if (typeof professionalSelf === "number") reasonLines.push(`Самооценка (Профессиональный английский) — ${professionalSelf}/5`);
      recommendations.push({
        label: "Использовать профессиональную лексику в устных заданиях",
        reasonLines,
        source: "Start Profile",
      });
    }
  }

  return recommendations.slice(0, 3);
}
