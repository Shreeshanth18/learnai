export type CompetencyStatus = 'Strong' | 'Building' | 'Needs focus';
export type Competency = { id: string; name: string; score: number; status: CompetencyStatus; category: string; trend: number; color: string };
export type Course = { id: string; title: string; skill: string; duration: string; level: string; progress: number; relevance: number; description: string; lessons: number; phase: string; format: string; outcome: string };
export type QuizQuestion = { id: string; prompt: string; options: string[]; answer: string; explanation: string; topic: string; difficulty: string };
export type ChatMessage = { id: string; role: 'user' | 'tutor'; text: string; time: string };
export type Activity = { day: string; minutes: number; label: string };
export type LearnerProfile = { name: string; role: string; institution: string; interests: string[]; preferences?: Record<string, boolean> };

export const defaultProfile: LearnerProfile = {
  name: 'Learner',
  role: 'Official Statistics Officer',
  institution: 'National Statistical Capacity Building Programme',
  interests: ['Official statistics', 'Data quality', 'Digital governance'],
};

export const competencies: Competency[] = [
  { id: 'digital-governance', name: 'Digital governance', score: 78, status: 'Strong', category: 'Governance', trend: 8, color: '#e6a04f' },
  { id: 'official-statistics', name: 'Official statistics and data quality', score: 64, status: 'Building', category: 'Statistical practice', trend: 12, color: '#2e9b91' },
  { id: 'data-privacy', name: 'Data privacy and security', score: 59, status: 'Building', category: 'Responsible digital practice', trend: 5, color: '#5f7da8' },
  { id: 'policy-implementation', name: 'Policy implementation', score: 41, status: 'Needs focus', category: 'Governance', trend: -2, color: '#d87462' },
  { id: 'public-communication', name: 'Public communication', score: 53, status: 'Building', category: 'Citizen engagement', trend: 4, color: '#8f7db7' },
  { id: 'digital-tools', name: 'Digital tools for service delivery', score: 82, status: 'Strong', category: 'Technology', trend: 7, color: '#4e9b75' },
];

export const courses: Course[] = [
  { id: 'frame-the-right-problem', title: 'Frame the right problem', skill: 'Problem framing', duration: '26 min', level: 'Foundations', progress: 0, relevance: 94, lessons: 4, phase: '01 · Discover', format: 'Guided course', outcome: 'Write a focused opportunity statement.', description: 'Move from solution-first thinking to a crisp opportunity statement rooted in people, context, and impact.' },
  { id: 'research-real-needs', title: 'Research real needs', skill: 'User research', duration: '38 min', level: 'Foundations', progress: 0, relevance: 88, lessons: 5, phase: '01 · Discover', format: 'Practice lab', outcome: 'Plan an interview that surfaces real behavior.', description: 'Turn assumptions into useful questions and find the evidence hiding in recent learner experiences.' },
  { id: 'measuring-what-matters', title: 'Measuring what matters', skill: 'Evaluation & measurement', duration: '42 min', level: 'Foundations', progress: 0, relevance: 96, lessons: 5, phase: '02 · Measure', format: 'Guided course', outcome: 'Choose signals that connect activity to impact.', description: 'Turn fuzzy product questions into observable signals, useful experiments, and decisions your team can stand behind.' },
  { id: 'experiment-design', title: 'Design a useful experiment', skill: 'Evaluation & measurement', duration: '34 min', level: 'Applied', progress: 0, relevance: 91, lessons: 4, phase: '02 · Measure', format: 'Case study', outcome: 'Create a test with a clear comparison point.', description: 'Move beyond vanity metrics by connecting a product change to a behavior you can actually observe.' },
  { id: 'data-quality-decisions', title: 'Make decisions with imperfect data', skill: 'Data storytelling', duration: '31 min', level: 'Applied', progress: 0, relevance: 83, lessons: 4, phase: '02 · Measure', format: 'Decision lab', outcome: 'Name the limits of evidence before acting.', description: 'Practice making a responsible recommendation when the dataset is incomplete, noisy, or uneven.' },
  { id: 'from-insight-to-narrative', title: 'From insight to narrative', skill: 'Data storytelling', duration: '28 min', level: 'Intermediate', progress: 0, relevance: 84, lessons: 3, phase: '03 · Communicate', format: 'Studio workshop', outcome: 'Build an evidence-led story for a decision meeting.', description: 'Shape an evidence-led story that helps a busy audience see the decision hiding inside the data.' },
  { id: 'present-with-clarity', title: 'Present with clarity', skill: 'Data storytelling', duration: '24 min', level: 'Intermediate', progress: 0, relevance: 79, lessons: 3, phase: '03 · Communicate', format: 'Practice lab', outcome: 'Deliver a concise recommendation with evidence.', description: 'Make the important pattern easy to see and give your audience a clear next decision.' },
  { id: 'ai-product-briefs', title: 'Writing better AI product briefs', skill: 'AI literacy', duration: '35 min', level: 'Applied', progress: 0, relevance: 89, lessons: 4, phase: '04 · Build responsibly', format: 'Guided course', outcome: 'Scope an AI feature without overpromising.', description: 'A practical field guide for scoping responsible AI features without overpromising what the model can do.' },
  { id: 'evaluate-ai-systems', title: 'Evaluate AI systems fairly', skill: 'AI literacy', duration: '46 min', level: 'Intermediate', progress: 0, relevance: 92, lessons: 6, phase: '04 · Build responsibly', format: 'Case study', outcome: 'Design an evaluation that reveals uneven performance.', description: 'Learn how to inspect quality, uncertainty, and group-level differences before a system reaches users.' },
  { id: 'human-in-the-loop', title: 'Design meaningful human review', skill: 'Responsible AI', duration: '32 min', level: 'Intermediate', progress: 0, relevance: 86, lessons: 4, phase: '04 · Build responsibly', format: 'Scenario lab', outcome: 'Place review at the moments where it changes outcomes.', description: 'Use uncertainty and consequence to decide when a person should review an AI suggestion.' },
  { id: 'ship-the-learning-loop', title: 'Ship the learning loop', skill: 'Product thinking', duration: '40 min', level: 'Advanced', progress: 0, relevance: 80, lessons: 5, phase: '05 · Capstone', format: 'Capstone project', outcome: 'Connect a user need, intervention, and success signal.', description: 'Bring discovery, measurement, communication, and responsible AI into one realistic product proposal.' },
  { id: 'capstone-product-review', title: 'Capstone: product review', skill: 'Cross-functional collaboration', duration: '55 min', level: 'Advanced', progress: 0, relevance: 78, lessons: 5, phase: '05 · Capstone', format: 'Assessed project', outcome: 'Defend a product decision with evidence and trade-offs.', description: 'Complete a review-ready portfolio piece and receive a final competency signal.' },
];

export const quizQuestions: QuizQuestion[] = [
  { id: 'q1', topic: 'Evaluation & measurement', difficulty: 'Warm up', prompt: 'A learning team wants to know whether a new reflection activity is helping learners transfer a skill. Which signal is the strongest starting point?', options: ['How many people opened the activity', 'Learners applying the skill in a new scenario', 'How attractive the activity looks', 'The number of words in each response'], answer: 'Learners applying the skill in a new scenario', explanation: 'Transfer into a new scenario is closer to the outcome than simple attention or completion signals.', },
  { id: 'q2', topic: 'AI literacy', difficulty: 'Core', prompt: 'What is the most responsible way to describe a prototype AI recommendation in a product brief?', options: ['The system understands exactly what every learner needs', 'The model guarantees better learning outcomes', 'The prototype suggests a next step from observed signals', 'The AI replaces the need for a mentor'], answer: 'The prototype suggests a next step from observed signals', explanation: 'Clear boundaries build trust: a prototype can surface a useful signal without claiming certainty or replacing human judgment.', },
  { id: 'q3', topic: 'Problem framing', difficulty: 'Stretch', prompt: 'Which opportunity statement is most useful for a product team?', options: ['Build a dashboard for all learners', 'Make the app more engaging', 'Help early-career analysts choose a focused practice task after a quiz', 'Add AI to the home page'], answer: 'Help early-career analysts choose a focused practice task after a quiz', explanation: 'A useful frame names a person, context, and desired change while leaving room for multiple solutions.', },
  { id: 'q4', topic: 'Data storytelling', difficulty: 'Warm up', prompt: 'What makes a chart useful in a decision meeting?', options: ['It uses the most colors possible', 'It makes the decision-relevant pattern easy to see', 'It includes every available data point', 'It uses a three-dimensional layout'], answer: 'It makes the decision-relevant pattern easy to see', explanation: 'A useful chart reduces interpretation effort and keeps attention on the evidence needed for the decision.', },
  { id: 'q5', topic: 'Responsible AI', difficulty: 'Core', prompt: 'A model performs well overall but poorly for one learner group. What should the team do first?', options: ['Hide the group breakdown', 'Ship because the average score is strong', 'Investigate the difference and its impact before release', 'Delete the evaluation results'], answer: 'Investigate the difference and its impact before release', explanation: 'Aggregate performance can conceal harmful gaps. Disaggregated evaluation helps the team understand and address them.', },
  { id: 'q6', topic: 'Product thinking', difficulty: 'Core', prompt: 'Which experiment result is most useful for deciding what to build next?', options: ['The feature received compliments', 'The team spent two weeks building it', 'A defined user behavior changed against a comparison point', 'The launch announcement got many views'], answer: 'A defined user behavior changed against a comparison point', explanation: 'A clear outcome and comparison make evidence more useful than enthusiasm, effort, or reach alone.', },
  { id: 'q7', topic: 'Research', difficulty: 'Warm up', prompt: 'What is the strongest opening question in a learner interview?', options: ['Would you use our new feature?', 'Do you like this design?', 'Tell me about the last time you faced this situation', 'You agree this would save time, right?'], answer: 'Tell me about the last time you faced this situation', explanation: 'Recent concrete experiences reveal behavior and context without leading the participant toward a preferred answer.', },
  { id: 'q8', topic: 'Evaluation & measurement', difficulty: 'Stretch', prompt: 'A completion rate rises while skill transfer does not. What is the best interpretation?', options: ['The program definitely succeeded', 'Completion is a useful but insufficient signal', 'Transfer no longer matters', 'The data should be ignored'], answer: 'Completion is a useful but insufficient signal', explanation: 'Completion describes activity, while transfer describes the desired change. Both can matter, but they answer different questions.', },
  { id: 'q9', topic: 'AI literacy', difficulty: 'Stretch', prompt: 'What should a product brief say when an AI feature is uncertain?', options: ['The system is always correct', 'The uncertainty can be ignored by users', 'Where uncertainty appears and how a person can review the result', 'The model should make the final decision alone'], answer: 'Where uncertainty appears and how a person can review the result', explanation: 'Transparent limits and meaningful review help people use AI suggestions responsibly.', },
];

export const initialActivity: Activity[] = [
  { day: 'Mon', minutes: 32, label: 'Quiz + review' }, { day: 'Tue', minutes: 18, label: 'Course lesson' },
  { day: 'Wed', minutes: 44, label: 'Tutor session' }, { day: 'Thu', minutes: 0, label: 'Rest day' },
  { day: 'Fri', minutes: 26, label: 'Quiz practice' }, { day: 'Sat', minutes: 51, label: 'Course lesson' },
  { day: 'Sun', minutes: 14, label: 'Reflection' },
];

export const badges = [
  { id: 'first-step', name: 'First step', detail: 'Completed your first diagnostic', icon: 'Sparkles', earned: true },
  { id: 'curious-mind', name: 'Curious mind', detail: 'Asked the AI tutor 5 questions', icon: 'MessagesSquare', earned: true },
  { id: 'steady-practice', name: 'Steady practice', detail: 'Learned on 7 different days', icon: 'CalendarCheck2', earned: true },
  { id: 'signal-finder', name: 'Signal finder', detail: 'Reach 70% in evaluation', icon: 'Target', earned: false },
];

export const adminMetrics = {
  learners: 248,
  activeThisWeek: 182,
  avgCompetency: 61,
  coursesCompleted: 1246,
  topGap: 'Policy implementation',
  topGapScore: 44,
  cohorts: [
    { name: 'Product fellows · June', learners: 64, score: 68, movement: 9 },
    { name: 'Digital public goods', learners: 91, score: 57, movement: 6 },
    { name: 'Analyst foundations', learners: 93, score: 59, movement: 11 },
  ],
};

export const tutorStarters = [
  'Why is evaluation my biggest gap?',
  'Give me a 10-minute practice task.',
  'Explain transfer with a simple example.',
];

export function getStored<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : fallback;
  } catch {
    return fallback;
  }
}

export function setStored<T>(key: string, value: T) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* local storage can be unavailable in private browsing */ }
}