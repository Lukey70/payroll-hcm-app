'use strict';
const assert=require('assert'),E=require('../payroll-engine'),D=require('../data-store'),F=require('../payroll-features').create(E),{fixture,uiFixture}=require('./self-service-v121.test');
const DATE='2026-10-24';let count=0;const test=(name,fn)=>{fn();count++;console.log('PASS: '+name);};
const bal=s=>E.projectedBalances(s,s.employees.find(e=>e.id==='worker'),E.currentCycle(s),false);
test('signed adjustments add and take all leave credits precisely, use the open period and preserve finalised history',()=>{
 const s=fixture(),before=bal(s);s.payslips.push(...E.calculateEmployee(s,'worker',1,true));const history=JSON.stringify(s.payslips);
 F.adjustAbsenceBalances(s,'payroll','worker',{annual:7.5,personal:-2.25,lslProRata:1.2345,lslAccrued:4,comment:'Credit correction'},DATE);let after=bal(s);
 for(const [key,delta]of Object.entries({annual:7.5,personal:-2.25,lslProRata:1.2345,lslAccrued:4}))assert.equal(after[key],E.round4(before[key]+delta),key);
 assert.equal(s.jobEvents.at(-1).effectiveDate,E.currentCycle(s).end);assert.equal(s.jobEvents.at(-1).actorId,'payroll');assert(s.jobEvents.at(-1).description.includes('Credit correction'));assert.equal(JSON.stringify(s.payslips),history);
 F.adjustAbsenceBalances(s,'payroll','worker',{annual:-1,personal:3,lslProRata:-0.5,lslAccrued:-1,comment:'Second correction'},DATE);const second=bal(s);assert.equal(second.lslAccrued,3);assert.equal(second.lslProRata,E.round4(after.lslProRata-0.5));assert.equal(second.annual,E.round4(after.annual-1));
 assert(E.projectedBalances(s,s.employees.find(e=>e.id==='worker'),E.cycleById(12),false).lslProRata>second.lslProRata);assert.deepStrictEqual(bal(D.importJson(D.exportJson(s))),second);
});
test('LSL entitlement date can change alone and future service still accrues',()=>{
 const s=fixture(),before=bal(s),date=E.addDays(before.lslEntitlementDate,12);F.adjustAbsenceBalances(s,'payroll','worker',{lslEntitlementDate:date,comment:'Recognised service adjustment'},DATE);const after=bal(s);assert.equal(after.lslEntitlementDate,date);assert.equal(after.annual,before.annual);assert.equal(after.personal,before.personal);assert.equal(after.lslProRata,before.lslProRata);
});
test('unauthorised, invalid, empty and excess-LSL adjustments leave the records unchanged',()=>{
 const s=fixture();for(const [actor,input]of [['worker',{annual:1,comment:'No'}],['manager',{annual:1,comment:'No'}],['payroll',{annual:NaN,comment:'Invalid'}],['payroll',{annual:Infinity,comment:'Invalid'}],['payroll',{personal:true,comment:'Invalid'}],['payroll',{annual:1,comment:''}],['payroll',{comment:'No change'}],['payroll',{lslAccrued:-1,comment:'Excess'}],['payroll',{lslEntitlementDate:'2026-02-30',comment:'Bad date'}]]){
  const before=JSON.stringify(s);assert.throws(()=>F.adjustAbsenceBalances(s,actor,'worker',input,DATE));assert.equal(JSON.stringify(s),before);
 }
});
test('shared cards contain requested order, pending reservations and full-width entitlement date',()=>{
 const b=bal(fixture()),html=E.selfService.absenceBalanceCardsHtml(b,{annual:7.5,personal:0,lslAccrued:0});const labels=['Annual Leave','Personal Leave','LSL Pro Rata','LSL Accrued','LSL Entitlement Date'];for(let i=1;i<labels.length;i++)assert(html.indexOf(labels[i-1])<html.indexOf(labels[i]));assert(html.includes('Pending requests: 7.50 hours'));assert(html.includes('absence-entitlement-card'));
});
test('Payroll Add/Take form saves deltas, retains employee and rejects storage failures atomically',()=>{
 const f=uiFixture();f.login('payroll');f.app.openPayrollManagement();f.app.showTab('absenceBalance');f.set('absenceEmp','worker');f.fire('absenceEmp');assert(f.html('absenceOutput').includes('absence-balance-cards'));assert(!f.html('absenceOutput').includes('recalculateBalances'));const before=bal(f.s);
 f.click('adjustBalances');f.set('adjAnnual','7.5');f.set('adjPersonalAction','Take');f.set('adjPersonal','1');f.click('saveAbsenceAdjust');f.set('absenceComment','Correction');f.click('saveAbsenceComment');assert.equal(bal(f.s).annual,E.round4(before.annual+7.5));assert.equal(bal(f.s).personal,E.round4(before.personal-1));assert.equal(f.nodes.get('absenceEmp').value,'worker');
 f.click('adjustBalances');f.set('adjAnnual','2');f.click('saveAbsenceAdjust');f.set('absenceComment','Failed save');const saved=JSON.stringify(f.s);f.context.DataStore.save=()=>false;f.click('saveAbsenceComment');assert.equal(JSON.stringify(f.s),saved);assert(f.errors.some(e=>e.includes('Unable to save')));
});
test('ESS and MSS balances show cards with no adjustment controls and MSS remains direct-report scoped',()=>{
 const f=uiFixture();f.ui.show('ess','leave');f.choose('data-ss-section','balances');assert(f.html('ssMain').includes('absence-balance-cards'));assert(f.html('ssMain').includes('LSL Pro Rata'));assert(!f.html('ssMain').includes('adjustBalances'));f.setUser('manager');f.ui.show('mss','leave');f.choose('data-ss-section','balances');assert(f.html('ssMain').includes('absence-balance-cards'));assert(!f.html('ssMain').includes('value="outsider"'));assert(!f.html('ssMain').includes('adjustBalances'));assert.deepStrictEqual(f.errors,[]);
});
console.log('PASS: '+count+' absence balance card and adjustment groups.');
