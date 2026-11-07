'use strict';
const assert=require('assert'),E=require('../payroll-engine'),D=require('../data-store'),{fixture}=require('./self-service-v121.test');
let count=0;function test(name,fn){if(require.main!==module)return;fn();count++;console.log('PASS: '+name);}
function setup(){
 const s=fixture(),e=s.employees.find(x=>x.id==='worker'),j=s.jobDataRows.find(x=>x.empId===e.id);
 Object.assign(e,{type:'Fixed Term',startDate:'2018-05-22',originalStartDate:'2018-05-22',lslServiceDate:'2018-05-22',contractEndDate:'2026-10-11',annualLeaveBalance:150,personalLeaveBalance:100});
 Object.assign(j,{reason:'New Hire Fixed-Term',effectiveDate:e.startDate,positionClass:'Fixed-Term',hoursByDay:{0:0,1:7.5,2:7.5,3:7.5,4:7.5,5:7.5,6:0}});
 s.schedules.find(x=>x.empId===e.id).effectiveDate=e.startDate;s.payRates.find(x=>x.empId===e.id).effectiveDate=e.startDate;
 s.jobDataRows.push({id:'term',empId:e.id,action:'Termination',reason:'Expiry of Fixed Term',effectiveDate:'2026-10-12',effectiveSequence:0,saved:true});
 E.reconcileEmploymentFromJobData(s,e);
 const baseline=E.calculateEmployee(s,e.id,11);
 s.jobDataRows.push({id:'casual',empId:e.id,action:'Commencement',reason:'Rehire Casual',effectiveDate:'2026-10-12',effectiveSequence:1,positionClass:'Casual',positionNumber:'CREW',positionName:'Crew',hourlyRate:30,reportsTo:'MGR',saved:true});
 s.payRates.push({id:'casual-rate',empId:e.id,jobDataId:'casual',effectiveDate:'2026-10-12',effectiveSequence:1,changeType:'Permanent',position:'Crew',hourlyRate:30});
 s.schedules.push({id:'casual-roster',empId:e.id,jobDataId:'casual',effectiveDate:'2026-10-12',effectiveSequence:1,hoursByDay:{0:0,1:0,2:0,3:0,4:0,5:0,6:0}});
 return {s,e,baseline};
}
test('same-day sequence 1 casual rehire remains active and rebuilds previous fixed-term service',()=>{
 const {s,e}=setup();e.employmentSegments=[];E.reconcileEmploymentFromJobData(s,e);assert.equal(e.type,'Casual');assert.equal(e.startDate,'2026-10-12');assert.equal(e.terminationDate,'');assert.equal(e.contractEndDate,'');assert.equal(e.status,'Active');assert(E.isEmployedOn(e,'2026-10-09'));assert(E.isEmployedOn(e,'2026-10-12'));assert(E.selfService.isActiveEmployee(s,e,'2026-10-24'));assert.equal(e.employmentSegments.filter(x=>x.endDate==='2026-10-12').length,1);
 const before=JSON.stringify(e);E.reconcileEmploymentFromJobData(s,e);assert.equal(JSON.stringify(e),before);
});
test('fixed-term AL and accrued LSL payouts equal a normal termination; personal and pro-rata LSL do not pay',()=>{
 const {s,e,baseline}=setup(),pays=E.calculateEmployee(s,e.id,11),payouts=p=>p.flatMap(x=>x.rows).filter(r=>r.kind==='payout').map(r=>[r.description,r.units,r.amount,r.startDate]).sort();
 assert.deepStrictEqual(payouts(pays),payouts(baseline));assert(payouts(pays).some(r=>r[0]==='Annual Leave Payout'));assert(payouts(pays).some(r=>r[0]==='Long Service Leave Payout'));assert(!payouts(pays).some(r=>/Personal|Pro-rata/.test(r[0])));assert(pays.some(p=>p.employmentType==='Fixed Term'));assert(pays.every(p=>p.rows.filter(r=>r.kind==='payout').every(r=>r.startDate==='2026-10-11')));
});
test('casual earnings coexist with the final fixed-term pay; finalisation clears paid balances without closing casual',()=>{
 const {s,e}=setup();s.additionalEarnings.push({id:'cas-work',empId:e.id,cycleId:11,earningType:'Casual Earnings',startDate:'2026-10-12',endDate:'2026-10-12',positionNumber:'CREW',hours:4,saved:true});const before=E.calculateEmployee(s,e.id,11),casual=before.flatMap(p=>p.rows).find(r=>r.casualEarnings);assert.equal(casual.amount,150);assert(before.some(p=>p.employmentType==='Casual'));const result=E.finaliseCurrentPay(s);assert(result.payslips.some(p=>p.empId===e.id&&p.rows.some(r=>r.description==='Annual Leave Payout')));assert.equal(e.annualLeaveBalance,0);assert.equal(e.lslAccruedBalance,0);assert.equal(e.terminationDate,'');assert.equal(e.type,'Casual');assert(E.selfService.isActiveEmployee(s,e,'2026-10-24'));
 s.additionalEarnings.push({id:'next-cas-work',empId:e.id,cycleId:12,earningType:'Casual Earnings',startDate:'2026-10-26',endDate:'2026-10-26',positionNumber:'CREW',hours:5,saved:true});const next=E.calculateEmployee(s,e.id,12);assert(next.some(p=>p.rows.some(r=>r.casualEarnings&&r.amount===187.5)));assert(!next.flatMap(p=>p.rows).some(r=>/Payout/.test(r.description)));assert.equal(next.reduce((n,p)=>n+p.annualAccrual,0),0);assert(E.selfService.payslips(s,e.id).some(p=>p.finalised));const imported=D.importJson(D.exportJson(s));E.reconcileAllEmploymentFromJobData(imported);assert(E.selfService.isActiveEmployee(imported,imported.employees.find(x=>x.id===e.id),'2026-10-24'));
});
test('a later same-day termination still closes the casual record',()=>{
 const {s,e,baseline}=setup();s.jobDataRows.push({id:'close-casual',empId:e.id,action:'Termination',reason:'Voluntary Resignation',effectiveDate:'2026-10-12',effectiveSequence:2,saved:true});E.reconcileEmploymentFromJobData(s,e);assert.equal(e.terminationDate,'2026-10-12');assert(!E.selfService.isActiveEmployee(s,e,'2026-10-24'));const payouts=rows=>rows.flatMap(p=>p.rows).filter(r=>r.kind==='payout').map(r=>[r.description,r.amount]);assert.deepStrictEqual(payouts(E.calculateEmployee(s,e.id,11)),payouts(baseline));
});
if(require.main===module)console.log('PASS: '+count+' same-day casual rehire groups.');
module.exports={setup};
