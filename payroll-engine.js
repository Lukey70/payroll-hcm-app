(function(global){
  'use strict';

  const STANDARD_WEEKLY_HOURS = 37.5;
  const FIRST_PAY_START = '2026-05-22';
  const RETRO_CUTOFF = '2026-05-03';
  const SG_RATE = 0.12;
  const PAYG_SOURCE = 'ATO NAT 1006-06.2026';
  const STSL_SOURCE = 'ATO NAT 2185-06.2026';

  const PUBLIC_HOLIDAYS_WA = [
    ['2026-01-01', "New Year's Day"],
    ['2026-01-26', 'Australia Day'],
    ['2026-03-02', 'Labour Day'],
    ['2026-04-03', 'Good Friday'],
    ['2026-04-05', 'Easter Sunday'],
    ['2026-04-06', 'Easter Monday'],
    ['2026-04-25', 'ANZAC Day'],
    ['2026-04-27', 'ANZAC Day additional public holiday'],
    ['2026-06-01', 'Western Australia Day'],
    ['2026-09-28', "King's Birthday"],
    ['2026-12-25', 'Christmas Day'],
    ['2026-12-26', 'Boxing Day'],
    ['2026-12-28', 'Boxing Day additional public holiday'],
    ['2027-01-01', "New Year's Day"],
    ['2027-01-26', 'Australia Day'],
    ['2027-03-01', 'Labour Day'],
    ['2027-03-26', 'Good Friday'],
    ['2027-03-28', 'Easter Sunday'],
    ['2027-03-29', 'Easter Monday'],
    ['2027-04-25', 'ANZAC Day'],
    ['2027-04-26', 'ANZAC Day additional public holiday'],
    ['2027-06-07', 'Western Australia Day'],
    ['2027-09-27', "King's Birthday"],
    ['2027-12-25', 'Christmas Day'],
    ['2027-12-26', 'Boxing Day'],
    ['2027-12-27', 'Christmas Day additional public holiday'],
    ['2027-12-28', 'Boxing Day additional public holiday']
  ];

  function parseDate(iso){
    if(!iso) return null;
    const [y,m,d] = String(iso).slice(0,10).split('-').map(Number);
    if(!y || !m || !d) return null;
    return new Date(y, m-1, d);
  }
  function iso(date){
    const d = new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }
  function addDays(isoDate, days){ const d = parseDate(isoDate); d.setDate(d.getDate()+days); return iso(d); }
  function addYears(isoDate, years){ const d = parseDate(isoDate); if(!d) return ''; d.setFullYear(d.getFullYear()+years); return iso(d); }
  function cmp(a,b){ return (parseDate(a)||new Date(0)) - (parseDate(b)||new Date(0)); }
  function inRange(day,start,end){ return cmp(day,start)>=0 && cmp(day,end)<=0; }
  function round2(n){ return Math.round((Number(n)||0)*100)/100; }
  function money(n){ return round2(n); }
  function fmtPay(isoDate){ const d=parseDate(isoDate); return d ? d.toLocaleDateString('en-AU') : ''; }
  function daysBetween(start,end){ const out=[]; for(let d=parseDate(start); d && cmp(iso(d),end)<=0; d.setDate(d.getDate()+1)) out.push(iso(d)); return out; }
  function ppeLabel(cycle){ return cycle ? `PPE ${fmtPay(cycle.end)}` : ''; }

  function makePayCycles(start=FIRST_PAY_START, count=80){
    const cycles = [];
    let s = start;
    for(let i=0;i<count;i++){
      const end = addDays(s,13);
      const closeDate = addDays(end,-6);
      cycles.push({ id:i+1, start:s, end, paymentDate:end, closeDate });
      s = addDays(s,14);
    }
    return cycles;
  }
  const PAY_CYCLES = makePayCycles();
  function cycleById(id){ return PAY_CYCLES.find(c=>Number(c.id)===Number(id)) || PAY_CYCLES[0]; }

  function fullName(e){ return `${e.firstName||''} ${e.lastName||''}`.trim() || e.name || e.id; }
  function isTerminatedBefore(e, day){ return e.status === 'Terminated' && e.terminationDate && cmp(e.terminationDate, day) < 0; }
  function activeEmployees(state, asOf){
    return (state.employees||[]).filter(e=>{
      if(e.startDate && cmp(e.startDate, asOf) > 0) return false;
      if(isTerminatedBefore(e, asOf)) return false;
      return e.status !== 'Terminated' || (e.terminationDate && cmp(e.terminationDate, asOf) >= 0);
    });
  }

  function sortedEffectiveRows(rows, empId, dateField='effectiveDate'){
    return (rows||[]).filter(r=>r.empId===empId).sort((a,b)=>cmp(a[dateField],b[dateField]) || String(a.id).localeCompare(String(b.id)));
  }
  function effectiveSchedule(state, empId, day){
    const rows = sortedEffectiveRows(state.schedules, empId).filter(r=>cmp(r.effectiveDate, day)<=0);
    return rows[rows.length-1] || null;
  }
  function scheduledHoursOn(state, empId, day){
    const sch = effectiveSchedule(state, empId, day);
    if(!sch) return 0;
    const dow = parseDate(day).getDay();
    return Number((sch.hoursByDay||{})[dow] || 0);
  }
  function effectiveRateRow(state, empId, day){
    const rows = sortedEffectiveRows(state.payRates, empId).filter(r=>{
      if(cmp(r.effectiveDate, day)>0) return false;
      if(r.endDate && cmp(r.endDate, day)<0) return false;
      return true;
    });
    return rows[rows.length-1] || null;
  }
  function hourlyRateOn(state, empId, day){
    const r = effectiveRateRow(state, empId, day);
    if(r) return Number(r.hourlyRate || 0);
    const e = (state.employees||[]).find(x=>x.id===empId);
    return Number(e?.hourlyRate || 0);
  }
  function positionOn(state, empId, day){
    const r = effectiveRateRow(state, empId, day);
    const e = (state.employees||[]).find(x=>x.id===empId);
    return r?.position || e?.position || '';
  }
  function addressFor(state, empId, day){
    const rows = sortedEffectiveRows(state.addressHistory, empId).filter(r=>cmp(r.effectiveDate, day)<=0);
    if(rows.length) return rows[rows.length-1].address || '';
    const e = (state.employees||[]).find(x=>x.id===empId);
    return e?.address || '';
  }
  function lslEntitlementDate(emp){ return addYears(emp.lslServiceDate || emp.originalStartDate || emp.startDate, 7); }

  function publicHoliday(day){ return PUBLIC_HOLIDAYS_WA.find(p=>p[0]===day) || null; }
  function leaveBookingsForDate(state, empId, day){
    return (state.leaveBookings||[]).filter(l=>l.empId===empId && l.status !== 'Declined' && inRange(day, l.startDate, l.endDate));
  }
  function isKnownCalendarLeave(type){
    return ['Annual Leave','Personal Leave','Long Service Leave','Leave Without Pay','Public Holiday','Non Rostered Day'].includes(type);
  }
  function calendarCategory(type){
    return isKnownCalendarLeave(type) ? type : 'Other Leave';
  }

  function row(description, units, rate, from, to, flags={}){
    const amount = flags.zeroAmount ? 0 : money(Number(units||0) * Number(rate||0));
    return Object.assign({ description, units: round2(units), rate: round2(rate), amount, from, to, taxable: true, ote: true }, flags);
  }
  function mergeRow(rows, newRow){
    const key = [newRow.description, newRow.rate, newRow.from, newRow.to, newRow.amount < 0 ? 'neg' : 'pos'].join('|');
    const existing = rows.find(r=>[r.description, r.rate, r.from, r.to, r.amount < 0 ? 'neg' : 'pos'].join('|')===key && !r.noMerge);
    if(existing){ existing.units = round2(existing.units + newRow.units); existing.amount = money(existing.amount + newRow.amount); }
    else rows.push(newRow);
  }

  function leaveHoursForBooking(state, booking, day, scheduledHours){
    if(Number(booking.hours)>0 && booking.startDate === booking.endDate) return Math.min(Number(booking.hours), scheduledHours);
    return scheduledHours;
  }

  function calculateCurrentRows(state, emp, cycle){
    const rows=[];
    const empId = emp.id;
    for(const day of daysBetween(cycle.start, cycle.end)){
      if(emp.startDate && cmp(day, emp.startDate)<0) continue;
      if(emp.terminationDate && cmp(day, emp.terminationDate)>0) continue;
      const scheduled = scheduledHoursOn(state, empId, day);
      if(scheduled <= 0) continue;
      const rate = hourlyRateOn(state, empId, day);
      const ph = publicHoliday(day);
      const bookings = leaveBookingsForDate(state, empId, day);
      if(ph && emp.type !== 'Casual'){
        mergeRow(rows, row('Public Holiday', scheduled, rate, day, day, { publicHolidayName: ph[1] }));
        continue;
      }
      let remaining = scheduled;
      bookings.forEach(b=>{
        if(remaining <= 0) return;
        const hours = Math.min(leaveHoursForBooking(state, b, day, scheduled), remaining);
        if(hours <= 0) return;
        if(b.type === 'Leave Without Pay'){
          mergeRow(rows, row('Leave Without Pay', hours, 0, day, day, { zeroAmount:true, taxable:false, ote:false }));
        }else{
          mergeRow(rows, row(b.type || 'Other Leave', hours, rate, day, day, { leaveType:b.type || 'Other Leave' }));
        }
        remaining = round2(remaining - hours);
      });
      if(remaining > 0){
        mergeRow(rows, row('Regular Pay', remaining, rate, day, day));
      }
    }
    return rows;
  }

  function calculateAdditionalRows(state, emp, cycle){
    const rows=[];
    const items = (state.additionalEarnings||[]).filter(a=>a.saved !== false && a.empId===emp.id && Number(a.cycleId)===Number(cycle.id));
    items.forEach(a=>{
      const from = a.startDate || cycle.start;
      const to = a.endDate || from;
      const rate = hourlyRateOn(state, emp.id, from);
      const hours = Number(a.hours || 0);
      if(hours <= 0) return;
      let multiplier = 1;
      let ote = true;
      if(a.earningType === 'Overtime 1.5'){ multiplier = 1.5; ote = false; }
      if(a.earningType === 'Overtime 2.0'){ multiplier = 2; ote = false; }
      rows.push(row(a.earningType || 'Additional Day', hours, rate*multiplier, from, to, { additional:true, ote }));
    });
    return rows;
  }

  function retroEligible(description){
    return ['Regular Pay','Annual Leave','Personal Leave','Long Service Leave','Public Holiday'].includes(description);
  }

  function calculateRetroRows(state, emp, currentCycle){
    const rows=[];
    const finalisedPayslips = (state.payslips||[]).filter(p=>p.empId===emp.id && p.finalised && Number(p.cycleId)!==Number(currentCycle.id));
    finalisedPayslips.forEach(p=>{
      if(cmp(p.paymentDate || cycleById(p.cycleId).paymentDate, RETRO_CUTOFF) < 0) return;
      (p.rows||[]).forEach(old=>{
        if(!retroEligible(old.description)) return;
        if(String(old.description).includes('Retro')) return;
        const effectiveDay = old.to || old.from || p.paymentDate || cycleById(p.cycleId).paymentDate;
        const newRate = hourlyRateOn(state, emp.id, effectiveDay);
        const units = Number(old.units || 0);
        const shouldHavePaid = money(units * newRate);
        const wasPaid = money(old.amount || (units * Number(old.rate || 0)));
        const diff = money(shouldHavePaid - wasPaid);
        if(Math.abs(diff) >= 0.01){
          rows.push({
            description: `${old.description} Retro`,
            units,
            rate: money(units ? diff / units : 0),
            amount: diff,
            from: old.from || p.periodStart,
            to: old.to || p.periodEnd,
            taxable: true,
            ote: old.ote !== false,
            retro: true,
            sourcePayslipId: p.id,
            calculationNote: 'Difference-only retro: correct entitlement minus amount already paid.'
          });
        }
      });
    });
    return rows;
  }

  function calculateDeductions(state, emp, cycle, gross){
    const deductions=[];
    (state.deductions||[]).filter(d=>d.empId===emp.id && d.saved !== false).forEach(d=>{
      const starts = !d.startDate || cmp(d.startDate, cycle.end) <= 0;
      const ends = !d.endDate || cmp(d.endDate, cycle.start) >= 0;
      if(!starts || !ends) return;
      let amount = 0;
      if(d.type === 'Percentage') amount = money(gross * Number(d.value || 0) / 100);
      else amount = money(Number(d.value || 0));
      if(amount > 0) deductions.push({ description:d.description || 'Deduction', amount, from:cycle.start, to:cycle.end });
    });
    return deductions;
  }

  function calculateTax(gross, emp){
    // Lightweight fortnightly estimate. The UI identifies the intended ATO sources; upload of full tables can replace this later.
    const taxable = Math.max(0, Number(gross||0));
    const threshold = emp.taxFreeThreshold !== 'No';
    let payg = 0;
    if(threshold){
      if(taxable > 700) payg = (Math.min(taxable, 1730)-700)*0.16;
      if(taxable > 1730) payg += (Math.min(taxable, 3500)-1730)*0.30;
      if(taxable > 3500) payg += (taxable-3500)*0.37;
    }else{
      payg = taxable * 0.30;
    }
    let stsl = 0;
    if(emp.stsl === 'Yes') stsl = taxable >= 1980 ? taxable * 0.01 : 0;
    return { payg: money(Math.round(payg)), stsl: money(Math.round(stsl)), source: PAYG_SOURCE, stslSource: STSL_SOURCE };
  }

  function calculateBalances(state, emp, rows){
    const annualTaken = rows.filter(r=>r.description==='Annual Leave').reduce((s,r)=>s+Number(r.units||0),0);
    const personalTaken = rows.filter(r=>r.description==='Personal Leave').reduce((s,r)=>s+Number(r.units||0),0);
    const lslTaken = rows.filter(r=>r.description==='Long Service Leave').reduce((s,r)=>s+Number(r.units||0),0);
    return {
      annualLeave: round2(Number(emp.annualLeaveBalance||0) - annualTaken),
      personalLeave: round2(Number(emp.personalLeaveBalance||0) - personalTaken),
      longServiceLeave: round2(Number(emp.lslAccruedBalance||0) - lslTaken),
      lslEntitlementDate: lslEntitlementDate(emp)
    };
  }

  function calculatePayslip(state, empId, cycleId, includeRetro=true){
    const emp = (state.employees||[]).find(e=>e.id===empId);
    const cycle = cycleById(cycleId || state.currentCycleId);
    if(!emp || !cycle) return null;
    const currentRows = calculateCurrentRows(state, emp, cycle);
    const additionalRows = calculateAdditionalRows(state, emp, cycle);
    const retroRows = includeRetro ? calculateRetroRows(state, emp, cycle) : [];
    const rows = currentRows.concat(additionalRows, retroRows);
    const gross = money(rows.reduce((s,r)=>s+Number(r.amount||0),0));
    const taxableGross = money(rows.filter(r=>r.taxable !== false).reduce((s,r)=>s+Number(r.amount||0),0));
    const tax = calculateTax(taxableGross, emp);
    const deductions = calculateDeductions(state, emp, cycle, gross);
    const deductionTotal = money(deductions.reduce((s,d)=>s+Number(d.amount||0),0));
    const superable = money(rows.filter(r=>r.ote !== false && !r.retro).reduce((s,r)=>s+Math.max(0,Number(r.amount||0)),0));
    const employerSuper = money(superable * SG_RATE);
    const net = money(gross - tax.payg - tax.stsl - deductionTotal);
    const balances = calculateBalances(state, emp, rows);
    if(gross === 0 && rows.every(r=>r.description==='Leave Without Pay')) return null;
    if(gross === 0 && rows.length === 0) return null;
    const existingFinal = (state.payslips||[]).find(p=>p.empId===emp.id && Number(p.cycleId)===Number(cycle.id) && p.finalised);
    const addressSnapshot = existingFinal?.addressSnapshot || addressFor(state, emp.id, cycle.paymentDate);
    return {
      id: existingFinal?.id || `pay_${emp.id}_${cycle.id}`,
      empId: emp.id,
      employeeName: fullName(emp),
      position: positionOn(state, emp.id, cycle.paymentDate),
      cycleId: cycle.id,
      periodStart: cycle.start,
      periodEnd: cycle.end,
      paymentDate: cycle.paymentDate,
      payCloseDate: cycle.closeDate,
      ppeLabel: ppeLabel(cycle),
      rows,
      deductions,
      gross,
      taxableGross,
      payg: tax.payg,
      stsl: tax.stsl,
      deductionTotal,
      net,
      employerSuper,
      balances,
      addressSnapshot,
      taxSource: tax.source,
      stslSource: tax.stslSource,
      finalised: !!existingFinal,
      generatedAt: new Date().toISOString()
    };
  }

  function calculateCycle(state, cycleId, employeeIds){
    const cycle = cycleById(cycleId || state.currentCycleId);
    const ids = employeeIds && employeeIds.length ? employeeIds : activeEmployees(state, cycle.end).map(e=>e.id);
    const newPayslips = [];
    ids.forEach(id=>{
      if(state.finalisedCycles[String(cycle.id)]){
        const existing = (state.payslips||[]).find(p=>p.empId===id && Number(p.cycleId)===Number(cycle.id));
        if(existing) newPayslips.push(existing);
        return;
      }
      const p = calculatePayslip(state, id, cycle.id, true);
      if(p) newPayslips.push(p);
    });
    state.payslips = (state.payslips||[]).filter(p=>{
      if(Number(p.cycleId)!==Number(cycle.id)) return true;
      if(p.finalised) return true;
      return !ids.includes(p.empId);
    }).concat(newPayslips);
    state.payResults[String(cycle.id)] = summariseCycle(state, cycle.id);
    return newPayslips;
  }

  function summariseCycle(state, cycleId){
    const payslips = (state.payslips||[]).filter(p=>Number(p.cycleId)===Number(cycleId));
    const gross = money(payslips.reduce((s,p)=>s+Number(p.gross||0),0));
    const retro = money(payslips.flatMap(p=>p.rows||[]).filter(r=>r.retro).reduce((s,r)=>s+Number(r.amount||0),0));
    const net = money(payslips.reduce((s,p)=>s+Number(p.net||0),0));
    return { gross, retro, net, count:payslips.length };
  }

  function finaliseCycle(state, cycleId){
    const cycle = cycleById(cycleId || state.currentCycleId);
    calculateCycle(state, cycle.id);
    state.finalisedCycles[String(cycle.id)] = { finalisedAt:new Date().toISOString(), cycleId:cycle.id };
    (state.payslips||[]).filter(p=>Number(p.cycleId)===Number(cycle.id)).forEach(p=>{
      p.finalised = true;
      p.addressSnapshot = p.addressSnapshot || addressFor(state, p.empId, cycle.paymentDate);
      p.finalisedAt = new Date().toISOString();
    });
    return (state.payslips||[]).filter(p=>Number(p.cycleId)===Number(cycle.id));
  }

  const api = {
    STANDARD_WEEKLY_HOURS, FIRST_PAY_START, RETRO_CUTOFF, SG_RATE, PAYG_SOURCE, STSL_SOURCE, PUBLIC_HOLIDAYS_WA, PAY_CYCLES,
    parseDate, iso, addDays, addYears, cmp, inRange, round2, money, fmtPay, daysBetween, ppeLabel, cycleById,
    fullName, activeEmployees, effectiveSchedule, scheduledHoursOn, effectiveRateRow, hourlyRateOn, positionOn, addressFor, lslEntitlementDate,
    publicHoliday, leaveBookingsForDate, calendarCategory, calculatePayslip, calculateCycle, finaliseCycle, summariseCycle,
    calculateCurrentRows, calculateRetroRows
  };
  global.PayrollEngine = api;
  if(typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
