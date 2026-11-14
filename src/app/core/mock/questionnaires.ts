import { AnswerValue, Assignment, Questionnaire, QuestionnaireId, QuestionOption } from '../models';
import { at } from './mission-plan';

/*
 * Nova Healix questionnaires. All questions are written for this mission;
 * they are NOT copies of any copyrighted clinical instrument.
 * Scale answers are 1–5; scores are normalised to 0–100 where higher = more strain.
 */

const OFTEN: QuestionOption[] = [
  { value: 1, label: 'Never' },
  { value: 2, label: 'Rarely' },
  { value: 3, label: 'Sometimes' },
  { value: 4, label: 'Often' },
  { value: 5, label: 'Very often' },
];

const AGREE: QuestionOption[] = [
  { value: 1, label: 'Not at all' },
  { value: 2, label: 'A little' },
  { value: 3, label: 'Somewhat' },
  { value: 4, label: 'Mostly' },
  { value: 5, label: 'Completely' },
];

const LEVEL: QuestionOption[] = [
  { value: 1, label: 'Very low' },
  { value: 2, label: 'Low' },
  { value: 3, label: 'Moderate' },
  { value: 4, label: 'High' },
  { value: 5, label: 'Very high' },
];

export const QUESTIONNAIRES: Record<QuestionnaireId, Questionnaire> = {
  wellbeing: {
    id: 'wellbeing',
    title: 'Weekly wellbeing',
    purpose: 'How the past week felt. Helps spot isolation stress early.',
    minutes: 2,
    hazards: ['isolation', 'distance'],
    feeds: 'stress',
    scoreMeaning: 'more stress',
    questions: [
      { id: 'w1', kind: 'scale', options: OFTEN, text: 'This week, how often did you feel on edge or unable to relax?' },
      { id: 'w2', kind: 'scale', options: AGREE, reverse: true, text: 'After work, were you able to switch off?' },
      { id: 'w3', kind: 'scale', options: AGREE, reverse: true, text: 'Did you feel connected to the rest of the crew?' },
      { id: 'w4', kind: 'scale', options: AGREE, reverse: true, text: 'Did you feel connected to people at home?' },
      { id: 'w5', kind: 'scale', options: OFTEN, text: 'How often did small problems feel bigger than usual?' },
      { id: 'w6', kind: 'text', optional: true, text: 'Anything you would like the flight surgeon to know?' },
    ],
  },
  sleep: {
    id: 'sleep',
    title: 'Sleep',
    purpose: 'What is getting in the way of good sleep on board.',
    minutes: 1,
    hazards: ['isolation', 'environment'],
    scoreMeaning: 'worse sleep',
    questions: [
      { id: 's1', kind: 'scale', options: OFTEN, text: 'How often did it take you more than 30 minutes to fall asleep?' },
      { id: 's2', kind: 'scale', options: OFTEN, text: 'How often did you wake up during your sleep period?' },
      { id: 's3', kind: 'scale', options: AGREE, reverse: true, text: 'Did you feel rested when you woke up?' },
      { id: 's4', kind: 'scale', options: OFTEN, text: 'How often did noise, light or temperature disturb your sleep?' },
      { id: 's5', kind: 'scale', options: OFTEN, text: 'How often did you struggle to stay alert during the work day?' },
    ],
  },
  workload: {
    id: 'workload',
    title: 'Workload',
    purpose: 'How demanding the week was, with less help from Earth.',
    minutes: 1,
    hazards: ['distance', 'isolation'],
    feeds: 'workload',
    scoreMeaning: 'heavier workload',
    questions: [
      { id: 'k1', kind: 'scale', options: LEVEL, text: 'How mentally demanding was your work this week?' },
      { id: 'k2', kind: 'scale', options: LEVEL, text: 'How much time pressure did you feel?' },
      { id: 'k3', kind: 'scale', options: OFTEN, text: 'How often did you have to make a decision you would normally check with Earth?' },
      { id: 'k4', kind: 'scale', options: AGREE, reverse: true, text: 'Were you able to finish your planned tasks?' },
      { id: 'k5', kind: 'scale', options: LEVEL, text: 'How tired were you at the end of the work day?' },
    ],
  },
  team: {
    id: 'team',
    title: 'Team dynamics',
    purpose: 'How the crew is getting along in a small space.',
    minutes: 2,
    hazards: ['isolation'],
    scoreMeaning: 'more strain in the team',
    questions: [
      { id: 't1', kind: 'scale', options: AGREE, reverse: true, text: 'Do you feel heard when you raise something with the crew?' },
      { id: 't2', kind: 'scale', options: OFTEN, text: 'How often were there tensions or disagreements this week?' },
      { id: 't3', kind: 'scale', options: AGREE, reverse: true, text: 'Do you get enough private time and space?' },
      { id: 't4', kind: 'scale', options: AGREE, reverse: true, text: 'Do you feel tasks are shared fairly?' },
      { id: 't5', kind: 'scale', options: AGREE, reverse: true, text: 'If you had a problem, would you feel comfortable asking a crewmate for help?' },
      { id: 't6', kind: 'text', optional: true, text: 'Anything else about life on board you want to mention?' },
    ],
  },
};

/** 0–100, higher = more strain. Text answers are ignored. */
export function scoreQuestionnaire(q: Questionnaire, answers: Record<string, AnswerValue>): number {
  const vals: number[] = [];
  for (const question of q.questions) {
    if (question.kind !== 'scale') continue;
    const a = answers[question.id];
    if (typeof a !== 'number') continue;
    vals.push(question.reverse ? 6 - a : a);
  }
  if (!vals.length) return 0;
  const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
  return Math.round(((mean - 1) / 4) * 100);
}

/** Assignments already on board at Day 142 (assigned by the flight surgeon). */
export function seedAssignments(surgeon: string): Assignment[] {
  const base = { assignedBy: surgeon, status: 'assigned' as const, answers: {}, currentIndex: 0 };
  return [
    ...['hashir', 'ahmad', 'hannan', 'sabaina'].map((crewId) => ({
      ...base,
      id: `as-wellbeing-${crewId}-142`,
      crewId,
      questionnaireId: 'wellbeing' as const,
      assignedAt: at(140, 20),
      dueDay: 147,
      note: 'Routine weekly questionnaire.',
    })),
    {
      ...base,
      id: 'as-sleep-ahmad-141',
      crewId: 'ahmad',
      questionnaireId: 'sleep',
      assignedAt: at(141, 15),
      dueDay: 143,
      note: 'Your sleep has been short before EVA-3. Five quick questions so we can help.',
    },
    {
      ...base,
      id: 'as-team-hannan-141',
      crewId: 'hannan',
      questionnaireId: 'team',
      assignedAt: at(141, 14),
      dueDay: 144,
      note: 'No pressure. Just checking how life on board is going for you.',
      // Started earlier and left unfinished: demonstrates resuming.
      status: 'in-progress',
      answers: { t1: 2, t2: 4 },
      currentIndex: 2,
    },
  ];
}
