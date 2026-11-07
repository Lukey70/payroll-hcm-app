'use strict';
const assert=require('assert'),E=require('../payroll-engine'),D=require('../data-store'),{fixture,uiFixture,DATE}=require('./self-service-v121.test'),U=E.urgentPay;
let count=0;function test(name,fn){fn();count++;console.log('PASS: '+name);}
function setup(){const s=fixture();s.bankDetails.push({id:'bank',empId:'worker',effectiveDate:'2026-10-09',effectiveSequence:0,bsb:'012345',accountNumber:'00012345',accountName:'Worker, Test',saved:true});s.deductions.push({id:'urgent1',empId:'worker',deductionType:'Urgent Pay',startDate:'2026-10-09',endDate:'2026-10-22',amount:100,percentage:'',saved:true,deleted:false});return s;}
test('Urgent Pay reduces net once without changing gross, tax, super or next-period deductions',()=>{
 const s=setup(),base=fixture(),a=E.calculateEmployee(s,'worker',11)[0],b=E.calculateEmployee(base,'worker',11)[0];assert.equal(a.gross,b.gross);assert.equal(a.tax,b.tax);assert.equal(a.superAmt,b.superAmt);assert.equal(a.net,b.net-100);assert(a.postTaxDeductions.some(d=>d.description==='Urgent Pay'&&d.amount===100));assert.equal(E.calculateEmployee(s,'worker',12)[0].net,E.calculateEmployee(base,'worker',12)[0].net);
 for(const bad of [{amount:-1},{amount:0},{amount:Infinity},{amount:1.001},{percentage:2},{endDate:''},{endDate:'2026-11-05'}])assert.throws(()=>U.validateDeduction(s,{...s.deductions[0],...bad}));
});
test('preview is read-only; running snapshots bank accounts, locks deductions and excludes repeat payments',()=>{
 const s=setup(),before=JSON.stringify(s),p=U.preview(s,'payroll',11,DATE,DATE);assert.equal(JSON.stringify(s),before);assert.equal(p.total,100);const batch=U.run(s,'payroll',11,DATE,p.signature,DATE);assert(U.locked(s,s.deductions[0]));assert.equal(U.pending(s,11).length,0);assert.throws(()=>U.run(s,'payroll',11,DATE,p.signature,DATE),/no saved/);const csv=U.csv(s,'payroll',batch.id,DATE);assert(csv.includes('"012345","00012345","Worker, Test","100.00"'));s.bankDetails[0].accountNumber='999999';assert.equal(U.csv(s,'payroll',batch.id,DATE),csv);const copy=D.importJson(D.exportJson(s));assert.equal(U.csv(copy,'payroll',batch.id,DATE),csv);
 for(const change of [{amount:101},{deleted:true},{endDate:''},{deductionType:'Union Fees'}])assert.throws(()=>U.validateDraftSet(s,'worker',[{...s.deductions[0],...change}]),/cannot be changed/);assert.throws(()=>U.validateDraftSet(s,'worker',[]));U.validateDraftSet(s,'worker',D.clone(s.deductions));
});
test('batch run rejects stale previews, missing bank details, invalid amounts and excess deductions atomically',()=>{
 const s=setup(),p=U.preview(s,'payroll',11,DATE,DATE);s.bankDetails[0].accountName='Changed';assert.throws(()=>U.run(s,'payroll',11,DATE,p.signature,DATE),/changed/);assert(!U.locked(s,s.deductions[0]));s.bankDetails=[];assert.throws(()=>U.preview(s,'payroll',11,DATE,DATE),/bank/);assert.equal((s.urgentPayBatches||[]).length,0);const huge=setup();huge.deductions[0].amount=999999999;assert.throws(()=>U.preview(huge,'payroll',11,DATE,DATE),/exceed/);assert.throws(()=>U.preview(setup(),'worker',11,DATE,DATE),/access/);assert.throws(()=>U.preview(setup(),'payroll',11,'2026-10-01',DATE),/Payment date/);
});
test('unprocessed urgent pay blocks regular finalisation; processed pay finalises without extra payslips',()=>{
 const s=setup(),before=JSON.stringify(s);assert.throws(()=>E.finaliseCurrentPay(s),/urgent pay cycle/);assert.equal(JSON.stringify(s),before);const p=U.preview(s,'payroll',11,DATE,DATE);U.run(s,'payroll',11,DATE,p.signature,DATE);const result=E.finaliseCurrentPay(s);assert.equal(result.finalisedCycle.id,11);assert.equal(s.urgentPayBatches.length,1);assert(s.payslips.some(p=>p.empId==='worker'&&p.postTaxDeductions.some(d=>d.description==='Urgent Pay')));assert.throws(()=>U.preview(s,'payroll',11,DATE,DATE),/open pay period/);
});
test('the deduction form fixes urgent pay to one period and marks processed rows read-only',()=>{
 const f=uiFixture();f.login('payroll');f.app.openPayrollManagement();f.app.showTab('deductions');f.set('dedEmp','worker');f.fire('dedEmp');f.click('addDeductionBtn');f.set('dedType','Urgent Pay');f.fire('dedType');assert.equal(f.nodes.get('dedEnd').value,E.cycleById(11).end);assert(f.nodes.get('dedEnd').disabled);assert(f.nodes.get('dedPercentage').disabled);f.set('dedAmount','100');f.click('stageDeduction');f.click('saveDeductionsBtn');f.timeouts.find(t=>t.ms===700).fn();assert.equal(f.s.deductions[0].deductionType,'Urgent Pay');
});
test('on-call earnings support normal Additional Earnings and scoped manager entry with the fixed $22.50 rate',()=>{
 const s=fixture(),S=E.selfService;assert(S.EARNINGS.includes('On-call Allowance'));const a=S.saveAdditional(s,'manager',{empId:'worker',cycleId:11,earningType:'On-call Allowance',startDate:'2026-10-12',endDate:'2026-10-12',hours:12,unitRate:5,ote:true},DATE);assert.equal(a.amount,270);assert.equal(a.ote,false);assert.equal(a.unitRate,22.5);assert.equal(S.additionalAmount(s,a),270);const line=E.calculateEmployee(s,'worker',11)[0].rows.find(r=>r.description==='On-call Allowance');assert.equal(line.amount,270);assert.equal(line.rate,22.5);assert.equal(line.accruesLeave,false);assert.equal(line.ote,false);assert.throws(()=>S.saveAdditional(s,'otherManager',{...a,id:undefined},DATE),/access/);assert.equal(S.saveAdditional(s,'manager',{...a,unitRate:999},DATE).unitRate,22.5);assert.throws(()=>S.saveAdditional(s,'manager',{...a,hours:25},DATE),/covered period/);
});
test('stale deduction drafts cannot overwrite a processed batch and duplicate IDs cannot pay twice',()=>{
 const s=setup(),stale=D.clone(s.deductions),p=U.preview(s,'payroll',11,DATE,DATE);U.run(s,'payroll',11,DATE,p.signature,DATE);assert.throws(()=>U.validateDraftSet(s,'worker',stale),/cannot be changed/);assert.throws(()=>U.validateDraftSet(s,'worker',[s.deductions[0],s.deductions[0]]),/Duplicate/);
 const duplicate=setup();duplicate.deductions.push({...duplicate.deductions[0]});assert.throws(()=>U.preview(duplicate,'payroll',11,DATE,DATE),/Duplicate/);
});
test('fixed on-call rate ignores open-entry overrides and preserves historical finalised rates',()=>{
 const s=fixture(),a={id:'call',empId:'worker',cycleId:11,earningType:'On-call Allowance',startDate:'2026-10-12',endDate:'2026-10-12',hours:2,unitRate:999,amount:999,saved:true};s.additionalEarnings.push(a);
 let line=E.calculateEmployee(s,'worker',11)[0].rows.find(r=>r.description==='On-call Allowance');assert.equal(line.amount,45);assert.equal(line.rate,22.5);
 a.unitRate=5;a.amount=10;a.ote=true;s.finalisedCycles['11']=true;line=E.calculateEmployee(s,'worker',11)[0].rows.find(r=>r.description==='On-call Allowance');assert.equal(line.amount,10);assert.equal(line.rate,5);assert.equal(line.ote,true);
});
test('finalisation freezes the configured on-call rate and does not create a later reversal',()=>{
 const s=fixture();s.additionalEarnings.push({id:'open-old-rate',empId:'worker',cycleId:11,earningType:'On-call Allowance',startDate:'2026-10-12',endDate:'2026-10-12',hours:2,unitRate:5,amount:10,ote:true,saved:true});
 E.finaliseCurrentPay(s);assert.equal(s.additionalEarnings[0].unitRate,22.5);assert.equal(s.additionalEarnings[0].amount,45);assert.equal(s.additionalEarnings[0].ote,false);
 const next=E.calculateEmployee(s,'worker',12);assert(!next.flatMap(p=>p.rows).some(r=>r.description==='On-call Allowance Retro'));
 const a=E.selfService.saveAdditional(s,'manager',{empId:'worker',cycleId:11,earningType:'On-call Allowance',startDate:'2026-10-13',endDate:'2026-10-13',hours:1,unitRate:999},DATE);assert.equal(a.unitRate,22.5);assert.equal(a.amount,22.5);
});
console.log('PASS: '+count+' urgent-pay and on-call groups.');
