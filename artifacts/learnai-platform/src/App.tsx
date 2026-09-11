import { type ReactNode, createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpRight, BookOpen, CalendarDays, Check, CheckCircle2, ChevronRight, Clock3, Compass, Download, FileText, Flame, Gauge, GraduationCap, LayoutDashboard, Lightbulb, LockKeyhole, LogOut, Menu, MessageCircle, Moon, MoreHorizontal, Network, Play, Plus, RefreshCw, Send, Settings2, Sparkles, Sun, Target, TrendingDown, TrendingUp, Trophy, Users, X, Zap } from 'lucide-react';
import { ClerkProvider, SignIn, SignUp, useAuth, useClerk, useUser } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import { customFetch, setAuthTokenGetter, useEnsureLearner, useUpdateLearner, useGetLearnerDashboard, useSaveCourseProgress, useRecordQuizAttempt, useGetTutorMessages, useSendTutorMessage } from '@workspace/api-client-react';
import { Link, Route, Router as WouterRouter, Switch, useLocation, useRoute } from 'wouter';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { badges, competencies, courses, defaultProfile, getStored, quizQuestions, adminMetrics as fallbackAdminMetrics, setStored, tutorStarters, type ChatMessage, type Competency, type Course, type LearnerProfile, type QuizQuestion } from '@/lib/data';

const queryClient = new QueryClient();
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const clerkPubKey = import.meta.env.PROD
  ? publishableKeyFromHost(window.location.hostname, import.meta.env.VITE_CLERK_PUBLISHABLE_KEY)
  : import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
const clerkProxyUrl = import.meta.env.PROD ? import.meta.env.VITE_CLERK_PROXY_URL : undefined;

if (!clerkPubKey) {
  throw new Error('Set VITE_CLERK_PUBLISHABLE_KEY before starting the local app.');
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: 'clerk',
  options: {
    logoPlacement: 'inside' as const,
    logoLinkUrl: basePath || '/',
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: '#278f86',
    colorForeground: '#e8f1ef',
    colorMutedForeground: '#9bb0b5',
    colorDanger: '#c84f49',
    colorBackground: '#15252c',
    colorInput: '#20343d',
    colorInputForeground: '#e8f1ef',
    colorNeutral: '#29434a',
    fontFamily: 'DM Sans, sans-serif',
    borderRadius: '0.85rem',
  },
  elements: {
    rootBox: 'w-full flex justify-center',
    cardBox: 'bg-card rounded-2xl w-[440px] max-w-full overflow-hidden',
    card: '!shadow-none !border-0 !bg-transparent !rounded-none',
    footer: '!shadow-none !border-0 !bg-transparent !rounded-none',
    headerTitle: 'font-display !text-3xl !font-extrabold !tracking-tight',
    headerSubtitle: '!text-muted-foreground',
    socialButtonsBlockButtonText: '!text-foreground !font-semibold',
    formFieldLabel: '!text-foreground !font-semibold',
    footerActionLink: '!text-primary !font-semibold',
    footerActionText: '!text-muted-foreground',
    dividerText: '!text-muted-foreground',
    formButtonPrimary: '!bg-primary hover:!bg-primary/90 !font-bold',
    formFieldInput: '!bg-muted/40 !border-border !text-foreground focus:!border-primary',
    socialButtonsBlockButton: '!border-border !bg-card hover:!bg-muted',
    dividerLine: '!bg-border',
    alert: '!border-destructive/20 !bg-destructive/10',
    alertText: '!text-destructive',
    main: 'gap-5',
  },
};

type AppContextValue = {
  profile: LearnerProfile;
  courseProgress: Record<string, number>;
  quizHistory: number[];
  activity: Array<{ day: string; minutes: number; events?: number }>;
  stats: Record<string, unknown>;
  dashboardCompetencies: Competency[];
  dashboardBadges: Array<{ id: string; name: string; detail: string; earned: boolean }>;
  gamification: { points: number; badges: Array<{ id: string; name: string; detail: string; earned: boolean }>; leaderboard: Array<{ rank: number; learner: string; points: number; isCurrentUser: boolean }> };
  dark: boolean;
  updateProfile: (profile: LearnerProfile) => void;
  updateCourse: (id: string, progress: number) => void;
  recordQuiz: (score: number, total: number, topic?: string) => void;
  toggleTheme: () => void;
  flash: (message: string) => void;
  saveCourse: (id: string, progress: number) => void;
  resetCourseProgress: (courseId?: string) => void;
  saveQuiz: (score: number, total: number, topic?: string) => void;
};
const AppContext = createContext<AppContextValue | null>(null);
function useApp() {
  const value = useContext(AppContext);
  if (!value) throw new Error('LearnAI context is missing');
  return value;
}

function AppProvider({ children }: { children: ReactNode }) {
  const { user } = useUser();
  const { getToken } = useAuth();
  const ensureLearner = useEnsureLearner();
  const updateLearner = useUpdateLearner();
  const [ensuredUserId, setEnsuredUserId] = useState<string | null>(null);
  const dashboard = useGetLearnerDashboard({ query: { enabled: Boolean(user && ensuredUserId === user.id), queryKey: ['learner-dashboard', user?.id ?? 'signed-out'], refetchInterval: user && ensuredUserId === user.id ? 15000 : false, refetchOnWindowFocus: true } });
  const saveCourseProgress = useSaveCourseProgress();
  const recordQuizAttempt = useRecordQuizAttempt();
  const syncedUserId = useRef<string | null>(null);
  const [profile, setProfile] = useState<LearnerProfile>(defaultProfile);
  const [courseProgress, setCourseProgress] = useState<Record<string, number>>({});
  const [quizHistory, setQuizHistory] = useState<number[]>([]);
  const [activity, setActivity] = useState<Array<{ day: string; minutes: number; events?: number }>>([]);
  const [stats, setStats] = useState<Record<string, unknown>>({});
  const [dashboardCompetencies, setDashboardCompetencies] = useState<Competency[]>([]);
  const [dashboardBadges, setDashboardBadges] = useState<Array<{ id: string; name: string; detail: string; earned: boolean }>>([]);
  const [gamification, setGamification] = useState<AppContextValue['gamification']>({ points: 0, badges: [], leaderboard: [] });
  useEffect(() => {
    setAuthTokenGetter(getToken);
    return () => setAuthTokenGetter(null);
  }, [getToken]);
  useEffect(() => {
    setEnsuredUserId(null);
    setProfile(defaultProfile);
    setCourseProgress({});
    setQuizHistory([]);
    setActivity([]);
    setStats({});
    setDashboardCompetencies([]);
    setDashboardBadges([]);
  }, [user?.id]);
  const [dark, setDark] = useState(() => getStored('learnai-theme', false));
  const [toast, setToast] = useState('');
  useEffect(() => { document.documentElement.classList.toggle('dark', dark); setStored('learnai-theme', dark); }, [dark]);
  useEffect(() => {
    if (!dashboard.data) return;
    setProfile({ name: dashboard.data.profile.name, role: dashboard.data.profile.role, institution: dashboard.data.profile.institution, interests: dashboard.data.profile.interests, preferences: dashboard.data.profile.preferences });
    setCourseProgress(Object.fromEntries(dashboard.data.courseProgress.map((item: { courseId: string; progress: number }) => [item.courseId, item.progress])));
    setQuizHistory(dashboard.data.quizHistory.map((item: { score: number; total: number }) => Math.round(item.score / item.total * 100)));
    setActivity(dashboard.data.activity.map((item: Record<string, unknown>) => ({ day: String(item.day), minutes: Number(item.minutes ?? 0), events: Number(item.events ?? 0) })));
    setStats(dashboard.data.stats);
    setDashboardCompetencies(dashboard.data.competency as Competency[]);
    setDashboardBadges(dashboard.data.badges as Array<{ id: string; name: string; detail: string; earned: boolean }>);
  }, [dashboard.data]);
  useEffect(() => {
    if (!user || ensuredUserId !== user.id) return;
    void customFetch<AppContextValue['gamification']>('/api/learners/me/gamification', { responseType: 'json' }).then(setGamification).catch(() => undefined);
  }, [ensuredUserId, user]);
  useEffect(() => {
    if (!user || syncedUserId.current === user.id) return;
    const email = user.primaryEmailAddress?.emailAddress;
    if (!email) return;
    syncedUserId.current = user.id;
    ensureLearner.mutate({
      data: {
        name: user.fullName || user.firstName || defaultProfile.name,
        email,
        role: profile.role,
        institution: profile.institution,
        interests: profile.interests,
      },
     }, {
      onSuccess: (record: { name: string; role: string; institution: string; interests: string[] }) => { setEnsuredUserId(user.id); setProfile((current: LearnerProfile) => ({
        ...current,
        name: record.name,
        role: record.role,
        institution: record.institution,
        interests: record.interests,
       })); },
       onSettled: () => { void dashboard.refetch(); },
    });
  }, [ensureLearner, profile.institution, profile.interests, profile.role, user]);
  useEffect(() => {
    if (!user) return;
    setProfile((current) => ({
      ...current,
      name: user.fullName || user.firstName || defaultProfile.name,
    }));
  }, [user?.id, user?.fullName, user?.firstName]);
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(''), 2800); return () => window.clearTimeout(timer); }, [toast]);
  const value = {
    profile, courseProgress, quizHistory, activity, stats, dashboardCompetencies, dashboardBadges, gamification, dark,
    updateProfile: (next: LearnerProfile) => {
       setProfile(next);
      const email = user?.primaryEmailAddress?.emailAddress;
      if (email) {
        updateLearner.mutate({
          data: {
            name: next.name,
            email,
            role: next.role,
            institution: next.institution,
            interests: next.interests,
            preferences: next.preferences ?? {},
          },
        });
      }
      setToast('Profile saved');
    },
    updateCourse: (id: string, progress: number) => { setCourseProgress((current) => ({ ...current, [id]: progress })); saveCourseProgress.mutate({ data: { courseId: id, progress } }, { onSuccess: () => dashboard.refetch(), onError: () => setToast('Could not save course progress') }); },
    recordQuiz: (value: number, total: number, topic?: string) => { recordQuizAttempt.mutate({ data: { score: value, total, topic } }, { onSuccess: () => dashboard.refetch(), onError: () => setToast('Could not save quiz attempt') }); },
    saveCourse: (id: string, progress: number) => { saveCourseProgress.mutate({ data: { courseId: id, progress } }, { onSuccess: () => dashboard.refetch(), onError: () => setToast('Could not save course progress') }); },
    resetCourseProgress: (courseId?: string) => { setCourseProgress((current) => courseId ? Object.fromEntries(Object.entries(current).filter(([id]) => id !== courseId)) : {}); void customFetch(`/api/learners/me/course-progress${courseId ? `?courseId=${encodeURIComponent(courseId)}` : ''}`, { method: 'DELETE', responseType: 'json' }).then(() => dashboard.refetch()).catch(() => setToast('Could not reset course progress')); },
    saveQuiz: (score: number, total: number, topic?: string) => { recordQuizAttempt.mutate({ data: { score, total, topic } }, { onSuccess: () => dashboard.refetch(), onError: () => setToast('Could not save quiz attempt') }); },
    toggleTheme: () => setDark((current) => !current),
    flash: (message: string) => setToast(message),
  };
  return <AppContext.Provider value={value}>{children}<div className={`fixed bottom-5 left-1/2 z-[60] -translate-x-1/2 transition-all duration-300 ${toast ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-3 opacity-0'}`} role="status" data-testid="status-toast"><div className="flex items-center gap-2 rounded-full border border-primary/20 bg-sidebar px-4 py-3 text-sm font-semibold text-sidebar-foreground shadow-xl"><Check size={16} className="text-sidebar-primary" />{toast}</div></div></AppContext.Provider>;
}

const navItems = [
  { href: '/workspace', label: 'Overview', icon: LayoutDashboard },
  { href: '/learn', label: 'Learning path', icon: Compass },
  { href: '/competency', label: 'Competency map', icon: Network },
  { href: '/quiz', label: 'Adaptive quiz', icon: Target },
  { href: '/ai-gaps', label: 'Gap analysis', icon: Gauge },
  { href: '/material-studio', label: 'Material studio', icon: FileText },
  { href: '/igot', label: 'iGOT integration', icon: Network },
  { href: '/tutor', label: 'Local tutor', icon: MessageCircle },
  { href: '/progress', label: 'My progress', icon: TrendingUp },
  { href: '/achievements', label: 'Achievements', icon: Trophy },
];

function Shell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { profile, dark, toggleTheme } = useApp();
  const { signOut } = useClerk();
  const trainerView = location.startsWith('/admin');
  return <div className="app-surface min-h-[100dvh] overflow-x-hidden text-foreground noise">
    <aside className={`fixed inset-y-0 left-0 z-40 flex w-[260px] flex-col bg-sidebar px-4 py-5 text-sidebar-foreground shadow-[18px_0_50px_hsl(203_35%_17%_/_0.12)] transition-transform duration-300 lg:translate-x-0 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}>
      <div className="mb-8 flex items-center justify-between px-2">
        <Link href="/workspace" onClick={() => setMobileOpen(false)} className="flex items-center gap-3" data-testid="link-brand">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground shadow-lg shadow-sidebar-primary/10"><Sparkles size={18} /></span>
          <span><span className="block font-display text-lg font-extrabold tracking-tight">learn<span className="text-sidebar-primary">ai</span></span><span className="block font-mono-ui text-[9px] uppercase tracking-[.18em] text-sidebar-foreground/50">competency studio</span></span>
        </Link>
        <button className="rounded-lg p-1.5 text-sidebar-foreground/60 hover:bg-sidebar-accent lg:hidden" onClick={() => setMobileOpen(false)} data-testid="button-close-menu"><X size={18} /></button>
      </div>
      <div className="mb-3 px-3 font-mono-ui text-[10px] uppercase tracking-[.16em] text-sidebar-foreground/40">Your workspace</div>
      <nav className="space-y-1" aria-label="Primary navigation">{navItems.map(({ href, label, icon: Icon }) => <Link key={href} href={href} onClick={() => setMobileOpen(false)} className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${location === href ? 'bg-sidebar-primary text-sidebar-primary-foreground shadow-md shadow-sidebar-primary/10' : 'text-sidebar-foreground/65 hover:bg-sidebar-accent hover:text-sidebar-foreground'}`} data-testid={`link-nav-${label.toLowerCase().replaceAll(' ', '-')}`}><Icon size={17} strokeWidth={location === href ? 2.4 : 1.8} /><span>{label}</span>{href === '/competency' && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-accent" />}</Link>)}</nav>
      <div className="mt-7 px-3 font-mono-ui text-[10px] uppercase tracking-[.16em] text-sidebar-foreground/40">Studio</div>
      <nav className="mt-2 space-y-1">{trainerView && <Link href="/admin" onClick={() => setMobileOpen(false)} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${location === '/admin' ? 'bg-sidebar-accent text-sidebar-foreground' : 'text-sidebar-foreground/65 hover:bg-sidebar-accent hover:text-sidebar-foreground'}`} data-testid="link-nav-admin"><Users size={17} /><span>Trainer dashboard</span></Link>}<Link href="/settings" onClick={() => setMobileOpen(false)} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${location === '/settings' ? 'bg-sidebar-accent text-sidebar-foreground' : 'text-sidebar-foreground/65 hover:bg-sidebar-accent hover:text-sidebar-foreground'}`} data-testid="link-nav-settings"><Settings2 size={17} /><span>Settings</span></Link></nav>
      <div className="mt-auto rounded-2xl border border-sidebar-border bg-sidebar-accent/60 p-3">
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-sidebar-foreground"><span className="grid h-7 w-7 place-items-center rounded-full bg-accent text-xs font-bold text-accent-foreground">{profile.name.split(' ').map((part) => part[0]).join('')}</span><span className="truncate">{profile.name}</span></div>
        <div className="flex items-center justify-between gap-2 text-[11px] text-sidebar-foreground/55"><span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-sidebar-primary" />Secure workspace</span><button onClick={() => signOut({ redirectUrl: basePath || '/' })} className="inline-flex items-center gap-1 rounded-lg px-1.5 py-1 text-sidebar-foreground/55 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground" data-testid="button-sign-out"><LogOut size={12} />Sign out</button></div>
      </div>
    </aside>
    {mobileOpen && <button className="fixed inset-0 z-30 bg-sidebar/40 backdrop-blur-sm lg:hidden" onClick={() => setMobileOpen(false)} aria-label="Close navigation" data-testid="button-overlay-menu" />}
     <div className="lg:pl-[260px]">
      <header className="sticky top-0 z-20 flex h-[72px] items-center justify-between border-b border-border/70 bg-background/75 px-4 shadow-[0_8px_30px_hsl(201_34%_18%_/_0.04)] backdrop-blur-xl sm:px-8">
         <button className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-xs font-bold text-muted-foreground hover:text-foreground lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open navigation menu" data-testid="button-open-menu"><Menu size={18} /><span>Menu</span></button>
         <div className="hidden items-center gap-2 text-xs text-muted-foreground sm:flex"><span className="h-2 w-2 rounded-full bg-primary" />Personal workspace <span className="text-border">/</span> {location === '/workspace' ? 'Overview' : location.slice(1).replace('-', ' ')}</div>
        <div className="ml-auto flex items-center gap-2"><button onClick={toggleTheme} className="rounded-xl p-2.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" aria-label="Toggle theme" data-testid="button-toggle-theme">{dark ? <Sun size={17} /> : <Moon size={17} />}</button><Link href="/settings" className="grid h-9 w-9 place-items-center rounded-full bg-primary/15 text-xs font-bold text-primary" data-testid="link-header-profile">{profile.name.split(' ').map((part) => part[0]).join('')}</Link></div>
      </header>
      <main className="mx-auto min-w-0 max-w-[1440px] px-4 pb-24 pt-6 sm:p-8 sm:pb-8">{children}</main>
       <nav className="safe-area-bottom fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 border-t border-border/80 bg-card/95 px-2 pt-2 shadow-[0_-8px_24px_hsl(201_34%_18%_/_0.06)] backdrop-blur-lg lg:hidden" aria-label="Quick navigation">
         {navItems.slice(0, 4).map(({ href, label, icon: Icon }) => <Link key={href} href={href} onClick={() => setMobileOpen(false)} className={`flex min-w-0 flex-col items-center gap-1 rounded-xl px-1 py-1.5 text-[10px] font-bold ${location === href ? 'bg-primary/10 text-primary' : 'text-muted-foreground'}`} data-testid={`link-mobile-nav-${label.toLowerCase().replaceAll(' ', '-')}`}><Icon size={17} strokeWidth={location === href ? 2.5 : 1.8} /><span className="max-w-full truncate">{label === 'Learning path' ? 'Learn' : label === 'Adaptive quiz' ? 'Quiz' : label}</span></Link>)}
       </nav>
    </div>
  </div>;
}
function SectionTitle({ eyebrow, title, detail, action }: { eyebrow: string; title: string; detail?: string; action?: ReactNode }) {
  return <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="mb-2 font-mono-ui text-[10px] uppercase tracking-[.17em] text-primary">{eyebrow}</p><h1 className="font-display text-3xl font-extrabold tracking-[-.03em] text-foreground sm:text-[2.5rem]">{title}</h1>{detail && <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{detail}</p>}</div>{action}</div>;
}
function timeGreeting(date = new Date()) {
  const hour = date.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  if (hour < 22) return 'Good evening';
  return 'Good night';
}
function Pill({ children, tone = 'muted' }: { children: ReactNode; tone?: 'muted' | 'primary' | 'accent' | 'danger' }) {
  const styles = { muted: 'bg-muted text-muted-foreground', primary: 'bg-primary/10 text-primary', accent: 'bg-accent/20 text-accent-foreground', danger: 'bg-destructive/10 text-destructive' };
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 font-mono-ui text-[10px] font-bold uppercase tracking-[.05em] ${styles[tone]}`}>{children}</span>;
}
function ProgressBar({ value, color = 'bg-primary' }: { value: number; color?: string }) { return <div className="h-2 overflow-hidden rounded-full bg-muted"><div className={`h-full rounded-full ${color} transition-all duration-700`} style={{ width: `${value}%` }} /></div>; }
function Card({ children, className = '' }: { children: ReactNode; className?: string }) { return <div className={`lift-on-hover rounded-2xl border border-card-border bg-card shadow-[0_2px_18px_hsl(201_34%_18%_/_0.035)] ${className}`}>{children}</div>; }

function Overview() {
  const { profile, courseProgress, activity, stats, dashboardCompetencies, dashboardBadges, gamification } = useApp();
  const focus = courses[0];
  const continueCourse = courses[1];
    const totalMinutes = Number(stats.totalMinutes ?? activity.reduce((sum, day) => sum + day.minutes, 0));
    const continueProgress = courseProgress[continueCourse.id] ?? 0;
  const greeting = timeGreeting();
    const dateLabel = new Intl.DateTimeFormat('en', { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date());
  return <div className="animate-enter">
    <div className="mb-8 flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
       <div>
         <div className="mb-3 flex flex-wrap items-center gap-2">
           <p className="font-mono-ui text-[10px] uppercase tracking-[.18em] text-primary" data-testid="text-today-date">{dateLabel}</p>
           <span className="h-1 w-1 rounded-full bg-border" />
           <span className="text-xs font-semibold text-muted-foreground">Your daily learning desk</span>
         </div>
          <h1 className="font-display text-4xl font-extrabold tracking-[-.045em] sm:text-5xl">{greeting}, {profile.name.split(' ')[0]}<span className="text-accent">.</span></h1>
         <p className="mt-3 max-w-xl text-base leading-7 text-muted-foreground">Keep the thread going with one deliberate practice. You are building a useful habit, not chasing a perfect score.</p>
       </div>
       <div className="flex flex-wrap items-center gap-2">
         <Link href="/progress" className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-3.5 py-2.5 text-xs font-bold text-muted-foreground hover:border-primary/30 hover:text-foreground" data-testid="link-review-progress"><CalendarDays size={15} />Review week</Link>
         <Link href="/quiz" className="group inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/15 transition-transform hover:-translate-y-0.5" data-testid="link-start-focus"><Zap size={16} />Start today's focus<ChevronRight size={16} className="transition-transform group-hover:translate-x-0.5" /></Link>
       </div>
     </div>
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[{ label: 'Current streak', value: `${Number(stats.streak ?? 0)} days`, icon: Flame, tone: 'text-accent-foreground bg-accent/20' }, { label: 'Study time', value: `${totalMinutes} min`, icon: Clock3, tone: 'text-primary bg-primary/10' }, { label: 'Quiz attempts', value: `${Number(stats.quizCount ?? 0)}`, icon: Target, tone: 'text-destructive bg-destructive/10' }, { label: 'Paths active', value: `${Object.values(courseProgress).filter((value) => value > 0).length} courses`, icon: BookOpen, tone: 'text-foreground bg-muted' }].map(({ label, value, icon: Icon, tone }, index) => <div key={label} className={`metric-shine lift-on-hover animate-enter-${Math.min(index + 1, 3)} glass-panel flex min-w-0 items-center gap-3 rounded-2xl border px-3 py-3.5 sm:px-4`} data-testid={`stat-${label.toLowerCase().replaceAll(' ', '-')}`}><div className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${tone}`}><Icon size={17} /></div><div className="min-w-0"><p className="truncate text-[10px] font-bold uppercase tracking-[.08em] text-muted-foreground">{label}</p><p className="mt-0.5 truncate font-display text-lg font-extrabold">{value}</p></div></div>)}
     </div>
     <div className="grid gap-5 xl:grid-cols-[1.3fr_.7fr]">
      <Card className="hero-glow relative overflow-hidden bg-sidebar p-6 text-sidebar-foreground sm:p-8">
         <div className="absolute -right-16 -top-24 h-72 w-72 rounded-full border-[36px] border-sidebar-primary/10" />
         <div className="absolute right-12 top-12 h-28 w-28 rounded-full border border-accent/30" />
         <div className="relative">
           <div className="flex flex-wrap items-center justify-between gap-3"><Pill tone="accent">Today's focus</Pill><span className="font-mono-ui text-[10px] text-sidebar-foreground/45">12 MINUTE PRACTICE</span></div>
           <div className="mt-7 max-w-xl"><p className="font-mono-ui text-[10px] uppercase tracking-[.14em] text-sidebar-primary">{focus.skill}</p><h2 className="mt-2 font-display text-3xl font-extrabold tracking-[-.03em] sm:text-4xl">Make evaluation feel less fuzzy.</h2><p className="mt-3 max-w-lg text-sm leading-6 text-sidebar-foreground/65">Learn how to tell a useful metric from a merely busy one, then test the distinction on a real product decision.</p></div>
           <div className="mt-8 flex flex-wrap items-center gap-3"><Link href="/learn" className="inline-flex items-center gap-2 rounded-xl bg-sidebar-primary px-4 py-3 text-sm font-bold text-sidebar-primary-foreground hover:brightness-105" data-testid="link-focus-course"><Play size={15} fill="currentColor" />Open the practice<ArrowUpRight size={15} /></Link><span className="flex items-center gap-1.5 text-xs text-sidebar-foreground/55"><Clock3 size={14} />{focus.duration}</span></div>
         </div>
       </Card>
      <Card className="glass-panel lift-on-hover p-6 sm:p-7">
         <div className="flex items-start justify-between gap-4"><div><p className="font-mono-ui text-[10px] uppercase tracking-[.15em] text-muted-foreground">This week</p><h2 className="mt-1 font-display text-2xl font-extrabold">Momentum, kept visible.</h2></div><div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-accent/20 text-accent-foreground"><Flame size={21} /></div></div>
          <p className="mt-3 text-sm leading-6 text-muted-foreground"><span className="font-bold text-foreground">{totalMinutes} minutes</span> across {activity.filter((day) => day.minutes > 0).length} learning days.</p>
          <div className="mt-8 flex h-32 items-end gap-1.5">{activity.length ? activity.map((day) => <div className="group flex min-w-0 flex-1 flex-col items-center gap-2" key={day.day}><div className="flex h-24 w-full items-end rounded-lg bg-muted p-1"><div className="w-full rounded-md bg-primary/80 transition-all group-hover:bg-primary" style={{ height: `${Math.max(day.minutes / 60 * 100, day.minutes ? 14 : 5)}%` }} /></div><span className="font-mono-ui text-[9px] text-muted-foreground">{day.day.slice(-2)}</span></div>) : <p className="py-8 text-xs text-muted-foreground">Your learning activity will appear here.</p>}</div>
         <Link href="/progress" className="mt-5 inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline" data-testid="link-view-week">View full progress<ChevronRight size={14} /></Link>
       </Card>
     </div>
     <div className="mt-8 grid gap-5 lg:grid-cols-[1.2fr_.8fr]">
      <Card className="glass-panel lift-on-hover p-6 sm:p-7">
         <div className="mb-5 flex items-start justify-between gap-4"><div><p className="font-mono-ui text-[10px] uppercase tracking-[.15em] text-muted-foreground">Pick up where you left off</p><h2 className="mt-1 font-display text-2xl font-extrabold">One course already in motion.</h2></div><Link href="/learn" className="shrink-0 text-xs font-bold text-primary hover:underline" data-testid="link-view-path">View path</Link></div>
         <div className="flex flex-col gap-4 sm:flex-row sm:items-center"><div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-accent/20 text-accent-foreground"><Gauge size={25} /></div><div className="min-w-0 flex-1"><div className="mb-2 flex items-center justify-between gap-3"><span className="truncate text-sm font-bold">{continueCourse.title}</span><span className="font-mono-ui text-[11px] text-muted-foreground">{continueProgress}%</span></div><ProgressBar value={continueProgress} color="bg-accent" /><p className="mt-2 text-xs text-muted-foreground">{continueCourse.skill}  {Math.max(1, continueCourse.lessons - 1)} lessons left</p></div><Link href="/learn" className="inline-flex items-center justify-center gap-1 rounded-xl border border-border px-3 py-2 text-xs font-bold hover:bg-muted" data-testid="link-continue-course">Continue <ChevronRight size={14} /></Link></div>
       </Card>
      <Card className="glass-panel lift-on-hover p-6 sm:p-7"><div className="flex items-start justify-between gap-4"><div><p className="font-mono-ui text-[10px] uppercase tracking-[.15em] text-muted-foreground">Competency pulse</p><p className="mt-1 text-lg font-extrabold">Your current signals.</p></div><Link href="/competency" className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" data-testid="link-competency-pulse"><ChevronRight size={16} /></Link></div><div className="mt-5 flex items-center gap-4"><div className="relative grid h-20 w-20 shrink-0 place-items-center rounded-full" style={{ background: `conic-gradient(hsl(var(--accent)) 0 ${Number(dashboardCompetencies[0]?.score ?? 0)}%, hsl(var(--muted)) ${Number(dashboardCompetencies[0]?.score ?? 0)}% 100%)` }}><div className="grid h-14 w-14 place-items-center rounded-full bg-card font-display text-xl font-extrabold">{Number(dashboardCompetencies[0]?.score ?? 0)}</div></div><div><p className="font-bold">{dashboardCompetencies[0]?.name ?? 'No signal yet'}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{dashboardCompetencies[0] ? 'Your latest recorded learning signals.' : 'Complete a quiz or course activity to establish a baseline.'}</p></div></div></Card>
     </div>
     <div className="mt-8 grid gap-5 lg:grid-cols-[.85fr_1.15fr]">
        <Card className="p-6 sm:p-7"><div className="flex items-center justify-between"><div><p className="font-mono-ui text-[10px] uppercase tracking-[.15em] text-muted-foreground">Recent wins</p><h2 className="mt-1 font-display text-xl font-extrabold">Evidence of showing up.</h2></div><Trophy size={20} className="text-accent-foreground" /></div><div className="mt-5 space-y-3">{dashboardBadges.filter((badge) => badge.earned).slice(0, 3).map((badge) => <div key={badge.id} className="flex items-center gap-3 rounded-xl bg-muted/70 p-3" data-testid={`status-badge-${badge.id}`}><CheckCircle2 size={17} className="shrink-0 text-primary" /><div className="min-w-0"><p className="truncate text-xs font-bold">{badge.name}</p><p className="truncate text-[11px] text-muted-foreground">{badge.detail}</p></div></div>)}</div></Card>
       <div><p className="mb-3 font-mono-ui text-[10px] uppercase tracking-[.15em] text-muted-foreground">Useful next stops</p><div className="grid gap-3 sm:grid-cols-3">{[{ href: '/competency', icon: Network, title: 'See your map', text: 'Find the skill with the most leverage.' }, { href: '/tutor', icon: MessageCircle, title: 'Ask the tutor', text: 'Turn a confusing idea into a clear step.' }, { href: '/progress', icon: Trophy, title: 'Review momentum', text: 'Notice the pattern, not just the score.' }].map(({ href, icon: Icon, title, text }) => <Link href={href} key={href} className="group rounded-2xl border border-border bg-card p-5 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5" data-testid={`link-quick-${title.toLowerCase().replaceAll(' ', '-')}`}><Icon size={19} className="text-primary" /><h3 className="mt-5 font-bold">{title}<ChevronRight size={15} className="ml-1 inline transition-transform group-hover:translate-x-1" /></h3><p className="mt-1 text-xs leading-5 text-muted-foreground">{text}</p></Link>)}</div></div>
     </div>

     <div className="mt-8 grid gap-5 lg:grid-cols-[1.1fr_.9fr]">
       <Card className="p-6 sm:p-7">
         <div className="mb-5 flex items-center justify-between">
           <p className="font-mono-ui text-[10px] uppercase tracking-[.15em] text-muted-foreground">Gamification</p>
           <Pill tone="primary">Points</Pill>
         </div>
         <div className="mb-4 flex items-center justify-between rounded-xl bg-primary/10 px-3 py-3"><span className="text-sm font-bold">Your points</span><span className="font-mono-ui text-lg font-bold text-primary">{gamification.points}</span></div>
         <div className="space-y-4">
           {[
             { action: 'Complete course', points: '+100' },
             { action: 'Complete quiz', points: '+50' },
             { action: '7-day streak', points: '+100' },
             { action: 'Improve competency', points: '+150' },
           ].map((reward) => (
             <div key={reward.action} className="flex items-center justify-between rounded-xl border border-border bg-muted/20 px-3 py-3">
               <span className="text-sm font-medium">{reward.action}</span>
               <span className="font-mono-ui text-sm font-bold text-primary">{reward.points}</span>
             </div>
           ))}
         </div>
       </Card>

       <Card className="p-6 sm:p-7">
         <div className="mb-5 flex items-center justify-between">
           <p className="font-mono-ui text-[10px] uppercase tracking-[.15em] text-muted-foreground">Leaderboard</p>
           <Pill tone="accent">Top learners</Pill>
         </div>
         <div className="space-y-3">
           {gamification.leaderboard.map((entry) => (
             <div key={entry.rank} className="flex items-center justify-between rounded-xl border border-border bg-muted/20 px-3 py-3">
               <div className="flex items-center gap-3">
                 <span className="grid h-8 w-8 place-items-center rounded-full bg-primary/10 font-mono-ui text-xs font-bold text-primary">#{entry.rank}</span>
                 <span className="text-sm font-bold">{entry.learner}</span>
               </div>
               <span className="font-mono-ui text-sm font-bold text-foreground">{entry.points}</span>
             </div>
           ))}
         </div>
       </Card>
     </div>

     <div className="mt-8">
       <p className="mb-3 font-mono-ui text-[10px] uppercase tracking-[.15em] text-muted-foreground">Badges</p>
       <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {gamification.badges.map((badge) => (
           <div key={badge.id} className="rounded-2xl border border-border bg-card p-5">
             <div className="mb-3 grid h-12 w-12 place-items-center rounded-xl bg-accent/15 text-accent-foreground">
               <Trophy size={18} />
             </div>
             <p className="text-base font-bold">{badge.name}</p>
             <p className="mt-2 text-xs leading-5 text-muted-foreground">{badge.detail}</p>
           </div>
         ))}
       </div>
     </div>
  </div>;
}

function courseMatch(course: Course, competencySignals: Competency[]) {
  const signal = competencySignals.find((item) => item.name.toLowerCase() === course.skill.toLowerCase());
  if (!signal) return course.relevance;
  return Math.max(45, Math.min(99, Math.round(course.relevance * 0.55 + (100 - signal.score) * 0.45)));
}

function Learn() {
  const { courseProgress, updateCourse, flash, dashboardCompetencies } = useApp();
  const { resetCourseProgress } = useApp();
  const [filter, setFilter] = useState('All');
    useEffect(() => {
      if (courseProgress[courses[0].id] === 75) resetCourseProgress(courses[0].id);
    }, [courseProgress, resetCourseProgress]);
  const filters = ['All', 'Recommended', 'In progress', 'Completed', 'Foundations'];
  const visible = courses.filter((course) => {
    const progress = courseProgress[course.id] ?? 0;
    if (filter === 'Recommended') return courseMatch(course, dashboardCompetencies) > 85;
    if (filter === 'In progress') return progress > 0 && progress < 100;
    if (filter === 'Completed') return progress >= 100;
    if (filter === 'Foundations') return course.level === 'Foundations';
    return true;
  });
      return <div className="animate-enter"><SectionTitle eyebrow="Your path" title="A path with a point." detail="Focused learning that responds to the competencies youre building  not a library you have to sort alone." action={<Link href="/quiz" className="inline-flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-4 py-3 text-sm font-bold text-primary hover:bg-primary/15" data-testid="link-path-quiz"><Target size={16} />Retake diagnostic</Link>} /><div className="mb-5 flex gap-2 overflow-x-auto pb-1">{filters.map((item) => <button key={item} onClick={() => setFilter(item)} className={`whitespace-nowrap rounded-full px-3 py-2 text-xs font-bold transition-colors ${filter === item ? 'bg-foreground text-background' : 'border border-border bg-card text-muted-foreground hover:text-foreground'}`} data-testid={`button-filter-${item.toLowerCase().replaceAll(' ', '-')}`}>{item}</button>)}</div><div className="grid gap-4 lg:grid-cols-2">{visible.map((course, index) => { const progress = courseProgress[course.id] ?? 0; return <CourseCard key={course.id} course={course} progress={progress} index={index} onStart={() => { const step = Math.ceil(100 / course.lessons); const nextProgress = Math.min(100, Math.max(progress, 0) + step); updateCourse(course.id, nextProgress); flash(nextProgress >= 100 ? 'Course completed  your certificate is ready in Achievements' : progress ? 'Lesson completed  progress saved' : 'Course started  your path is taking shape'); }} />; })}</div>{visible.length === 0 && <Card className="p-10 text-center"><Compass className="mx-auto text-muted-foreground" /><h3 className="mt-3 font-bold">No courses in this view yet</h3><p className="mt-1 text-sm text-muted-foreground">Try another filter  your path is still here.</p></Card>}<div className="mt-8 flex items-start gap-3 rounded-2xl border border-primary/20 bg-primary/5 p-5"><Lightbulb size={19} className="mt-0.5 shrink-0 text-primary" /><div><p className="text-sm font-bold">Why these recommendations?</p><p className="mt-1 text-xs leading-5 text-muted-foreground">LearnAI compares your quiz signals with competency targets to surface the next useful course. iGOT connectivity can be added through the integration layer when approved.</p></div></div></div>;
}
function CourseCard({ course, progress, index, onStart }: { course: Course; progress: number; index: number; onStart: () => void }) {
  const { dashboardCompetencies } = useApp();
  const match = courseMatch(course, dashboardCompetencies);
  const complete = progress >= 100;
    return <Card className={`animate-enter-${Math.min(index + 1, 3)} group overflow-hidden p-5 transition-all hover:-translate-y-0.5 hover:border-primary/35 sm:p-6`}>
      <div className="flex items-start justify-between gap-4">
        <div className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ${index % 2 ? 'bg-accent/20 text-accent-foreground' : 'bg-primary/10 text-primary'}`}>
          <GraduationCap size={22} />
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Pill tone={match > 85 ? 'accent' : 'muted'}>{match}% match</Pill>
          <Pill>{course.phase}</Pill>
        </div>
      </div>
      <h3 className="mt-5 font-display text-xl font-extrabold">{course.title}</h3>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{course.description}</p>
      <div className="mt-4 rounded-xl bg-muted/60 p-3">
        <p className="font-mono-ui text-[10px] uppercase tracking-[.12em] text-primary">Course outcome</p>
        <p className="mt-1 text-xs font-semibold leading-5">{course.outcome}</p>
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><Clock3 size={14} />{course.duration}</span>
        <span className="flex items-center gap-1.5"><FileText size={14} />{course.lessons} lessons</span>
        <span>{course.format}</span>
        <span className="text-primary">{course.skill}</span>
      </div>
      <div className="mt-5 border-t border-border pt-4">
        <div className="mb-2 flex justify-between text-[11px] font-bold">
          <span>{complete ? 'Completed' : progress ? `${Math.min(course.lessons, Math.ceil(progress / 100 * course.lessons))} of ${course.lessons} lessons` : 'Ready when you are'}</span>
          <span className="font-mono-ui text-muted-foreground">{progress}%</span>
        </div>
        <ProgressBar value={progress} color={complete ? 'bg-primary' : progress > 0 ? 'bg-accent' : 'bg-primary'} />
        <Link href={`/learn/${course.id}`} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-foreground px-4 py-2.5 text-xs font-bold text-background transition-transform hover:-translate-y-0.5" data-testid={`button-start-course-${course.id}`}>
          {complete ? 'Review course' : progress ? 'Continue learning' : 'Start course'}
          {complete ? <CheckCircle2 size={14} /> : <ChevronRight size={14} />}
        </Link>
      </div>
    </Card>;
}

const lessonBlueprints = [
  { title: 'Set the context', body: 'Start with the situation your learner or customer is actually facing. Write down what happens today, who is affected, and what makes the moment difficult. A clear context keeps the rest of the course grounded in a real decision.' },
  { title: 'Work through an example', body: 'Compare a vague approach with a stronger one. Notice the evidence, assumptions, and trade-offs that separate them. The goal is not to memorize a framework, but to recognize the pattern when you meet it in your own work.' },
  { title: 'Try the method', body: 'Apply the idea to a small, concrete scenario. Keep the scope narrow enough to finish in ten minutes. Capture your first answer before looking for a perfect one; reflection is where the useful signal appears.' },
  { title: 'Review the trade-offs', body: 'Good product decisions involve constraints. Check who could be missed, which signal could mislead you, and what evidence would change your mind. This review turns an attractive answer into a responsible one.' },
  { title: 'Make it transferable', body: 'Close by writing one action you can take this week. Name the situation where you will use it and the evidence you will look for. A course is useful when the idea travels with you into the next decision.' },
  { title: 'Prepare your final response', body: 'Bring the work together in a short recommendation. State the need, your proposed response, the success signal, and the main uncertainty. This is the same structure used in the capstone review.' },
];

function CoursePlayer() {
  const [, params] = useRoute('/learn/:courseId');
  const { courseProgress, updateCourse, flash, resetCourseProgress } = useApp();
  const course = courses.find((item) => item.id === params?.courseId);
  useEffect(() => {
    if (course?.id === courses[0].id && courseProgress[course.id] === 75) resetCourseProgress(course.id);
  }, [course, courseProgress, resetCourseProgress]);
  const [lessonIndex, setLessonIndex] = useState(0);
  const [checked, setChecked] = useState(false);
  const [reflection, setReflection] = useState('');
  const [answer, setAnswer] = useState('');
  if (!course) return <NotFound />;
  const progress = courseProgress[course.id] ?? 0;
  const completedLessons = Math.min(course.lessons, Math.round(progress / 100 * course.lessons));
  const lesson = lessonBlueprints[lessonIndex % lessonBlueprints.length];
  const isCompleted = completedLessons > lessonIndex;
  const finishLesson = () => {
    if (isCompleted && lessonIndex < course.lessons - 1) { setLessonIndex((current) => Math.min(course.lessons - 1, current + 1)); setChecked(false); return; }
    const reflectionText = (document.querySelector('[data-testid="input-lesson-reflection"]') as HTMLTextAreaElement | null)?.value ?? '';
    const knowledgeCheck = window.prompt('Quick check: type APPLY if you can use this idea in a real decision.') ?? '';
    if (reflectionText.trim().length < 25 || knowledgeCheck.trim().toUpperCase() !== 'APPLY') {
      flash('Add a short reflection and choose the best answer before completing this lesson');
      return;
    }
    const nextProgress = Math.min(100, Math.round(((lessonIndex + 1) / course.lessons) * 100));
    updateCourse(course.id, nextProgress);
    setChecked(true);
    flash(nextProgress >= 100 ? 'Course completed  your certificate is ready in Achievements' : 'Lesson completed  progress saved');
  };
  return <div className="animate-enter"><Link href="/learn" className="mb-6 inline-flex items-center gap-2 text-xs font-bold text-primary hover:underline"><ChevronRight size={14} className="rotate-180" />Back to learning path</Link><div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="font-mono-ui text-[10px] uppercase tracking-[.17em] text-primary">{course.phase}  {course.format}</p><h1 className="mt-2 max-w-3xl font-display text-3xl font-extrabold tracking-[-.03em] sm:text-5xl">{course.title}</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">{course.outcome}</p></div><Pill tone="accent">{progress}% complete</Pill></div><div className="grid gap-5 xl:grid-cols-[260px_1fr]"><Card className="h-fit p-4"><p className="px-2 text-[10px] font-bold uppercase tracking-[.14em] text-muted-foreground">Course lessons</p><div className="mt-3 space-y-1">{Array.from({ length: course.lessons }, (_, index) => <button key={index} onClick={() => { setLessonIndex(index); setChecked(false); }} className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-xs font-bold ${lessonIndex === index ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted'} `}><span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg font-mono-ui text-[10px] ${completedLessons > index ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>{completedLessons > index ? <Check size={13} /> : String(index + 1).padStart(2, '0')}</span><span className="min-w-0 truncate">{lessonBlueprints[index % lessonBlueprints.length].title}</span></button>)}</div><div className="mt-4 border-t border-border pt-4"><ProgressBar value={progress} /><p className="mt-2 text-[11px] text-muted-foreground">{completedLessons} of {course.lessons} lessons complete</p></div></Card><div className="space-y-5"><Card className="overflow-hidden"><div className="border-b border-border bg-sidebar px-6 py-5 text-sidebar-foreground sm:px-9"><div className="flex items-center justify-between gap-3"><Pill tone="accent">Lesson {lessonIndex + 1} of {course.lessons}</Pill><span className="flex items-center gap-1.5 text-xs text-sidebar-foreground/60"><Clock3 size={14} />8 min</span></div><h2 className="mt-6 font-display text-3xl font-extrabold">{lesson.title}</h2><p className="mt-2 text-sm text-sidebar-foreground/65">Build one practical layer of your {course.skill.toLowerCase()} practice.</p></div><div className="p-6 sm:p-9"><p className="max-w-2xl text-base leading-8 text-muted-foreground">{lesson.body}</p><div className="mt-8 rounded-2xl border border-primary/20 bg-primary/5 p-5"><p className="font-mono-ui text-[10px] font-bold uppercase tracking-[.14em] text-primary">Apply it now</p><p className="mt-2 text-sm font-semibold leading-6">Write one sentence that connects this lesson to the course outcome: I will use this when I need to {course.outcome.toLowerCase()}</p><textarea className="mt-4 min-h-24 w-full resize-y rounded-xl border border-border bg-background p-3 text-sm outline-none focus:border-primary" placeholder="Your working note" data-testid="input-lesson-reflection" /></div>{checked && <div className="mt-5 flex items-center gap-2 rounded-xl bg-primary/10 p-3 text-sm font-bold text-primary"><CheckCircle2 size={17} />Lesson recorded in your learning record.</div>}<div className="mt-7 flex flex-wrap justify-between gap-3"><button onClick={() => { setLessonIndex((current) => Math.max(0, current - 1)); setChecked(false); }} disabled={lessonIndex === 0} className="rounded-xl border border-border px-4 py-3 text-sm font-bold disabled:opacity-40">Previous</button><button onClick={finishLesson} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground">{isCompleted ? 'Review next lesson' : lessonIndex === course.lessons - 1 ? 'Complete course' : 'Mark lesson complete'}<ChevronRight size={16} /></button></div></div></Card><div className="flex items-start gap-3 rounded-2xl border border-border bg-card p-5"><Lightbulb size={18} className="mt-0.5 shrink-0 text-accent-foreground" /><p className="text-xs leading-5 text-muted-foreground">Take your time. Your progress is recorded when you mark a lesson complete, not when you open it.</p></div></div></div></div>;
}

function Competency() {
  const { flash, dashboardCompetencies: values } = useApp();
  const [recomputing, setRecomputing] = useState(false);
  const recompute = () => { setRecomputing(true); window.setTimeout(() => { setRecomputing(false); flash('Competency map reflects your latest recorded signals'); }, 300); };
  return <div className="animate-enter"><SectionTitle eyebrow="Your signal map" title="See the shape of your skills." detail="Competencies are directional signals, not a verdict. Use the gaps to choose a useful practice  then come back and notice what changed." action={<button onClick={recompute} disabled={recomputing} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground disabled:opacity-60" data-testid="button-recompute">{<RefreshCw size={16} className={recomputing ? 'animate-spin' : ''} />} {recomputing ? 'Recomputing' : 'Recompute map'}</button>} /><div className="grid gap-5 xl:grid-cols-[1.15fr_.85fr]"><Card className="p-6 sm:p-8"><div className="mb-6 flex items-center justify-between"><div><p className="font-mono-ui text-[10px] uppercase tracking-[.15em] text-muted-foreground">Overall picture</p><h2 className="mt-1 font-display text-2xl font-extrabold">A capable base, one clear gap.</h2></div><div className="text-right"><div className="font-mono-ui text-2xl font-bold text-primary">63<span className="text-sm text-muted-foreground"> / 100</span></div><p className="text-[10px] text-muted-foreground">prototype index</p></div></div><div className="grid gap-3 sm:grid-cols-2">{values.map((item) => <CompetencyItem key={item.id} item={item} />)}</div><div className="mt-6 flex items-center gap-4 border-t border-border pt-5 text-xs text-muted-foreground"><span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-primary" />Strong signal</span><span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-accent" />Build next</span><span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-destructive" />Needs focus</span></div></Card><div className="space-y-5"><Card className="bg-sidebar p-6 text-sidebar-foreground"><Pill tone="accent">Highest leverage</Pill><h2 className="mt-5 font-display text-2xl font-extrabold">Evaluation & measurement</h2><p className="mt-3 text-sm leading-6 text-sidebar-foreground/65">At 41, this is the competency where a little practice can unlock better product decisions across your role.</p><Link href="/learn" className="mt-6 inline-flex items-center gap-2 rounded-xl bg-sidebar-primary px-4 py-3 text-sm font-bold text-sidebar-primary-foreground" data-testid="link-focus-gap">See focused practice <ChevronRight size={15} /></Link></Card><Card className="p-6"><div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-accent/20 text-accent-foreground"><TrendingUp size={19} /></div><div><p className="text-sm font-bold">Since your last check-in</p><p className="text-xs text-muted-foreground">Most movement is in AI literacy.</p></div></div><div className="mt-5 grid grid-cols-3 gap-3 text-center"><div className="rounded-xl bg-muted p-3"><p className="font-mono-ui text-lg font-bold">+12</p><p className="mt-1 text-[10px] text-muted-foreground">AI literacy</p></div><div className="rounded-xl bg-muted p-3"><p className="font-mono-ui text-lg font-bold">+8</p><p className="mt-1 text-[10px] text-muted-foreground">Storytelling</p></div><div className="rounded-xl bg-muted p-3"><p className="font-mono-ui text-lg font-bold">+7</p><p className="mt-1 text-[10px] text-muted-foreground">Collaboration</p></div></div></Card></div></div></div>;
}
function CompetencyItem({ item }: { item: Competency }) {
  return <div className="rounded-xl border border-border p-4 transition-colors hover:border-primary/30"><div className="mb-3 flex items-start justify-between gap-3"><div><div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} /><p className="text-sm font-bold">{item.name}</p></div><p className="mt-1 pl-[18px] text-[11px] text-muted-foreground">{item.category}</p></div><span className="font-mono-ui text-lg font-bold">{item.score}</span></div><ProgressBar value={item.score} color={item.status === 'Needs focus' ? 'bg-destructive' : item.status === 'Strong' ? 'bg-primary' : 'bg-accent'} /><div className="mt-2 flex justify-between text-[10px]"><Pill tone={item.status === 'Needs focus' ? 'danger' : item.status === 'Strong' ? 'primary' : 'accent'}>{item.status}</Pill><span className={`flex items-center gap-1 ${item.trend < 0 ? 'text-destructive' : 'text-primary'}`}>{item.trend < 0 ? <TrendingDown size={12} /> : <TrendingUp size={12} />}{Math.abs(item.trend)} pts</span></div></div>;
}

function shuffle<T>(items: T[]): T[] {
  return [...items].sort(() => Math.random() - 0.5);
}

function createQuizAttempt() {
  return shuffle(quizQuestions).slice(0, 3).map((question) => ({ ...question, options: shuffle(question.options) }));
}

async function requestGeminiQuiz() {
  return customFetch<QuizQuestion[]>('/api/learners/me/quiz', { method: 'POST', responseType: 'json' });
}

function Quiz() {
  const { flash, recordQuiz } = useApp();
  const [questions, setQuestions] = useState(createQuizAttempt);
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState('');
  const [answered, setAnswered] = useState(false);
  const [score, setScore] = useState(0);
  const [done, setDone] = useState(false);
  useEffect(() => {
    let active = true;
    void requestGeminiQuiz().then((generated: QuizQuestion[]) => {
      if (active && generated.length === 3) setQuestions(generated.map((question: QuizQuestion) => ({ ...question, options: shuffle(question.options) })));
    }).catch(() => undefined);
    return () => { active = false; };
  }, []);
  const question = questions[index];
    const choose = (option: string) => { if (!answered) { setSelected(option); setAnswered(true); if (option === question.answer) setScore((current: number) => current + 1); } };
    const next = () => { if (index === questions.length - 1) { const finalScore = score + (selected === question.answer ? 1 : 0); setDone(true); recordQuiz(finalScore, questions.length, 'Adaptive diagnostic'); flash(`Diagnostic complete  ${Math.round(finalScore / questions.length * 100)}% signal`); } else { setIndex((current: number) => current + 1); setSelected(''); setAnswered(false); } };
    const restart = () => { setQuestions(createQuizAttempt()); setIndex(0); setSelected(''); setAnswered(false); setScore(0); setDone(false); void requestGeminiQuiz().then((generated: QuizQuestion[]) => { if (generated.length === 3) setQuestions(generated.map((question: QuizQuestion) => ({ ...question, options: shuffle(question.options) }))); }).catch(() => undefined); };
  if (done) return <div className="mx-auto max-w-2xl animate-enter py-10 text-center"><div className="mx-auto grid h-20 w-20 place-items-center rounded-3xl bg-primary/10 text-primary"><Trophy size={34} /></div><p className="mt-6 font-mono-ui text-[10px] uppercase tracking-[.18em] text-primary">Diagnostic complete</p><h1 className="mt-2 font-display text-4xl font-extrabold">Your next signal is clear.</h1><p className="mx-auto mt-4 max-w-md text-sm leading-6 text-muted-foreground">You got <strong className="text-foreground">{score} of {quizQuestions.length}</strong>. Evaluation & measurement is still the most useful place to invest your next 12 minutes.</p><div className="mx-auto mt-7 max-w-sm rounded-2xl border border-border bg-card p-5 text-left"><div className="mb-2 flex justify-between text-xs font-bold"><span>Evaluation & measurement</span><span className="text-accent-foreground">Needs practice</span></div><ProgressBar value={41} color="bg-accent" /></div><div className="mt-8 flex flex-wrap justify-center gap-3"><button onClick={restart} className="rounded-xl border border-border px-4 py-3 text-sm font-bold hover:bg-muted" data-testid="button-restart-quiz">Try again</button><Link href="/learn" className="rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground" data-testid="link-quiz-recommendations">See recommendations</Link></div></div>;
  return <div className="mx-auto max-w-3xl animate-enter"><SectionTitle eyebrow="Adaptive diagnostic" title="Find the next useful edge." detail="Three questions, no pressure. Your answers tune the path  they do not define you." action={<Pill tone="primary"><Target size={12} className="mr-1" /> Instant competency insights</Pill>} /><Card className="overflow-hidden"><div className="flex items-center gap-1 bg-muted p-2">{quizQuestions.map((item, itemIndex) => <div key={item.id} className={`h-1.5 flex-1 rounded-full ${itemIndex < index ? 'bg-primary' : itemIndex === index ? 'bg-accent' : 'bg-border'}`} />)}</div><div className="p-6 sm:p-10"><div className="flex items-center justify-between"><Pill>{question.difficulty}</Pill><span className="font-mono-ui text-xs text-muted-foreground">{String(index + 1).padStart(2, '0')} / 03</span></div><p className="mt-8 font-mono-ui text-[10px] uppercase tracking-[.15em] text-primary">{question.topic}</p><h2 className="mt-3 max-w-2xl font-display text-2xl font-extrabold leading-tight sm:text-3xl">{question.prompt}</h2><div className="mt-8 grid gap-3">{question.options.map((option, optionIndex) => { const isCorrect = option === question.answer; const isChosen = option === selected; return <button key={option} onClick={() => choose(option)} className={`flex items-start gap-3 rounded-xl border p-4 text-left text-sm font-semibold transition-all ${answered && isCorrect ? 'border-primary bg-primary/10 text-primary' : answered && isChosen ? 'border-destructive bg-destructive/10 text-destructive' : 'border-border bg-card hover:-translate-y-0.5 hover:border-primary/40'}`} data-testid={`button-answer-${optionIndex}` }><span className={`grid h-6 w-6 shrink-0 place-items-center rounded-lg font-mono-ui text-[10px] ${answered && isCorrect ? 'bg-primary text-primary-foreground' : answered && isChosen ? 'bg-destructive text-destructive-foreground' : 'bg-muted text-muted-foreground'}`}>{String.fromCharCode(65 + optionIndex)}</span><span>{option}</span>{answered && isCorrect && <Check className="ml-auto shrink-0" size={17} />}</button>; })}</div>{answered && <div className={`mt-6 rounded-xl p-4 text-sm leading-6 ${selected === question.answer ? 'bg-primary/10 text-primary' : 'bg-accent/15 text-foreground'}`}><p className="font-bold">{selected === question.answer ? 'Good read.' : 'Useful distinction.'}</p><p className="mt-1 text-muted-foreground">{question.explanation}</p></div>}<div className="mt-8 flex justify-end"><button disabled={!answered} onClick={next} className="inline-flex items-center gap-2 rounded-xl bg-foreground px-4 py-3 text-sm font-bold text-background disabled:cursor-not-allowed disabled:opacity-40" data-testid="button-next-question">{index === quizQuestions.length - 1 ? 'See my signal' : 'Next question'}<ChevronRight size={16} /></button></div></div></Card></div>;
}

function Tutor() {
  const { profile, flash } = useApp();
  const tutorHistory = useGetTutorMessages({ query: { queryKey: ['tutor-messages'], refetchInterval: 10000, refetchOnWindowFocus: true } });
  const sendTutor = useSendTutorMessage();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  useEffect(() => {
    if (tutorHistory.data) setMessages(tutorHistory.data.map((message: { id: number; role: 'user' | 'tutor'; text: string; createdAt: string }) => ({ id: String(message.id), role: message.role, text: message.text, time: new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) })));
  }, [tutorHistory.data]);
  const [input, setInput] = useState('');
  const send = (text = input) => { const clean = text.trim(); if (!clean) return; sendTutor.mutate({ data: { text: clean } }, { onSuccess: (rows: Array<{ id: number; role: 'user' | 'tutor'; text: string; createdAt: string }>) => { setMessages((current: ChatMessage[]) => [...current, ...rows.map((message: { id: number; role: 'user' | 'tutor'; text: string; createdAt: string }) => ({ id: String(message.id), role: message.role, text: message.text, time: new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }))]); setInput(''); flash('Tutor response saved'); }, onError: () => flash('Could not save tutor message') }); };
  return <div className="animate-enter"><SectionTitle eyebrow="Your study companion" title="Ask it until it clicks." detail="A material-aware tutor that uses your learning record to make difficult concepts more concrete." action={<Pill tone="primary"><LockKeyhole size={11} className="mr-1" /> Secure guidance</Pill>} /><div className="grid gap-5 xl:grid-cols-[1fr_.34fr]"><Card className="flex min-h-[560px] flex-col overflow-hidden"><div className="flex items-center gap-3 border-b border-border p-5"><div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary"><MessageCircle size={20} /></div><div><p className="text-sm font-bold">LearnAI tutor</p><p className="flex items-center gap-1.5 text-xs text-muted-foreground"><span className="h-1.5 w-1.5 rounded-full bg-primary" />Uses your learning record</p></div><MoreHorizontal className="ml-auto text-muted-foreground" size={18} /></div><div className="flex-1 space-y-5 overflow-y-auto p-5 sm:p-7">{messages.map((message) => <div key={message.id} className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : ''}`}><div className={`max-w-[82%] rounded-2xl p-4 text-sm leading-6 ${message.role === 'user' ? 'rounded-br-sm bg-primary text-primary-foreground' : 'rounded-bl-sm bg-muted text-foreground'}`}><p>{message.text}</p><p className={`mt-2 font-mono-ui text-[9px] ${message.role === 'user' ? 'text-primary-foreground/60' : 'text-muted-foreground'}`}>{message.time}</p></div></div>)}</div><div className="border-t border-border p-4"><div className="flex gap-2 rounded-xl border border-border bg-muted/40 p-2 focus-within:border-primary/50"><input value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') send(); }} placeholder="Ask about a concept, gap, or practice" className="min-w-0 flex-1 bg-transparent px-2 text-sm outline-none placeholder:text-muted-foreground" data-testid="input-tutor-message" /><button onClick={() => send()} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground hover:brightness-105" aria-label="Send message" data-testid="button-send-message"><Send size={16} /></button></div></div></Card><Card className="h-fit p-5"><p className="font-mono-ui text-[10px] uppercase tracking-[.15em] text-muted-foreground">Try asking</p><div className="mt-4 space-y-2">{tutorStarters.map((starter) => <button key={starter} onClick={() => send(starter)} className="flex w-full items-start gap-2 rounded-xl border border-border p-3 text-left text-xs font-semibold leading-5 transition-colors hover:border-primary/40 hover:bg-primary/5" data-testid={`button-prompt-${starter.slice(0, 8).replaceAll(' ', '-').toLowerCase()}`}><Sparkles size={14} className="mt-0.5 shrink-0 text-accent-foreground" />{starter}</button>)}</div><div className="mt-6 rounded-xl bg-sidebar p-4 text-sidebar-foreground"><p className="text-xs font-bold">How guidance works</p><p className="mt-2 text-[11px] leading-5 text-sidebar-foreground/65">Guidance is grounded in your current learning record and is designed to support  not replace  your judgment.</p></div></Card></div></div>;
}

function Progress() {
  const { quizHistory, profile, activity, dashboardBadges, stats } = useApp();
  const max = Math.max(1, ...activity.map((item) => item.minutes));
  return <div className="animate-enter"><SectionTitle eyebrow="Your momentum" title="Progress you can feel." detail="The goal is not a perfect dashboard. Its a clearer sense of what is moving, and what to try next." action={<button className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm font-bold hover:bg-muted" onClick={() => window.print()} data-testid="button-export-progress"><Download size={16} />Export view</button>} /><div className="grid gap-5 sm:grid-cols-3"><StatCard label="Current streak" value={String(Number(stats.streak ?? 0)) + " days"} sub="Best this month" icon={Flame} tone="accent" /><StatCard label="Practice time" value={String(Number(stats.totalMinutes ?? 0)) + " min"} sub="This week" icon={Clock3} tone="primary" /><StatCard label="Quiz signal" value={`${quizHistory[quizHistory.length - 1] ?? 78}%`} sub="+11 pts since first check-in" icon={Target} tone="blue" /></div><div className="mt-5 grid gap-5 xl:grid-cols-[1.15fr_.85fr]"><Card className="p-6 sm:p-7"><div className="flex items-center justify-between"><div><p className="font-mono-ui text-[10px] uppercase tracking-[.15em] text-muted-foreground">Weekly activity</p><h2 className="mt-1 font-display text-xl font-extrabold">Small steps, visible pattern.</h2></div><Pill tone="primary">{Number(stats.totalMinutes ?? 0)} min total</Pill></div><div className="mt-8 flex h-48 items-end gap-2 sm:gap-4">{activity.map((day) => <div key={day.day} className="group flex h-full flex-1 flex-col items-center justify-end gap-3"><div className="relative flex w-full flex-1 items-end rounded-xl bg-muted/60 p-1"><div className={`w-full rounded-lg transition-all duration-700 group-hover:brightness-110 ${day.minutes > 0 ? 'bg-primary' : 'bg-border'}`} style={{ height: `${Math.max(day.minutes / max * 100, day.minutes ? 12 : 4)}%` }}><span className="absolute -top-6 left-1/2 hidden -translate-x-1/2 rounded-md bg-foreground px-1.5 py-1 font-mono-ui text-[9px] text-background group-hover:block">{day.minutes}m</span></div></div><span className="font-mono-ui text-[10px] text-muted-foreground">{day.day}</span></div>)}</div></Card><Card className="p-6 sm:p-7"><p className="font-mono-ui text-[10px] uppercase tracking-[.15em] text-muted-foreground">Diagnostic trend</p><h2 className="mt-1 font-display text-xl font-extrabold">Your signal is climbing.</h2><div className="mt-7 flex items-end gap-3">{quizHistory.map((value, index) => <div className="flex flex-1 flex-col items-center gap-2" key={`${value}-${index}`}><div className="flex h-32 w-full items-end rounded-xl bg-muted p-1"><div className={`w-full rounded-lg ${index === quizHistory.length - 1 ? 'bg-accent' : 'bg-primary/55'}`} style={{ height: `${value}%` }} /></div><span className="font-mono-ui text-[10px] text-muted-foreground">Check {index + 1}</span><span className="font-mono-ui text-xs font-bold">{value}</span></div>)}</div></Card></div><Card className="mt-5 p-6 sm:p-7"><div className="flex items-end justify-between"><div><p className="font-mono-ui text-[10px] uppercase tracking-[.15em] text-muted-foreground">Milestones</p><h2 className="mt-1 font-display text-xl font-extrabold">Quiet proof youre showing up.</h2></div><span className="text-xs text-muted-foreground">{dashboardBadges.filter((badge) => badge.earned).length} earned</span></div><div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{dashboardBadges.map((badge) => <div key={badge.id} className={`rounded-xl border p-4 ${badge.earned ? 'border-primary/20 bg-primary/5' : 'border-border opacity-55'}`}><div className="flex items-center justify-between"><span className={`grid h-9 w-9 place-items-center rounded-xl ${badge.earned ? 'bg-accent/20 text-accent-foreground' : 'bg-muted text-muted-foreground'}`}>{badge.earned ? <Trophy size={17} /> : <LockKeyhole size={16} />}</span>{badge.earned && <Check size={15} className="text-primary" />}</div><p className="mt-4 text-sm font-bold">{badge.name}</p><p className="mt-1 text-[11px] leading-5 text-muted-foreground">{badge.detail}</p></div>)}</div></Card><Card className="mt-5 overflow-hidden bg-sidebar text-sidebar-foreground"><div className="grid gap-6 p-6 sm:grid-cols-[1fr_auto] sm:p-8"><div><Pill tone="accent">Certificate preview</Pill><h2 className="mt-5 font-display text-2xl font-extrabold">Foundations of responsible product thinking</h2><p className="mt-2 max-w-xl text-sm leading-6 text-sidebar-foreground/65">A preview of the recognition youll unlock after completing your focused path. Keep building  the point is the practice behind the paper.</p><div className="mt-6 flex items-center gap-3 text-xs text-sidebar-foreground/55"><span className="font-mono-ui text-sidebar-primary">LAI</span><span></span><span>Issued to {profile.name}</span></div></div><div className="flex items-center justify-center"><div className="grid h-28 w-28 place-items-center rounded-full border border-accent/35"><div className="grid h-20 w-20 place-items-center rounded-full border border-sidebar-primary/35 text-sidebar-primary"><Sparkles size={26} /></div></div></div></div></Card></div>;
}

type CertificateResponse = { learner: string; certificates: Array<{ id: string; courseId: string; issuedAt: string; status: string }> };

function Achievements() {
  const { gamification, flash } = useApp();
  const [data, setData] = useState<CertificateResponse>({ learner: 'Learner', certificates: [] });
  useEffect(() => { void customFetch<CertificateResponse>('/api/learners/me/certificates', { responseType: 'json' }).then(setData).catch(() => flash('Could not load certificates.')); }, [flash]);
  const downloadCertificate = (certificate: CertificateResponse['certificates'][number]) => {
    const course = courses.find((item) => item.id === certificate.courseId);
    const html = `<html><body style="font-family:Georgia;text-align:center;padding:80px"><h1>Certificate of Completion</h1><p>This certifies that</p><h2>${data.learner}</h2><p>completed</p><h2>${course?.title ?? certificate.courseId}</h2><p>Issued ${new Date(certificate.issuedAt).toLocaleDateString()}</p><p>Certificate ID: ${certificate.id}</p></body></html>`;
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    const link = document.createElement('a'); link.href = url; link.download = `${certificate.id}.html`; link.click(); URL.revokeObjectURL(url);
  };
  return <div className="animate-enter"><SectionTitle eyebrow="Recognition" title="Achievements you earned." detail="Badges come from recorded learning activity. Certificates are issued when a course reaches 100% completion." /><div className="grid gap-5 lg:grid-cols-[.9fr_1.1fr]"><Card className="p-6 sm:p-7"><div className="flex items-center justify-between"><div><p className="font-mono-ui text-[10px] uppercase tracking-[.15em] text-muted-foreground">Achievements</p><h2 className="mt-1 font-display text-2xl font-extrabold">Your milestones</h2></div><Trophy className="text-accent-foreground" size={22} /></div><div className="mt-5 space-y-3">{gamification.badges.map((badge) => <div key={badge.id} className={`flex items-center gap-3 rounded-xl border p-3 ${badge.earned ? 'border-primary/25 bg-primary/5' : 'border-border opacity-50'}`}><CheckCircle2 className={badge.earned ? 'text-primary' : 'text-muted-foreground'} size={18} /><div><p className="text-sm font-bold">{badge.name}</p><p className="text-xs text-muted-foreground">{badge.detail}</p></div><Pill tone={badge.earned ? 'primary' : 'muted'}>{badge.earned ? 'Earned' : 'Locked'}</Pill></div>)}</div><p className="mt-5 text-sm font-bold text-primary">{gamification.points} learning points</p></Card><Card className="p-6 sm:p-7"><div className="flex items-center justify-between"><div><p className="font-mono-ui text-[10px] uppercase tracking-[.15em] text-muted-foreground">Certificates</p><h2 className="mt-1 font-display text-2xl font-extrabold">Completion records</h2></div><GraduationCap className="text-primary" size={22} /></div>{data.certificates.length === 0 ? <p className="mt-6 rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground">Complete a course to receive your first certificate.</p> : <div className="mt-5 space-y-3">{data.certificates.map((certificate) => <div key={certificate.id} className="flex flex-col justify-between gap-3 rounded-xl border border-border p-4 sm:flex-row sm:items-center"><div><p className="text-sm font-bold">{courses.find((course) => course.id === certificate.courseId)?.title ?? certificate.courseId}</p><p className="mt-1 text-xs text-muted-foreground">{certificate.id}  Issued {new Date(certificate.issuedAt).toLocaleDateString()}</p></div><button onClick={() => downloadCertificate(certificate)} className="rounded-xl bg-primary px-3 py-2 text-xs font-bold text-primary-foreground">Download certificate</button></div>)}</div>}</Card></div></div>;
}
function StatCard({ label, value, sub, icon: Icon, tone }: { label: string; value: string; sub: string; icon: typeof Flame; tone: string }) { return <Card className="p-5"><div className="flex items-start justify-between"><div><p className="text-xs text-muted-foreground">{label}</p><p className="mt-2 font-display text-3xl font-extrabold">{value}</p><p className="mt-1 text-[11px] text-muted-foreground">{sub}</p></div><div className={`grid h-10 w-10 place-items-center rounded-xl ${tone === 'accent' ? 'bg-accent/20 text-accent-foreground' : tone === 'blue' ? 'bg-[#5f7da8]/15 text-[#5f7da8]' : 'bg-primary/10 text-primary'}`}><Icon size={18} /></div></div></Card>; }

type CompetencyGap = {
  id: number;
  competency: string;
  score: number;
  target: number;
  gap: number;
  status: string;
  updatedAt?: string;
};

type TrainingRecommendation = {
  id: number;
  title: string;
  competency: string;
  priority: number;
  rationale: string;
  resourceType: string;
  resourceUrl: string;
  metadata?: Record<string, unknown>;
};

type GeneratedMaterialQuestion = {
  id: number;
  topic: string;
  difficulty: string;
  prompt: string;
  options: string[];
  answer: string;
  explanation: string;
};

type UploadedMaterial = {
  id: string;
  title: string;
  type: 'PDF' | 'PPT' | 'DOCX' | 'TXT';
  size: string;
  topic: string;
  keywords: string[];
  concepts: string[];
  objectives: string[];
  summary: string;
  content: string;
  points: number;
};

function GapAnalysis() {
  const { flash } = useApp();
  const [gaps, setGaps] = useState<CompetencyGap[]>([]);
  const [recommendations, setRecommendations] = useState<TrainingRecommendation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [gapData, recData] = await Promise.all([
          customFetch<CompetencyGap[]>('/api/learners/me/competency-gap', { responseType: 'json' }),
          customFetch<TrainingRecommendation[]>('/api/learners/me/recommendations', { responseType: 'json' }),
        ]);
        setGaps(gapData);
        setRecommendations(recData);
      } catch {
        flash('AI gap analysis is not available yet. Please enable the backend data source.');
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [flash]);

  return <div className="animate-enter">
    <SectionTitle eyebrow="SIH capacity-building workflow" title="Competency gaps with targeted action." detail="Domain-specific assessment identifies public-service skill gaps, recommends an iGOT-aligned intervention, and supports reassessment after training." />
    <div className="grid gap-5 xl:grid-cols-[1.1fr_.9fr]">
      <Card className="p-6 sm:p-7">
        <div className="mb-5 flex items-center justify-between">
          <p className="font-mono-ui text-[10px] uppercase tracking-[.15em] text-muted-foreground">Skill gap matrix</p>
          <Pill tone="primary">Live signal</Pill>
        </div>
        {loading ? <div className="text-sm text-muted-foreground">Loading competency analysis</div> : (
           <div className="space-y-4">
            {gaps.map((item) => (
              <div key={item.id ?? item.competency} className="rounded-2xl border border-border p-4">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold">{item.competency}</p>
                    <p className="text-[11px] text-muted-foreground">Target {item.target}%</p>
                  </div>
                  <span className="font-mono-ui text-lg font-bold">{item.score}%</span>
                </div>
                <ProgressBar value={item.score} color={item.status === 'Needs focus' ? 'bg-destructive' : item.status === 'Strong' ? 'bg-primary' : 'bg-accent'} />
                <div className="mt-3 flex items-center justify-between text-[11px]">
                  <Pill tone={item.status === 'Needs focus' ? 'danger' : item.status === 'Strong' ? 'primary' : 'accent'}>{item.status}</Pill>
                  <span className="text-muted-foreground">Gap: {item.gap}%</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
      <Card className="p-6 sm:p-7">
        <div className="mb-5 flex items-center justify-between">
          <p className="font-mono-ui text-[10px] uppercase tracking-[.15em] text-muted-foreground">Recommended learning</p>
          <Pill tone="accent">Next best move</Pill>
        </div>
        <div className="space-y-3">
          {recommendations.length === 0 ? (
            <p className="text-sm text-muted-foreground">No recommendation yet.</p>
          ) : (
            recommendations.map((item) => (
              <div key={item.id ?? `${item.competency}-${item.priority}`} className="rounded-2xl border border-border p-4">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <p className="text-sm font-bold">{item.title}</p>
                  <span className="font-mono-ui text-[10px] uppercase tracking-[.12em] text-primary">P{item.priority}</span>
                </div>
                <p className="text-[11px] text-muted-foreground">{item.competency}</p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.rationale}</p>
                <a href={item.resourceUrl || '#'} target="_blank" rel="noreferrer" className="mt-3 inline-flex text-xs font-bold text-primary hover:underline">Redirect to iGOT course</a>
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  </div>;
}

function MaterialStudio() {
  const { flash } = useApp();
  const [title, setTitle] = useState('');
  const [topic, setTopic] = useState('');
  const [content, setContent] = useState('');
  const [questions, setQuestions] = useState<GeneratedMaterialQuestion[]>([]);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const [materials, setMaterials] = useState<UploadedMaterial[]>([]);
  const [selectedMaterialId, setSelectedMaterialId] = useState<string | null>(null);
  const [askQuestion, setAskQuestion] = useState('');
  const [askMode, setAskMode] = useState(false);
  const [igotAction, setIgotAction] = useState<'learner' | 'competency' | 'course' | 'assessment'>('learner');
  const [igotSyncing, setIgotSyncing] = useState(false);
  const [igotResult, setIgotResult] = useState('');

  const selectedMaterial = materials.find((material) => material.id === selectedMaterialId) ?? materials[0];

  const handleFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;

    setSaving(true);
    try {
      const results = await Promise.allSettled(Array.from(fileList).map(async (file) => {
        if (file.size > 10 * 1024 * 1024) {
          throw new Error(`${file.name} is larger than the 10 MB upload limit.`);
        }
        const formData = new FormData();
        formData.append('file', file);
        const response = await customFetch<{ material: { id: number; title: string }; extraction: { fileName: string; fileSize: number; sourceType: UploadedMaterial['type']; topic: string; keywords: string[]; concepts: string[]; objectives: string[]; summary: string; content: string } }>('/api/learners/me/materials/upload', {
          method: 'POST',
          body: formData,
          responseType: 'json',
        });
        return {
          id: String(response.material.id),
          title: response.material.title,
          type: response.extraction.sourceType,
          size: `${(response.extraction.fileSize / (1024 * 1024)).toFixed(1)} MB`,
          topic: response.extraction.topic,
          keywords: response.extraction.keywords,
          concepts: response.extraction.concepts,
          objectives: response.extraction.objectives,
          summary: response.extraction.summary,
          content: response.extraction.content,
          points: 120,
        } satisfies UploadedMaterial;
      }));
      const uploaded = results.flatMap((result) => result.status === 'fulfilled' ? [result.value] : []);
      const failures = results.flatMap((result) => result.status === 'rejected' ? [result.reason instanceof Error ? result.reason.message : 'Upload failed.'] : []);
      if (failures.length > 0 && uploaded.length === 0) throw new Error(failures.join(' '));
      setMaterials((current) => [...uploaded, ...current]);
      setSelectedMaterialId((current) => uploaded[0]?.id ?? current);
      if (uploaded[0]) {
        setTitle(uploaded[0].title);
        setTopic(uploaded[0].topic);
        setContent(uploaded[0].content);
      }
      flash(`${uploaded.length} file${uploaded.length > 1 ? 's' : ''} uploaded and analyzed.${failures.length > 0 ? ` ${failures.join(' ')}` : ''}`);
    } catch (error) {
      flash(error instanceof Error ? error.message : 'Upload failed. Check the file type, size, and server connection.');
    } finally {
      setSaving(false);
    }
  };

  const generateQuestions = async () => {
    if (!content.trim()) {
      flash('Please add material before generating questions.');
      return;
    }
    setSaving(true);
    try {
      const payload = await customFetch<GeneratedMaterialQuestion[]>('/api/learners/me/materials/generate-questions', {
        method: 'POST',
        responseType: 'json',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, topic, content, count: 3 }),
      });
      setQuestions(payload);
      flash('Questions generated from the learning material.');
    } catch (error) {
      flash(error instanceof Error ? error.message : 'Question generation failed. Check the backend configuration.');
    } finally {
      setSaving(false);
    }
  };

  const saveMaterial = async () => {
    if (!content.trim()) {
      flash('Please add material before saving.');
      return;
    }
    try {
      await customFetch('/api/learners/me/materials', {
        method: 'POST',
        responseType: 'json',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, topic, content }),
      });
      flash('Learning material stored successfully.');
    } catch (error) {
      flash(error instanceof Error ? error.message : 'Material upload failed.');
    }
  };

  const [actionResult, setActionResult] = useState('');
  const runMaterialAction = async (action: 'quiz' | 'summary' | 'ask') => {
    setActionResult('');
    if (!selectedMaterial) {
      flash('Upload a file before running AI actions.');
      return;
    }
    if (action === 'ask' && !askMode) {
      setAskMode(true);
      return;
    }
    if (action === 'ask' && !askQuestion.trim()) {
      flash('Type a question about the uploaded material first.');
      return;
    }

    if (action === 'quiz') {
      setSaving(true);
      try {
        const generated = await customFetch<GeneratedMaterialQuestion[]>('/api/learners/me/materials/generate-questions', {
          method: 'POST', responseType: 'json', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: selectedMaterial.title, topic: selectedMaterial.topic, content: selectedMaterial.content, count: 3 }),
        });
        setQuestions(generated);
        setActionResult(`Generated ${generated.length} questions from the extracted material.`);
      } catch (error) {
        flash(error instanceof Error ? error.message : 'Quiz generation failed.');
      } finally {
        setSaving(false);
      }
      return;
    }
    if (action === 'summary') {
      setSaving(true);
      try {
        const response = await customFetch<{ answer: string }>('/api/learners/me/materials/assist', {
          method: 'POST', responseType: 'json', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: selectedMaterial.title, content: selectedMaterial.content, prompt: 'Summarize this learning material in three concise sentences and identify its main practical takeaway.' }),
        });
        setActionResult(response.answer);
      } catch (error) {
        flash(error instanceof Error ? error.message : 'Summary generation failed.');
      } finally {
        setSaving(false);
      }
      return;
    }
    setSaving(true);
    try {
      const response = await customFetch<{ answer: string }>('/api/learners/me/materials/assist', {
        method: 'POST', responseType: 'json', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: selectedMaterial.title, content: selectedMaterial.content, prompt: askQuestion.trim() }),
      });
      setActionResult(response.answer);
    } catch (error) {
      flash(error instanceof Error ? error.message : 'Material assistant failed.');
    } finally {
      setSaving(false);
    }
  };

  const runIgotDemoSync = () => {
    setIgotSyncing(true);
    setIgotResult('');
    window.setTimeout(() => {
      const results = {
        learner: 'Learner profile mapped: role, institution, interests',
        competency: '6 competency signals prepared for exchange',
        course: '1 learning material mapped to a capacity-building course record',
        assessment: `${questions.length || 3} assessment items prepared with answer keys`,
      };
      setIgotResult(results[igotAction]);
      setIgotSyncing(false);
    }, 650);
  };

  return <div className="animate-enter">
    <SectionTitle eyebrow="Domain-specific learning" title="Turn government training material into assessments." detail="Upload official curriculum content, detect relevant public-service topics, generate scenario-based questions, and create targeted learning support for government employees." />
    <div className="grid gap-5 xl:grid-cols-[.9fr_1.1fr]">
      <Card className="p-6 sm:p-7">
        <div
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            void handleFiles(event.dataTransfer.files);
          }}
          className={`rounded-2xl border border-dashed p-6 text-center transition-all ${dragging ? 'border-primary bg-primary/5' : 'border-border bg-muted/20'}`}
        >
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary">
            <FileText size={24} />
          </div>
          <p className="mt-4 text-base font-bold">Drag & drop learning material</p>
          <p className="mt-2 text-sm text-muted-foreground">PDF, PPT, DOCX, TXT</p>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={saving}
            className="mt-5 inline-flex items-center rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground"
          >
            {saving ? 'Processing' : 'Upload file'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.pptx,.docx,.txt"
            multiple
            className="hidden"
            onChange={(event) => { void handleFiles(event.target.files); }}
          />
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <button onClick={() => void runMaterialAction('quiz')} disabled={saving} className="rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground disabled:opacity-60">Generate Quiz</button>
          <button onClick={() => void runMaterialAction('summary')} disabled={saving} className="rounded-xl border border-border px-4 py-3 text-sm font-bold hover:bg-muted disabled:opacity-60">Summarize</button>
          <button onClick={() => void runMaterialAction('ask')} disabled={saving} className="rounded-xl border border-border px-4 py-3 text-sm font-bold hover:bg-muted disabled:opacity-60">Ask AI</button>
        </div>
        {askMode && <div className="mt-5 rounded-2xl border border-primary/25 bg-primary/5 p-4"><label className="block text-xs font-bold" htmlFor="material-question">Your question</label><div className="mt-3 flex gap-2"><input id="material-question" value={askQuestion} onChange={(event) => setAskQuestion(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && askQuestion.trim()) void runMaterialAction('ask'); }} placeholder="Ask something about this material" className="min-w-0 flex-1 rounded-xl border border-border bg-card px-3 py-2.5 text-sm outline-none focus:border-primary" autoFocus /><button onClick={() => void runMaterialAction('ask')} disabled={saving || !askQuestion.trim()} className="rounded-xl bg-primary px-3 py-2 text-xs font-bold text-primary-foreground disabled:opacity-50">{saving ? 'Asking' : 'Ask'}</button></div></div>}
        {actionResult && <div className="mt-5 rounded-2xl border border-primary/25 bg-primary/5 p-5" aria-live="polite"><p className="font-mono-ui text-[10px] uppercase tracking-[.15em] text-primary">Material response</p><p className="mt-3 text-sm leading-6 text-foreground">{actionResult}</p></div>}

        <div className="mt-6 space-y-4">
          <label className="block">
            <span className="mb-2 block text-xs font-bold">Title</span>
            <input value={title} onChange={(event) => setTitle(event.target.value)} className="w-full rounded-xl border border-border bg-muted/30 px-3.5 py-3 text-sm outline-none focus:border-primary" />
          </label>
          <label className="block">
            <span className="mb-2 block text-xs font-bold">Topic</span>
            <input value={topic} onChange={(event) => setTopic(event.target.value)} className="w-full rounded-xl border border-border bg-muted/30 px-3.5 py-3 text-sm outline-none focus:border-primary" />
          </label>
          <label className="block">
            <span className="mb-2 block text-xs font-bold">Learning material</span>
            <textarea value={content} onChange={(event) => setContent(event.target.value)} rows={12} className="w-full rounded-xl border border-border bg-muted/30 px-3.5 py-3 text-sm outline-none focus:border-primary" />
          </label>
          <div className="flex flex-wrap gap-3">
            <button onClick={saveMaterial} className="rounded-xl border border-border px-4 py-3 text-sm font-bold hover:bg-muted">Save material</button>
            <button onClick={generateQuestions} disabled={saving} className="rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground disabled:opacity-60">{saving ? 'Generating' : 'Generate questions'}</button>
          </div>
        </div>
      </Card>

      <div className="space-y-5">
        <Card className="p-6 sm:p-7">
          <div className="mb-5 flex items-center justify-between">
            <p className="font-mono-ui text-[10px] uppercase tracking-[.15em] text-muted-foreground">AI extraction preview</p>
              <Pill tone="accent">Extracted output</Pill>
          </div>
          {selectedMaterial ? (
            <div className="space-y-5">
              <div className="rounded-2xl border border-border bg-muted/20 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-mono-ui text-[10px] uppercase tracking-[.14em] text-primary">{selectedMaterial.type}</p>
                    <h3 className="mt-2 text-lg font-extrabold">{selectedMaterial.title}</h3>
                  </div>
                  <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary">{selectedMaterial.points} pts</span>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-border p-4">
                  <p className="font-mono-ui text-[10px] uppercase tracking-[.14em] text-muted-foreground">Topics</p>
                  <p className="mt-3 text-sm font-bold">{selectedMaterial.topic}</p>
                </div>
                <div className="rounded-2xl border border-border p-4">
                  <p className="font-mono-ui text-[10px] uppercase tracking-[.14em] text-muted-foreground">File size</p>
                  <p className="mt-3 text-sm font-bold">{selectedMaterial.size}</p>
                </div>
              </div>

              <div className="rounded-2xl border border-border p-4">
                <p className="font-mono-ui text-[10px] uppercase tracking-[.14em] text-muted-foreground">Keywords</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {selectedMaterial.keywords.map((keyword) => (
                    <span key={keyword} className="rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-bold text-primary">{keyword}</span>
                  ))}
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-border p-4">
                  <p className="font-mono-ui text-[10px] uppercase tracking-[.14em] text-muted-foreground">Concepts</p>
                  <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                    {selectedMaterial.concepts.map((concept) => <li key={concept}>- {concept}</li>)}
                  </ul>
                </div>
                <div className="rounded-2xl border border-border p-4">
                  <p className="font-mono-ui text-[10px] uppercase tracking-[.14em] text-muted-foreground">Learning objectives</p>
                  <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                    {selectedMaterial.objectives.map((objective) => <li key={objective}>- {objective}</li>)}
                  </ul>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Upload a material to see AI extraction details.</p>
          )}
        </Card>

        <Card className="p-6 sm:p-7">
          <div className="mb-5 flex items-center justify-between">
            <p className="font-mono-ui text-[10px] uppercase tracking-[.15em] text-muted-foreground">Generated MCQs</p>
            <Pill tone="accent">AI output</Pill>
          </div>
          <div className="space-y-4">
            {questions.length === 0 ? (
              <p className="text-sm text-muted-foreground">No questions generated yet. Add content and run the generator.</p>
            ) : (
              questions.map((question, index) => (
                <div key={`${question.topic}-${index}`} className="rounded-2xl border border-border p-4">
                  <p className="font-mono-ui text-[10px] uppercase tracking-[.12em] text-primary">{question.topic}  {question.difficulty}</p>
                  <h3 className="mt-2 text-base font-bold">{question.prompt}</h3>
                  <div className="mt-3 space-y-2">
                    {question.options.map((option, optionIndex) => (
                      <div key={`${option}-${optionIndex}`} className={`rounded-xl border px-3 py-2 text-sm ${option === question.answer ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-muted/20'}`}>
                        <span className="mr-2 font-mono-ui text-[10px] uppercase tracking-[.12em]">{String.fromCharCode(65 + optionIndex)}</span>
                        {option}
                      </div>
                    ))}
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground">Answer: {question.answer}</p>
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">{question.explanation}</p>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    </div>

    <div className="mt-8 rounded-2xl border border-border bg-card p-6 sm:p-7">
      <div className="mb-5 flex items-center justify-between">
        <p className="font-mono-ui text-[10px] uppercase tracking-[.15em] text-muted-foreground">iGOT integration layer</p>
        <Pill tone="accent">Local integration demo</Pill>
      </div>
      <div className="grid gap-3 lg:grid-cols-[1.2fr_.6fr_1.2fr_1.2fr_1.2fr] lg:items-center">
        <div className="rounded-2xl border border-border bg-sidebar px-4 py-5 text-center text-sm font-bold text-sidebar-foreground">iGOT Karmayogi</div>
        <div className="hidden text-center text-lg text-muted-foreground lg:block">-&gt;</div>
        <div className="rounded-2xl border border-primary/30 bg-primary/10 px-4 py-5 text-center text-sm font-bold text-primary">Integration Layer</div>
        <div className="hidden text-center text-lg text-muted-foreground lg:block">-&gt;</div>
        <div className="rounded-2xl border border-border bg-muted/20 px-4 py-5 text-center text-sm font-bold">AI System</div>
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-4 text-sm font-bold">Competency Engine</div>
        <div className="rounded-2xl border border-border bg-card p-4 text-sm font-bold">Learning Engine</div>
        <div className="rounded-2xl border border-border bg-card p-4 text-sm font-bold">Assessment Engine</div>
      </div>
      <div className="mt-6 rounded-2xl border border-primary/20 bg-primary/5 p-5">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div><p className="text-sm font-bold">Try the integration contract</p><p className="mt-1 text-xs leading-5 text-muted-foreground">These actions simulate the payloads LearnAI would exchange with official iGOT services.</p></div>
          <Pill tone="primary">Mock adapter - no external request</Pill>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-4">
          {([['learner', 'Sync learner'], ['competency', 'Sync competency'], ['course', 'Sync course'], ['assessment', 'Sync assessment']] as const).map(([value, label]) => <button key={value} onClick={() => setIgotAction(value)} className={`rounded-xl border px-3 py-2.5 text-xs font-bold ${igotAction === value ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card hover:border-primary/40'}`}>{label}</button>)}
        </div>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center"><button onClick={runIgotDemoSync} disabled={igotSyncing} className="inline-flex items-center justify-center gap-2 rounded-xl bg-foreground px-4 py-3 text-sm font-bold text-background disabled:opacity-60"><Network size={15} />{igotSyncing ? 'Preparing payload...' : 'Run demo sync'}</button>{igotResult && <span className="text-sm font-semibold text-primary" role="status"><Check size={15} className="mr-1 inline" />{igotResult}</span>}</div>
        <pre className="mt-4 overflow-x-auto rounded-xl bg-sidebar p-4 font-mono-ui text-[11px] leading-5 text-sidebar-foreground">{JSON.stringify({
          adapter: 'igot-demo',
          operation: igotAction,
          learnerId: 'learnai-user',
          competency: 'Public-sector capacity building',
          igotCategory: 'Capacity Building',
          igotResourceId: `learnai-${igotAction}`,
          source: selectedMaterial?.title ?? 'uploaded learning material',
          status: igotResult ? 'prepared' : 'ready',
        }, null, 2)}</pre>
      </div>
      <p className="mt-4 text-sm leading-6 text-muted-foreground">
        This demo shows the integration contract for public-sector capacity building. It uses a local mock adapter and does not claim live iGOT API access; official endpoints and credentials can replace the adapter later.
      </p>
    </div>
  </div>;
}

function IgotIntegration() {
  const [operation, setOperation] = useState<'learner' | 'competency' | 'course' | 'assessment'>('learner');
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState('');
  const runSync = () => {
    setSyncing(true);
    setResult('');
    window.setTimeout(() => {
      setResult({ learner: 'Learner profile mapped successfully.', competency: '6 competency signals prepared.', course: 'Course payload prepared from learning material.', assessment: 'Assessment payload prepared with answer keys.' }[operation]);
      setSyncing(false);
    }, 650);
  };
  return <div className="animate-enter"><SectionTitle eyebrow="Integration layer" title="iGOT capacity-building connection." detail="A local integration demo for learner, competency, learning, and assessment exchange in Indias Official Statistical System." /><Card className="p-6 sm:p-8"><div className="grid gap-3 lg:grid-cols-[1fr_auto_1fr_auto_1fr] lg:items-center"><div className="rounded-2xl border border-border bg-sidebar px-4 py-6 text-center font-bold text-sidebar-foreground">iGOT Karmayogi</div><span className="hidden text-center text-xl text-muted-foreground lg:block"></span><div className="rounded-2xl border border-primary/30 bg-primary/10 px-4 py-6 text-center font-bold text-primary">LearnAI Integration Layer</div><span className="hidden text-center text-xl text-muted-foreground lg:block"></span><div className="rounded-2xl border border-border bg-muted/20 px-4 py-6 text-center font-bold">Competency + Learning + Assessment</div></div><div className="mt-8 rounded-2xl border border-primary/20 bg-primary/5 p-5"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><p className="text-sm font-bold">Run local integration demo</p><p className="mt-1 text-xs leading-5 text-muted-foreground">This prepares the contract without calling external iGOT services.</p></div><Pill tone="accent">Mock adapter</Pill></div><div className="mt-5 grid gap-2 sm:grid-cols-4">{([['learner', 'Sync learner'], ['competency', 'Sync competency'], ['course', 'Sync course'], ['assessment', 'Sync assessment']] as const).map(([value, label]) => <button key={value} onClick={() => setOperation(value)} className={`rounded-xl border px-3 py-3 text-xs font-bold ${operation === value ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card hover:border-primary/40'}`}>{label}</button>)}</div><div className="mt-4 flex flex-wrap items-center gap-3"><button onClick={runSync} disabled={syncing} className="inline-flex items-center gap-2 rounded-xl bg-foreground px-4 py-3 text-sm font-bold text-background disabled:opacity-60"><Network size={15} />{syncing ? 'Preparing' : 'Run demo sync'}</button>{result && <span className="text-sm font-semibold text-primary" role="status"><Check size={15} className="mr-1 inline" />{result}</span>}</div><pre className="mt-5 overflow-x-auto rounded-xl bg-sidebar p-4 font-mono-ui text-[11px] leading-5 text-sidebar-foreground">{JSON.stringify({ adapter: 'igot-demo', operation, domain: 'Official Statistical System capacity building', status: result ? 'prepared' : 'ready', externalRequest: false }, null, 2)}</pre></div><div className="mt-6 grid gap-3 md:grid-cols-3"><div className="rounded-xl border border-border p-4 text-sm font-bold">Competency mapping</div><div className="rounded-xl border border-border p-4 text-sm font-bold">Learning catalogue</div><div className="rounded-xl border border-border p-4 text-sm font-bold">Assessment exchange</div></div><p className="mt-6 text-sm leading-6 text-muted-foreground">This is a local demo adapter, not live iGOT API access. Official API documentation and credentials can replace the adapter without changing the learning workflows.</p></Card></div>;
}

function Admin() {
  const [tab, setTab] = useState('Overview');
  const [adminMetrics, setAdminMetrics] = useState(fallbackAdminMetrics);
  const [accessError, setAccessError] = useState(false);
  useEffect(() => {
    void customFetch<typeof fallbackAdminMetrics>('/api/trainer/dashboard', { responseType: 'json' }).then(setAdminMetrics).catch(() => setAccessError(true));
  }, []);
  if (accessError) return <div className="mx-auto grid min-h-[60vh] max-w-xl place-items-center text-center"><div><Users className="mx-auto text-destructive" size={32} /><h1 className="mt-4 font-display text-3xl font-extrabold">Trainer access required</h1><p className="mt-3 text-sm leading-6 text-muted-foreground">This view only shows live organization data to approved trainer accounts. Add your Clerk email to <code>TRAINER_EMAILS</code>, restart the API, and sign in again.</p></div></div>;
  return <div className="animate-enter"><SectionTitle eyebrow="Trainer studio" title="See where the cohort needs you." detail="An organization-level view for facilitators. Built for conversation, not surveillance." action={<Pill tone="accent"><Users size={12} className="mr-1" /> Demo organization</Pill>} /><div className="mb-5 flex gap-1 rounded-xl bg-muted p-1 sm:w-fit">{['Overview', 'Cohorts', 'Competencies'].map((item) => <button key={item} onClick={() => setTab(item)} className={`rounded-lg px-4 py-2 text-xs font-bold ${tab === item ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'}`} data-testid={`button-admin-tab-${item.toLowerCase()}`}>{item}</button>)}</div>{tab === 'Overview' && <><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[{ label: 'Learners', value: adminMetrics.learners, sub: 'Across 8 cohorts', icon: Users }, { label: 'Active this week', value: adminMetrics.activeThisWeek, sub: '73% of learners', icon: Zap }, { label: 'Average competency', value: `${adminMetrics.avgCompetency}/100`, sub: '+8 since baseline', icon: Gauge }, { label: 'Courses completed', value: adminMetrics.coursesCompleted.toLocaleString(), sub: 'All-time learning', icon: GraduationCap }].map(({ label, value, sub, icon: Icon }) => <Card key={label} className="p-5"><Icon size={18} className="text-primary" /><p className="mt-5 text-xs text-muted-foreground">{label}</p><p className="mt-1 font-display text-3xl font-extrabold">{value}</p><p className="mt-1 text-[11px] text-muted-foreground">{sub}</p></Card>)}</div><div className="mt-5 grid gap-5 xl:grid-cols-[1fr_.8fr]"><Card className="p-6"><div className="flex items-center justify-between"><div><p className="font-mono-ui text-[10px] uppercase tracking-[.15em] text-muted-foreground">Cohort pulse</p><h2 className="mt-1 font-display text-xl font-extrabold">Where the room is moving</h2></div><button className="rounded-lg p-2 text-muted-foreground hover:bg-muted" onClick={() => setTab('Cohorts')} data-testid="button-view-cohorts"><ChevronRight size={16} /></button></div><div className="mt-5 space-y-3">{adminMetrics.cohorts.map((cohort) => <div className="rounded-xl border border-border p-4" key={cohort.name}><div className="flex items-center justify-between gap-3"><p className="text-sm font-bold">{cohort.name}</p><span className="font-mono-ui text-sm font-bold">{cohort.score}</span></div><div className="mt-3 flex items-center gap-3"><ProgressBar value={cohort.score} /><span className="flex shrink-0 items-center gap-1 text-[10px] text-primary"><TrendingUp size={12} />+{cohort.movement}</span></div><p className="mt-2 text-[10px] text-muted-foreground">{cohort.learners} learners</p></div>)}</div></Card><Card className="bg-sidebar p-6 text-sidebar-foreground"><p className="font-mono-ui text-[10px] uppercase tracking-[.15em] text-sidebar-foreground/50">Shared opportunity</p><h2 className="mt-5 font-display text-2xl font-extrabold">{adminMetrics.topGap}</h2><p className="mt-3 text-sm leading-6 text-sidebar-foreground/65">The most common competency gap across the organization. A short facilitated practice here could create a lot of lift.</p><div className="mt-8 flex items-end justify-between"><span className="text-xs text-sidebar-foreground/55">Cohort signal</span><span className="font-mono-ui text-3xl font-bold text-accent">{adminMetrics.topGapScore}<span className="text-sm text-sidebar-foreground/50"> / 100</span></span></div><div className="mt-3"><ProgressBar value={adminMetrics.topGapScore} color="bg-accent" /></div></Card></div></>}{tab !== 'Overview' && <Card className="p-6 sm:p-8"><div className="grid gap-3 md:grid-cols-2">{tab === 'Cohorts' ? adminMetrics.cohorts.map((cohort) => <div key={cohort.name} className="rounded-xl border border-border p-5"><div className="flex items-center justify-between"><Users size={18} className="text-primary" /><Pill tone="primary">{cohort.learners} learners</Pill></div><h3 className="mt-5 font-display text-lg font-extrabold">{cohort.name}</h3><p className="mt-1 text-sm text-muted-foreground">Average competency {cohort.score}  +{cohort.movement} this cycle</p></div>) : competencies.map((item) => <div key={item.id} className="rounded-xl border border-border p-5"><div className="flex justify-between"><p className="text-sm font-bold">{item.name}</p><span className="font-mono-ui text-sm">{item.score}</span></div><div className="mt-3"><ProgressBar value={item.score} /></div><p className="mt-2 text-[11px] text-muted-foreground">{item.category}  {item.status}</p></div>)}</div></Card>}</div>;
}

function Settings() {
  const { profile, updateProfile, dark, toggleTheme, flash } = useApp();
  const [form, setForm] = useState(profile);
  const [reminders, setReminders] = useState(true);
  const update = (field: keyof LearnerProfile, value: string) => setForm((current) => ({ ...current, [field]: value }));
  return <div className="animate-enter"><SectionTitle eyebrow="Your workspace" title="Make LearnAI yours." detail="Your profile shapes the path and is saved to your account record." /><div className="grid gap-5 xl:grid-cols-[1fr_.65fr]"><Card className="p-6 sm:p-8"><div className="flex items-center gap-4 border-b border-border pb-6"><div className="grid h-14 w-14 place-items-center rounded-2xl bg-primary text-lg font-bold text-primary-foreground">{profile.name.split(' ').map((part) => part[0]).join('')}</div><div><p className="font-display text-xl font-extrabold">{profile.name}</p><p className="text-sm text-muted-foreground">{profile.role}  {profile.institution}</p></div></div><div className="mt-7 grid gap-5 sm:grid-cols-2"><Field label="Name" value={form.name} onChange={(value) => update('name', value)} testId="input-profile-name" /><Field label="Role" value={form.role} onChange={(value) => update('role', value)} testId="input-profile-role" /><Field label="Institution" value={form.institution} onChange={(value) => update('institution', value)} testId="input-profile-institution" /></div><div className="mt-6"><p className="mb-2 text-xs font-bold">Interests</p><div className="flex flex-wrap gap-2">{form.interests.map((interest) => <span key={interest} className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary">{interest}<button onClick={() => setForm((current) => ({ ...current, interests: current.interests.filter((item) => item !== interest) }))} className="ml-1 rounded-full hover:bg-primary/20" aria-label={`Remove ${interest}`} data-testid={`button-remove-interest-${interest.replaceAll(' ', '-').toLowerCase()}`}><X size={12} /></button></span>)}<button onClick={() => setForm((current) => ({ ...current, interests: [...current.interests, current.interests.includes('Systems thinking') ? 'Ethics in technology' : 'Systems thinking'] }))} className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:border-primary hover:text-primary" data-testid="button-add-interest"><Plus size={13} />Add interest</button></div></div><button onClick={() => updateProfile(form)} className="mt-8 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground" data-testid="button-save-profile">Save profile</button></Card><div className="space-y-5"><Card className="p-6"><p className="font-mono-ui text-[10px] uppercase tracking-[.15em] text-muted-foreground">Preferences</p><div className="mt-5 space-y-1"><ToggleRow label="Weekly nudge" detail="A gentle reminder to keep your thread" checked={reminders} onChange={() => { const next = !reminders; setReminders(next); updateProfile({ ...form, preferences: { ...(form.preferences ?? {}), weeklyNudge: next } }); }} testId="toggle-reminders" /><ToggleRow label="Dark studio" detail="A softer view for evening study" checked={dark} onChange={toggleTheme} testId="toggle-dark" /></div></Card><Card className="bg-accent/15 p-6"><div className="flex items-center gap-3"><Sun size={19} className="text-accent-foreground" /><p className="text-sm font-bold">Your account record</p></div><p className="mt-3 text-xs leading-5 text-muted-foreground">Your profile is saved to your LearnAI account. Study preferences and activity are also retained on this device for a responsive experience.</p></Card></div></div></div>;
}
function Field({ label, value, onChange, testId }: { label: string; value: string; onChange: (value: string) => void; testId: string }) { return <label className="block"><span className="mb-2 block text-xs font-bold">{label}</span><input value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded-xl border border-border bg-muted/30 px-3.5 py-3 text-sm outline-none transition-colors focus:border-primary" data-testid={testId} /></label>; }
function ToggleRow({ label, detail, checked, onChange, testId }: { label: string; detail: string; checked: boolean; onChange: () => void; testId: string }) { return <button onClick={onChange} className="flex w-full items-center justify-between rounded-xl p-3 text-left transition-colors hover:bg-muted" data-testid={testId}><span><span className="block text-sm font-bold">{label}</span><span className="mt-1 block text-[11px] text-muted-foreground">{detail}</span></span><span className={`relative h-6 w-11 rounded-full transition-colors ${checked ? 'bg-primary' : 'bg-muted-foreground/25'}`}><span className={`absolute top-1 h-4 w-4 rounded-full bg-card transition-transform ${checked ? 'translate-x-6' : 'translate-x-1'}`} /></span></button>; }

function BrandMark({ dark = false }: { dark?: boolean }) {
  return <div className="flex items-center gap-3"><span className={`grid h-10 w-10 place-items-center rounded-xl ${dark ? 'bg-sidebar-primary text-sidebar-primary-foreground' : 'bg-primary text-primary-foreground'}`}><Sparkles size={19} /></span><span><span className={`block font-display text-xl font-extrabold tracking-tight ${dark ? 'text-sidebar-foreground' : 'text-foreground'}`}>learn<span className={dark ? 'text-sidebar-primary' : 'text-primary'}>ai</span></span><span className={`block font-mono-ui text-[9px] uppercase tracking-[.2em] ${dark ? 'text-sidebar-foreground/50' : 'text-muted-foreground'}`}>competency studio</span></span></div>;
}

function PublicHome() {
  return <div className="min-h-[100dvh] bg-background text-foreground noise">
    <header className="mx-auto flex max-w-7xl items-center justify-between px-5 py-6 sm:px-8"><BrandMark /><div className="flex items-center gap-2"><Link href="/trainer-login" className="rounded-xl px-3 py-2 text-sm font-bold text-muted-foreground hover:bg-muted hover:text-foreground" data-testid="link-public-trainer-login">Trainer sign in</Link><Link href="/sign-in" className="rounded-xl px-3 py-2 text-sm font-bold text-muted-foreground hover:bg-muted hover:text-foreground" data-testid="link-public-sign-in">Learner sign in</Link><Link href="/sign-up" className="rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/15 transition-transform hover:-translate-y-0.5" data-testid="link-public-sign-up">Create learner account</Link></div></header>
    <main className="mx-auto grid max-w-7xl items-center gap-12 px-5 pb-16 pt-12 sm:px-8 lg:grid-cols-[1.05fr_.95fr] lg:gap-16 lg:pb-24 lg:pt-20">
      <section className="animate-enter"><Pill tone="accent">Competency-led learning</Pill><h1 className="mt-6 max-w-2xl font-display text-5xl font-extrabold leading-[.98] tracking-[-.055em] sm:text-6xl lg:text-7xl">Build the skill behind the signal<span className="text-accent">.</span></h1><p className="mt-6 max-w-xl text-base leading-7 text-muted-foreground sm:text-lg">LearnAI helps you understand where you are, choose what matters next, and build capability through focused practice.</p><div className="mt-8 flex flex-wrap items-center gap-3"><Link href="/sign-up" className="group inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3.5 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/15 transition-all hover:-translate-y-0.5 hover:shadow-xl hover:shadow-primary/20" data-testid="link-hero-get-started">Start building your path <ChevronRight size={16} className="transition-transform group-hover:translate-x-1" /></Link><Link href="/sign-in" className="rounded-xl border border-border bg-card px-5 py-3.5 text-sm font-bold hover:bg-muted" data-testid="link-hero-sign-in">Sign in</Link></div><div className="mt-10 flex flex-wrap gap-x-6 gap-y-3 text-xs text-muted-foreground"><span className="flex items-center gap-2"><Check size={14} className="text-primary" />Personal competency map</span><span className="flex items-center gap-2"><Check size={14} className="text-primary" />Adaptive practice</span><span className="flex items-center gap-2"><Check size={14} className="text-primary" />Progress you own</span></div></section>
      <section className="relative animate-enter-2"><div className="absolute -right-8 -top-8 h-32 w-32 rounded-full border-[20px] border-accent/15" /><div className="relative overflow-hidden rounded-[2rem] border border-sidebar-border bg-sidebar p-5 text-sidebar-foreground shadow-2xl shadow-sidebar/20 sm:p-7"><div className="flex items-center justify-between border-b border-sidebar-border pb-5"><div><p className="font-mono-ui text-[10px] uppercase tracking-[.18em] text-sidebar-foreground/45">Your learning system</p><p className="mt-2 font-display text-xl font-extrabold">One clear next step</p></div><span className="grid h-10 w-10 place-items-center rounded-xl bg-sidebar-primary/15 text-sidebar-primary"><Network size={19} /></span></div><div className="mt-6 rounded-2xl border border-sidebar-border bg-sidebar-accent/45 p-5"><div className="flex items-end justify-between"><div><p className="text-xs text-sidebar-foreground/55">Your baseline</p><p className="mt-2 font-display text-3xl font-extrabold">Not set yet</p></div><Pill tone="accent">Start learning</Pill></div><div className="mt-5 h-2 overflow-hidden rounded-full bg-sidebar-border"><div className="h-full w-1/4 rounded-full bg-sidebar-primary" /></div></div><div className="mt-4 grid gap-3 sm:grid-cols-2"><div className="rounded-2xl border border-sidebar-border p-4"><Target size={17} className="text-accent" /><p className="mt-5 text-sm font-bold">Find your gap</p><p className="mt-1 text-xs leading-5 text-sidebar-foreground/55">See the skill with the most leverage.</p></div><div className="rounded-2xl border border-sidebar-border p-4"><TrendingUp size={17} className="text-sidebar-primary" /><p className="mt-5 text-sm font-bold">Track your movement</p><p className="mt-1 text-xs leading-5 text-sidebar-foreground/55">Make progress visible over time.</p></div></div></div></section>
    </main>
  </div>;
}

function AuthRouteLink({ href, children, className = '' }: { href: string; children: ReactNode; className?: string }) {
  const { signOut } = useClerk();
  const [, setLocation] = useLocation();
  return <a href={href} className={className} onClick={async (event) => { event.preventDefault(); await signOut(); setLocation(href); }}>{children}</a>;
}

function AuthPage({ mode }: { mode: 'sign-in' | 'sign-up' }) {
  const isSignIn = mode === 'sign-in';
  return <div className="surface-grid min-h-[100dvh] bg-background px-5 py-6 text-foreground sm:px-8 sm:py-8"><div className="mx-auto flex max-w-7xl items-center justify-between"><Link href="/" data-testid="link-auth-brand"><BrandMark /></Link><div className="flex items-center gap-3 text-xs font-bold sm:gap-5 sm:text-sm"><AuthRouteLink href="/trainer-login" className="text-primary hover:underline">Trainer login</AuthRouteLink><AuthRouteLink href={isSignIn ? '/sign-up' : '/sign-in'} className="rounded-xl border border-border bg-card px-3 py-2 hover:border-primary/40 hover:text-primary">{isSignIn ? 'Create learner account' : 'Learner sign in'}</AuthRouteLink></div></div><main className="mx-auto grid min-h-[calc(100dvh-100px)] max-w-7xl items-center gap-10 py-10 lg:grid-cols-[1fr_480px] lg:gap-20"><section className="hidden max-w-xl animate-enter lg:block"><Pill tone="accent">SIH260101 - Official Statistical System</Pill><h1 className="mt-7 max-w-lg font-display text-5xl font-extrabold leading-[1.02] tracking-[-.045em]">Build capability from every learning signal.</h1><p className="mt-6 max-w-lg text-base leading-7 text-muted-foreground">LearnAI helps statistical officers find competency gaps, follow targeted training, and turn official learning material into practical assessments.</p><div className="mt-9 grid gap-3 sm:grid-cols-3"><div className="rounded-2xl border border-border bg-card/70 p-4"><Network size={18} className="text-primary" /><p className="mt-5 text-sm font-bold">Map skills</p><p className="mt-1 text-xs leading-5 text-muted-foreground">See the next capability to strengthen.</p></div><div className="rounded-2xl border border-border bg-card/70 p-4"><Target size={18} className="text-accent-foreground" /><p className="mt-5 text-sm font-bold">Practice</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Learn through domain scenarios.</p></div><div className="rounded-2xl border border-border bg-card/70 p-4"><TrendingUp size={18} className="text-primary" /><p className="mt-5 text-sm font-bold">Improve</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Track progress before reassessment.</p></div></div><p className="mt-8 font-mono-ui text-[10px] uppercase tracking-[.16em] text-muted-foreground">Digital governance - Data quality - Capacity building</p></section><section className="w-full animate-enter-2"><div className="mb-6 text-center lg:text-left"><p className="font-mono-ui text-[10px] uppercase tracking-[.2em] text-primary">{isSignIn ? 'Learner sign in' : 'Learner registration'}</p><h1 className="mt-3 font-display text-3xl font-extrabold tracking-[-.04em] sm:text-4xl">{isSignIn ? 'Continue your learning journey.' : 'Start with a clearer direction.'}</h1><p className="mt-3 text-sm leading-6 text-muted-foreground">{isSignIn ? 'Access your competency record and recommended training path.' : 'Create your learner record for personalized capacity building.'}</p></div><div className="rounded-3xl border border-primary/20 bg-card/85 p-2 shadow-2xl shadow-primary/10"><div className="rounded-2xl border border-border/70 bg-background/60 p-4 sm:p-6">{isSignIn ? <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} oauthFlow="redirect" /> : <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} oauthFlow="redirect" />}</div></div><p className="mt-5 text-center text-xs text-muted-foreground">Secure learner authentication by LearnAI.</p></section></main></div>;
}

function SignInPage() {
  return <AuthPage mode="sign-in" />;
}

function SignUpPage() {
  return <AuthPage mode="sign-up" />;
}

function TrainerLoginPage() {
  return <div className="surface-grid grid min-h-[100dvh] place-items-center bg-sidebar px-5 py-8 text-sidebar-foreground"><div className="w-full max-w-[520px] animate-enter"><div className="mb-8 text-center"><BrandMark dark /><p className="mt-8 font-mono-ui text-[10px] uppercase tracking-[.2em] text-sidebar-primary">Facilitator console</p><h1 className="mt-3 font-display text-4xl font-extrabold">Trainer sign in.</h1><p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-sidebar-foreground/60">Access live learner, cohort, and competency signals from your trainer workspace.</p></div><div className="rounded-2xl border border-sidebar-border bg-sidebar-accent/80 p-2 shadow-2xl"><div className="rounded-xl border border-sidebar-border bg-sidebar p-4 sm:p-6"><SignIn routing="path" path={`${basePath}/trainer-login`} signUpUrl={`${basePath}/sign-up`} oauthFlow="redirect" forceRedirectUrl={`${basePath}/admin`} /></div></div><div className="mt-6 flex justify-center gap-5 text-sm font-bold"><AuthRouteLink href="/sign-in" className="text-sidebar-primary hover:underline">Candidate sign in</AuthRouteLink><AuthRouteLink href="/sign-up" className="text-sidebar-primary hover:underline">Candidate sign up</AuthRouteLink></div></div></div>;
}

function Router() {
  const { isLoaded, isSignedIn } = useAuth();
  const [location, setLocation] = useLocation();
  const authPath = location.startsWith('/sign-in') || location.startsWith('/sign-up') || location.startsWith('/trainer-login');
  const protectedPath = ['/workspace', '/learn', '/competency', '/quiz', '/ai-gaps', '/material-studio', '/igot', '/tutor', '/progress', '/achievements', '/admin', '/settings'].some((path) => location === path || location.startsWith(`${path}/`));
  useEffect(() => {
    if (!isLoaded) return;
    if (isSignedIn && (location === '/' || authPath)) setLocation('/workspace');
    if (!isSignedIn && protectedPath) setLocation('/');
  }, [authPath, isLoaded, isSignedIn, location, protectedPath, setLocation]);
  if (!isLoaded) return <div className="grid min-h-[100dvh] place-items-center bg-background"><div className="animate-pulse-soft text-center"><BrandMark /><p className="mt-5 text-xs text-muted-foreground">Loading your secure workspace</p></div></div>;
  if (!isSignedIn) return <Switch><Route path="/sign-in/*?" component={SignInPage} /><Route path="/sign-up/*?" component={SignUpPage} /><Route path="/trainer-login/*?" component={TrainerLoginPage} /><Route path="/home" component={PublicHome} /><Route component={SignInPage} /></Switch>;
    if (authPath) return <Switch><Route path="/sign-in/*?" component={SignInPage} /><Route path="/sign-up/*?" component={SignUpPage} /><Route path="/trainer-login/*?" component={TrainerLoginPage} /></Switch>;
    return <RoutedErrorBoundary><Shell><Switch><Route path="/workspace" component={Overview} /><Route path="/" component={Overview} /><Route path="/learn/:courseId" component={CoursePlayer} /><Route path="/learn" component={Learn} /><Route path="/competency" component={Competency} /><Route path="/quiz" component={Quiz} /><Route path="/ai-gaps" component={GapAnalysis} /><Route path="/material-studio" component={MaterialStudio} /><Route path="/igot" component={IgotIntegration} /><Route path="/tutor" component={Tutor} /><Route path="/progress" component={Progress} /><Route path="/achievements" component={Achievements} /><Route path="/admin" component={Admin} /><Route path="/settings" component={Settings} /><Route component={NotFound} /></Switch></Shell></RoutedErrorBoundary>;
}
function RoutedErrorBoundary({ children }: { children: ReactNode }) { const [location] = useLocation(); return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>; }
function ClerkApp() { const [, setLocation] = useLocation(); return <ClerkProvider publishableKey={clerkPubKey} proxyUrl={clerkProxyUrl} appearance={clerkAppearance} signInUrl={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} localization={{ signIn: { start: { title: 'Welcome back', subtitle: 'Sign in to access your learning record' } }, signUp: { start: { title: 'Create your account', subtitle: 'Build a learning path that is yours' } } }} routerPush={(to) => setLocation(to.replace(basePath, '') || '/')} routerReplace={(to) => setLocation(to.replace(basePath, '') || '/')}><QueryClientProvider client={queryClient}><TooltipProvider><AppProvider><Router /></AppProvider><Toaster /></TooltipProvider></QueryClientProvider></ClerkProvider>; }
function App() { return <WouterRouter base={basePath}><ClerkApp /></WouterRouter>; }
export default App;
