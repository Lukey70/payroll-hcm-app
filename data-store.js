(function(global){
  'use strict';

  const APP_VERSION = '1.1.11';
  const STORAGE_KEY = 'payrollHcmAppData';

  function clone(value){ return JSON.parse(JSON.stringify(value)); }
  function uid(prefix){ return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`; }

  function emptyState(){
    return {
      version: APP_VERSION,
      employees: [],
      addressHistory: [],
      schedules: [],
      payRates: [],
      leaveBookings: [],
      additionalEarnings: [],
      deductions: [],
      jobEvents: [],
      payslips: [],
      certifications: {},
      finalisedCycles: {},
      payResults: {},
      currentCycleId: 1,
      selectedEmployeeId: '',
      selectedPayslipId: '',
      alerts: [],
      lastOvernightDate: '',
      auditLog: ['System created with no demo employees.']
    };
  }

  function migrate(input){
    const state = Object.assign(emptyState(), input || {});
    const base = emptyState();
    Object.keys(base).forEach(k=>{
      if(state[k] === undefined || state[k] === null) state[k] = clone(base[k]);
    });
    ['employees','addressHistory','schedules','payRates','leaveBookings','additionalEarnings','deductions','jobEvents','payslips','alerts','auditLog'].forEach(k=>{
      if(!Array.isArray(state[k])) state[k] = [];
    });
    ['certifications','finalisedCycles','payResults'].forEach(k=>{
      if(typeof state[k] !== 'object' || Array.isArray(state[k]) || state[k] === null) state[k] = {};
    });
    state.currentCycleId = Number(state.currentCycleId || 1);

    state.employees.forEach(e=>{
      if(!e.id) e.id = uid('emp');
      if(!e.firstName && e.name) e.firstName = String(e.name).split(' ')[0] || '';
      if(!e.lastName && e.name) e.lastName = String(e.name).split(' ').slice(1).join(' ') || '';
      e.name = `${e.firstName || ''} ${e.lastName || ''}`.trim();
      if(!e.status) e.status = 'Active';
      if(!e.type) e.type = 'Permanent';
      if(!e.department) e.department = '';
      if(!e.position) e.position = '';
      if(!e.startDate) e.startDate = '';
      if(!e.originalStartDate) e.originalStartDate = e.startDate || '';
      if(!e.lslServiceDate) e.lslServiceDate = e.startDate || e.originalStartDate || '';
      if(e.annualLeaveBalance === undefined) e.annualLeaveBalance = 0;
      if(e.personalLeaveBalance === undefined) e.personalLeaveBalance = 0;
      if(e.lslAccruedBalance === undefined) e.lslAccruedBalance = Number(e.lslBalance || 0);
      if(e.lslProRataBalance === undefined) e.lslProRataBalance = 0;
      if(e.taxFreeThreshold === undefined) e.taxFreeThreshold = 'Yes';
      if(e.stsl === undefined) e.stsl = 'No';
      if(e.tfn === undefined) e.tfn = '';
      if(e.address && !state.addressHistory.some(a=>a.empId === e.id)){
        state.addressHistory.push({id:uid('addr'), empId:e.id, effectiveDate:e.startDate || '2026-05-22', address:e.address});
      }
    });

    state.addressHistory.forEach(a=>{
      if(!a.id) a.id = uid('addr');
      if(!a.effectiveDate) a.effectiveDate = '2026-05-22';
      if(!a.address) a.address = '';
    });
    state.schedules.forEach(s=>{ if(!s.id) s.id = uid('sch'); if(!s.hoursByDay) s.hoursByDay = {}; });
    state.payRates.forEach(r=>{ if(!r.id) r.id = uid('rate'); if(!r.effectiveDate) r.effectiveDate = '2026-05-22'; if(!r.changeType) r.changeType = 'Permanent'; });
    state.leaveBookings.forEach(l=>{ if(!l.id) l.id = uid('leave'); if(!l.status) l.status = 'Approved'; if(l.hours === undefined) l.hours = ''; });
    state.additionalEarnings.forEach(a=>{ if(!a.id) a.id = uid('add'); if(a.saved === undefined) a.saved = true; });
    state.deductions.forEach(d=>{ if(!d.id) d.id = uid('ded'); if(d.saved === undefined) d.saved = true; });
    state.payslips.forEach(p=>{ if(!p.id) p.id = uid('payslip'); if(!p.addressSnapshot) p.addressSnapshot = ''; if(p.finalised === undefined) p.finalised = !!state.finalisedCycles[String(p.cycleId)]; });

    state.version = APP_VERSION;
    return state;
  }

  function load(){
    if(typeof localStorage === 'undefined') return emptyState();
    try{
      const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem('payrollAppData');
      return migrate(raw ? JSON.parse(raw) : emptyState());
    }catch(err){
      console.error('Failed to load data', err);
      return emptyState();
    }
  }

  function save(state){
    state.version = APP_VERSION;
    if(typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function exportJson(state){ return JSON.stringify(state, null, 2); }
  function importJson(text){ return migrate(JSON.parse(text)); }

  const api = { APP_VERSION, STORAGE_KEY, emptyState, migrate, load, save, clone, uid, exportJson, importJson };
  global.DataStore = api;
  if(typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
