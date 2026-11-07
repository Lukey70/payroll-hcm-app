'use strict';
const assert=require('assert'),D=require('../data-store'),E=require('../payroll-engine'),{fixture,DATE}=require('./self-service-v121.test'),O=E.operations;
let count=0;function test(name,fn){fn();count++;console.log('PASS: '+name);}
const file={name:'certificate.txt',size:3,data:'data:text/plain;base64,YWJj'};
test('leave files validate size/content and are scoped to owner, current manager and Payroll',()=>{
 const s=fixture();assert.deepStrictEqual(O.attachments([file]),[file]);for(const files of [[{...file,size:4}],[{...file,data:'javascript:alert(1)'}],Array(6).fill(file),[{...file,size:1048577}]])assert.throws(()=>O.attachments(files));
 s.leaveBookings.push({id:'leave',empId:'worker',attachments:[file]});assert.equal(O.leaveFiles(s,'worker','leave','ess',DATE).length,1);assert.equal(O.leaveFiles(s,'manager','leave','mss',DATE).length,1);assert.equal(O.leaveFiles(s,'payroll','leave','payroll',DATE).length,1);assert.throws(()=>O.leaveFiles(s,'outsider','leave','ess',DATE));assert.throws(()=>O.leaveFiles(s,'otherManager','leave','mss',DATE));
 s.leaveBookings=[];const l=E.selfService.submitLeave(s,'worker',{type:'Personal Leave',startDate:'2026-10-12',endDate:'2026-10-12',attachments:[file]},'ess',DATE);assert.deepStrictEqual(l.attachments,[file]);
});
test('excess leave thresholds are configurable, support disabled types and reject invalid values',()=>{
 const s=fixture();assert.equal(O.excess(s,DATE).length,0);O.thresholds(s,'payroll',{annual:100,personal:'',lslAccrued:'',lslProRata:''},DATE);const r=O.excess(s,DATE);assert(r.some(r=>r.empId==='worker'&&r.excess===50));assert(r.every(r=>r.type==='annual'));assert.throws(()=>O.thresholds(s,'manager',{annual:1},DATE));assert.throws(()=>O.thresholds(s,'payroll',{annual:-1},DATE));assert.deepStrictEqual(D.importJson(D.exportJson(s)).excessLeaveThresholds,s.excessLeaveThresholds);
});
test('roster comparison respects same-day sequence and both weeks',()=>{
 const s=fixture();s.jobDataRows.push({id:'prior',empId:'worker',effectiveDate:'2026-10-12',effectiveSequence:0,hoursByDay:{1:4},saved:true});const r=O.rosterComparison(s,{id:'next',empId:'worker',effectiveDate:'2026-10-12',effectiveSequence:1,rosterPattern:'2-week',hoursByDay:{1:6},hoursByDayWeek1:{1:6},hoursByDayWeek2:{1:8}});assert(r.changed);assert.equal(r.before[0][1],4);assert.equal(r.after[1][1],8);assert.equal(r.newWeekly,7);
});
test('roster comparison reads linked schedules for imported empty Job Data rosters',()=>{
 const s=fixture(),row=s.jobDataRows.find(r=>r.empId==='worker');row.hoursByDay={};row.hoursByDayWeek1={};row.hoursByDayWeek2={};
 const proposed={empId:'worker',id:'draft',effectiveDate:'2026-11-01',effectiveSequence:0,rosterPattern:'1-week',hoursByDay:{0:0,1:6,2:7.5,3:7.5,4:7.5,5:7.5,6:0}};
 const result=O.rosterComparison(s,proposed);assert.equal(result.oldWeekly,37.5);assert.equal(result.newWeekly,36);assert.equal(result.before[0][1],7.5);
});
test('FTE establishment counts active actual positions and supports unconfigured/zero capacity',()=>{
 const s=fixture();s.positions.find(p=>p.positionNumber==='STAFF').approvedFte=1.5;let r=O.establishment(s,DATE).find(r=>r.positionNumber==='STAFF');assert.equal(r.occupied,2);assert.equal(r.variance,-0.5);assert.equal(r.employees.length,2);assert.equal(O.establishment(s,DATE).find(r=>r.positionNumber==='CREW').approved,null);s.positions.find(p=>p.positionNumber==='STAFF').approvedFte=0;assert.equal(O.establishment(s,DATE).find(r=>r.positionNumber==='STAFF').approved,0);
});
test('acting register shows current/upcoming and removes ended assignments without mutating data',()=>{
 const s=fixture();s.jobDataRows.push({id:'act',empId:'worker',effectiveDate:'2026-10-01',action:'Movement',reason:'Acting Higher Level',positionNumber:'MGR',positionName:'Manager',positionClass:'Permanent',saved:true},{id:'return',empId:'worker',effectiveDate:'2026-11-01',action:'Movement',reason:'Return from Temp Assignment',positionNumber:'STAFF',saved:true});const before=JSON.stringify(s),r=O.acting(s,DATE);assert.equal(r.length,1);assert.equal(r[0].end,'2026-10-31');assert.equal(O.acting(s,'2026-09-30')[0].status,'Upcoming');assert.equal(O.acting(s,'2026-11-01').length,0);assert.equal(JSON.stringify(s),before);
});
test('contract expiry buckets use saved authoritative expiry dates',()=>{
 const s=fixture(),j=s.jobDataRows.find(r=>r.empId==='worker');j.reason='New Hire Fixed-Term';j.positionClass='Fixed-Term';s.employees.find(e=>e.id==='worker').type='Fixed Term';s.jobDataRows.push({id:'expiry',empId:'worker',action:'Termination',reason:'Expiry of Fixed Term',effectiveDate:'2026-11-01',saved:true});const groups=O.expiries(s,DATE);assert.equal(groups['Within 30 days'][0].end,'2026-10-31');assert.equal(O.expiries(s,'2026-11-01').Expired.length,1);
});
test('recovery statements use recorded repayments and enforce employee visibility',()=>{
 const s=fixture();s.deductions.push({id:'debt',empId:'worker',deductionType:'Recovery Deduction',openingDebt:500,startDate:'2026-10-09',amount:100,saved:true});s.recoveryRepayments.push({deductionId:'debt',cycleId:10,amount:100});const r=O.recovery(s,'payroll','worker','payroll',DATE)[0];assert.equal(r.remaining,400);assert.equal(r.payments.length,1);assert.equal(O.recovery(s,'worker','worker','ess',DATE)[0].repaid,100);assert.throws(()=>O.recovery(s,'outsider','worker','ess',DATE));
});
test('probation and response templates validate dates, permissions and retain history',()=>{
 const s=fixture();assert.throws(()=>O.saveProbation(s,'manager',{empId:'worker'},DATE));assert.throws(()=>O.saveProbation(s,'payroll',{empId:'worker',startDate:DATE,reviewDate:'2026-10-01',status:'Scheduled'},DATE));const p=O.saveProbation(s,'payroll',{empId:'worker',startDate:DATE,reviewDate:'2026-11-01',status:'Scheduled'},DATE);O.saveProbation(s,'payroll',{...p,status:'Completed',completedDate:'2026-11-01'},DATE);assert.equal(s.probations.length,1);assert.equal(s.probations[0].status,'Completed');const r=O.saveResponse(s,'payroll',{name:'Received',body:'Thanks, we are checking this.'},DATE);O.saveResponse(s,'payroll',{...r,active:false},DATE);assert.equal(s.supportResponseTemplates.length,1);assert.throws(()=>O.saveResponse(s,'worker',{name:'x',body:'x'},DATE));
});
test('on-call periods produce taxable allowances with configurable super and no leave accrual',()=>{
 const s=fixture(),base=E.calculateEmployee(s,'worker',11)[0];const r=O.saveOnCall(s,'payroll',{empId:'worker',start:'2026-10-12T18:00',end:'2026-10-13T06:00',rate:5,superEligible:true},DATE);assert.equal(r.hours,12);const p=E.calculateEmployee(s,'worker',11)[0],line=p.rows.find(r=>r.description==='On-call Allowance');assert.equal(line.amount,270);assert.equal(p.gross,base.gross+270);assert.equal(p.taxableCurrentGross,base.taxableCurrentGross+270);assert.equal(p.annualAccrual,base.annualAccrual);assert.equal(p.superAmt,E.round2(base.superAmt+32.4));assert.throws(()=>O.saveOnCall(s,'payroll',{empId:'worker',start:r.start,end:r.end,rate:5},DATE));assert.throws(()=>O.removeOnCall(s,'worker',r.id,DATE));O.removeOnCall(s,'payroll',r.id,DATE);assert(!s.additionalEarnings.length);s.finalisedCycles['11']=true;assert.throws(()=>O.saveOnCall(s,'payroll',{empId:'worker',start:r.start,end:r.end,rate:5},DATE));
});
console.log('PASS: '+count+' payroll operations groups.');
