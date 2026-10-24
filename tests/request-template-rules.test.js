'use strict';
const assert=require('assert'),D=require('../data-store'),E=require('../payroll-engine'),F=require('../payroll-features').create(E),T=require('../support-requests').create(E,E.selfService),{fixture,DATE}=require('./self-service-v121.test');
let count=0;const test=(name,fn)=>{fn();count++;console.log('PASS: '+name);};
const week={0:0,1:7.5,2:7.5,3:7.5,4:7.5,5:7.5,6:0},roster={rosterPattern:'1-week',hoursByDayWeek1:week};
const templates={Commencement:{reason:'New Hire Permanent',effectiveDate:'2026-11-01',employmentType:'Permanent',positionNumber:'STAFF',firstName:'New',lastName:'Employee',...roster},Movement:{reason:'Promotion',effectiveDate:'2026-11-01',positionNumber:'STAFF',temporary:'Permanent',...roster},Variation:{reason:'Work Schedule Adjustment',effectiveDate:'2026-11-01',...roster},Termination:{reason:'Voluntary Resignation',lastWorkingDay:'2026-10-31'}};
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
 const s=state();for(const reason of require('../payroll-features').REASONS.Termination)assert.deepStrictEqual(F.validateTemplate('Termination',{lastWorkingDay:'2026-10-31',reason,effectiveDate:'2026-12-01'},'worker',s),{reason,lastWorkingDay:'2026-10-31'});
 for(const reason of ['',undefined,'Unknown'])assert.throws(()=>F.validateTemplate('Termination',{lastWorkingDay:'2026-10-31',reason},'worker',s),/termination reason/);
 for(const lastWorkingDay of ['',undefined,'bad','2026-02-30'])assert.throws(()=>F.validateTemplate('Termination',{reason:'Redundant',lastWorkingDay},'worker',s),/working day/);assert.throws(()=>F.validateTemplate('Termination',templates.Termination,'new-employee',s),/existing employee/);
});
test('roster variations use daily grids; other variations retain change details and no roster requirement',()=>{
 const s=state();assert(F.validateTemplate('Variation',templates.Variation,'worker',s).hoursByDayWeek1);assert.throws(()=>F.validateTemplate('Variation',{reason:'Pay Rate Change',effectiveDate:'2026-11-01'},'worker',s),/changes/);const result=F.validateTemplate('Variation',{reason:'Pay Rate Change',effectiveDate:'2026-11-01',changes:'Change rate to $45'},'worker',s);assert(!result.hoursByDayWeek1);
});
test('manager-only restrictions and backup/import preserve structured roster records',()=>{
 const s=state();for(const [id,area]of [['worker','ess'],['payroll','payroll']])assert.throws(()=>T.submit(s,id,{raisedBy:'worker',raisedFor:'worker',requestType:'Termination',template:templates.Termination},area,DATE),/Only managers/);T.submit(s,'manager',{raisedFor:'worker',requestType:'Movement',template:templates.Movement},'mss',DATE);assert.deepStrictEqual(D.importJson(D.exportJson(s)).supportRequests,s.supportRequests);
});
console.log(`PASS: ${count} simplified request template rule groups.`);
