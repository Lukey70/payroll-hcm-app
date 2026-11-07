'use strict';
const assert=require('assert'),E=require('../payroll-engine'),D=require('../data-store'),{fixture,DATE}=require('./self-service-v121.test'),T=E.timeRecords;
let count=0;function test(name,fn){fn();count++;console.log('PASS: '+name);}
const day=(date,start='08:00',finish='17:00',flexTaken=0)=>({date,blocks:[{start,finish}],flexTaken}),split=date=>({date,blocks:[{start:'08:00',finish:'12:00'},{start:'12:30',finish:'17:00'}],flexTaken:0});
const financial=s=>JSON.stringify({earnings:s.additionalEarnings,deductions:s.deductions,payslips:s.payslips,results:s.payResults,finalised:s.finalisedCycles,balances:s.employees.map(e=>[e.id,e.annualLeaveBalance,e.personalLeaveBalance,e.lslAccruedBalance]),repayments:s.recoveryRepayments,urgent:s.urgentPayBatches});
test('On/Off work periods calculate actual time, breaks, roster and flex without pay data',()=>{
 const s=fixture(),r=T.normalise(s,'worker',11,[split('2026-10-12')],true),d=r.days.find(d=>d.date==='2026-10-12');assert.equal(d.workedHours,8.5);assert.equal(d.breakHours,0.5);assert.equal(d.rosteredHours,7.5);assert.equal(d.flexEarned,1);assert.equal(d.totalHours,8.5);assert.equal(r.days.length,14);
});
test('daily shortfalls do not reduce flex unless Flex Time Taken is entered; extra days earn flex only above 7.5 hours',()=>{
 const s=fixture(),days=T.normalise(s,'worker',11,[day('2026-10-12','08:00','14:00'),day('2026-10-10','09:00','13:00')],true).days;assert.equal(days.find(d=>d.date==='2026-10-12').flexEarned,0);const saturday=days.find(d=>d.date==='2026-10-10');assert.equal(saturday.flexEarned,0);assert(saturday.additionalDay);assert.equal(T.totals(days).taken,0);
});
test('drafts retain incomplete times, but submission rejects incomplete, overlapping and out-of-period work',()=>{
 const s=fixture();const partial={date:'2026-10-12',blocks:[{start:'08:00',finish:''}]};assert(T.saveTimesheet(s,'worker',{cycleId:11,days:[partial]},false,DATE));for(const days of [[partial],[day('2026-11-01')],[day('2026-10-12','25:00','17:00')],[{date:'2026-10-12',blocks:[{start:'09:00',finish:'12:00'},{start:'11:00',finish:'14:00'}]}],[day('2026-10-12'),day('2026-10-12')]])assert.throws(()=>T.saveTimesheet(s,'worker',{id:s.timesheets[0].id,cycleId:11,days},true,DATE));assert.throws(()=>T.saveTimesheet(s,'worker',{cycleId:11,lines:[{hours:2,earningType:'Overtime 1.5'}]},true,DATE),/On\/Off/);
});
test('overnight work and breaks are counted against the start day without adjacent-date overlap',()=>{
 const s=fixture(),d=T.normalise(s,'worker',11,[{date:'2026-10-12',blocks:[{start:'22:00',finish:'23:00'},{start:'00:00',finish:'06:00'}]}],true).days.find(d=>d.date==='2026-10-12');assert.equal(d.workedHours,7);assert.equal(d.breakHours,1);assert.throws(()=>T.normalise(s,'worker',11,[day('2026-10-12','22:00','06:00'),day('2026-10-13','05:00','08:00')],true),/overlap/);
});
test('save, submit, deny, resubmit, approve and withdrawal never change any payroll data',()=>{
 const s=fixture();s.payResults['11']=E.calculateAll(s,11);const before=financial(s),t=T.saveTimesheet(s,'worker',{cycleId:11,days:[split('2026-10-12')]},false,DATE);assert.equal(financial(s),before);T.saveTimesheet(s,'worker',{id:t.id,cycleId:11,days:[split('2026-10-12')]},true,DATE);assert.equal(financial(s),before);assert.throws(()=>T.approveTimesheet(s,'manager',t.id,'Denied','',DATE));T.approveTimesheet(s,'manager',t.id,'Denied','Check times',DATE);T.saveTimesheet(s,'worker',{id:t.id,cycleId:11,days:[split('2026-10-12')]},true,DATE);T.approveTimesheet(s,'manager',t.id,'Approved','Checked',DATE);assert.equal(financial(s),before);assert.equal(s.additionalEarnings.length,0);assert.throws(()=>T.approveTimesheet(s,'manager',t.id,'Approved','',DATE));assert.throws(()=>T.withdrawTimesheet(s,'worker',t.id,DATE));assert(s.timesheets[0].history.some(h=>h.status==='Denied'));assert(s.alerts.some(a=>a.recipientIds.includes('worker')));
});
test('only current direct-report managers can approve and records remain owner-scoped',()=>{
 const s=fixture(),t=T.saveTimesheet(s,'worker',{cycleId:11,days:[split('2026-10-12')]},true,DATE);assert.equal(T.timesheets(s,'outsider','ess',DATE).length,0);assert.equal(T.timesheets(s,'otherManager','mss',DATE).length,0);assert.throws(()=>T.approveTimesheet(s,'otherManager',t.id,'Approved','',DATE));s.jobDataRows.find(r=>r.empId==='worker').reportsTo='MGR2';assert.throws(()=>T.approveTimesheet(s,'manager',t.id,'Approved','',DATE));T.approveTimesheet(s,'otherManager',t.id,'Approved','',DATE);assert.equal(s.timesheets[0].status,'Approved');
});
test('approved flex carries forward, explicit use reduces it, and unapproved flex does not carry',()=>{
 const s=fixture(),t=T.saveTimesheet(s,'worker',{cycleId:11,days:[split('2026-10-12'),day('2026-10-10','09:00','13:00')]},true,DATE);assert.equal(T.carriedForward(s,'worker',12),0);T.approveTimesheet(s,'manager',t.id,'Approved','',DATE);assert.equal(T.carriedForward(s,'worker',12),1);s.currentCycleId=12;const next=T.saveTimesheet(s,'worker',{cycleId:12,days:[day('2026-10-26','08:00','15:00',0.5),day('2026-10-27','08:00','14:00')]},true,DATE),sum=T.summary(s,next);assert.equal(sum.carried,1);assert.equal(sum.earned,0);assert.equal(sum.taken,0.5);assert.equal(sum.closing,0.5);T.approveTimesheet(s,'manager',next.id,'Approved','',DATE);assert.equal(T.carriedForward(s,'worker',13),0.5);
});
test('carry is capped at 37.5 hours and excess is shown separately without bank or payroll entries',()=>{
 const s=fixture(),days=E.daysBetween(E.cycleById(11).start,E.cycleById(11).end).map(d=>day(d,'07:00','19:00')),t=T.saveTimesheet(s,'worker',{cycleId:11,days},true,DATE);T.approveTimesheet(s,'manager',t.id,'Approved','',DATE);const sum=T.summary(s,s.timesheets[0]);assert.equal(sum.closing,37.5);assert.equal(sum.excess,E.round4(sum.earned-37.5));assert.equal(T.carriedForward(s,'worker',12),37.5);assert.equal(s.additionalEarnings.length,0);
});
test('flex cannot be taken beyond roster shortfall, approved availability or earlier day earnings',()=>{
 const s=fixture();assert.throws(()=>T.saveTimesheet(s,'worker',{cycleId:11,days:[day('2026-10-12','08:00','14:00',1)]},true,DATE),/Insufficient/);assert.throws(()=>T.saveTimesheet(s,'worker',{cycleId:11,days:[day('2026-10-12','08:00','17:00',1)]},true,DATE),/cannot exceed/);
});
test('time records can be approved for a finalised pay period while finalised pay stays identical',()=>{
 const s=fixture();E.finaliseCurrentPay(s);const before=financial(s),t=T.saveTimesheet(s,'worker',{cycleId:11,days:[split('2026-10-12')]},true,DATE);T.approveTimesheet(s,'manager',t.id,'Approved','',DATE);assert.equal(financial(s),before);assert.equal(T.summary(s,s.timesheets[0]).earned,1);
});
test('legacy migration archives unfinalised generated earnings and detaches historical sources without changing payslips',()=>{
 const s=fixture();s.timesheets.push({id:'old',empId:'worker',cycleId:11,status:'Approved',lines:[{date:'2026-10-12',hours:2,earningType:'Overtime 1.5'}]});s.additionalEarnings.push({id:'generated',empId:'worker',cycleId:11,earningType:'Overtime 1.5',startDate:'2026-10-12',endDate:'2026-10-12',hours:2,amount:120,saved:true,sourceTimesheetId:'old'});const base=E.calculateEmployee(fixture(),'worker',11)[0];assert.equal(E.calculateEmployee(s,'worker',11)[0].gross,base.gross);const result=T.migrateTimesheets(s);assert.equal(result.archived,1);assert.equal(s.additionalEarnings.length,0);assert.equal(s.timesheetPayrollArchive.length,1);assert.equal(s.timesheets[0].status,'Draft');assert.equal(s.timesheets[0].legacyHoursRecord.status,'Approved');assert.equal(T.migrateTimesheets(s).converted,0);
 const historic=fixture();historic.finalisedCycles['11']=true;historic.additionalEarnings.push({id:'historical',empId:'worker',cycleId:11,earningType:'Overtime 1.5',startDate:'2026-10-12',endDate:'2026-10-12',hours:2,amount:120,saved:true,sourceTimesheetId:'old'});historic.payslips=E.calculateEmployee(historic,'worker',11,true);const saved=JSON.stringify(historic.payslips),gross=historic.payslips[0].gross;T.migrateTimesheets(historic);assert.equal(JSON.stringify(historic.payslips),saved);assert.equal(E.calculateEmployee(historic,'worker',11)[0].gross,gross);assert.equal(historic.additionalEarnings[0].sourceTimesheetId,undefined);assert.equal(historic.additionalEarnings[0].legacyTimesheetSourceId,'old');
});
test('withdrawn records remain archived and time/flex data survive export/import',()=>{
 const s=fixture(),t=T.saveTimesheet(s,'worker',{cycleId:11,days:[split('2026-10-12')]},true,DATE);T.withdrawTimesheet(s,'worker',t.id,DATE);assert.equal(s.timesheets.length,0);assert.equal(s.timesheetRecordArchive[0].status,'Withdrawn');const restored=D.importJson(D.exportJson(s));assert.deepStrictEqual(restored.timesheetRecordArchive,s.timesheetRecordArchive);assert.deepStrictEqual(restored.flexOpeningBalances,s.flexOpeningBalances);
});
test('overnight hours cannot be duplicated in a submitted adjacent fortnight',()=>{
 const s=fixture();const old=T.saveTimesheet(s,'worker',{cycleId:11,days:[day('2026-10-22','22:00','06:00')]},true,DATE);
 s.currentCycleId=12;assert.throws(()=>T.saveTimesheet(s,'worker',{cycleId:12,days:[day('2026-10-23','05:00','08:00')]},true,DATE),/overlap another/);assert.equal(s.timesheets.length,1);
});
test('approved roster snapshots remain stable after a later Job Data schedule change',()=>{
 const s=fixture(),t=T.saveTimesheet(s,'worker',{cycleId:11,days:[split('2026-10-12')]},true,DATE);T.approveTimesheet(s,'manager',t.id,'Approved','',DATE);s.schedules.find(r=>r.empId==='worker').hoursByDay[1]=1;assert.equal(T.summary(s,s.timesheets[0]).earned,1);
});
test('future timesheet drafts and submissions are rejected until that pay period is current',()=>{
 const s=fixture(),before=JSON.stringify(s);for(const submit of [false,true])assert.throws(()=>T.saveTimesheet(s,'worker',{cycleId:12,days:[split('2026-10-26')]},submit,DATE),/Future pay periods/);assert.equal(JSON.stringify(s),before);s.currentCycleId=12;assert(T.saveTimesheet(s,'worker',{cycleId:12,days:[split('2026-10-26')]},false,DATE));
});
test('non-rostered day flex starts above 7.5 net worked hours while rostered days retain their own threshold',()=>{
 const s=fixture(),date='2026-10-14';s.schedules.find(r=>r.empId==='worker').hoursByDay[3]=0;
 for(const [finish,expected]of [['13:00',0],['16:30',0],['17:30',1]]){const d=T.normalise(s,'worker',11,[day(date,'09:00',finish)],true).days.find(d=>d.date===date);assert.equal(d.flexEarned,expected);assert(d.additionalDay);}
 const splitDay=T.normalise(s,'worker',11,[split(date)],true).days.find(d=>d.date===date);assert.equal(splitDay.workedHours,8.5);assert.equal(splitDay.breakHours,0.5);assert.equal(splitDay.flexEarned,1);
 s.schedules.find(r=>r.empId==='worker').hoursByDay[3]=3;assert.equal(T.normalise(s,'worker',11,[day(date,'09:00','13:00')],true).days.find(d=>d.date===date).flexEarned,1);
});
test('approved leave references cover individual rostered dates and partial hours without changing flex or pay',()=>{
 const s=fixture(),base={empId:'worker',type:'Annual Leave',startDate:'2026-10-12',endDate:'2026-10-13',hours:15,status:'Approved'};
 s.leaveBookings.push({...base,id:'multi'},{...base,id:'partial',type:'Personal Leave',startDate:'2026-10-14',endDate:'2026-10-14',hours:3.5,requestedHours:3.5},{...base,id:'pending',startDate:'2026-10-15',endDate:'2026-10-15',status:'Awaiting Manager Approval'},{...base,id:'other',empId:'outsider',startDate:'2026-10-16',endDate:'2026-10-16'});
 const before=JSON.stringify(s),sum=T.summary(s,{empId:'worker',cycleId:11,status:'Draft',days:[]},'2026-10-24'),get=date=>sum.days.find(d=>d.date===date);
 assert.equal(get('2026-10-12').approvedLeave[0].hours,7.5);assert.equal(get('2026-10-13').approvedLeave[0].hours,7.5);assert.equal(get('2026-10-14').approvedLeave[0].hours,3.5);assert.equal(get('2026-10-14').approvedLeave[0].type,'Personal Leave');assert(!get('2026-10-14').missingRecord);assert.equal(get('2026-10-15').approvedLeave.length,0);assert(get('2026-10-15').missingRecord);assert(get('2026-10-16').missingRecord);assert.equal(sum.earned,0);assert.equal(sum.worked,0);assert.equal(sum.total,0);assert.equal(JSON.stringify(s),before);
 s.leaveBookings=s.leaveBookings.filter(l=>l.id!=='multi');assert(T.summary(s,{empId:'worker',cycleId:11,status:'Draft',days:[]},'2026-10-24').days.find(d=>d.date==='2026-10-12').missingRecord);
});
test('missing-day warnings ignore today, future, weekends, public holidays, flex, work and non-rostered days',()=>{
 const s=fixture(),t={empId:'worker',cycleId:11,status:'Draft',days:[]};let sum=T.summary(s,t,'2026-10-12');assert(sum.days.find(d=>d.date==='2026-10-09').missingRecord);assert(!sum.days.find(d=>d.date==='2026-10-10').missingRecord);assert(!sum.days.find(d=>d.date==='2026-10-12').missingRecord);assert(!sum.days.find(d=>d.date==='2026-10-13').missingRecord);
 t.days=[split('2026-10-12'),{date:'2026-10-13',flexTaken:1,blocks:[]}];s.schedules.find(r=>r.empId==='worker').hoursByDay[3]=0;sum=T.summary(s,t,'2026-10-24');for(const date of ['2026-10-12','2026-10-13','2026-10-14'])assert(!sum.days.find(d=>d.date===date).missingRecord);
 const holiday='2026-09-28',c=E.cycleForDate(holiday);assert(!T.summary(s,{empId:'worker',cycleId:c.id,status:'Draft',days:[]},'2026-10-24').days.find(d=>d.date===holiday).missingRecord);
 const fresh=fixture(),newEmployee=fresh.employees.find(e=>e.id==='worker');newEmployee.startDate=newEmployee.originalStartDate='2026-10-12';fresh.jobDataRows.find(r=>r.empId==='worker').effectiveDate='2026-10-12';assert(!T.summary(fresh,{empId:'worker',cycleId:11,status:'Draft',days:[]},'2026-10-24').days.find(d=>d.date==='2026-10-09').missingRecord);
});
console.log('PASS: '+count+' actual-time/flex groups.');
