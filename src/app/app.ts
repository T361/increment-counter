import { ChangeDetectionStrategy, Component, signal, computed, ChangeDetectorRef, OnInit, OnDestroy, PLATFORM_ID, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { DatePipe, UpperCasePipe, isPlatformBrowser } from '@angular/common';
import { createClient, SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://wcylvnumkdogurygzaiw.supabase.co';
const SUPABASE_ANON_KEY: string = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndjeWx2bnVta2RvZ3VyeWd6YWl3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIwOTIwODMsImV4cCI6MjA4NzY2ODA4M30.HwOInQFVS0I4a-QqMSF23kVp1WmZUBRiBg5CWBiegdg';

type AdminRole = 'ALPHA' | 'BETA' | 'GAMMA';

interface RotiEntry { name: string; count: number; }

interface Application {
  id: number;
  type: 'increment' | 'decrement';
  name: string;
  amount: number;
  reason: string;
  status: string;
  approvals: string[];
  submitted_by: string | null;
  timestamp: number;
}

interface LogEntry { id: number; message: string; status: string; timestamp: number; }

const ADMIN_PASSWORDS: Record<string, AdminRole> = {
  'PASS_ALPHA': 'ALPHA',
  'PASS_BETA': 'BETA',
  'PASS_GAMMA': 'GAMMA',
};

const DEFAULT_COUNTERS: RotiEntry[] = [
  { name: 'ali', count: 7 }, { name: 'tahir', count: 8 },
  { name: 'lahori', count: 26 }, { name: 'bilal', count: 8 },
  { name: 'taimoor', count: 10 }, { name: 'wasay', count: 19 },
  { name: 'taha', count: 7 }, { name: 'zain jabir', count: 4 },
  { name: 'zain sheikh', count: 7 }, { name: 'salman', count: 1 },
  { name: 'rayyan', count: 2 }, { name: 'theta', count: 2 },
  { name: 'tawassul', count: 6 }, { name: 'sheikh', count: 2 },
  { name: 'abdullah adnan', count: 6 },
];

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-root',
  imports: [RouterOutlet, MatIconModule, ReactiveFormsModule, DatePipe, UpperCasePipe],
  templateUrl: './app.html',
})
export class App implements OnInit, OnDestroy {
  private platformId = inject(PLATFORM_ID);
  private isBrowser = isPlatformBrowser(this.platformId);

  counters = signal<RotiEntry[]>([]);
  rankedCounters = computed(() => [...this.counters()].sort((a, b) => b.count - a.count));
  validNames = computed(() => this.counters().map(c => c.name).sort());
  currentAdmin = signal<AdminRole | null>(null);
  isAdmin = computed(() => this.currentAdmin() !== null);
  showAdminLogin = signal(false);
  showAppForm = signal(false);
  applications = signal<Application[]>([]);
  logs = signal<LogEntry[]>([]);
  loginForm: FormGroup;
  appForm: FormGroup;
  supabaseReady = false;
  private supabase!: SupabaseClient;
  private channel: RealtimeChannel | null = null;
  processing = signal(false);

  constructor(private fb: FormBuilder, private cdr: ChangeDetectorRef) {
    this.loginForm = this.fb.group({ password: ['', Validators.required] });
    this.appForm = this.fb.group({
      type: ['increment', Validators.required],
      name: ['', Validators.required],
      amount: [1, [Validators.required, Validators.min(1)]],
      reason: ['', [Validators.required, Validators.minLength(5)]],
    });
  }

  async ngOnInit(): Promise<void> {
    if (!this.isBrowser) {
      this.counters.set([...DEFAULT_COUNTERS]);
      return;
    }
    if (!SUPABASE_ANON_KEY || SUPABASE_ANON_KEY === 'YOUR_ANON_KEY' || SUPABASE_ANON_KEY.length < 20) {
      console.warn('[ROTI_NEXUS] Supabase not configured. Using local defaults.');
      this.counters.set([...DEFAULT_COUNTERS]);
      this.cdr.markForCheck();
      return;
    }
    try {
      this.supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      this.supabaseReady = true;
      await this.fetchAll();
      this.subscribeRealtime();
    } catch (e) {
      console.error('[ROTI_NEXUS] Init failed:', e);
      this.counters.set([...DEFAULT_COUNTERS]);
      this.cdr.markForCheck();
    }
  }

  ngOnDestroy(): void {
    if (this.channel && this.supabaseReady) this.supabase.removeChannel(this.channel);
  }

  private async fetchAll(): Promise<void> {
    if (!this.supabaseReady) return;
    const [cR, aR, lR] = await Promise.all([
      this.supabase.from('counters').select('*'),
      this.supabase.from('applications').select('*').eq('status', 'pending'),
      this.supabase.from('logs').select('*').order('timestamp', { ascending: false }).limit(100),
    ]);
    if (cR.data && cR.data.length > 0) this.counters.set(cR.data);
    else if (!cR.error) this.counters.set([...DEFAULT_COUNTERS]);
    if (aR.data) this.applications.set(aR.data);
    if (lR.data) this.logs.set(lR.data);
    this.cdr.markForCheck();
  }

  private subscribeRealtime(): void {
    if (!this.supabaseReady || !this.isBrowser) return;
    this.channel = this.supabase.channel('roti-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'counters' }, () => this.fetchAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'applications' }, () => this.fetchAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'logs' }, () => this.fetchAll())
      .subscribe();
  }

  toggleAdminLogin(): void { this.showAdminLogin.update(v => !v); this.cdr.markForCheck(); }
  toggleAppForm(): void {
    this.showAppForm.update(v => !v);
    if (this.showAppForm()) {
      const names = this.validNames();
      this.appForm.reset({ type: 'increment', name: names.length > 0 ? names[0] : '', amount: 1, reason: '' });
    }
    this.cdr.markForCheck();
  }

  attemptLogin(): void {
    const pwd = this.loginForm.value.password?.trim();
    if (!pwd) return;
    const role = ADMIN_PASSWORDS[pwd] ?? null;
    if (role) { this.currentAdmin.set(role); this.showAdminLogin.set(false); this.loginForm.reset(); }
    else { alert('ACCESS DENIED: Invalid Protocol Sequence'); }
    this.cdr.markForCheck();
  }

  logout(): void { this.currentAdmin.set(null); this.cdr.markForCheck(); }

  async submitApplication(): Promise<void> {
    if (!this.appForm.valid || this.processing()) return;
    this.processing.set(true);
    this.cdr.markForCheck();
    const v = this.appForm.value;
    const target = (v.name as string).toLowerCase().trim();
    if (!this.counters().some(c => c.name === target)) {
      alert('Entity "' + target + '" not found. No new users can be added.');
      this.processing.set(false);
      this.cdr.markForCheck();
      return;
    }
    const admin = this.currentAdmin();
    const appData = {
      type: v.type as ('increment' | 'decrement'),
      name: target,
      amount: v.amount as number,
      reason: (v.reason as string).trim(),
      status: 'pending',
      approvals: admin ? [admin] : [],
      submitted_by: admin ?? 'standard_user',
      timestamp: Date.now(),
    };
    if (this.supabaseReady) {
      const { error } = await this.supabase.from('applications').insert([appData]);
      if (error) {
        console.error('[ROTI_NEXUS] insert failed:', error.message);
        alert('Submit failed: ' + error.message);
        this.processing.set(false);
        this.cdr.markForCheck();
        return;
      }
      await this.fetchAll();
    } else {
      this.applications.update(a => [...a, { id: Date.now(), ...appData }]);
    }
    this.showAppForm.set(false);
    this.appForm.reset({ type: 'increment', amount: 1 });
    this.processing.set(false);
    this.cdr.markForCheck();
  }

  async approveApplication(app: Application): Promise<void> {
    const admin = this.currentAdmin();
    if (!admin || this.processing()) return;
    const approvals: string[] = Array.isArray(app.approvals) ? app.approvals : [];
    if (approvals.indexOf(admin) !== -1) return;
    this.processing.set(true);
    const newApprovals = [...approvals, admin];
    this.applications.update(a => a.map(x => x.id === app.id ? { ...x, approvals: newApprovals } : x));
    this.cdr.markForCheck();

    if (newApprovals.length >= 3) {
      if (this.supabaseReady) {
        const { data: row } = await this.supabase.from('counters').select('count').eq('name', app.name).single();
        if (row) {
          const delta = app.type === 'decrement' ? -app.amount : app.amount;
          await this.supabase.from('counters').update({ count: Math.max(0, row.count + delta) }).eq('name', app.name);
        }
        await this.supabase.from('applications').delete().eq('id', app.id);
        const verb = app.type === 'increment' ? 'Incremented' : 'Decremented';
        await this.supabase.from('logs').insert([{
          message: '[APPROVED] ' + verb + ' ' + app.name.toUpperCase() + ' by ' + app.amount + '. By: ' + newApprovals.join(', ') + '. Reason: ' + app.reason,
          status: 'approved', timestamp: Date.now(),
        }]);
        await this.fetchAll();
      } else {
        const delta = app.type === 'decrement' ? -app.amount : app.amount;
        this.counters.update(cs => cs.map(c => c.name === app.name ? { ...c, count: Math.max(0, c.count + delta) } : c));
        this.applications.update(a => a.filter(x => x.id !== app.id));
        const verb = app.type === 'increment' ? 'Incremented' : 'Decremented';
        this.logs.update(l => [{ id: Date.now(), message: '[APPROVED] ' + verb + ' ' + app.name.toUpperCase() + ' by ' + app.amount + '. By: ' + newApprovals.join(', ') + '. Reason: ' + app.reason, status: 'approved', timestamp: Date.now() }, ...l]);
      }
    } else {
      if (this.supabaseReady) {
        await this.supabase.from('applications').update({ approvals: newApprovals }).eq('id', app.id);
        await this.fetchAll();
      } else {
        this.applications.update(a => a.map(x => x.id === app.id ? { ...x, approvals: newApprovals } : x));
      }
    }
    this.processing.set(false);
    this.cdr.markForCheck();
  }

  async rejectApplication(app: Application): Promise<void> {
    const admin = this.currentAdmin();
    if (!admin || this.processing()) return;
    this.processing.set(true);
    this.applications.update(a => a.filter(x => x.id !== app.id));
    this.cdr.markForCheck();

    if (this.supabaseReady) {
      await this.supabase.from('applications').delete().eq('id', app.id);
      const verb = app.type === 'increment' ? 'Increment' : 'Decrement';
      await this.supabase.from('logs').insert([{
        message: '[REJECTED] ' + verb + ' for ' + app.name.toUpperCase() + ' (+/-' + app.amount + ') by Admin ' + admin + '. Reason: ' + app.reason,
        status: 'rejected', timestamp: Date.now(),
      }]);
      await this.fetchAll();
    } else {
      const verb = app.type === 'increment' ? 'Increment' : 'Decrement';
      this.logs.update(l => [{ id: Date.now(), message: '[REJECTED] ' + verb + ' for ' + app.name.toUpperCase() + ' (+/-' + app.amount + ') by Admin ' + admin + '. Reason: ' + app.reason, status: 'rejected', timestamp: Date.now() }, ...l]);
    }
    this.processing.set(false);
    this.cdr.markForCheck();
  }

  hasApproved(app: Application): boolean {
    const a = this.currentAdmin();
    if (!a) return false;
    const approvals: string[] = Array.isArray(app.approvals) ? app.approvals : [];
    return approvals.indexOf(a) !== -1;
  }

  getRankBadge(idx: number): string {
    if (idx === 0) return 'GOLD - GIVES ROTI';
    if (idx === 1) return 'SILVER - GIVES ROTI';
    if (idx === 2) return 'BRONZE - GIVES ROTI';
    return '';
  }

  getRankColor(idx: number): string {
    if (idx === 0) return '#ffd700';
    if (idx === 1) return '#c0c0c0';
    if (idx === 2) return '#cd7f32';
    return '';
  }
}
