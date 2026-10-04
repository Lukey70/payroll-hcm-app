(function(global){
  'use strict';
  const APP_VERSION = '1.1.36';
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
      repairs: {},
      currentCycleId: 1,
      lastOvernightDate: '',
      auditLog: ['System created with no demo employees.'],
      loginCredentials: {}
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
    const sourceVersion = String((state&&state.version)||'');
    const blank = emptyState();
    Object.keys(blank).forEach(k=>{ if(state[k] === undefined || state[k] === null) state[k] = clone(blank[k]); });
    ['employees','schedules','payRates','leaveBookings','additionalEarnings','deductions','positions','jobDataRows','cashOutRequests','taxDetails','alerts','jobEvents','payslips','auditLog'].forEach(k=>{ if(!Array.isArray(state[k])) state[k] = []; });
    ['payResults','certifications','finalisedCycles','repairs','loginCredentials'].forEach(k=>{ if(typeof state[k] !== 'object' || Array.isArray(state[k])) state[k] = {}; });
    state.currentCycleId = Number(state.currentCycleId || 1);
    // v1.1.36 changes temporary-movement pay presentation to substantive Regular Pay
    // plus Higher Duties Allowance. Only Acting Higher Level is intentionally
    // reclassified historically back to 01/07/2026. Existing Acting Lower/Same
    // history remains as finalised before the upgrade; the new presentation starts
    // with the open cycle at upgrade.
    if(!state.repairs.higherDutiesMovementStartCycleId && sourceVersion && sourceVersion!=='1.1.36') state.repairs.higherDutiesMovementStartCycleId=state.currentCycleId;

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
      if(e.lslAccruedAdjustment === undefined) e.lslAccruedAdjustment = null;
      if(e.lslProRataAdjustment === undefined) e.lslProRataAdjustment = null;
      if(e.lslEntitlementDateAdjustmentDays === undefined) e.lslEntitlementDateAdjustmentDays = null;
      if(e.lslEntitlementDateAdjustmentCycleStart === undefined) e.lslEntitlementDateAdjustmentCycleStart = null;
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
        if(r.action==='Commencement' && /^(New Hire|Rehire)\b/.test(String(r.reason||''))){
          const last=segments[segments.length-1];
          if(!last || last.endDate || last.startDate!==r.effectiveDate){
            segments.push({ id:`segment_${e.id}_${segments.length+1}`, startDate:r.effectiveDate||'', endDate:'', inclusiveEnd:false, terminationReason:'', source:'jobData' });
          }
        }else if(r.action==='Termination'){
          let last=[...segments].reverse().find(seg=>!seg.endDate);
          if(!last && e.startDate) { last={ id:`segment_${e.id}_${segments.length+1}`, startDate:e.originalStartDate||e.startDate, endDate:'', inclusiveEnd:false, terminationReason:'', source:'legacy' }; segments.push(last); }
          if(last){ last.endDate=r.effectiveDate||''; last.terminationReason=r.reason||''; last.inclusiveEnd=false; }
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
    state.employees.forEach(e=>{
      const existing=state.loginCredentials[e.id];
      if(!existing || typeof existing!=='object') state.loginCredentials[e.id]={password:'1234'};
      else if(existing.password===undefined || existing.password===null || existing.password==='') existing.password='1234';
    });
    state.schedules.forEach(s=>{ if(!s.id) s.id = uid('schedule'); if(!s.hoursByDay) s.hoursByDay = {}; if(!s.rosterPattern) s.rosterPattern='1-week'; if(!s.hoursByDayWeek1) s.hoursByDayWeek1=clone(s.hoursByDay||{}); if(!s.hoursByDayWeek2) s.hoursByDayWeek2=clone(s.hoursByDayWeek1||s.hoursByDay||{}); });
    state.payRates.forEach(r=>{ if(!r.id) r.id = uid('rate'); if(!r.changeType && r.type) r.changeType = r.type; if(!r.changeType) r.changeType = 'Permanent'; });
    state.leaveBookings.forEach(l=>{ if(!l.id) l.id = uid('leave'); if(!l.status) l.status = 'Approved'; if(!Array.isArray(l.statusHistory)) l.statusHistory=[]; if(l.evidenceProvided===undefined) l.evidenceProvided=false; if(l.confidential===undefined) l.confidential=(l.type==='Family and Domestic Violence Leave'); if(l.type==='Parental Leave - Paid' && !l.payOption) l.payOption='Full Pay'; if(l.forecastApproved===undefined) l.forecastApproved=false; if(l.forecastBalanceBefore===undefined) l.forecastBalanceBefore=''; if(l.forecastBalanceAfter===undefined) l.forecastBalanceAfter=''; if(l.forecastApprovedAtCycleId===undefined) l.forecastApprovedAtCycleId=''; });
    state.additionalEarnings.forEach(a=>{
      if(!a.id) a.id = uid('add');
      if(!a.earningType) a.earningType = 'Additional Hours';
      if(a.earningType==='Additional Day') a.earningType='Additional Hours';
      if(a.saved === undefined) a.saved = true;
      if(a.amount === undefined) a.amount = 0;
      if(['Overpayment Adjustment','Reimbursement','Travel Allowance','Bonus','Meal Allowance','Special Responsibility Allowance (Days)','Motor Vehicle Allowance - Single Trip','Motor Vehicle Allowance - Return Trip'].includes(a.earningType)) a.hours = 0;
      if(a.earningType==='Casual Earnings'){
        if(a.positionNumber===undefined) a.positionNumber='';
        if(a.positionName===undefined) a.positionName='';
        if(a.casualBaseRate===undefined) a.casualBaseRate='';
        if(a.casualLoadingRate===undefined) a.casualLoadingRate=0.25;
        if(a.casualLoadedRate===undefined) a.casualLoadedRate='';
      }
      if(a.earningType==='Higher Duties Allowance'){
        if(a.positionNumber===undefined) a.positionNumber='';
        if(a.positionName===undefined) a.positionName='';
        if(a.higherDutiesNormalRate===undefined) a.higherDutiesNormalRate='';
        if(a.higherDutiesPositionRate===undefined) a.higherDutiesPositionRate='';
        if(a.higherDutiesDifference===undefined) a.higherDutiesDifference='';
      }
    });
    state.deductions.forEach(d=>{ if(!d.id) d.id = uid('ded'); if(!d.deductionType) d.deductionType = 'Pre-tax Super Deduction'; if(d.saved === undefined) d.saved = true; if(d.deleted === undefined) d.deleted = false; if(d.amount === undefined || d.amount === null) d.amount = ''; if(d.percentage === undefined || d.percentage === null) d.percentage = ''; if(d.endDate === undefined || d.endDate === null) d.endDate=''; if(d.deductionType==='Union Fees') d.percentage=''; });
    state.positions.forEach(pos=>{ if(!pos.id) pos.id = uid('pos'); if(!pos.positionNumber) pos.positionNumber = String(Math.floor(1000 + Math.random()*9000)); if(pos.active === undefined) pos.active = true; if(pos.hourlyRate === undefined) pos.hourlyRate = 0; if(!Array.isArray(pos.rateHistory)) pos.rateHistory=[]; if(pos.accessManagerSelfService === undefined) pos.accessManagerSelfService=false; if(pos.accessPayrollManagement === undefined) pos.accessPayrollManagement=false; });
    state.jobDataRows.forEach(j=>{ if(!j.id) j.id = uid('jobdata'); if(j.effectiveSequence === undefined) j.effectiveSequence = 0; if(!j.action) j.action = 'Commencement'; if(!j.reason) j.reason = ''; if(!j.hoursByDay) j.hoursByDay = {}; if(!j.rosterPattern) j.rosterPattern='1-week'; if(!j.hoursByDayWeek1) j.hoursByDayWeek1=clone(j.hoursByDay||{}); if(!j.hoursByDayWeek2) j.hoursByDayWeek2=clone(j.hoursByDayWeek1||j.hoursByDay||{}); if(j.action==='Variation' && j.reason==='Permanency Confirmed') j.positionClass='Permanent'; });
    // Repair v1.1.32 records created after a Permanency Confirmed row inherited the
    // stale Fixed-Term class. Permanency remains effective until an explicit later
    // employment-type transition is recorded.
    state.employees.forEach(e=>{
      let permanentActive=false;
      (state.jobDataRows||[]).filter(j=>j.empId===e.id&&j.saved!==false).slice().sort((a,b)=>String(a.effectiveDate||'').localeCompare(String(b.effectiveDate||''))||Number(a.effectiveSequence||0)-Number(b.effectiveSequence||0)).forEach(j=>{
        if(j.action==='Variation'&&j.reason==='Permanency Confirmed'){ j.positionClass='Permanent'; permanentActive=true; return; }
        const explicitFixed=/Fixed-Term|Fixed Term Contract/.test(String(j.reason||'')) || j.reason==='Permanency Removed';
        const explicitCasual=/Casual/.test(String(j.reason||''));
        if(explicitFixed||explicitCasual){ permanentActive=false; return; }
        if(permanentActive&&j.action!=='Termination') j.positionClass='Permanent';
      });
    });
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
