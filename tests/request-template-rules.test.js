'use strict';
const assert=require('assert'),D=require('../data-store'),E=require('../payroll-engine'),F=require('../payroll-features').create(E),T=require('../support-requests').create(E,E.selfService),{fixture,DATE}=require('./self-service-v121.test');
let count=0;const test=(name,fn)=>{fn();count++;console.log('PASS: '+name);};
const week={0:0,1:7.5,2:7.5,3:7.5,4:7.5,5:7.5,6:0},roster={rosterPattern:'1-week',hoursByDayWeek1:week};
const templates={Commencement:{...require('./commencement-fixture.cjs').newEmployeeDetails,reason:'New Hire Permanent',effectiveDate:'2026-11-01',employmentType:'Permanent',positionNumber:'STAFF',firstName:'New',lastName:'Employee',...roster},Movement:{reason:'Promotion',effectiveDate:'2026-11-01',positionNumber:'STAFF',temporary:'Permanent',...roster},Variation:{reason:'Work Schedule Adjustment',effectiveDate:'2026-11-01',...roster},Termination:{reason:'Voluntary Resignation',lastWorkingDay:'2026-10-31'}};
function state(){const s=fixture();s.positions.find(p=>p.positionNumber==='STAFF').reportsTo=['MGR','MGR2'];return s;}
test('all structured request types submit without subject or description, use default subjects and preserve Job Data',()=>{
 const s=state(),before=JSON.stringify(s.jobDataRows);for(const [requestType,template]of Object.entries(templates)){const c=T.submit(s,'manager',{requestType,template,raisedFor:requestType==='Commencement'?'new-employee':'worker',additionalComments:'Additional context'},'mss',DATE);assert.equal(c.subject,requestType+' Request');assert.equal(c.description,'');assert.equal(c.additionalComments,'Additional context');}assert.equal(JSON.stringify(s.jobDataRows),before);
});
test('default subjects are enforced by the service, while general enquiries still require both fields',()=>{
 const s=state();const c=T.submit(s,'manager',{requestType:'Termination',template:templates.Termination,raisedFor:'worker',subject:'Spoofed',description:'Ignored'},'mss',DATE);assert.equal(c.subject,'Termination Request');assert.equal(c.description,'');for(const fields of [{},{subject:'Subject'},{description:'Details'}])assert.throws(()=>T.submit(s,'worker',fields,'ess',DATE),/Subject and Description/);
});
test('Reports To is derived from active Position Data, including multiple reporting positions and no supervisor',()=>{
 const s=state(),data={...templates.Commencement,reportsTo:'SPOOFED'};assert.equal(F.validateTemplate('Commencement',data,'new-employee',s).reportsTo,'MGR, MGR2');s.positions.find(p=>p.positionNumber==='STAFF').reportsTo='';assert.equal(F.validateTemplate('Commencement',data,'new-employee',s).reportsTo,'');s.positions.find(p=>p.positionNumber==='STAFF').active=false;assert.throws(()=>F.validateTemplate('Commencement',data,'new-employee',s),/active position/);
});
test('one-week and two-week rosters retain numeric daily hours and allow an alternating week off',()=>{
 const s=state(),one=F.validateTemplate('Movement',templates.Movement,'worker',s);assert.deepStrictEqual(one.hoursByDayWeek2,week);assert.equal(typeof one.hoursByDayWeek1[1],'number');const zero=Object.fromEntries(Object.keys(week).map(d=>[d,0])),two=F.validateTemplate('Movement',{...templates.Movement,rosterPattern:'2-week',hoursByDayWeek1:zero,hoursByDayWeek2:week},'worker',s);assert.equal(Object.values(two.hoursByDayWeek1).reduce((a,b)=>a+b),0);assert.deepStrictEqual(two.hoursByDayWeek2,week);
});
test('empty, free-text, malformed and invalid daily rosters are rejected; two weeks require both grids',()=>{
 const s=state();for(const hoursByDayWeek1 of [undefined,'Mon-Fri 7.5',[],{...week,1:''},{...week,1:-1},{...week,1:25},{...week,1:NaN},{...week,1:Infinity},{...week,1:true},Object.fromEntries(Object.keys(week).map(d=>[d,0]))])assert.throws(()=>F.validateTemplate('Commencement',{...templates.Commencement,hoursByDayWeek1},'new-employee',s),/roster|hours/);assert.throws(()=>F.validateTemplate('Movement',{...templates.Movement,rosterPattern:'2-week'},'worker',s),/week 2/);
});
test('casual requests follow Job Data with a zero fixed roster, without requiring hours',()=>{
 const s=state(),c=F.validateTemplate('Commencement',{...templates.Commencement,reason:'New Hire Casual',employmentType:'Casual',rosterPattern:'2-week',hoursByDayWeek1:week},'new-employee',s);assert.equal(c.rosterPattern,'1-week');assert(Object.values(c.hoursByDayWeek1).every(h=>h===0));assert(Object.values(c.hoursByDayWeek2).every(h=>h===0));
});
test('termination requires an allowed reason and valid Last Working Day, without an effective date or other fields',()=>{
 const s=state();for(const reason of require('../payroll-features').REASONS.Termination)assert.deepStrictEqual(F.validateTemplate('Termination',{lastWorkingDay:'2026-10-31',reason,effectiveDate:'2026-12-01'},'worker',s),{jobRecord:0,recordMode:'existing',reason,lastWorkingDay:'2026-10-31'});
 for(const reason of ['',undefined,'Unknown'])assert.throws(()=>F.validateTemplate('Termination',{lastWorkingDay:'2026-10-31',reason},'worker',s),/termination reason/);
 for(const lastWorkingDay of ['',undefined,'bad','2026-02-30'])assert.throws(()=>F.validateTemplate('Termination',{reason:'Redundant',lastWorkingDay},'worker',s),/working day/);assert.throws(()=>F.validateTemplate('Termination',templates.Termination,'new-employee',s),/existing employee/);
});
test('roster variations use daily grids; other variations retain change details and no roster requirement',()=>{
 const s=state();assert(F.validateTemplate('Variation',templates.Variation,'worker',s).hoursByDayWeek1);assert.throws(()=>F.validateTemplate('Variation',{reason:'Pay Rate Change',effectiveDate:'2026-11-01'},'worker',s),/changes/);const result=F.validateTemplate('Variation',{reason:'Pay Rate Change',effectiveDate:'2026-11-01',changes:'Change rate to $45'},'worker',s);assert(!result.hoursByDayWeek1);
});
test('manager-only restrictions and backup/import preserve structured roster records',()=>{
 const s=state();for(const [id,area]of [['worker','ess'],['payroll','payroll']])assert.throws(()=>T.submit(s,id,{raisedBy:'worker',raisedFor:'worker',requestType:'Termination',template:templates.Termination},area,DATE),/Only managers/);T.submit(s,'manager',{raisedFor:'worker',requestType:'Movement',template:templates.Movement},'mss',DATE);assert.deepStrictEqual(D.importJson(D.exportJson(s)).supportRequests,s.supportRequests);
});
test('new employee commencements require all four onboarding sections and validate their fields',()=>{
 const s=state(),data=JSON.parse(JSON.stringify(templates.Commencement));for(const section of ['personalDetails','taxDetails','superDetails','bankDetails']){const invalid={...data};delete invalid[section];assert.throws(()=>F.validateTemplate('Commencement',invalid,'new-employee',s),/details/);}
 for(const [section,key,value]of [['personalDetails','firstName',''],['personalDetails','dateOfBirth','2026-02-30'],['personalDetails','email','bad'],['personalDetails','phone',''],['taxDetails','taxFileNumber','123'],['taxDetails','claimTaxFreeThreshold','true'],['taxDetails','stsl',undefined],['superDetails','memberNumber',''],['superDetails','abn','123'],['bankDetails','bsb','123'],['bankDetails','accountNumber','abc'],['bankDetails','accountName','']]){const invalid=JSON.parse(JSON.stringify(data));invalid[section][key]=value;assert.throws(()=>F.validateTemplate('Commencement',invalid,'new-employee',s),section+'.'+key);}
});
test('existing employee commencements derive only their identity and ignore submitted personal, tax, bank and super details',()=>{
 const s=state(),result=F.validateTemplate('Commencement',{...templates.Commencement,employeeId:'outsider',employeeName:'Spoofed',firstName:'Spoofed',dateOfBirth:'invalid ignored field'},'worker',s);assert.equal(result.employeeId,'worker');assert.equal(result.employeeName,'worker Test');for(const key of ['firstName','lastName','dateOfBirth','email','address','personalDetails','taxDetails','superDetails','bankDetails'])assert(!Object.hasOwn(result,key),key);assert(result.hoursByDayWeek1);assert.equal(result.positionNumber,'STAFF');
});
test('new onboarding preserves leading zeros, explicit tax choices and authoritative fund details, allowing an explicit missing TFN',()=>{
 const s=state();s.superFunds.push({id:'known',usi:'EXAMPLEUSI',fundName:'Known Super',abn:'98765432101',active:true});const data=JSON.parse(JSON.stringify(templates.Commencement));data.bankDetails.bsb='012-345';data.superDetails.fundName='Spoofed';data.superDetails.abn='000';data.taxDetails.tfnNotProvided=true;delete data.taxDetails.taxFileNumber;
 const result=F.validateTemplate('Commencement',data,'new-employee',s);assert.equal(result.bankDetails.bsb,'012345');assert.equal(result.bankDetails.accountNumber,'0012345678');assert.equal(result.superDetails.memberNumber,'000456');assert.equal(result.superDetails.fundName,'Known Super');assert.equal(result.superDetails.abn,'98765432101');assert.equal(result.superDetails.fundId,'known');assert.equal(result.taxDetails.taxFileNumber,'');assert.equal(result.taxDetails.claimTaxFreeThreshold,true);assert.equal(result.taxDetails.stsl,false);s.superFunds[0].active=false;assert.throws(()=>F.validateTemplate('Commencement',data,'new-employee',s),/active super fund/);
});
test('submitting onboarding stores request details without changing employee, job, tax, super or bank records',()=>{
 const s=state(),keys=['employees','jobDataRows','taxDetails','superDetails','superFunds','bankDetails','schedules','payRates'],before=JSON.stringify(keys.map(k=>s[k]));const c=T.submit(s,'manager',{raisedFor:'new-employee',requestType:'Commencement',template:templates.Commencement},'mss',DATE);assert.equal(c.template.personalDetails.firstName,'New');assert.equal(c.template.bankDetails.accountNumber,'0012345678');assert.equal(JSON.stringify(keys.map(k=>s[k])),before);assert(!JSON.stringify(s.alerts).includes('123456789'));assert(!JSON.stringify(s.auditLog).includes('0012345678'));assert.deepStrictEqual(D.importJson(D.exportJson(s)).supportRequests,s.supportRequests);
});
test('new-employee preferred name is optional, trimmed and retained without changing legal names',()=>{
 const s=state(),data=JSON.parse(JSON.stringify(templates.Commencement));data.personalDetails.preferredName='  Alex  ';
 const result=F.validateTemplate('Commencement',data,'new-employee',s);assert.equal(result.personalDetails.preferredName,'Alex');assert.equal(result.personalDetails.firstName,'New');assert.equal(result.personalDetails.lastName,'Employee');
 data.personalDetails.preferredName=' ';assert(!Object.hasOwn(F.validateTemplate('Commencement',data,'new-employee',s).personalDetails,'preferredName'));
 data.personalDetails.preferredName={name:'bad'};assert.throws(()=>F.validateTemplate('Commencement',data,'new-employee',s),/preferred name/);
 data.personalDetails.preferredName='A'.repeat(256);assert.throws(()=>F.validateTemplate('Commencement',data,'new-employee',s),/too long/);
 assert(!Object.hasOwn(F.validateTemplate('Commencement',data,'worker',s),'personalDetails'));
});
test('temporary work schedule requests retain both rosters and the return date without changing Job Data',()=>{
 const s=state(),before=JSON.stringify(s.jobDataRows),input={...templates.Variation,scheduleDuration:'Temporary',returnEffectiveDate:'2026-12-01',returnRoster:{rosterPattern:'2-week',hoursByDayWeek1:week,hoursByDayWeek2:{...week,1:4}}};
 const c=T.submit(s,'manager',{raisedFor:'worker',requestType:'Variation',template:input},'mss',DATE);assert.equal(c.template.returnEffectiveDate,'2026-12-01');assert.equal(c.template.returnRoster.hoursByDayWeek2[1],4);assert.equal(c.template.hoursByDayWeek1[1],7.5);assert.equal(JSON.stringify(s.jobDataRows),before);assert.deepStrictEqual(D.importJson(D.exportJson(s)).supportRequests,s.supportRequests);
});
test('temporary schedule return requires a later valid date and complete valid roster',()=>{
 const s=state(),input={...templates.Variation,scheduleDuration:'Temporary',returnEffectiveDate:'2026-12-01',returnRoster:{rosterPattern:'1-week',hoursByDayWeek1:week}};
 for(const date of [undefined,'','2026-02-30','2026-11-01','2026-10-31'])assert.throws(()=>F.validateTemplate('Variation',{...input,returnEffectiveDate:date},'worker',s),/return effective date/i);
 for(const roster of [undefined,{}, {rosterPattern:'text'}, {rosterPattern:'1-week',hoursByDayWeek1:{...week,1:-1}},{rosterPattern:'1-week',hoursByDayWeek1:{...week,1:''}},{rosterPattern:'1-week',hoursByDayWeek1:Object.fromEntries(Object.keys(week).map(d=>[d,0]))},{rosterPattern:'2-week',hoursByDayWeek1:week}])assert.throws(()=>F.validateTemplate('Variation',{...input,returnRoster:roster},'worker',s),/return|hours/);
 const permanent=F.validateTemplate('Variation',{...input,scheduleDuration:'Permanent'},'worker',s);assert(!Object.hasOwn(permanent,'returnEffectiveDate'));assert(!Object.hasOwn(permanent,'returnRoster'));assert.equal(permanent.scheduleDuration,'Permanent');assert.doesNotThrow(()=>F.validateTemplate('Variation',templates.Variation,'worker',s));
});
test('structured requests use an explicit existing record, auto-fill single records and queue new concurrent commencements',()=>{
 const s=state(),{addJob}=require('./concurrent-jobs.test');assert.equal(F.validateTemplate('Variation',templates.Variation,'worker',s).jobRecord,0);assert.equal(F.validateTemplate('Commencement',templates.Commencement,'new-employee',s).jobRecord,0);addJob(s,'worker');assert.throws(()=>F.validateTemplate('Variation',templates.Variation,'worker',s),/record number/);assert.equal(F.validateTemplate('Variation',{...templates.Variation,jobRecord:1},'worker',s).jobRecord,1);assert.throws(()=>F.validateTemplate('Variation',{...templates.Variation,jobRecord:99},'worker',s),/record number/);const before=JSON.stringify(s.jobRecords),request=F.validateTemplate('Commencement',{...templates.Commencement,jobRecord:'new'},'worker',s);assert.equal(request.recordMode,'new-concurrent');assert.equal(request.jobRecord,'new');assert.equal(JSON.stringify(s.jobRecords),before);assert.throws(()=>F.validateTemplate('Termination',{...templates.Termination,jobRecord:'new'},'worker',s),/commencement/);
});
test('manager draft plan converts inclusive last working days and preserves start and return dates',()=>{
 const s=state(),before=JSON.stringify(s.jobDataRows),submit=(requestType,template)=>T.submit(s,'manager',{requestType,template,raisedFor:'worker'},'mss',DATE);
 const fixed=submit('Commencement',{...templates.Commencement,reason:'New Hire Fixed-Term',employmentType:'Fixed Term',effectiveDate:'2026-11-01',contractEndDate:'2026-12-31',jobRecord:'new'});
 const plan=F.jobDataDraftPlan(s,fixed,'worker',1);
 assert.deepEqual(plan.map(r=>[r.jobRecord,r.action,r.effectiveDate,r.reason,r.saved]),[[1,'Commencement','2026-11-01','New Hire Fixed-Term',false],[1,'Termination','2027-01-01','Expiry of Fixed Term',false]]);
 assert.equal(fixed.template.contractEndDate,'2026-12-31');
 const term=submit('Termination',templates.Termination);assert.equal(F.jobDataDraftPlan(s,term,'worker',0)[0].effectiveDate,'2026-11-01');
 const move=submit('Movement',{...templates.Movement,reason:'Acting Same Level',temporary:'Temporary',positionNumber:'CREW',returnDate:'2026-11-20'});
 assert.deepEqual(F.jobDataDraftPlan(s,move,'worker',0).map(r=>[r.effectiveDate,r.positionNumber]),[['2026-11-01','CREW'],['2026-11-20','STAFF']]);
 const variation=submit('Variation',{...templates.Variation,scheduleDuration:'Temporary',returnEffectiveDate:'2026-11-30',returnRoster:{rosterPattern:'2-week',hoursByDayWeek1:week,hoursByDayWeek2:{...week,1:4}}});
 const v=F.jobDataDraftPlan(s,variation,'worker',0);assert.equal(v[1].effectiveDate,'2026-11-30');assert.equal(v[1].hoursByDayWeek2[1],4);assert.equal(JSON.stringify(s.jobDataRows),before);
 assert.throws(()=>F.jobDataDraftPlan(s,{...term,source:'ess'},'worker',0),/manager/);
 assert.throws(()=>F.jobDataDraftPlan(s,{...fixed,template:{...fixed.template,employmentType:'Permanent'}},'worker',1),/do not match/);
 assert.throws(()=>F.jobDataDraftPlan(s,{...fixed,template:{...fixed.template,reason:'New Fixed Term Contract'}},'worker',1),/contract extension/);
 assert.throws(()=>F.jobDataDraftPlan(s,{...term,template:{...term.template,lastWorkingDay:'2026-02-30'}},'worker',0),/valid last working day/);
});
test('incomplete linked Job Data changes block finalisation only when the companion is due',()=>{
 const s=state(),c=E.currentCycle(s),rec=E.jobRecords.add(s,'payroll','worker');
 const req=T.submit(s,'manager',{requestType:'Commencement',raisedFor:'worker',template:{...templates.Commencement,jobRecord:'new',reason:'New Hire Fixed-Term',employmentType:'Fixed Term',effectiveDate:c.start,contractEndDate:c.end}},'mss',DATE);
 const [main,expiry]=F.jobDataDraftPlan(s,req,'worker',rec.recordNumber);
 s.jobDataRows.push({...main,id:'linked-main',saved:true,effectiveSequence:0},{...expiry,id:'draft-expiry',saved:false,effectiveSequence:0});
 assert.equal(expiry.effectiveDate,E.addDays(c.end,1));
 assert.deepEqual(E.jobRecords.requestCompanionErrors(s,{...c,end:E.addDays(c.end,-1)}),[]);
 // A different job's termination cannot satisfy the linked expiry.
 s.jobDataRows.push({...expiry,id:'other-job',jobRecord:0,saved:true,effectiveSequence:0});
 const issues=E.jobRecords.requestCompanionErrors(s,c);assert.equal(issues.length,1);assert(issues[0].message.includes(req.number)&&issues[0].message.includes('Job 1'));
 const before=JSON.stringify(s);assert.throws(()=>E.finaliseCurrentPay(s),/fixed-term expiry/);assert.equal(JSON.stringify(s),before);
 s.jobDataRows.find(r=>r.id==='draft-expiry').saved=true;assert.deepEqual(E.jobRecords.requestCompanionErrors(s,c),[]);
});
test('a due temporary roster or movement requires a saved return or a superseding change on the same job',()=>{
 for(const type of ['Variation','Movement']){
  const s=state(),c=E.currentCycle(s),start=E.addDays(c.end,-5),end=E.addDays(c.end,-1);
  const template=type==='Variation'?{...templates.Variation,effectiveDate:start,scheduleDuration:'Temporary',returnEffectiveDate:end,returnRoster:roster}:{...templates.Movement,reason:'Acting Same Level',temporary:'Temporary',effectiveDate:start,returnDate:end};
  const request=T.submit(s,'manager',{requestType:type,template,raisedFor:'worker'},'mss',DATE);
  const [main,back]=F.jobDataDraftPlan(s,request,'worker',0);s.jobDataRows.push({...main,id:'linked-main',saved:true});
  assert.equal(E.jobRecords.requestCompanionErrors(s,{...c,end:E.addDays(end,-1)}).length,0);
  assert.equal(E.jobRecords.requestCompanionErrors(s,c).length,1);
  s.jobDataRows.push({...back,id:'manual-return',sourceRequestCaseId:undefined,sourceRequestStep:undefined,saved:true});
  assert.equal(E.jobRecords.requestCompanionErrors(s,c).length,0);
 }
});
test('processed resolution notes require every saved step on the same job and use the Perth processing date',()=>{
 const s=state(),request=T.submit(s,'manager',{requestType:'Commencement',raisedFor:'worker',template:{...templates.Commencement,reason:'New Hire Fixed-Term',employmentType:'Fixed Term',contractEndDate:'2026-12-31',jobRecord:0}},'mss',DATE);
 const [main,expiry]=F.jobDataDraftPlan(s,request,'worker',0);s.jobDataRows.push({...main,id:'main',saved:true},{...expiry,id:'expiry'});
 request.history.push({action:'Job Data saved',at:'2026-10-24T17:00:00Z'});
 assert.equal(T.jobDataResolutionNote(s,request),'');
 const row=s.jobDataRows.at(-1);row.saved=true;row.jobRecord=1;assert.equal(T.jobDataResolutionNote(s,request),'');
 row.jobRecord=0;assert.equal(T.jobDataResolutionNote(s,request),'Request processed 25/10/2026');
 assert.equal(T.jobDataResolutionNote(s,{requestType:'General Enquiry'}),'');
});
test('only the requester can resubmit selected correction fields and Job Data stays unchanged',()=>{
 const s=state(),c=T.submit(s,'manager',{requestType:'Termination',raisedFor:'worker',template:templates.Termination},'mss',DATE);
 const original=JSON.stringify(s.jobDataRows);
 assert.throws(()=>T.returnForCorrection(s,'manager',c.id,['lastWorkingDay'],'Check this date',DATE),/Payroll/);
 T.returnForCorrection(s,'payroll',c.id,['lastWorkingDay'],'Confirm the final day',DATE);
 const id=c.correctionPending.id;assert.equal(c.status,'Awaiting Correction');assert.equal(c.template.lastWorkingDay,'2026-10-31');
 T.assign(s,'payroll',c.id,'payroll',DATE);assert.equal(c.status,'Awaiting Correction');
 T.message(s,'manager',c.id,'I will check.',[],'own',DATE);assert.equal(c.status,'Awaiting Correction');
 assert.throws(()=>T.status(s,'payroll',c.id,'Resolved','Done',DATE),/corrections/);
 assert.throws(()=>T.submitCorrection(s,'otherManager',c.id,id,{lastWorkingDay:'2026-11-02'},'mss',DATE),/access/);
 assert.throws(()=>T.submitCorrection(s,'manager',c.id,id,{lastWorkingDay:'2026-11-02'},'ess',DATE),/Manager Self Service/);
 assert.throws(()=>T.submitCorrection(s,'manager',c.id,id,{lastWorkingDay:'2026-11-02',reason:'Deceased'},'mss',DATE),/only the requested/);
 assert.throws(()=>T.submitCorrection(s,'manager',c.id,id,{lastWorkingDay:'2026-02-30'},'mss',DATE),/valid last working day/);
 T.submitCorrection(s,'manager',c.id,id,{lastWorkingDay:'2026-11-02'},'mss',DATE);
 assert.equal(c.status,'Open');assert.equal(c.template.lastWorkingDay,'2026-11-02');assert.equal(T.templateAtRevision(c,0).lastWorkingDay,'2026-10-31');assert.equal(c.jobDataStepRevisions.main,1);
 assert.equal(F.jobDataDraftPlan(s,c,'worker',0)[0].effectiveDate,'2026-11-03');assert.equal(JSON.stringify(s.jobDataRows),original);
 assert.deepEqual(c.corrections[0].changes.map(x=>[x.before,x.after]),[['2026-10-31','2026-11-02']]);assert(s.alerts.some(a=>a.recipientIds.includes('payroll')&&a.key==='support-corrected:'+id));
 assert.throws(()=>T.submitCorrection(s,'manager',c.id,id,{lastWorkingDay:'2026-11-03'},'mss',DATE),/no longer current/);
});
test('correcting saved expiry flags only the affected row and blocks the affected pay until review',()=>{
 const s=state(),cycle=E.currentCycle(s),c=T.submit(s,'manager',{requestType:'Commencement',raisedFor:'worker',template:{...templates.Commencement,reason:'Rehire Fixed-Term',employmentType:'Fixed Term',effectiveDate:cycle.start,contractEndDate:cycle.end,jobRecord:0}},'mss',DATE);
 const [main,expiry]=F.jobDataDraftPlan(s,c,'worker',0);s.jobDataRows.push({...main,id:'linked-main',saved:true},{...expiry,id:'linked-expiry',saved:true});
 c.history.push({action:'Job Data saved',at:'2026-10-24T12:00:00Z'});
 assert(T.jobDataResolutionNote(s,c));T.returnForCorrection(s,'payroll',c.id,['contractEndDate'],'Update final day',DATE);
 assert(E.jobRecords.requestCompanionErrors(s,cycle).some(r=>/awaiting correction/.test(r.message)));
 T.submitCorrection(s,'manager',c.id,c.correctionPending.id,{contractEndDate:E.addDays(cycle.end,2)},'mss',DATE);
 assert.deepEqual(c.jobDataStepRevisions,{expiry:1});assert.equal(T.jobDataResolutionNote(s,c),'');
 assert(E.jobRecords.requestCompanionErrors(s,cycle).some(r=>/corrected Job Data draft/.test(r.message)));
 assert.throws(()=>T.status(s,'payroll',c.id,'Resolved','Done',DATE),/corrected Job Data/);
 assert.equal(s.jobDataRows.find(r=>r.id==='linked-expiry').effectiveDate,expiry.effectiveDate);
});
test('corrections validate two-week schedules and withdrawn requests cannot be submitted',()=>{
 const s=state(),c=T.submit(s,'manager',{requestType:'Variation',raisedFor:'worker',template:templates.Variation},'mss',DATE);
 T.returnForCorrection(s,'payroll',c.id,['roster'],'Please correct the work schedule.',DATE);const first=c.correctionPending.id;
 assert.throws(()=>T.withdrawCorrection(s,'manager',c.id,first,DATE),/Payroll/);
 T.withdrawCorrection(s,'payroll',c.id,first,DATE);assert.equal(c.status,'New');
 assert.throws(()=>T.submitCorrection(s,'manager',c.id,first,{roster},'mss',DATE),/no longer current/);
 T.returnForCorrection(s,'payroll',c.id,['roster'],'Confirm both weeks.',DATE);
 const input={rosterPattern:'2-week',hoursByDayWeek1:{...week,1:6},hoursByDayWeek2:{...week,1:4}};
 T.submitCorrection(s,'manager',c.id,c.correctionPending.id,{roster:input},'mss',DATE);
 assert.equal(c.template.hoursByDayWeek2[1],4);assert.equal(T.templateAtRevision(c,0).hoursByDayWeek1[1],7.5);
 assert.equal(c.corrections[0].changes[0].before.rosterPattern,'1-week');
 assert.equal(c.corrections[0].changes[0].after.rosterPattern,'2-week');
});
console.log(`PASS: ${count} simplified request template rule groups.`);
