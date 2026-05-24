(function(global){
  'use strict';
  const STANDARD_WEEKLY_HOURS = 37.5;
  const ANCHOR_CYCLE = { id: 1, start: '2026-05-22', end: '2026-06-04', paymentDate: '2026-06-04', closeDate: '2026-05-29' };
  const RETRO_PROCESSING_START = '2026-05-03';
  const SUPER_RATE = 0.115;
  const PAY_PERIODS_PER_YEAR = 26;
  const PUBLIC_HOLIDAYS_WA = [
    ['2026-01-01', "New Year's Day"], ['2026-01-26', 'Australia Day'], ['2026-03-02', 'Labour Day'],
    ['2026-04-03', 'Good Friday'], ['2026-04-06', 'Easter Monday'], ['2026-04-25', 'ANZAC Day'],
    ['2026-04-27', 'ANZAC Day additional public holiday'], ['2026-06-01', 'Western Australia Day'],
    ['2026-09-28', "King's Birthday"], ['2026-12-25', 'Christmas Day'], ['2026-12-26', 'Boxing Day'],
    ['2026-12-28', 'Boxing Day additional public holiday'],
    ['2027-01-01', "New Year's Day"], ['2027-01-26', 'Australia Day'], ['2027-03-01', 'Labour Day'],
    ['2027-03-26', 'Good Friday'], ['2027-03-29', 'Easter Monday'], ['2027-04-25', 'ANZAC Day'],
    ['2027-04-26', 'ANZAC Day additional public holiday'], ['2027-06-07', 'Western Australia Day'],
    ['2027-09-27', "King's Birthday"], ['2027-12-25', 'Christmas Day'], ['2027-12-26', 'Boxing Day'],
    ['2027-12-27', 'Christmas Day additional public holiday'], ['2027-12-28', 'Boxing Day additional public holiday']
  ];

  function parseDate(iso){
    if(!iso) return null;
    const [y,m,d] = String(iso).split('-').map(Number);
    return new Date(y, m-1, d);
  }
  function iso(date){
    const y = date.getFullYear();
    const m = String(date.getMonth()+1).padStart(2,'0');
    const d = String(date.getDate()).padStart(2,'0');
    return `${y}-${m}-${d}`;
  }
  function addDays(isoDate, days){ const d = parseDate(isoDate); d.setDate(d.getDate()+days); return iso(d); }
  function compare(a,b){ return parseDate(a) - parseDate(b); }
  function between(x,start,end){ return compare(start,x) <= 0 && compare(x,end) <= 0; }
  function daysBetween(start,end){
    const out = [];
    if(!start || !end || compare(start,end)>0) return out;
    for(let d=parseDate(start); d<=parseDate(end); d.setDate(d.getDate()+1)) out.push(iso(d));
    return out;
  }
  function fmtPay(dateIso){
    const d = parseDate(dateIso);
    return `${d.getDate()}/${d.getMonth()+1}/${String(d.getFullYear()).slice(-2)}`;
  }
  function fmtLong(dateIso){
    if(!dateIso) return '';
    try{return new Intl.DateTimeFormat('en-AU',{day:'2-digit',month:'short',year:'numeric'}).format(parseDate(dateIso));}catch(e){return fmtPay(dateIso);}
  }
  function money(v){
    try{return new Intl.NumberFormat('en-AU',{style:'currency',currency:'AUD'}).format(Number(v||0));}
    catch(e){return `$${Number(v||0).toFixed(2)}`;}
  }
  function round2(n){ return Math.round((Number(n)||0)*100)/100; }
  function round4(n){ return Math.round((Number(n)||0)*10000)/10000; }
  function ppeLabel(c){ return `PPE${fmtPay(c.end)}`; }
  function cycleDisplay(c){ return `${ppeLabel(c)} | Period: ${fmtPay(c.start)} - ${fmtPay(c.end)} | Payment Date: ${fmtPay(c.paymentDate)} | Pay close: ${fmtPay(c.closeDate)}`; }
  function makePayCycles(count=80){
    const out = [];
    let start = ANCHOR_CYCLE.start;
    for(let i=0;i<count;i++){
      const end = addDays(start, 13);
      const closeDate = addDays(end, -6);
      out.push({ id: i+1, start, end, paymentDate: end, closeDate });
      start = addDays(start, 14);
    }
    return out;
  }
  const PAY_CYCLES = makePayCycles(100);
  function cycleById(id){ return PAY_CYCLES.find(c=>c.id===Number(id)) || PAY_CYCLES[0]; }
  function currentCycle(state){ return cycleById(state.currentCycleId || 1); }
  function cycleForDate(dateIso){ return PAY_CYCLES.find(c=>between(dateIso,c.start,c.end)); }
  function isFinalised(state, cycle){ return !!state.finalisedCycles[String(cycle.id)]; }
  function isPublicHoliday(dateIso){ return PUBLIC_HOLIDAYS_WA.some(p=>p[0]===dateIso); }
  function publicHolidayName(dateIso){ return (PUBLIC_HOLIDAYS_WA.find(p=>p[0]===dateIso)||[])[1] || 'Public Holiday'; }
  function employeeName(e){ return `${e.firstName||''} ${e.lastName||''}`.trim() || e.name || e.id; }
  function activeSchedule(state, empId, onDate, excludeId){
    return (state.schedules||[]).filter(s=>s.empId===empId && s.id!==excludeId && compare(s.effectiveDate,onDate)<=0)
      .sort((a,b)=>compare(b.effectiveDate,a.effectiveDate))[0] || null;
  }
  function activePayRate(state, empId, onDate, excludeId){
    const rows = (state.payRates||[]).filter(p=>p.empId===empId && p.id!==excludeId && compare(p.effectiveDate,onDate)<=0 && (p.changeType==='Permanent' || !p.endDate || compare(onDate,p.endDate)<=0))
      .sort((a,b)=>compare(b.effectiveDate,a.effectiveDate) || ((b.changeType==='Temporary')-(a.changeType==='Temporary')));
    const e = (state.employees||[]).find(x=>x.id===empId) || {};
    return rows[0] || { id:'base', position:e.position||'', hourlyRate:Number(e.hourlyRate||0), changeType:'Permanent' };
  }
  function weeklyHoursFromSchedule(s){ return Object.values((s&&s.hoursByDay)||{}).reduce((sum,h)=>sum+Number(h||0),0); }
  function employmentEnd(e){ return e.terminationDate || (e.type==='Fixed Term' ? e.contractEndDate : '') || ''; }
  function isEmployedOn(e, dateIso){ return !!e && !!e.startDate && compare(e.startDate,dateIso)<=0 && (!employmentEnd(e) || compare(dateIso, employmentEnd(e))<=0); }
  function isEmployedInCycle(e,c){ return !!e && e.startDate && compare(e.startDate,c.end)<=0 && (!employmentEnd(e) || compare(employmentEnd(e),c.start)>=0); }
  function leaveOnDate(state, empId, dateIso){
    return (state.leaveBookings||[]).find(l=>l.empId===empId && compare(l.startDate,dateIso)<=0 && compare(dateIso,l.endDate)<=0);
  }
  function lslEntitlementDate(e){
    if(!e || !e.lslServiceDate) return '';
    const d = parseDate(e.lslServiceDate); d.setFullYear(d.getFullYear()+10); return iso(d);
  }
  function lslProRataHours(state,e,asOf){
    if(!e || !e.lslServiceDate) return 0;
    const serviceDays = Math.max(0, (parseDate(asOf)-parseDate(e.lslServiceDate))/86400000);
    const weekly = weeklyHoursFromSchedule(activeSchedule(state,e.id,asOf)) || STANDARD_WEEKLY_HOURS;
    const fullEntitlement = weekly * 8.667;
    return Math.min(fullEntitlement, fullEntitlement * (serviceDays/(365.25*10)));
  }
  function lslBalances(state,e,asOf){
    const ent = lslEntitlementDate(e);
    const pro = lslProRataHours(state,e,asOf);
    if(ent && compare(ent,asOf)<=0) return { accrued: round4(Number(e.lslAccruedBalance||0) + pro), proRata: 0, entitlementDate: ent };
    return { accrued: round4(Number(e.lslAccruedBalance||0)), proRata: round4(pro), entitlementDate: ent };
  }

  function activeTaxDetails(state, empId, onDate){
    const rows = (state.taxDetails||[]).filter(t=>t.empId===empId && compare(t.effectiveDate,onDate)<=0)
      .sort((a,b)=>compare(b.effectiveDate,a.effectiveDate));
    const e = (state.employees||[]).find(x=>x.id===empId) || {};
    return rows[0] || { empId, effectiveDate:e.startDate||onDate, taxFileNumber:'', claimTaxFreeThreshold:true, stsl:false };
  }
  function residentAnnualTax(annualIncome, claimTaxFreeThreshold=true){
    const x = Math.max(0, Number(annualIncome||0));
    if(!claimTaxFreeThreshold){
      if(x <= 45000) return round2(x * 0.16);
      if(x <= 135000) return round2(7200 + (x-45000) * 0.30);
      if(x <= 190000) return round2(34200 + (x-135000) * 0.37);
      return round2(54550 + (x-190000) * 0.45);
    }
    if(x <= 18200) return 0;
    if(x <= 45000) return round2((x-18200) * 0.16);
    if(x <= 135000) return round2(4288 + (x-45000) * 0.30);
    if(x <= 190000) return round2(31288 + (x-135000) * 0.37);
    return round2(51638 + (x-190000) * 0.45);
  }
  function stslAnnualRepayment(annualIncome){
    const x = Math.max(0, Number(annualIncome||0));
    if(x <= 67000) return 0;
    if(x <= 125000) return round2((x-67000) * 0.15);
    if(x <= 179285) return round2(8700 + (x-125000) * 0.17);
    return round2(17928.45 + (x-179285) * 0.19);
  }
  function taxForGross(state,e,gross,onDate,claimOverride){
    const tax = activeTaxDetails(state,e.id,onDate || e.startDate || ANCHOR_CYCLE.start);
    const claim = claimOverride === undefined ? tax.claimTaxFreeThreshold !== false : !!claimOverride;
    const annual = Math.max(0, Number(gross||0)) * PAY_PERIODS_PER_YEAR;
    return round2(residentAnnualTax(annual, claim) / PAY_PERIODS_PER_YEAR);
  }
  function stslForGross(state,e,gross,onDate){
    const tax = activeTaxDetails(state,e.id,onDate || e.startDate || ANCHOR_CYCLE.start);
    if(tax.stsl !== true) return 0;
    const annual = Math.max(0, Number(gross||0)) * PAY_PERIODS_PER_YEAR;
    return round2(stslAnnualRepayment(annual) / PAY_PERIODS_PER_YEAR);
  }
  function calculateTaxComponents(state,e,rows,c){
    const currentRows = rows.filter(r=>r.kind !== 'retro');
    const retroRowsOnly = rows.filter(r=>r.kind === 'retro');
    const currentGross = round2(currentRows.reduce((s,r)=>s+Number(r.amount||0),0));
    const retroGross = round2(retroRowsOnly.reduce((s,r)=>s+Number(r.amount||0),0));
    const marginalTax = taxForGross(state,e,currentGross,c.end);
    const marginalTaxRetro = retroGross > 0 ? taxForGross(state,e,retroGross,(retroRowsOnly[0]&&retroRowsOnly[0].startDate)||c.end) : 0;
    const stsl = stslForGross(state,e,currentGross,c.end);
    const stslRetro = retroGross > 0 ? stslForGross(state,e,retroGross,(retroRowsOnly[0]&&retroRowsOnly[0].startDate)||c.end) : 0;
    return { marginalTax, marginalTaxRetro, stsl, stslRetro, totalTax:round2(marginalTax + marginalTaxRetro + stsl + stslRetro) };
  }

  function validateLeaveBooking(state, empId, leaveType, startDate, endDate){
    const e = (state.employees||[]).find(x=>x.id===empId);
    if(!e || !startDate || !endDate) return { ok:false, hours:0, message:'Complete leave fields.' };
    if(compare(startDate,endDate)>0) return { ok:false, hours:0, message:'End date cannot be before start date.' };
    if(compare(startDate,e.startDate)<0) return { ok:false, hours:0, message:'Leave cannot be booked before the employee commences.' };
    if(employmentEnd(e) && compare(endDate, employmentEnd(e))>0) return { ok:false, hours:0, message:'Leave cannot be booked after the employee has terminated or the contract has ended.' };
    let hours = 0;
    const detail = [];
    daysBetween(startDate,endDate).forEach(d=>{
      const sched = activeSchedule(state, empId, d);
      const h = Number((sched && sched.hoursByDay && sched.hoursByDay[parseDate(d).getDay()]) || 0);
      const ph = isPublicHoliday(d);
      const counted = ph ? 0 : h;
      hours += counted;
      detail.push({ date:d, scheduledHours:h, publicHoliday:ph, countedHours:counted });
    });
    if(hours <= 0) return { ok:false, hours:0, detail, message:'Absence duration is 0 hours. Leave cannot be booked.' };
    if(leaveType && leaveType !== 'LWOP'){
      const cycle = currentCycle(state);
      const balances = projectedBalances(state, e, cycle);
      const available = leaveType === 'Annual Leave' ? balances.annual : leaveType === 'Personal Leave' ? balances.personal : leaveType === 'Long Service Leave' ? balances.lslAccrued : 999999;
      if(available + 0.0001 < hours) return { ok:false, hours, detail, message:'Insufficient Credits' };
    }
    return { ok:true, hours:round4(hours), detail, message:'OK' };
  }
  function mergeRows(rows){
    const out = [];
    rows.forEach(row=>{
      const key = [row.description,row.rate,row.position,row.kind].join('|');
      const last = out[out.length-1];
      if(last && last._key === key && addDays(last.endDate,1) === row.startDate){
        last.units = round4(last.units + row.units);
        last.amount = round2(last.amount + row.amount);
        last.endDate = row.endDate;
      }else out.push(Object.assign({_key:key}, row));
    });
    return out;
  }
  function earningRowsForCycle(state, e, c, options={}){
    const includeAdditional = options.includeAdditional !== false;
    const includePayouts = options.includePayouts !== false;
    const rows = [];
    if(!isEmployedInCycle(e,c)) return rows;
    daysBetween(c.start,c.end).forEach(d=>{
      if(!isEmployedOn(e,d)) return;
      const sched = activeSchedule(state,e.id,d);
      const hours = Number((sched && sched.hoursByDay && sched.hoursByDay[parseDate(d).getDay()]) || 0);
      if(hours <= 0) return;
      const rate = activePayRate(state,e.id,d);
      const amount = round2(hours * Number(rate.hourlyRate||0));
      const leave = leaveOnDate(state,e.id,d);
      if(isPublicHoliday(d)){
        rows.push({ description:'Public Holiday', units:hours, amount, startDate:d, endDate:d, rate:Number(rate.hourlyRate||0), position:rate.position||e.position, kind:'publicHoliday', note:publicHolidayName(d) });
        return;
      }
      if(leave){
        const paid = leave.type !== 'LWOP';
        rows.push({ description:leave.type, units:hours, amount: paid ? amount : 0, startDate:d, endDate:d, rate:Number(rate.hourlyRate||0), position:rate.position||e.position, kind:'leave', leaveType:leave.type });
        return;
      }
      rows.push({ description:'Regular Pay', units:hours, amount, startDate:d, endDate:d, rate:Number(rate.hourlyRate||0), position:rate.position||e.position, kind:'regular' });
    });
    if(includeAdditional){
      (state.additionalEarnings||[]).filter(a=>a.empId===e.id && Number(a.cycleId)===Number(c.id) && a.saved !== false).forEach(a=>{
        const baseRate = activePayRate(state,e.id,a.startDate);
        const multiplier = a.earningType === 'Overtime 1.5' ? 1.5 : a.earningType === 'Overtime 2.0' ? 2 : 1;
        rows.push({ description:a.earningType, units:Number(a.hours||0), amount:round2(Number(a.hours||0)*Number(baseRate.hourlyRate||0)*multiplier), startDate:a.startDate, endDate:a.endDate || a.startDate, rate:round2(Number(baseRate.hourlyRate||0)*multiplier), position:baseRate.position||e.position, kind:'additional' });
      });
    }
    if(includePayouts){
      const end = employmentEnd(e);
      if(end && between(end,c.start,c.end)){
        const rate = activePayRate(state,e.id,end);
        const balances = projectedBalances(state,e,c,false);
        if(balances.annual > 0) rows.push({ description:'Annual Leave Payout', units:balances.annual, amount:round2(balances.annual*Number(rate.hourlyRate||0)), startDate:end, endDate:end, rate:Number(rate.hourlyRate||0), position:rate.position||e.position, kind:'payout' });
        if(balances.lslAccrued > 0) rows.push({ description:'Accrued LSL Payout', units:balances.lslAccrued, amount:round2(balances.lslAccrued*Number(rate.hourlyRate||0)), startDate:end, endDate:end, rate:Number(rate.hourlyRate||0), position:rate.position||e.position, kind:'payout' });
      }
    }
    return mergeRows(rows);
  }
  function ordinaryHours(rows){
    return rows.filter(r=>['regular','leave','publicHoliday'].includes(r.kind) && r.description !== 'LWOP').reduce((s,r)=>s+Number(r.units||0),0);
  }
  function projectedBalances(state,e,c,includeCurrent=true,overrideRows=null){
    let annual = Number(e.annualLeaveBalance||0);
    let personal = Number(e.personalLeaveBalance||0);
    const lslInfo = lslBalances(state,e,c.end);
    let lslAccrued = Number(lslInfo.accrued||0);
    if(includeCurrent){
      const rows = overrideRows || earningRowsForCycle(state,e,c,{includeAdditional:true,includePayouts:true});
      const ordinary = ordinaryHours(rows);
      if(e.type !== 'Casual'){
        annual += ordinary * 4 / 52;
        personal += ordinary * 3 / 52;
      }
      annual -= rows.filter(r=>r.description==='Annual Leave').reduce((s,r)=>s+r.units,0);
      personal -= rows.filter(r=>r.description==='Personal Leave').reduce((s,r)=>s+r.units,0);
      lslAccrued -= rows.filter(r=>r.description==='Long Service Leave').reduce((s,r)=>s+r.units,0);
      annual -= rows.filter(r=>r.description==='Annual Leave Payout').reduce((s,r)=>s+r.units,0);
      lslAccrued -= rows.filter(r=>r.description==='Accrued LSL Payout').reduce((s,r)=>s+r.units,0);
    }
    return { annual:round4(Math.max(0,annual)), personal:round4(Math.max(0,personal)), lslAccrued:round4(Math.max(0,lslAccrued)), lslProRata:round4(lslInfo.proRata), lslEntitlementDate:lslInfo.entitlementDate };
  }
  function expectedGross(state,e,c){
    const rows = earningRowsForCycle(state,e,c,{includeAdditional:true,includePayouts:true});
    return { rows, gross:round2(rows.reduce((s,r)=>s+r.amount,0)), units:round4(rows.reduce((s,r)=>s+r.units,0)) };
  }
  function retroRows(state,e,c){
    const rows = [];
    PAY_CYCLES.filter(x=>x.id < c.id && isFinalised(state,x) && compare(x.end,RETRO_PROCESSING_START)>=0).forEach(prev=>{
      const retroPrev = Object.assign({}, prev, { start: compare(prev.start, RETRO_PROCESSING_START)<0 ? RETRO_PROCESSING_START : prev.start });
      const expected = expectedGross(state,e,retroPrev);
      const paid = (state.payslips||[]).filter(p=>p.empId===e.id && Number(p.cycleId)===Number(prev.id) && p.finalised);
      const paidGross = paid.reduce((s,p)=>s+Number(p.gross||0),0);
      const paidUnits = paid.reduce((s,p)=>s+Number(p.units||0),0);
      const delta = round2(expected.gross - paidGross);
      if(Math.abs(delta) >= 0.01){
        rows.push({ description:'Regular Pay Retro', units:round4(expected.units-paidUnits), amount:delta, startDate:retroPrev.start, endDate:retroPrev.end, rate:0, position:e.position, kind:'retro' });
      }
    });
    const anyPriorFinalised = PAY_CYCLES.some(x=>x.id < c.id && isFinalised(state,x));
    if(e.startDate && compare(e.startDate,c.start)<0 && !anyPriorFinalised){
      const priorEnd = addDays(c.start,-1);
      const priorRows = [];
      const retroStart = compare(e.startDate,RETRO_PROCESSING_START)<0 ? RETRO_PROCESSING_START : e.startDate;
      daysBetween(retroStart,priorEnd).forEach(d=>{
        if(!isEmployedOn(e,d)) return;
        const sched = activeSchedule(state,e.id,d);
        const hours = Number((sched && sched.hoursByDay && sched.hoursByDay[parseDate(d).getDay()]) || 0);
        if(hours <= 0) return;
        const rate = activePayRate(state,e.id,d);
        priorRows.push({ description:'Regular Pay Retro', units:hours, amount:round2(hours*Number(rate.hourlyRate||0)), startDate:d, endDate:d, rate:Number(rate.hourlyRate||0), position:rate.position||e.position, kind:'retro' });
      });
      rows.push(...mergeRows(priorRows));
    }
    return rows;
  }
  function makePayslip(state,e,c,rows,position,rate,segmentIndex,segmentCount,finalised){
    const gross = round2(rows.reduce((s,r)=>s+Number(r.amount||0),0));
    const taxParts = calculateTaxComponents(state,e,rows,c);
    const tax = taxParts.totalTax;
    const superAmt = round2(Math.max(0,gross) * SUPER_RATE);
    const net = round2(gross-tax);
    const ordinary = ordinaryHours(rows);
    const annualAccrual = e.type === 'Casual' ? 0 : round4(ordinary*4/52);
    const personalAccrual = e.type === 'Casual' ? 0 : round4(ordinary*3/52);
    const balances = projectedBalances({ employees:[e], schedules:[], payRates:[], leaveBookings:[], additionalEarnings:[] }, e, c, false);
    const retro = round2(rows.filter(r=>r.kind==='retro').reduce((s,r)=>s+Number(r.amount||0),0));
    return { id:`${e.id}_${c.id}_${segmentIndex}`, empId:e.id, employeeName:employeeName(e), employeeSnapshot:JSON.parse(JSON.stringify(e)), cycleId:c.id, cycle:JSON.parse(JSON.stringify(c)), position:position||e.position, rate:Number(rate||0), rows, gross, tax, marginalTax:taxParts.marginalTax, marginalTaxRetro:taxParts.marginalTaxRetro, stsl:taxParts.stsl, stslRetro:taxParts.stslRetro, superAmt, net, units:round4(rows.reduce((s,r)=>s+Number(r.units||0),0)), ordinaryHours:round4(ordinary), annualAccrual, personalAccrual, retro, balances, segmentIndex, segmentCount, finalised:!!finalised, createdAt:(new Date()).toISOString().slice(0,10) };
  }
  function splitIntoPayslips(state,e,c,rows,finalised){
    const mainRows = rows.filter(r=>r.kind !== 'retro');
    const retro = rows.filter(r=>r.kind === 'retro');
    const groups = [];
    mainRows.forEach(r=>{
      const key = `${r.position||e.position}|${r.rate||0}`;
      let g = groups.find(x=>x.key===key);
      if(!g){ g = { key, position:r.position||e.position, rate:r.rate||0, rows:[] }; groups.push(g); }
      g.rows.push(r);
    });
    if(!groups.length && retro.length) groups.push({ key:'retro', position:e.position, rate:e.hourlyRate, rows:[] });
    if(groups.length) groups[0].rows.push(...retro);
    return groups.map((g,i)=>makePayslip(state,e,c,g.rows,g.position,g.rate,i+1,groups.length,finalised)).filter(p=>Math.abs(p.gross)>0.004);
  }
  function calculateEmployee(state, empId, cycleId, finalised=false){
    const e = (state.employees||[]).find(x=>x.id===empId);
    if(!e) return [];
    const c = cycleById(cycleId || state.currentCycleId || 1);
    const rows = [...earningRowsForCycle(state,e,c,{includeAdditional:true,includePayouts:true}), ...retroRows(state,e,c)];
    const payslips = splitIntoPayslips(state,e,c,rows,finalised || isFinalised(state,c));
    payslips.forEach(p=>{ p.balances = projectedBalances(state,e,c,true,p.rows); });
    return payslips;
  }
  function calculateAll(state, cycleId, finalised=false){
    const c = cycleById(cycleId || state.currentCycleId || 1);
    autoProcessContractExpiries(state,c.end);
    return (state.employees||[]).flatMap(e=>calculateEmployee(state,e.id,c.id,finalised)).filter(p=>Math.abs(p.gross)>0.004);
  }
  function autoProcessContractExpiries(state, upToDate){
    (state.employees||[]).forEach(e=>{
      if(e.type==='Fixed Term' && e.autoTerminate && e.contractEndDate && compare(e.contractEndDate,upToDate)<=0 && e.status !== 'Terminated'){
        e.status = 'Terminated';
        e.terminationDate = e.contractEndDate;
        e.terminationReason = 'Expiry of Fixed Term Contract';
        if(Array.isArray(state.jobEvents)) state.jobEvents.push({ id:uid('job'), empId:e.id, type:'Termination', effectiveDate:e.contractEndDate, description:'Expiry of Fixed Term Contract', refKind:'employee', refId:e.id });
      }
    });
  }
  function commitBalancesOnFinalise(state, c, payslips){
    const processed = new Set();
    payslips.forEach(p=>{
      if(processed.has(p.empId)) return;
      processed.add(p.empId);
      const e = (state.employees||[]).find(x=>x.id===p.empId);
      if(!e) return;
      const rows = payslips.filter(x=>x.empId===e.id).flatMap(x=>x.rows||[]);
      const ordinary = ordinaryHours(rows);
      if(e.type !== 'Casual'){
        e.annualLeaveBalance = round4(Number(e.annualLeaveBalance||0) + ordinary*4/52);
        e.personalLeaveBalance = round4(Number(e.personalLeaveBalance||0) + ordinary*3/52);
      }
      e.annualLeaveBalance = round4(Math.max(0, Number(e.annualLeaveBalance||0) - rows.filter(r=>r.description==='Annual Leave').reduce((s,r)=>s+r.units,0) - rows.filter(r=>r.description==='Annual Leave Payout').reduce((s,r)=>s+r.units,0)));
      e.personalLeaveBalance = round4(Math.max(0, Number(e.personalLeaveBalance||0) - rows.filter(r=>r.description==='Personal Leave').reduce((s,r)=>s+r.units,0)));
      const lslTaken = rows.filter(r=>r.description==='Long Service Leave' || r.description==='Accrued LSL Payout').reduce((s,r)=>s+r.units,0);
      e.lslAccruedBalance = round4(Math.max(0, Number(e.lslAccruedBalance||0) - lslTaken));
    });
  }
  function finaliseCurrentPay(state){
    const c = currentCycle(state);
    const payslips = calculateAll(state,c.id,true).map(p=>Object.assign({},p,{finalised:true,finalisedAt:(new Date()).toISOString().slice(0,10)}));
    state.payslips = (state.payslips||[]).filter(p=>Number(p.cycleId)!==Number(c.id)).concat(payslips);
    state.finalisedCycles[String(c.id)] = { id:c.id, finalisedAt:(new Date()).toISOString().slice(0,10), label:ppeLabel(c) };
    commitBalancesOnFinalise(state,c,payslips);
    state.currentCycleId = c.id + 1;
    state.payResults[String(state.currentCycleId)] = calculateAll(state,state.currentCycleId,false);
    return { finalisedCycle:c, nextCycle:currentCycle(state), payslips };
  }
  function uid(prefix){ return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`; }

  const api = { STANDARD_WEEKLY_HOURS, ANCHOR_CYCLE, RETRO_PROCESSING_START, PAY_CYCLES, PUBLIC_HOLIDAYS_WA, parseDate, iso, addDays, compare, between, daysBetween, fmtPay, fmtLong, money, round2, round4, ppeLabel, cycleDisplay, cycleById, currentCycle, cycleForDate, isFinalised, isPublicHoliday, publicHolidayName, employeeName, activeSchedule, activePayRate, activeTaxDetails, residentAnnualTax, stslAnnualRepayment, taxForGross, stslForGross, calculateTaxComponents, weeklyHoursFromSchedule, employmentEnd, isEmployedOn, isEmployedInCycle, lslEntitlementDate, lslProRataHours, lslBalances, validateLeaveBooking, earningRowsForCycle, ordinaryHours, projectedBalances, expectedGross, retroRows, calculateEmployee, calculateAll, autoProcessContractExpiries, finaliseCurrentPay };
  global.PayrollEngine = api;
  if(typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
