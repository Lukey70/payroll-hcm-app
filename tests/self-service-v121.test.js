'use strict';
process.env.TZ='Australia/Perth';
const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm');
const D=require('../data-store'),E=require('../payroll-engine'),S=E.selfService;
const DATE='2026-10-10';let count=0;
function test(name,fn){if(require.main!==module)return;fn();count++;console.log('PASS: '+name);}
function fixture(){
  const s=D.emptyState();s.currentCycleId=11;
  s.positions.push({positionNumber:'MGR',positionName:'Manager',active:true,accessManagerSelfService:true},{positionNumber:'MGR2',positionName:'Other Manager',active:true,accessManagerSelfService:true},{positionNumber:'PAY',positionName:'Payroll',active:true,accessPayrollManagement:true},{positionNumber:'STAFF',positionName:'Officer',active:true,hourlyRate:40},{positionNumber:'CREW',positionName:'Crew',active:true,hourlyRate:30});
  for(const [id,pos,manager]of [['manager','MGR',''],['otherManager','MGR2',''],['payroll','PAY',''],['worker','STAFF','MGR'],['outsider','STAFF','MGR2']]){
    s.employees.push({id,firstName:id,lastName:'Test',name:id+' Test',startDate:'2026-05-22',originalStartDate:'2026-05-22',lslServiceDate:'2026-05-22',type:'Permanent',position:'Officer',status:'Active',hourlyRate:40,annualLeaveBalance:150,personalLeaveBalance:100,lslAccruedBalance:100});
    s.jobDataRows.push({id:'job-'+id,empId:id,effectiveDate:'2026-05-22',effectiveSequence:0,action:'Commencement',reason:'New Hire Permanent',positionNumber:pos,positionName:s.positions.find(p=>p.positionNumber===pos).positionName,positionClass:'Permanent',hourlyRate:40,reportsTo:manager,saved:true});
    s.schedules.push({id:'sched-'+id,empId:id,jobDataId:'job-'+id,effectiveDate:'2026-05-22',hoursByDay:{0:0,1:7.5,2:7.5,3:7.5,4:7.5,5:7.5,6:0}});
    s.payRates.push({id:'rate-'+id,empId:id,jobDataId:'job-'+id,effectiveDate:'2026-05-22',position:'Officer',hourlyRate:40,changeType:'Permanent'});
    s.taxDetails.push({id:'tax-'+id,empId:id,effectiveDate:'2026-05-22',taxFileNumber:'123456789',claimTaxFreeThreshold:true,stsl:false});
  }
  return s;
}
function input(type='Annual Leave',startDate='2026-10-12',endDate=startDate){return {empId:'worker',type,startDate,endDate};}
test('manager position resolves only current eligible direct reports; ambiguous and missing managers are errors',()=>{
  const s=fixture();assert.deepStrictEqual(S.directReports(s,'manager',DATE).map(e=>e.id),['worker']);assert.strictEqual(S.managerFor(s,'worker',DATE).managerId,'manager');
  assert.throws(()=>S.directReports(s,'worker',DATE),/access/);assert.throws(()=>S.assertScope(s,'manager','outsider','mss',DATE),/access/);assert.throws(()=>S.assertScope(s,'worker','outsider','ess',DATE),/access/);
  s.jobDataRows.find(j=>j.empId==='worker').reportsTo='MISSING';assert(S.errors(s,DATE).some(x=>x.includes('worker')&&x.includes('no active manager')));
  assert.throws(()=>S.submitLeave(s,'worker',input(),'ess',DATE),/correct Reports To/);
  s.jobDataRows.find(j=>j.empId==='worker').reportsTo='MGR';s.positions.find(p=>p.positionNumber==='MGR').accessManagerSelfService=false;assert.strictEqual(S.managerFor(s,'worker',DATE).managerId,'');
});
test('ESS submission is own-only, pending, manager-only initial alert and invisible to payroll processing',()=>{
  const s=fixture(),before=E.calculateEmployee(s,'worker',11)[0],balances=s.employees.find(e=>e.id==='worker').annualLeaveBalance;
  const l=S.submitLeave(s,'worker',{...input(),empId:'outsider'},'ess',DATE);assert.strictEqual(l.empId,'worker');assert.strictEqual(l.status,'Awaiting Manager Approval');assert.strictEqual(l.approverId,'manager');
  assert.strictEqual(S.alertsFor(s,'manager',DATE).length,1);assert.strictEqual(S.alertsFor(s,'payroll',DATE).length,0);assert.strictEqual(S.alertsFor(s,'outsider',DATE).length,0);
  assert.strictEqual(E.calculateEmployee(s,'worker',11)[0].gross,before.gross);assert.strictEqual(s.employees.find(e=>e.id==='worker').annualLeaveBalance,balances);
  assert.strictEqual(S.requests(s,'worker','ess',DATE).length,1);assert.strictEqual(S.requests(s,'otherManager','mss',DATE).length,0);
});
test('restricted leave types, invalid dates/duration/evidence and manager-only AWOL are enforced',()=>{
  const s=fixture();for(const type of ['Absent Without Leave','Family and Domestic Violence Leave','Parental Leave - Paid','Unknown'])assert.throws(()=>S.submitLeave(s,'worker',input(type),'ess',DATE),/only be booked/);
  for(const date of ['bad','2026-02-30'])assert.throws(()=>S.submitLeave(s,'worker',input('Annual Leave',date),'ess',DATE),/valid leave dates/);
  assert.throws(()=>S.submitLeave(s,'worker',{...input(),requestedHours:NaN},'ess',DATE),/valid leave hours/);
  assert.throws(()=>S.submitLeave(s,'worker',input('Personal Leave','2026-10-12','2026-10-14'),'ess',DATE),/Evidence/);
  const l=S.submitLeave(s,'manager',input('Absent Without Leave'),'mss',DATE);assert.strictEqual(l.status,'Approved');assert.strictEqual(l.empId,'worker');assert.strictEqual(S.alertsFor(s,'worker',DATE).length,1);
  assert.throws(()=>S.submitLeave(s,'manager',{...input('LWOP','2026-10-13'),empId:'outsider'},'mss',DATE),/access/);
});
test('pending overlap and balance reservations do not mutate committed balances',()=>{
  const s=fixture();const e=s.employees.find(e=>e.id==='worker');e.personalLeaveBalance=0;
  const pending=S.submitLeave(s,'worker',input('Personal Leave'),'ess',DATE);assert.strictEqual(e.personalLeaveBalance,0);
  assert.throws(()=>S.submitLeave(s,'worker',input('LWOP'),'ess',DATE),/overlaps/);
  assert.throws(()=>S.submitLeave(s,'worker',input('Personal Leave','2026-10-13'),'ess',DATE),/Insufficient/);
  assert.strictEqual(e.personalLeaveBalance,0);S.deleteRequest(s,'worker',pending.id,'ess',DATE);
  assert.doesNotThrow(()=>S.submitLeave(s,'worker',input('Personal Leave','2026-10-13'),'ess',DATE));
});
test('future personal pending reservations also reduce available request capacity',()=>{
  const s=fixture();s.employees.find(e=>e.id==='worker').personalLeaveBalance=0;
  S.submitLeave(s,'worker',input('Personal Leave','2026-11-02'),'ess',DATE);
  assert.throws(()=>S.submitLeave(s,'worker',input('Personal Leave','2026-11-03'),'ess',DATE),/Insufficient/);
});
test('manager approval and denial scopes, required comments, notifications and stale request handling',()=>{
  const s=fixture(),l=S.submitLeave(s,'worker',input(),'ess',DATE);
  assert.throws(()=>S.decide(s,'otherManager',l.id,'Approved','',DATE),/access/);assert.throws(()=>S.decide(s,'worker',l.id,'Approved','',DATE),/access/);assert.throws(()=>S.decide(s,'manager',l.id,'Denied',' ',DATE),/comment/);
  S.decide(s,'manager',l.id,'Approved','Enjoy your leave',DATE);assert.strictEqual(l.status,'Approved');assert.strictEqual(l.pendingApprovalSince,'');
  assert(S.alertsFor(s,'worker',DATE).some(a=>a.message.includes('approved')));assert(E.calculateEmployee(s,'worker',11).flatMap(p=>p.rows).some(r=>r.description==='Annual Leave'));
  assert.throws(()=>S.decide(s,'manager',l.id,'Denied','No',DATE),/Only pending/);
  const second=S.submitLeave(s,'worker',input('LWOP','2026-10-13'),'ess',DATE);S.decide(s,'manager',second.id,'Denied','Staffing needs',DATE);
  assert.strictEqual(second.decisionComment,'Staffing needs');assert(S.alertsFor(s,'worker',DATE).some(a=>a.message.includes('Staffing needs')));
});
test('withdraw pending only, approved deletion by direct manager, archive and payroll recalculation',()=>{
  const s=fixture(),l=S.submitLeave(s,'worker',input(),'ess',DATE);S.decide(s,'manager',l.id,'Approved','',DATE);
  assert.throws(()=>S.deleteRequest(s,'worker',l.id,'ess',DATE),/Only pending/);assert.throws(()=>S.deleteRequest(s,'otherManager',l.id,'mss',DATE),/access/);
  S.deleteRequest(s,'manager',l.id,'mss',DATE);assert.strictEqual(s.leaveBookings.length,0);assert.strictEqual(s.leaveRequestArchive.length,1);assert.strictEqual(s.leaveRequestArchive[0].deletedBy,'manager');
  assert(!E.calculateEmployee(s,'worker',11).flatMap(p=>p.rows).some(r=>r.description==='Annual Leave'));
  assert(S.alertsFor(s,'worker',DATE).some(a=>a.message.includes('deleted')));
  const pending=S.submitLeave(s,'worker',input(),'ess',DATE);assert.throws(()=>S.deleteRequest(s,'manager',pending.id,'mss',DATE),/approved/);S.deleteRequest(s,'worker',pending.id,'ess',DATE);
  assert.strictEqual(s.leaveRequestArchive.length,2);
});
test('overdue reminder goes to manager and payroll once; each recipient can mark it read independently',()=>{
  const s=fixture(),l=S.submitLeave(s,'worker',input(),'ess',DATE);l.pendingApprovalSince='2026-10-01T00:00:00Z';
  assert.strictEqual(E.ensurePendingLeaveNotifications(s,'2026-10-04T00:00:00Z'),0);assert.strictEqual(E.ensurePendingLeaveNotifications(s,'2026-10-04T00:00:01Z'),1);S.syncNotifications(s,DATE);
  const a=s.alerts.find(a=>a.type==='Leave Approval Reminder');assert.deepStrictEqual(a.recipientIds,['manager','payroll']);assert(!S.alertsFor(s,'worker',DATE).includes(a));
  S.readAlert(s,'manager',a.id,DATE);assert(!S.alertsFor(s,'manager',DATE).includes(a));assert(S.alertsFor(s,'payroll',DATE).includes(a));assert.throws(()=>S.readAlert(s,'outsider',a.id,DATE),/not available/);
  assert.strictEqual(E.ensurePendingLeaveNotifications(s,'2026-10-10T00:00:00Z'),0);
});
test('manager reassignment reroutes queue/alerts and removes prior manager access',()=>{
  const s=fixture(),l=S.submitLeave(s,'worker',input(),'ess',DATE);s.jobDataRows.find(j=>j.empId==='worker').reportsTo='MGR2';S.syncNotifications(s,DATE);
  assert.strictEqual(l.approverId,'otherManager');assert.strictEqual(S.requests(s,'manager','mss',DATE).length,0);assert.strictEqual(S.requests(s,'otherManager','mss',DATE).length,1);
  assert.throws(()=>S.decide(s,'manager',l.id,'Approved','',DATE),/access/);assert(S.alertsFor(s,'otherManager',DATE).some(a=>a.key.startsWith('leave-submit')));
});
test('ESS own payslips: recent ten, date range, open current pay and foreign exclusions',()=>{
  const s=fixture();for(let i=1;i<=12;i++)s.payslips.push({id:'p'+i,empId:'worker',cycle:E.cycleById(i),cycleId:i,finalised:true});
  s.payslips.push({id:'foreign',empId:'outsider',cycle:E.cycleById(12),finalised:true});s.payResults['11']=[{id:'open',empId:'worker',cycle:E.cycleById(11),finalised:false}];
  const recent=S.payslips(s,'worker','','',true,DATE);assert.strictEqual(recent.length,10);assert.strictEqual(recent[0].id,'p12');assert(!recent.some(p=>p.id==='foreign'));assert(recent.some(p=>p.id==='open_open'));
  assert.strictEqual(S.payslips(s,'worker',E.cycleById(1).end,E.cycleById(2).end,false,DATE).length,2);assert.throws(()=>S.payslips(s,'worker','2027-01-01','2026-01-01',false,DATE),/From Date/);
});
test('MSS earnings use only direct reports and apply rate-based and non-taxable payments correctly',()=>{
  const s=fixture(),base=E.calculateEmployee(s,'worker',11)[0];
  const hours=S.saveAdditional(s,'manager',{empId:'worker',cycleId:11,earningType:'Additional Hours',startDate:'2026-10-12',endDate:'2026-10-12',hours:2},DATE);
  assert.strictEqual(S.additionalAmount(s,hours),80);assert.strictEqual(E.calculateEmployee(s,'worker',11)[0].gross,base.gross+80);
  const reim=S.saveAdditional(s,'manager',{empId:'worker',cycleId:11,earningType:'Reimbursement',startDate:'2026-10-12',endDate:'2026-10-12',amount:100},DATE);
  const pay=E.calculateEmployee(s,'worker',11)[0];assert(pay.rows.some(r=>r.description==='Reimbursement'&&r.nonTaxable));
  assert.throws(()=>S.saveAdditional(s,'manager',{...reim,empId:'outsider'},DATE),/access/);assert.throws(()=>S.deleteAdditional(s,'otherManager',reim.id,DATE),/access/);
  assert.throws(()=>S.saveAdditional(s,'manager',{...reim,cycleId:12},DATE),/pay period/);S.deleteAdditional(s,'manager',reim.id,DATE);
  assert.strictEqual(s.additionalEarnings.length,1);
});
test('MSS casual/HDA/fixed allowances save with correct source position and amount',()=>{
  const s=fixture();const base={empId:'worker',cycleId:11,startDate:'2026-10-12',endDate:'2026-10-12'};
  const casual=S.saveAdditional(s,'manager',{...base,earningType:'Casual Earnings',hours:4,positionNumber:'CREW'},DATE);assert.strictEqual(casual.casualLoadedRate,37.5);assert.strictEqual(S.additionalAmount(s,casual),150);
  assert.throws(()=>S.saveAdditional(s,'manager',{...base,earningType:'Casual Earnings',hours:4,positionNumber:'UNKNOWN'},DATE),/active position/);
  const meal=S.saveAdditional(s,'manager',{...base,earningType:'Meal Allowance'},DATE);assert.strictEqual(S.additionalAmount(s,meal),18);
  const vehicle=S.saveAdditional(s,'manager',{...base,earningType:'Motor Vehicle Allowance - Return Trip'},DATE);assert.strictEqual(S.additionalAmount(s,vehicle),50);
});
test('deleting approved leave after finalisation generates retro reversal without rewriting finalised pay',()=>{
  const s=fixture(),l=S.submitLeave(s,'worker',input(),'ess',DATE);S.decide(s,'manager',l.id,'Approved','',DATE);E.finaliseCurrentPay(s);
  const frozen=JSON.stringify(s.payslips);S.deleteRequest(s,'manager',l.id,'mss',DATE);
  const rows=E.calculateEmployee(s,'worker',12).flatMap(p=>p.rows);assert(rows.some(r=>r.description==='Annual Leave Retro'&&r.units<0));assert.strictEqual(JSON.stringify(s.payslips),frozen);
});
test('pending Annual Leave reserves later requests even when a new request is earlier',()=>{
  const s=fixture();s.employees.find(e=>e.id==='worker').annualLeaveBalance=5;
  // A future request may use future accrual; an earlier booking must not consume
  // the same credits and invalidate that already pending reservation.
  const l=S.submitLeave(s,'worker',input('Annual Leave','2026-11-02','2026-11-04'),'ess',DATE);
  let rejected=false;try{S.submitLeave(s,'worker',input('Annual Leave','2026-10-12'),'ess',DATE);}catch(e){rejected=/Insufficient/.test(e.message);}
  assert(rejected,'Earlier annual request must account for later pending annual reservation');assert.strictEqual(s.leaveBookings.length,1);
});
test('suspended manager role or terminated actors cannot access team actions',()=>{
  const s=fixture();s.positions.find(p=>p.positionNumber==='MGR').active=false;
  assert.throws(()=>S.directReports(s,'manager',DATE),/access/);assert.strictEqual(S.managerFor(s,'worker',DATE).managerId,'');
  const e=s.employees.find(e=>e.id==='worker');e.terminationDate='2026-10-01';e.employmentSegments=[{startDate:e.startDate,endDate:'2026-10-01',inclusiveEnd:false}];
  assert.throws(()=>S.payslips(s,'worker','','',true,DATE),/active employee/);
});
test('archive, scoped notifications and request state survive export/import without repayment or status changes',()=>{
  const s=fixture(),l=S.submitLeave(s,'worker',input(),'ess',DATE);S.deleteRequest(s,'worker',l.id,'ess',DATE);const restored=D.importJson(D.exportJson(s));
  assert.deepStrictEqual(restored.leaveRequestArchive,s.leaveRequestArchive);assert.deepStrictEqual(restored.alerts,s.alerts);
});
// DOM harness for actual self-service handlers. Not a browser or security boundary.
function uiFixture(){
  const s=fixture(),nodes=new Map();let id='worker';const errors=[],timers=[],timeouts=[];
  function node(tag,attrs){
    const attributes={};for(const m of attrs.matchAll(/([\w-]+)="([^"]*)"/g))attributes[m[1]]=m[2];
    const classes=new Set((attributes.class||'').split(' ').filter(Boolean));const events={};const dataset={};for(const [k,value]of Object.entries(attributes))if(k.startsWith('data-'))dataset[k.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=value;const n={tag,attributes,dataset,style:{},readOnly:/\breadonly\b/.test(attrs),querySelectorAll(selector){const attr=selector.match(/^\[([^\]]+)\]$/)?.[1];return attr?(this.children||[]).filter(x=>Object.hasOwn(x.attributes,attr)):[];},setAttribute(k,v){attributes[k]=v;},focus(){},remove(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(x=>x!==this);},appendChild(child){this.children=this.children||[];child.parentNode=this;this.children.push(child);},showModal(){this.open=true;},close(){this.open=false;},value:attributes.value||'',checked:/\bchecked\b/.test(attrs),disabled:/\bdisabled\b/.test(attrs),hidden:/\bhidden\b/.test(attrs),innerText:'',textContent:'',classList:{remove(...xs){xs.forEach(x=>classes.delete(x));},add(...xs){xs.forEach(x=>classes.add(x));},toggle(x){if(classes.has(x))classes.delete(x);else classes.add(x);},contains(x){return classes.has(x);}},getAttribute:k=>attributes[k],addEventListener:(k,f)=>(events[k]||(events[k]=[])).push(f),fire(k='click'){if(this.disabled)return;return Promise.all([...events[k]||[]].map(f=>f({target:n,stopPropagation(){}})));},click(){n.fire();}};
    let html='';Object.defineProperty(n,'innerHTML',{get:()=>html,set:x=>{html=x;parse(x,n);}});if(attributes.id)nodes.set(attributes.id,n);return n;
  }
  let all=[];
  function parse(html,parent){
    if(parent?.children){const removed=new Set();const drop=n=>{removed.add(n);for(const child of n.children||[])drop(child);if(n.attributes.id&&nodes.get(n.attributes.id)===n)nodes.delete(n.attributes.id);};parent.children.forEach(drop);all=all.filter(n=>!removed.has(n));}
    const children=[];
    for(const m of html.matchAll(/<(button|input|select|textarea|div|aside|main|details|span|header|summary|dialog|section)\b([^>]*)>/g)){
      const n=node(m[1],m[2]);all.push(n);children.push(n);
      if(m[1]==='select'){const content=html.slice(m.index+m[0].length).split('</select>')[0],opts=[...content.matchAll(/<option([^>]*)>([\s\S]*?)<\/option>/g)],selected=opts.find(x=>/\bselected\b/.test(x[1]))||opts[0];n.value=selected?((selected[1].match(/value="([^"]*)"/)||[])[1]??selected[2]):'';}
    }
    if(parent)parent.children=children;
  }
  for(const name of ['selfServiceScreen','appShell','landingScreen','printArea'])node('div',`id="${name}"`);
  parse(fs.readFileSync(path.join(__dirname,'../index.html'),'utf8'),null);
  const document={addEventListener(){},documentElement:{},getElementById:k=>nodes.get(k)||null,querySelectorAll:selector=>{const attr=selector.match(/^\[([^\]]+)\]$/)?.[1];return attr?all.filter(n=>Object.hasOwn(n.attributes,attr)):selector.startsWith('.')?all.filter(n=>(n.attributes.class||'').split(' ').includes(selector.slice(1))):[];},querySelector:()=>null,body:{classList:{remove(){},add(){}}},createElement:tag=>node(tag,'')};
  const context={Date,document,window:{print(){},addEventListener(){},scrollTo(){}},setTimeout:(fn,ms)=>{timers.push(fn);timeouts.push({fn,ms});return timers.length;},URL:{createObjectURL:()=>'',revokeObjectURL(){}},Blob,alert:m=>errors.push(m),confirm:()=>true,console};context.window.document=document;context.DataStore=Object.assign({},D,{load:()=>s,save:()=>true});context.PayrollEngine=E;context.SupportRequests=require('../support-requests');const session=new Map();context.sessionStorage={getItem:k=>session.get(k)||null,setItem:(k,v)=>session.set(k,v),removeItem:k=>session.delete(k)};context.requestAnimationFrame=fn=>fn();context.clearTimeout=()=>{};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../self-service.js'),'utf8'),context);
  context.PayrollEngine=Object.assign({},E,{createSelfServiceUI:context.window.SelfService.createUI});
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../pdf-fonts.js'),'utf8'),context);context.PayrollPdfFonts=context.window.PayrollPdfFonts;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../payroll-features.js'),'utf8'),context);context.PayrollFeatures=context.window.PayrollFeatures;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../support-requests.js'),'utf8'),context);context.SupportRequests=context.window.SupportRequests;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../app.js'),'utf8'),context);
  const app=context.window.PayrollApp;
  const ui=context.window.SelfService.createUI({jobSummaryHtml:app.jobSummaryHtml,yearlyCalendarHtml:app.yearlyCalendarHtml,monthlyCalendarHtml:app.monthlyAbsenceCalendarHtml,mountPayments:app.mountSelfServicePayments,unmountPayments:app.unmountSelfServicePayments,E,getState:()=>s,getUser:()=>id,payslipHtml:p=>`<div>${p.id}</div>`,onChange(){s.payResults['11']=E.calculateAll(s,11);},home(){},logout(){},esc:x=>String(x??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;')});
  const find=(attr,value)=>all.find(n=>n.attributes[attr]===value);
  return {s,ui,app,nodes,errors,context,timeouts,login(user){id=user;nodes.get('loginUser').value=user;nodes.get('loginPassword').value='1234';app.login();},flush(){let n=0;while(timers.length){assert(n++<100);timers.shift()();}},fire:(name,event='change')=>nodes.get(name).fire(event),edit:(attr,value,next)=>{const n=find(attr,value);assert(n);n.value=next;n.fire('change');},setUser:x=>{id=x;},set:(name,value)=>{assert(nodes.has(name),'Missing field '+name);nodes.get(name).value=value;},click:name=>{assert(nodes.has(name),'Missing control '+name);return nodes.get(name).fire();},choose:(attr,value)=>{const n=find(attr,value);assert(n,'Missing action '+attr+' '+value);n.fire();},html:name=>nodes.get(name)?.innerHTML||''};
}
test('ESS tiles, exact sidebar order, read-only tax/bank/super/job and blank timesheets render',()=>{
  const f=uiFixture();f.ui.show('ess');let html=f.html('ssBody');for(const label of ['Payslips','Leave &amp; Timesheets','Personal Details'])assert(html.includes(label)||html.includes(label.replace('&amp;','&')));assert.strictEqual((html.match(/landing-tile-icon/g)||[]).length,4);
  f.choose('data-ss-tile','details');html=f.html('ssSidebar');assert(html.indexOf('Bank Details')<html.indexOf('Tax Details'));assert(html.indexOf('Tax Details')<html.indexOf('Super'));
  f.choose('data-ss-section','tax');assert(f.html('ssMain').includes('Read only'));assert(!f.html('ssMain').includes('outsider'));assert(!f.html('ssMain').includes('Save'));
  f.ui.show('ess','leave');html=f.html('ssSidebar');assert(html.indexOf('Absence Request')<html.indexOf('My Requests'));
  f.choose('data-ss-section','timesheets');assert.strictEqual(f.html('ssMain'),'');assert.strictEqual(f.errors.length,0);
});
test('actual ESS form submits pending request; MSS queue shows full details and approves',()=>{
  const f=uiFixture();f.ui.show('ess','leave');f.set('ssLeaveType','Annual Leave');f.set('ssLeaveStart','2026-10-12');f.set('ssLeaveEnd','2026-10-12');f.click('ssLeaveSubmit');
  assert.strictEqual(f.s.leaveBookings.length,1);assert.strictEqual(f.s.leaveBookings[0].status,'Awaiting Manager Approval');assert(f.html('ssMain').includes('Awaiting Manager Approval'));
  f.setUser('manager');f.ui.show('mss','approvals');assert(f.html('ssMain').includes('Hours'));f.click('ssApprove');assert.strictEqual(f.s.leaveBookings[0].status,'Approved');assert.strictEqual(f.errors.length,0);
});
test('actual MSS tiles, direct reports, readonly details, auto-approved booking and scoped payments save',()=>{
  const f=uiFixture();f.setUser('manager');f.ui.show('mss');assert.strictEqual((f.html('ssBody').match(/landing-tile-icon/g)||[]).length,7);
  f.choose('data-ss-tile','reports');assert(f.html('ssSidebar').includes('worker'));assert(!f.html('ssSidebar').includes('outsider'));assert(f.html('ssMain').includes('Job Summary'));
  f.ui.show('mss','details');assert(f.html('ssSidebar').includes('Tax Details'));assert(!f.html('ssMain').includes('outsider'));
  f.ui.show('mss','leave');f.set('ssLeaveType','Absent Without Leave');f.set('ssLeaveStart','2026-10-12');f.set('ssLeaveEnd','2026-10-12');f.click('ssLeaveSubmit');assert.strictEqual(f.s.leaveBookings[0].status,'Approved');
  f.ui.show('mss','payments');f.set('addEmp','worker');f.fire('addEmp');f.click('addRow');f.edit('data-add-field','0|startDate','2026-10-13');f.edit('data-add-field','0|hours','2');f.click('saveAdditional');f.flush();assert.strictEqual(f.s.additionalEarnings.length,1);assert.strictEqual(f.s.additionalEarnings[0].empId,'worker');assert.strictEqual(f.errors.length,0);
});
test('actual monthly calendar is team-scoped, MSS timesheets blank and notification refresh preserves form input',()=>{
  const f=uiFixture();f.setUser('manager');f.ui.show('mss','leave');f.choose('data-ss-section','calendar');assert.deepStrictEqual(f.errors,[]);assert(f.html('ssCalendar').includes('worker'));assert(!f.html('ssCalendar').includes('outsider'));
  f.choose('data-ss-section','timesheets');assert.strictEqual(f.html('ssMain'),'');
  f.setUser('worker');f.ui.show('ess','leave');f.set('ssLeaveStart','2026-10-12');f.ui.refreshNotifications();assert.strictEqual(f.nodes.get('ssLeaveStart').value,'2026-10-12');assert.strictEqual(f.errors.length,0);
});
test('actual pending employee delete and approved manager delete obey workflow and notify',()=>{
  const f=uiFixture(),l=S.submitLeave(f.s,'worker',input(),'ess',DATE);f.ui.show('ess','leave');f.choose('data-ss-section','requests');f.choose('data-ss-delete',l.id);assert.strictEqual(f.s.leaveBookings.length,0);
  const approved=S.submitLeave(f.s,'manager',input(),'mss',DATE);f.setUser('manager');f.ui.show('mss','leave');f.choose('data-ss-section','requests');f.choose('data-ss-delete',approved.id);assert.strictEqual(f.s.leaveBookings.length,0);assert.strictEqual(f.s.leaveRequestArchive.length,2);assert.strictEqual(f.errors.length,0);
});
test('next-pay MSS earnings are permitted but do not enter current pay',()=>{
  const s=fixture(),base=E.calculateEmployee(s,'worker',11)[0].gross,c=E.cycleById(12);
  const row=S.saveAdditional(s,'manager',{empId:'worker',cycleId:12,earningType:'Additional Hours',startDate:c.start,endDate:c.start,hours:2},DATE);
  assert.strictEqual(row.cycleId,12);assert.strictEqual(E.calculateEmployee(s,'worker',11)[0].gross,base);assert(E.calculateEmployee(s,'worker',12).flatMap(p=>p.rows).some(r=>r.description==='Additional Hours'&&r.amount===80));
});
test('actual ESS payslip list includes own open pay, excludes foreign rows and expands earlier dates',()=>{
  const f=uiFixture();for(let i=1;i<=12;i++)f.s.payslips.push({id:'slip'+i,empId:'worker',cycle:E.cycleById(i),finalised:true,position:'Officer',net:100});f.s.payslips.push({id:'FOREIGN',empId:'outsider',cycle:E.cycleById(12),finalised:true});f.s.payResults['11']=[{id:'OPEN',empId:'worker',cycle:E.cycleById(11),finalised:false,net:90}];
  f.ui.show('ess','payslips');assert.strictEqual((f.html('ssMain').match(/data-ss-slip/g)||[]).length,10);assert(!f.html('ssMain').includes('FOREIGN'));assert(f.html('ssMain').includes('Open'));
  f.set('ssPayFrom',E.cycleById(1).end);f.set('ssPayTo',E.cycleById(2).end);f.click('ssPayApply');assert.strictEqual((f.html('ssMain').match(/data-ss-slip/g)||[]).length,2);assert.strictEqual(f.errors.length,0);
});
test('acting assignment replaces substantive manager access and returns on expiry or return row',()=>{
 const s=fixture();s.positions.push({positionNumber:'ACT',positionName:'Acting Officer',active:true,reportsTo:'MGR2'});
 s.jobDataRows.push({id:'acting-worker',empId:'worker',effectiveDate:'2026-10-01',endDate:'2026-10-12',effectiveSequence:0,action:'Movement',reason:'Acting Higher Level',positionNumber:'ACT',reportsTo:'MGR2',saved:true});
 assert.deepStrictEqual(S.managerFor(s,'worker',DATE).managerIds,['otherManager']);
 const l=S.submitLeave(s,'worker',input(),'ess',DATE);assert(!S.requests(s,'manager','mss',DATE).some(x=>x.id===l.id));assert(S.requests(s,'otherManager','mss',DATE).some(x=>x.id===l.id));
 assert.throws(()=>S.decide(s,'manager',l.id,'Approved','',DATE),/access/);
 assert.deepStrictEqual(S.managerFor(s,'worker','2026-10-13').managerIds,['manager']);
 s.jobDataRows.push({id:'return',empId:'worker',effectiveDate:'2026-10-10',effectiveSequence:1,action:'Movement',reason:'Return to Substantive',positionNumber:'STAFF',reportsTo:'MGR',saved:true});
 assert.deepStrictEqual(S.managerFor(s,'worker',DATE).managerIds,['manager']);
});
test('multiple Reports To values and active occupants route to all; unresolved links stay errors',()=>{
  const s=fixture(),j=s.jobDataRows.find(j=>j.empId==='worker');j.reportsTo=['MGR','MGR2'];
  assert.deepStrictEqual(S.managerFor(s,'worker',DATE).managerIds,['manager','otherManager']);
  s.jobDataRows.find(j=>j.empId==='otherManager').positionNumber='MGR';j.reportsTo='MGR';assert.deepStrictEqual(S.managerFor(s,'worker',DATE).managerIds,['manager','otherManager']);
  j.reportsTo=['MGR','UNKNOWN'];assert(S.errors(s,DATE).some(e=>e.includes('worker')&&e.includes('UNKNOWN')));assert.throws(()=>S.submitLeave(s,'worker',input(),'ess',DATE),/correct Reports To/);
});
test('Operations Manager auto-approves own leave without Reports To; validation and position limits remain',()=>{
  const s=fixture();s.positions.push({positionNumber:'OPS',positionName:'Operations Manager',active:true,accessManagerSelfService:true});
  const j=s.jobDataRows.find(j=>j.empId==='worker');j.positionNumber='OPS';j.positionName='Operations Manager';j.reportsTo='';
  assert(!S.errors(s,DATE).some(e=>e.includes('worker')));const l=S.submitLeave(s,'worker',input(),'ess',DATE);
  assert.strictEqual(l.status,'Approved');assert.strictEqual(S.requests(s,'worker','ess',DATE)[0].approverName,'Automatically Approved');assert.strictEqual(l.pendingApprovalSince,'');
  assert.strictEqual(E.ensurePendingLeaveNotifications(s,'2026-12-01T00:00:00Z'),0);assert.throws(()=>S.submitLeave(s,'worker',input(),'ess',DATE),/overlaps/);
  assert.throws(()=>S.submitLeave(s,'worker',input('Personal Leave','2026-10-19','2026-10-21'),'ess',DATE),/Evidence/);
  j.positionNumber='STAFF';j.positionName='Officer';assert.throws(()=>S.submitLeave(s,'worker',input('LWOP','2026-10-13'),'ess',DATE),/Reports To/);
  assert.strictEqual(S.requests(s,'worker','ess',DATE)[0].approverName,'Automatically Approved');
});
test('Payroll-booked legacy and new leave show Payroll; manager bookings retain actual actor',()=>{
  const s=fixture();s.leaveBookings.push({id:'old-payroll',...input(),status:'Approved',hours:7.5},{id:'new-payroll',...input('LWOP','2026-10-13'),status:'Approved',hours:7.5,source:'Payroll Management',submittedBy:'payroll',approverId:'payroll'});
  assert(S.requests(s,'worker','ess',DATE).every(l=>l.approverName==='Payroll'));const l=S.submitLeave(s,'manager',input('LWOP','2026-10-14'),'mss',DATE);
  assert.strictEqual(S.requests(s,'worker','ess',DATE).find(r=>r.id===l.id).approverName,'manager Test');
  const imported=D.importJson(D.exportJson(s));assert.strictEqual(S.requests(imported,'worker','ess',DATE).find(r=>r.id==='new-payroll').approverName,'Payroll');
});
test('open ESS payslip visible but print/download disabled and guarded; disbursement finalised only',()=>{
  const f=uiFixture();f.s.payResults['11']=E.calculateAll(f.s,11);f.ui.show('ess','payslips');
  assert(f.html('ssMain').includes('Open'));assert(!f.nodes.has('ssPrint'));
  const p=S.payslips(f.s,'worker','','',false,DATE)[0];f.choose('data-ss-slip',p.id);assert(f.nodes.get('ssPrint').disabled);assert(f.nodes.get('ssDownload').disabled);assert(!f.app.payslipHtml(p).includes('Disbursement Details'));
  f.nodes.get('ssPrint').disabled=false;f.click('ssPrint');assert(f.errors.pop().includes('until finalised'));
  f.nodes.get('ssDownload').disabled=false;f.click('ssDownload');assert(f.errors.pop().includes('until finalised'));
  const final=E.finaliseCurrentPay(f.s).payslips.find(p=>p.empId==='worker');f.ui.show('ess','payslips');f.choose('data-ss-slip',final.id);
  assert(!f.nodes.get('ssPrint').disabled);assert(!f.nodes.get('ssDownload').disabled);assert(f.app.payslipHtml(final).includes('Disbursement Details'));
});
test('ESS yearly and MSS monthly calendars reuse exact Payroll renderers and date navigation',()=>{
  const f=uiFixture();f.ui.show('ess','leave');f.choose('data-ss-section','calendar');const year=E.parseDate(E.currentCycle(f.s).start).getFullYear();
  assert.strictEqual(f.html('ssCalendar'),f.app.yearlyCalendarHtml('worker',year));assert.strictEqual((f.html('ssCalendar').match(/class="month"/g)||[]).length,12);
  f.click('ssYearNext');assert.strictEqual(f.html('ssCalendar'),f.app.yearlyCalendarHtml('worker',year+1));assert(f.nodes.get('ssYearNext').disabled);
  f.setUser('manager');f.ui.show('mss','leave');f.choose('data-ss-section','calendar');const month=f.nodes.get('ssMonth').value;
  assert.strictEqual(f.html('ssCalendar'),f.app.monthlyAbsenceCalendarHtml(month+'-01',['worker']));assert(!f.html('ssCalendar').includes('outsider'));
  f.click('ssMonthNext');assert.notStrictEqual(f.nodes.get('ssMonth').value,month);f.click('ssMonthPrev');assert.strictEqual(f.nodes.get('ssMonth').value,month);assert.deepStrictEqual(f.errors,[]);
});
test('ESS/MSS Job Summary reuses exact Payroll columns and excludes unsaved drafts',()=>{
  const f=uiFixture();f.s.jobDataRows.find(j=>j.empId==='worker').hoursByDay={1:7.5,2:7.5,3:7.5,4:7.5,5:7.5};f.s.jobDataRows.push({id:'draft',empId:'worker',effectiveDate:DATE,positionName:'UNSAVED',saved:false});
  const html=f.app.jobSummaryHtml('worker');assert(html.includes('37.50'));assert(!html.includes('UNSAVED'));f.ui.show('ess','details');f.choose('data-ss-section','job');assert(f.html('ssMain').includes(html));
  f.setUser('manager');f.ui.show('mss','reports');assert(f.html('ssMain').includes(html));assert.deepStrictEqual(f.errors,[]);
});
test('vertical form fills Payroll roster hours, follows dates and enforces partial-day limits',()=>{
  const f=uiFixture();f.ui.show('ess','leave');const html=f.html('ssMain');assert(html.includes('ss-leave-form'));assert(!html.includes('grid form-grid'));
  const ids=['ssLeaveType','ssLeaveStart','ssLeaveEnd','ssLeaveHours','ssEvidence'];for(let i=1;i<ids.length;i++)assert(html.indexOf(ids[i-1])<html.indexOf(ids[i]));
  f.set('ssLeaveType','Annual Leave');f.fire('ssLeaveType');f.set('ssLeaveStart','2026-10-12');f.fire('ssLeaveStart');
  assert.strictEqual(f.nodes.get('ssLeaveEnd').value,'2026-10-12');assert.strictEqual(f.nodes.get('ssLeaveHours').value,'7.50');assert.strictEqual(f.nodes.get('ssLeaveHours').readOnly,false);
  f.set('ssLeaveHours','8');f.click('ssLeaveSubmit');assert(f.errors.pop().includes('exceed scheduled'));f.set('ssLeaveHours','3');f.click('ssLeaveSubmit');assert.strictEqual(f.s.leaveBookings[0].hours,3);
  f.ui.show('ess','leave');f.set('ssLeaveType','Annual Leave');f.set('ssLeaveStart','2026-10-19');f.fire('ssLeaveStart');f.set('ssLeaveEnd','2026-10-20');f.fire('ssLeaveEnd');
  assert.strictEqual(f.nodes.get('ssLeaveHours').value,'15.00');assert(f.nodes.get('ssLeaveHours').readOnly);f.set('ssLeaveStart','2026-10-17');f.fire('ssLeaveStart');assert.strictEqual(f.nodes.get('ssLeaveHours').value,'0.00');assert.deepStrictEqual(f.errors,[]);
});
test('MSS period plus stages rows; whole-period save/delete preserves other employees',()=>{
  const f=uiFixture();f.s.additionalEarnings.push({id:'foreign-source',empId:'outsider',cycleId:11,earningType:'Bonus',amount:30,startDate:E.cycleById(11).start,endDate:E.cycleById(11).start,saved:true});
  f.setUser('manager');f.ui.show('mss','payments');assert(f.html('ssMain').includes('addPeriod'));assert(f.html('ssMain').includes('+ Add Row'));assert(!f.html('ssMain').includes('outsider'));
  f.set('addEmp','worker');f.fire('addEmp');f.click('addNext');assert.strictEqual(f.nodes.get('addPeriod').value,E.cycleDisplay(E.cycleById(12)));
  f.click('addRow');f.edit('data-add-field','0|earningType','Bonus');f.edit('data-add-field','0|amount','125');assert.strictEqual(f.s.additionalEarnings.length,1);
  f.click('saveAdditional');f.flush();const row=f.s.additionalEarnings.find(a=>a.empId==='worker');assert.strictEqual(row.cycleId,12);assert.strictEqual(row.amount,125);assert.strictEqual(row.source,'Manager Self Service');
  f.choose('data-del-add',row.id);f.click('confirmYes');f.click('saveAdditional');f.flush();assert(!f.s.additionalEarnings.some(a=>a.empId==='worker'));assert(f.s.additionalEarnings.some(a=>a.id==='foreign-source'));assert.deepStrictEqual(f.errors,[]);
});
test('MSS delayed save rechecks scope before modifying payroll',()=>{
  const f=uiFixture();f.setUser('manager');f.ui.show('mss','payments');f.set('addEmp','worker');f.fire('addEmp');f.click('addRow');f.edit('data-add-field','0|hours','2');
  f.click('saveAdditional');f.s.jobDataRows.find(j=>j.empId==='worker').reportsTo='MGR2';f.flush();assert.strictEqual(f.s.additionalEarnings.length,0);assert(f.errors.some(x=>x.includes('access')));
});
test('navigation uses bell, Back text and accessible home icon',()=>{
  const f=uiFixture();S.submitLeave(f.s,'worker',input(),'ess',DATE);f.setUser('manager');f.ui.show('mss');
  assert(f.html('selfServiceScreen').includes('>Back</button>'));assert(!f.html('selfServiceScreen').includes('Back to Manager'));assert(f.html('selfServiceScreen').includes('aria-label="Home"'));assert(f.html('ssNotifications').includes('🔔'));assert(f.nodes.get('ssNotifications').getAttribute('aria-label').startsWith('Notifications'));assert.deepStrictEqual(f.errors,[]);
});
test('roster calculation follows effective changes and two-week pattern; public holidays count zero',()=>{
  const f=uiFixture();f.s.schedules.push({id:'change',empId:'worker',jobDataId:'job-worker',effectiveDate:'2026-10-20',rosterPattern:'2-week',hoursByDayWeek1:{1:4,2:4,3:4,4:4,5:4},hoursByDayWeek2:{1:6,2:6,3:6,4:6,5:6}});
  f.ui.show('ess','leave');f.set('ssLeaveType','Annual Leave');f.set('ssLeaveStart','2026-10-19');f.fire('ssLeaveStart');f.set('ssLeaveEnd','2026-10-20');f.fire('ssLeaveEnd');
  const second=E.rosterWeekForDate('2026-10-20')===1?4:6;assert.strictEqual(Number(f.nodes.get('ssLeaveHours').value),7.5+second);
  f.set('ssLeaveStart','2026-12-25');f.fire('ssLeaveStart');assert.strictEqual(Number(f.nodes.get('ssLeaveHours').value),0);assert(f.nodes.get('ssLeaveHours').readOnly);
});
test('MSS whole-period save rolls back a valid first row if a later row fails validation',()=>{
  const f=uiFixture();f.setUser('manager');f.ui.show('mss','payments');f.set('addEmp','worker');f.fire('addEmp');f.click('addRow');f.edit('data-add-field','0|hours','2');f.click('addRow');
  f.edit('data-add-field','1|hours','0');f.click('saveAdditional');f.flush();assert.strictEqual(f.s.additionalEarnings.length,0);assert(f.errors.some(x=>x.includes('positive hours')));
  f.edit('data-add-field','1|hours','3');f.click('saveAdditional');f.flush();assert.strictEqual(f.s.additionalEarnings.length,2);
});
test('MSS switching employees or pay periods during a delayed save cancels that save',()=>{
  const f=uiFixture();f.setUser('manager');f.ui.show('mss','payments');f.set('addEmp','worker');f.fire('addEmp');f.click('addRow');f.edit('data-add-field','0|hours','2');f.click('saveAdditional');
  f.click('addNext');f.flush();assert.strictEqual(f.s.additionalEarnings.length,0);assert(f.errors.some(x=>x.includes('selection changed')));
});
test('MSS cannot create, amend, convert or delete Overpayment Adjustments',()=>{
  const s=fixture(),c=E.currentCycle(s),row={id:'payroll-overpayment',empId:'worker',cycleId:c.id,earningType:'Overpayment Adjustment',startDate:c.start,endDate:c.end,amount:-150,hours:0,saved:true};
  s.additionalEarnings.push(row);const before=JSON.stringify(s.additionalEarnings);
  assert(!S.EARNINGS.includes('Overpayment Adjustment'));
  for(const input of [{...row,id:undefined},{...row,amount:-250},{...row,earningType:'Bonus',amount:100}])assert.throws(()=>S.saveAdditional(s,'manager',input,DATE),/Payroll Management/);
  assert.throws(()=>S.deleteAdditional(s,'manager',row.id,DATE),/Payroll Management/);
  assert.strictEqual(JSON.stringify(s.additionalEarnings),before);
});
test('MSS saving and removing ordinary earnings preserves Payroll Overpayment Adjustments',()=>{
  const f=uiFixture(),c=E.currentCycle(f.s),row={id:'payroll-overpayment',empId:'worker',cycleId:c.id,earningType:'Overpayment Adjustment',startDate:c.start,endDate:c.end,amount:-150,hours:0,saved:true};
  f.s.additionalEarnings.push(row);const before=JSON.stringify(row);f.setUser('manager');f.ui.show('mss','payments');f.set('addEmp','worker');f.fire('addEmp');
  assert(!f.html('addRows').includes('Overpayment Adjustment'));f.click('addRow');assert(!f.html('addRows').includes('Overpayment Adjustment'));
  f.edit('data-add-field','0|earningType','Bonus');f.edit('data-add-field','0|amount','125');f.click('saveAdditional');f.flush();
  assert.strictEqual(JSON.stringify(f.s.additionalEarnings.find(a=>a.id===row.id)),before);const bonus=f.s.additionalEarnings.find(a=>a.earningType==='Bonus');assert.strictEqual(bonus.amount,125);
  f.choose('data-del-add',bonus.id);f.click('confirmYes');f.click('saveAdditional');f.flush();assert.strictEqual(f.s.additionalEarnings.length,1);assert.strictEqual(JSON.stringify(f.s.additionalEarnings[0]),before);assert.deepStrictEqual(f.errors,[]);
});
if(require.main===module)console.log(`PASS: ${count} v1.2.4 self-service test groups. UI harness is not live-browser QA; browser-local storage is not server-side authorization.`);

module.exports={fixture,uiFixture,DATE};
