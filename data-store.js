(function(global){
  'use strict';
  const APP_VERSION = '1.1.11';
  const STORAGE_KEY = 'payrollAppData';

  function emptyState(){
    return {
      version: APP_VERSION,
      employees: [],
      schedules: [],
      payRates: [],
      leaveBookings: [],
      additionalEarnings: [],
      deductions: [],
      positions: [],
      jobDataRows: [],
      cashOutRequests: [],
      taxDetails: [],
      alerts: [],
      jobEvents: [],
      payResults: {},
      payslips: [],
      certifications: {},
      finalisedCycles: {},
      currentCycleId: 1,
      lastOvernightDate: '',
      auditLog: ['System created with no demo employees.']
    };
  }

  function clone(value){ return JSON.parse(JSON.stringify(value)); }

  function load(){
    const base = emptyState();
    if(typeof localStorage === 'undefined') return base;
    try{
      const raw = localStorage.getItem(STORAGE_KEY);
      if(!raw) return base;
      const parsed = JSON.parse(raw);
      return migrate(Object.assign(base, parsed));
    }catch(err){
      console.error('Failed to load saved payroll data', err);
      return base;
    }
  }

  function save(state){
    state.version = APP_VERSION;
    if(typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function migrate(state){
    const blank = emptyState();
    Object.keys(blank).forEach(k=>{ if(state[k] === undefined || state[k] === null) state[k] = clone(blank[k]); });
    ['employees','schedules','payRates','leaveBookings','additionalEarnings','deductions','positions','jobDataRows','cashOutRequests','taxDetails','alerts','jobEvents','payslips','auditLog'].forEach(k=>{ if(!Array.isArray(state[k])) state[k] = []; });
    ['payResults','certifications','finalisedCycles'].forEach(k=>{ if(typeof state[k] !== 'object' || Array.isArray(state[k])) state[k] = {}; });
    state.currentCycleId = Number(state.currentCycleId || 1);

    state.employees.forEach(e=>{
      if(!e.id) e.id = String(Date.now());
      if(!e.firstName && e.name) e.firstName = String(e.name).split(' ')[0] || '';
      if(!e.lastName && e.name) e.lastName = String(e.name).split(' ').slice(1).join(' ') || '';
      e.name = `${e.firstName || ''} ${e.lastName || ''}`.trim();
      if(!e.status) e.status = 'Active';
      if(!e.originalStartDate) e.originalStartDate = e.startDate || '';
      if(!e.lslServiceDate) e.lslServiceDate = e.startDate || '';
      if(e.annualLeaveBalance === undefined) e.annualLeaveBalance = 0;
      if(e.personalLeaveBalance === undefined) e.personalLeaveBalance = 0;
      if(e.lslAccruedBalance === undefined) e.lslAccruedBalance = e.lslBalance || 0;
      if(e.lslEntitlementDateOverride === undefined) e.lslEntitlementDateOverride = '';
      if(e.lslProRataOverride === undefined) e.lslProRataOverride = '';
      if(e.type === 'Fixed Term' && e.autoTerminate === undefined) e.autoTerminate = true;
      if(!e.personalDetailsHistory) e.personalDetailsHistory = [];
      if(e.dateOfBirth === undefined) e.dateOfBirth = '';
      if(e.email === undefined) e.email = '';
      if(e.phone === undefined) e.phone = '';
      if(e.address === undefined) e.address = '';
      if(!e.personalDetailsHistory.length && (e.dateOfBirth || e.email || e.phone || e.address)){
        e.personalDetailsHistory.push({ id:uid('personal'), effectiveDate:e.startDate || '', dateOfBirth:e.dateOfBirth || '', email:e.email || '', phone:e.phone || '', address:e.address || '' });
      }
    });
    state.schedules.forEach(s=>{ if(!s.id) s.id = uid('schedule'); if(!s.hoursByDay) s.hoursByDay = {}; });
    state.payRates.forEach(r=>{ if(!r.id) r.id = uid('rate'); if(!r.changeType && r.type) r.changeType = r.type; if(!r.changeType) r.changeType = 'Permanent'; });
    state.leaveBookings.forEach(l=>{ if(!l.id) l.id = uid('leave'); if(!l.status) l.status = 'Approved'; });
    state.additionalEarnings.forEach(a=>{ if(!a.id) a.id = uid('add'); if(!a.earningType) a.earningType = 'Additional Day'; if(a.saved === undefined) a.saved = true; if(a.amount === undefined) a.amount = 0; if(a.earningType === 'Overpayment Adjustment'){ a.hours = 0; } });
    state.deductions.forEach(d=>{ if(!d.id) d.id = uid('ded'); if(!d.deductionType) d.deductionType = 'Pre-tax Super Deduction'; if(d.saved === undefined) d.saved = true; if(d.deleted === undefined) d.deleted = false; if(d.amount === undefined || d.amount === null) d.amount = ''; if(d.percentage === undefined || d.percentage === null) d.percentage = ''; });
    state.positions.forEach(pos=>{ if(!pos.id) pos.id = uid('pos'); if(!pos.positionNumber) pos.positionNumber = String(Math.floor(1000 + Math.random()*9000)); if(pos.active === undefined) pos.active = true; if(pos.hourlyRate === undefined) pos.hourlyRate = 0; });
    state.jobDataRows.forEach(j=>{ if(!j.id) j.id = uid('jobdata'); if(j.effectiveSequence === undefined) j.effectiveSequence = 0; if(!j.action) j.action = 'Commencement'; if(!j.reason) j.reason = ''; if(!j.hoursByDay) j.hoursByDay = {}; });
    state.cashOutRequests.forEach(c=>{ if(!c.id) c.id = uid('cash'); if(c.saved === undefined) c.saved = true; if(c.deleted === undefined) c.deleted = false; c.hours = Number(c.hours||0); });
    state.taxDetails.forEach(t=>{ if(!t.id) t.id = uid('tax'); if(t.claimTaxFreeThreshold === undefined) t.claimTaxFreeThreshold = true; if(t.stsl === undefined) t.stsl = false; if(t.taxFileNumber === undefined) t.taxFileNumber = ''; });
    state.alerts.forEach(a=>{ if(!a.id) a.id = uid('alert'); if(a.read === undefined) a.read = false; if(a.message === undefined) a.message = ''; });
    state.version = APP_VERSION;
    return state;
  }

  function uid(prefix){
    return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }

  function exportJson(state){ return JSON.stringify(state, null, 2); }
  function importJson(text){ return migrate(Object.assign(emptyState(), JSON.parse(text))); }

  const api = { APP_VERSION, STORAGE_KEY, emptyState, load, save, migrate, uid, exportJson, importJson, clone };
  global.DataStore = api;
  if(typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
