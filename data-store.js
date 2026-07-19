(function(global){
  'use strict';
  const APP_VERSION = '1.1.18';
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
    if(typeof localStorage === 'undefined') return true;
    try{
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      return true;
    }catch(err){
      console.error('Failed to save payroll data', err);
      return false;
    }
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
      if(e.lslEntitlementConvertedAt === undefined) e.lslEntitlementConvertedAt = '';
      if(e.type === 'Fixed Term' && e.autoTerminate === undefined) e.autoTerminate = true;
      if(!e.personalDetailsHistory) e.personalDetailsHistory = [];
      if(e.dateOfBirth === undefined) e.dateOfBirth = '';
      if(e.email === undefined) e.email = '';
      if(e.phone === undefined) e.phone = '';
      if(e.address === undefined) e.address = '';
      if(e.addressLine === undefined) e.addressLine = e.address || '';
      if(e.townSuburb === undefined) e.townSuburb = '';
      if(e.state === undefined) e.state = '';
      if(e.postcode === undefined) e.postcode = '';
      if(e.country === undefined) e.country = 'Australia';
      e.personalDetailsHistory.forEach(r=>{
        if(r.addressLine === undefined) r.addressLine = r.address || '';
        if(r.townSuburb === undefined) r.townSuburb = '';
        if(r.state === undefined) r.state = '';
        if(r.postcode === undefined) r.postcode = '';
        if(r.country === undefined) r.country = e.country || 'Australia';
      });
      if(!e.personalDetailsHistory.length && (e.dateOfBirth || e.email || e.phone || e.addressLine || e.townSuburb || e.state || e.postcode || e.country)){
        e.personalDetailsHistory.push({ id:uid('personal'), effectiveDate:e.startDate || '', dateOfBirth:e.dateOfBirth || '', email:e.email || '', phone:e.phone || '', addressLine:e.addressLine || '', townSuburb:e.townSuburb || '', state:e.state || '', postcode:e.postcode || '', country:e.country || 'Australia' });
      }
      if(!Array.isArray(e.employmentSegments)) e.employmentSegments = [];
      e.employmentSegments = e.employmentSegments.map((seg,index)=>({
        id:seg.id || `segment_${e.id}_${index+1}`,
        startDate:seg.startDate || '',
        endDate:seg.endDate || '',
        inclusiveEnd:!!seg.inclusiveEnd,
        terminationReason:seg.terminationReason || '',
        source:seg.source || 'stored'
      })).filter(seg=>seg.startDate);
    });
    state.employees.forEach(e=>{
      if(e.employmentSegments.length) return;
      const rows=(state.jobDataRows||[]).filter(r=>r.empId===e.id && r.saved!==false)
        .sort((a,b)=>String(a.effectiveDate||'').localeCompare(String(b.effectiveDate||'')) || Number(a.effectiveSequence||0)-Number(b.effectiveSequence||0));
      const segments=[];
      rows.forEach(r=>{
        if(r.action==='Commencement'){
          const last=segments[segments.length-1];
          if(!last || last.endDate || last.startDate!==r.effectiveDate){
            segments.push({ id:`segment_${e.id}_${segments.length+1}`, startDate:r.effectiveDate||'', endDate:'', inclusiveEnd:false, terminationReason:'', source:'jobData' });
          }
        }else if(r.action==='Termination'){
          let last=[...segments].reverse().find(seg=>!seg.endDate);
          if(!last && e.startDate) { last={ id:`segment_${e.id}_${segments.length+1}`, startDate:e.originalStartDate||e.startDate, endDate:'', inclusiveEnd:false, terminationReason:'', source:'legacy' }; segments.push(last); }
          if(last){ last.endDate=r.effectiveDate||''; last.terminationReason=r.reason||''; last.inclusiveEnd=(r.reason==='Expiry of Fixed Term'); }
        }
      });
      if(!segments.length && e.startDate){
        segments.push({ id:`segment_${e.id}_1`, startDate:e.startDate, endDate:e.terminationDate||'', inclusiveEnd:!!(e.terminationReason==='Expiry of Fixed Term'), terminationReason:e.terminationReason||'', source:'legacy' });
      }else if(e.startDate && !segments.some(seg=>seg.startDate===e.startDate)){
        segments.push({ id:`segment_${e.id}_${segments.length+1}`, startDate:e.startDate, endDate:e.terminationDate||'', inclusiveEnd:!!(e.terminationReason==='Expiry of Fixed Term'), terminationReason:e.terminationReason||'', source:'legacy-current' });
      }else if(e.terminationDate){
        const open=[...segments].reverse().find(seg=>!seg.endDate);
        if(open){ open.endDate=e.terminationDate; open.terminationReason=e.terminationReason||''; open.inclusiveEnd=!!(e.terminationReason==='Expiry of Fixed Term'); }
      }
      e.employmentSegments=segments.filter(seg=>seg.startDate);
    });
    state.schedules.forEach(s=>{ if(!s.id) s.id = uid('schedule'); if(!s.hoursByDay) s.hoursByDay = {}; });
    state.payRates.forEach(r=>{ if(!r.id) r.id = uid('rate'); if(!r.changeType && r.type) r.changeType = r.type; if(!r.changeType) r.changeType = 'Permanent'; });
    state.leaveBookings.forEach(l=>{ if(!l.id) l.id = uid('leave'); if(!l.status) l.status = 'Approved'; if(l.evidenceProvided===undefined) l.evidenceProvided=false; if(l.confidential===undefined) l.confidential=(l.type==='Family and Domestic Violence Leave'); });
    state.additionalEarnings.forEach(a=>{ if(!a.id) a.id = uid('add'); if(!a.earningType) a.earningType = 'Additional Day'; if(a.saved === undefined) a.saved = true; if(a.amount === undefined) a.amount = 0; if(['Overpayment Adjustment','Reimbursement'].includes(a.earningType)){ a.hours = 0; } });
    state.deductions.forEach(d=>{ if(!d.id) d.id = uid('ded'); if(!d.deductionType) d.deductionType = 'Pre-tax Super Deduction'; if(d.saved === undefined) d.saved = true; if(d.deleted === undefined) d.deleted = false; if(d.amount === undefined || d.amount === null) d.amount = ''; if(d.percentage === undefined || d.percentage === null) d.percentage = ''; });
    state.positions.forEach(pos=>{ if(!pos.id) pos.id = uid('pos'); if(!pos.positionNumber) pos.positionNumber = String(Math.floor(1000 + Math.random()*9000)); if(pos.active === undefined) pos.active = true; if(pos.hourlyRate === undefined) pos.hourlyRate = 0; });
    state.jobDataRows.forEach(j=>{ if(!j.id) j.id = uid('jobdata'); if(j.effectiveSequence === undefined) j.effectiveSequence = 0; if(!j.action) j.action = 'Commencement'; if(!j.reason) j.reason = ''; if(!j.hoursByDay) j.hoursByDay = {}; });
    state.cashOutRequests.forEach(c=>{ if(!c.id) c.id = uid('cash'); if(c.saved === undefined) c.saved = true; if(c.deleted === undefined) c.deleted = false; c.hours = Number(c.hours||0); });
    state.taxDetails.forEach(t=>{ if(!t.id) t.id = uid('tax'); if(t.claimTaxFreeThreshold === undefined) t.claimTaxFreeThreshold = true; if(t.stsl === undefined) t.stsl = false; if(t.taxFileNumber === undefined) t.taxFileNumber = ''; });
    state.alerts.forEach(a=>{ if(!a.id) a.id = uid('alert'); if(a.read === undefined) a.read = false; if(a.message === undefined) a.message = ''; });
    Object.keys(state.certifications||{}).forEach(k=>{ const c=state.certifications[k]; if(c && typeof c==='object'){ if(!c.lines) c.lines = {}; if(c.completed === undefined) c.completed = !!c.locked; if(c.locked === undefined) c.locked = !!c.completed; } });
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
