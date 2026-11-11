(function(g){
'use strict';
const copy=x=>JSON.parse(JSON.stringify(x)),uid=p=>p+'_'+Date.now()+'_'+Math.random().toString(16).slice(2),stamp=()=>new Date().toISOString();
function create(E,S){
 const today=()=>E.iso(new Date()),person=(s,id)=>s.employees.find(e=>e.id===id),rows=(s,k)=>s[k]||(s[k]=[]);
 function payroll(s,id,d=today()){if(!S.profile(s,id,d).payroll)throw Error('Payroll Management access is required.');}
 function scope(s,id,target,area,d=today()){if(area==='payroll'){payroll(s,id,d);if(!person(s,target))throw Error('Select an employee.');}else S.assertScope(s,id,target,area,d);}
 function audit(s,id,text){rows(s,'auditLog').unshift(stamp()+' — '+id+': '+text);}
 function date(value){if(!/^\d{4}-\d{2}-\d{2}$/.test(value||'')||E.iso(E.parseDate(value))!==value)throw Error('Enter a valid date.');return value;}
 function attachments(files=[]){if(!Array.isArray(files)||files.length>5)throw Error('Attach at most five documents.');let total=0;const out=files.map(f=>{if(!f||!String(f.name||'').trim()||!Number.isSafeInteger(f.size)||f.size<1||f.size>1048576||!/^data:[^,]*;base64,[A-Za-z0-9+/]*={0,2}$/.test(f.data||''))throw Error('Each attachment must be a valid file of up to 1 MB.');const str=f.data.split(',')[1],bytes=Math.floor(str.length*3/4)-(str.endsWith('==')?2:str.endsWith('=')?1:0);if(bytes!==f.size)throw Error('Attachment contents do not match the file size.');total+=f.size;return {name:String(f.name).slice(0,255),size:f.size,data:f.data};});if(total>2097152)throw Error('Attachments cannot exceed 2 MB per booking.');return out;}
 function leaveFiles(s,id,leaveId,area,d=today()){const leave=rows(s,'leaveBookings').find(l=>l.id===leaveId);if(!leave)throw Error('Leave booking not found.');if(area==='approvals'){S.assertApprovalScope(s,id,leave.empId,d);S.assertJobScope(s,id,leave.empId,leave.jobRecord||0,'approvals',d);if(leave.status!=='Awaiting Manager Approval')throw Error('This leave is no longer awaiting approval.');}else {scope(s,id,leave.empId,area,d);if(area==='mss')S.assertJobScope(s,id,leave.empId,leave.jobRecord||0,area,d);}return attachments(leave.attachments||[]);}
 function thresholds(s,id,input,d=today()){payroll(s,id,d);const out={};for(const key of ['annual','personal','lslAccrued','lslProRata']){const v=input[key];if(v===''||v==null){out[key]=null;continue;}if(!Number.isFinite(Number(v))||Number(v)<0)throw Error('Thresholds must be zero or positive hours, or blank to disable.');out[key]=Number(v);}s.excessLeaveThresholds=out;audit(s,id,'Updated excess leave thresholds');return out;}
 function excess(s,asOf=today()){date(asOf);const c=E.cycleForDate(asOf);if(!c)throw Error('Date is outside supported pay periods.');const t=s.excessLeaveThresholds||{annual:null,personal:null,lslAccrued:null,lslProRata:null},out=[];for(const e of s.employees){if(!S.isActiveEmployee(s,e,asOf)||E.isCasualOnly(s,e,asOf))continue;const b=E.projectedBalances(s,e,{...c,end:asOf},false);for(const key of Object.keys(t))if(t[key]!=null&&Number(b[key])>Number(t[key]))out.push({empId:e.id,name:E.employeeDisplayName(e),type:key,balance:b[key],threshold:t[key],excess:E.round4(b[key]-t[key])});}return out;}
 function rosterComparison(s,r){
  const prior=(s.jobDataRows||[]).filter(j=>j.empId===r.empId&&j.id!==r.id&&j.saved!==false&&(j.effectiveDate<r.effectiveDate||j.effectiveDate===r.effectiveDate&&Number(j.effectiveSequence||0)<Number(r.effectiveSequence||0))).sort((a,b)=>b.effectiveDate.localeCompare(a.effectiveDate)||Number(b.effectiveSequence||0)-Number(a.effectiveSequence||0));
  const existing=(s.jobDataRows||[]).find(j=>j.id===r.id&&j.empId===r.empId&&j.saved!==false),previous=existing||prior[0];
  const hasHours=x=>!!x&&Object.keys(x.hoursByDayWeek1||x.hoursByDay||{}).length>0;
  const linked=previous&&(s.schedules||[]).filter(x=>x.empId===r.empId&&x.jobDataId===previous.id).sort((a,b)=>b.effectiveDate.localeCompare(a.effectiveDate)||Number(b.effectiveSequence||0)-Number(a.effectiveSequence||0))[0];
  const old=hasHours(previous)?previous:linked||E.activeSchedule(s,r.empId,existing?r.effectiveDate:E.addDays(r.effectiveDate,-1))||{};
  const zero={0:0,1:0,2:0,3:0,4:0,5:0,6:0},weeks=x=>[x.hoursByDayWeek1||x.hoursByDay||zero,x.rosterPattern==='2-week'?(x.hoursByDayWeek2||x.hoursByDayWeek1||x.hoursByDay||zero):(x.hoursByDayWeek1||x.hoursByDay||zero)],before=weeks(old),after=weeks(r);
  const oldPattern=old.rosterPattern||'1-week',newPattern=r.rosterPattern||'1-week',total=values=>values.reduce((n,week)=>n+Object.values(week).reduce((n,h)=>n+Number(h||0),0),0);
  return {oldPattern,newPattern,before,after,changed:oldPattern!==newPattern||before.some((week,i)=>Object.keys(zero).some(day=>Number(week[day]||0)!==Number(after[i][day]||0))),oldWeekly:E.round4(total(before)/2),newWeekly:E.round4(total(after)/2)};
 }
 function establishment(s,asOf=today()){
  date(asOf);return (s.positions||[]).filter(p=>p.active!==false&&!p.deleted).map(p=>{const employees=[];
   for(const e of s.employees)for(const r of E.jobRecords.records(s,e.id)){const v=E.jobRecords.scope(s,e.id,r.recordNumber),person=v.employees.find(x=>x.id===e.id);E.reconcileEmploymentFromJobData(v,person);if(!S.isActiveEmployee(v,person,asOf))continue;for(const a of S.assignments(v,e.id,asOf)){if(a.positionNumber!==p.positionNumber)continue;const hours=E.weeklyHoursFromSchedule(E.activeSchedule(v,e.id,asOf));employees.push({empId:e.id,jobRecord:r.recordNumber,name:E.employeeDisplayName(e),fte:E.activeEmploymentType(v,person,asOf)==='Casual'?0:E.round4(hours/E.STANDARD_WEEKLY_HOURS)});break;}}
   const occupied=E.round4(employees.reduce((n,e)=>n+e.fte,0)),approved=p.approvedFte==null?null:Number(p.approvedFte);return {positionNumber:p.positionNumber,position:p.positionName,approved,occupied,variance:approved==null?null:E.round4(approved-occupied),employees};});
 }

 function acting(s,asOf=today()){date(asOf);const out=[];for(const e of s.employees){const list=(s.jobDataRows||[]).filter(r=>r.empId===e.id&&r.saved!==false).sort((a,b)=>a.effectiveDate.localeCompare(b.effectiveDate)||Number(a.effectiveSequence||0)-Number(b.effectiveSequence||0));for(let i=0;i<list.length;i++){const r=list[i];if(r.action!=='Movement'||!E.isActingJobDataRow(s,r))continue;const next=list.slice(i+1).find(x=>Number(x.jobRecord||0)===Number(r.jobRecord||0)&&['Movement','Termination','Commencement'].includes(x.action)),end=[next?E.addDays(next.effectiveDate,-1):'',r.endDate||''].filter(Boolean).sort()[0]||'';if(end&&end<asOf)continue;out.push({empId:e.id,name:E.employeeDisplayName(e),position:r.positionName||r.positionNumber,start:r.effectiveDate,end,status:r.effectiveDate>asOf?'Upcoming':'Current',rowId:r.id});}}return out.sort((a,b)=>a.start.localeCompare(b.start));}
 function expiries(s,asOf=today()){date(asOf);const groups={'Expired':[],'Within 30 days':[],'31–60 days':[],'61–90 days':[],'Over 90 days':[]};for(const employee of s.employees)for(const record of E.jobRecords.records(s,employee.id)){const view=E.jobRecords.scope(s,employee.id,record.recordNumber),e=view.employees.find(x=>x.id===employee.id);E.reconcileEmploymentFromJobData(view,e);if(E.activeEmploymentType(view,e,asOf)!=='Fixed Term'||!e.contractEndDate)continue;const days=E.dateDiffDays(asOf,e.contractEndDate),group=days<0?'Expired':days<=30?'Within 30 days':days<=60?'31–60 days':days<=90?'61–90 days':'Over 90 days';groups[group].push({empId:e.id,jobRecord:record.recordNumber,name:E.employeeDisplayName(e)+(E.jobRecords.records(s,e.id).length>1?' · Job '+record.recordNumber:''),end:e.contractEndDate,days});}Object.values(groups).forEach(a=>a.sort((x,y)=>x.end.localeCompare(y.end)));return groups;}

 function recovery(s,id,empId,area='payroll',d=today()){scope(s,id,empId,area,d);return (s.deductions||[]).filter(r=>r.empId===empId&&r.deductionType==='Recovery Deduction').map(r=>({deduction:r,...E.recoveryBalance(s,r),payments:(s.recoveryRepayments||[]).filter(p=>p.deductionId===r.id).sort((a,b)=>Number(a.cycleId)-Number(b.cycleId))}));}
 function negativeNetErrors(s,pays){
  return pays.filter(p=>Number(p.net)<-0.004).map(p=>{
   const e=person(s,p.empId),pre=Number(p.preTaxDeductionTotal||0),post=Number(p.postTaxDeductionTotal||0),recoveries=E.round2((p.rows||[]).filter(r=>Number(r.amount)<0&&(/recovery|overpayment/i.test(r.description||'')||r.personalLeaveDeficitRecovery||r.lslDeficitRecovery||r.annualLeaveDeficitRecovery)).reduce((n,r)=>n-Number(r.amount),0));
   return {empId:p.empId,employeeName:e?E.employeeDisplayName(e):p.employeeName||p.empId,message:'Negative net pay on '+E.ppeLabel(p.cycle)+': '+E.money(p.net)+'. Shortfall: '+E.money(-p.net)+'. Pre-tax deductions: '+E.money(pre)+'; post-tax deductions: '+E.money(post)+'; earnings recoveries: '+E.money(recoveries)+'. Review before finalising.'};
  });
 }
 function notifyRecoveryCompletions(s,c,completed,d=today()){
  const recipients=s.employees.filter(e=>S.profile(s,e.id,d).payroll).map(e=>e.id);let added=0;
  for(const item of completed){
   const deduction=(s.deductions||[]).find(r=>r.id===item.deductionId);if(!deduction)continue;
   const key='recovery-complete:'+item.repaymentId;if(rows(s,'alerts').some(a=>a.key===key))continue;
   const e=person(s,deduction.empId),balance=E.recoveryBalance(s,deduction);
   const alert={id:uid('alert'),key,type:'Recovery Complete',message:'Overpayment recovery fully repaid for '+(e?E.employeeDisplayName(e):deduction.empId)+' ('+deduction.empId+'). Recovery commencing '+E.fmtPay(deduction.startDate)+': '+E.money(balance.repaid)+' repaid; remaining debt '+E.money(balance.remaining)+'. Completed in '+E.ppeLabel(c)+'.',readBy:[],read:false,createdAt:stamp(),action:{tab:'reports',report:'recovery',empId:deduction.empId}};
   // With no currently eligible payroll users, retain a payroll-only notification.
   if(recipients.length)alert.recipientIds=recipients;
   rows(s,'alerts').unshift(alert);added++;
  }return added;
 }
 function saveProbation(s,id,input,d=today()){payroll(s,id,d);if(!person(s,input.empId))throw Error('Select an employee.');date(input.startDate);date(input.reviewDate);if(input.reviewDate<input.startDate)throw Error('Review date cannot precede start date.');if(!['Scheduled','In Progress','Completed','Extended'].includes(input.status))throw Error('Select a valid probation status.');if(input.status==='Completed'){date(input.completedDate);if(input.completedDate<input.startDate)throw Error('Completion cannot precede start date.');}if(String(input.notes||'').length>20000)throw Error('Notes are too long.');let r=rows(s,'probations').find(r=>r.id===input.id);if(!r){r={id:uid('probation')};s.probations.push(r);}Object.assign(r,{empId:input.empId,startDate:input.startDate,reviewDate:input.reviewDate,status:input.status,completedDate:input.status==='Completed'?input.completedDate:'',notes:String(input.notes||''),updatedBy:id,updatedAt:stamp()});audit(s,id,'Updated probation '+r.id);return r;}
 function casualRecords(s,empId,cycleId){
  const c=E.PAY_CYCLES.find(c=>c.id===Number(cycleId));if(!c)return [];
  return E.jobRecords.records(s,empId).filter(r=>{const v=E.jobRecords.scope(s,empId,r.recordNumber),e=person(v,empId);E.reconcileEmploymentFromJobData(v,e);return E.daysBetween(c.start,c.end).some(d=>E.isEmployedOn(e,d)&&E.activeEmploymentType(v,e,d)==='Casual');});
 }
 const casualInputRow=r=>r.earningType==='Casual Earnings'&&!r.sourceTimesheetId&&!r.onCallId;
 function casualInputRows(s,empId,cycleId){return rows(s,'additionalEarnings').filter(r=>r.empId===empId&&Number(r.cycleId)===Number(cycleId)&&casualInputRow(r)).map(copy);}
 function casualInputRate(s,empId,input){
  const old=rows(s,'additionalEarnings').find(r=>r.id===input.id&&r.empId===empId&&casualInputRow(r));
  return old&&old.startDate===input.startDate&&String(old.positionNumber)===String(input.positionNumber)&&Number.isFinite(Number(old.casualBaseRate))&&Number(old.casualBaseRate)>0?Number(old.casualBaseRate):E.positionHourlyRate(s,input.positionNumber,input.startDate);
 }
 function saveCasualInput(s,id,empId,cycleId,input,d=today()){
  payroll(s,id,d);if(!person(s,empId))throw Error('Select an employee.');
  const c=E.PAY_CYCLES.find(c=>c.id===Number(cycleId));if(!c||c.id>E.currentCycle(s).id+1)throw Error('Select a previous, current or next pay period.');
  if(!Array.isArray(input))throw Error('Enter valid casual earnings rows.');
  const existing=casualInputRows(s,empId,c.id),byId=new Map(existing.map(r=>[r.id,r])),seen=new Set();
  const saved=input.map(r=>{
   if(r.id&&(!byId.has(r.id)||seen.has(r.id)))throw Error('A casual earnings row is unavailable or duplicated. Reload this employee and pay period.');if(r.id)seen.add(r.id);
   const start=date(r.startDate);if(start<c.start||start>c.end)throw Error('Work date must fall within the selected pay period.');
   const n=Number(r.jobRecord??0);if(!Number.isInteger(n))throw Error('Select a valid casual job record.');
   const v=E.jobRecords.scope(s,empId,n),e=person(v,empId);E.reconcileEmploymentFromJobData(v,e);if(!E.isEmployedOn(e,start)||E.activeEmploymentType(v,e,start)!=='Casual')throw Error('Select a casual job record employed on the work date.');
   const position=s.positions.find(p=>String(p.positionNumber)===String(r.positionNumber)),old=byId.get(r.id);if(!position||position.active===false&&String(old?.positionNumber)!==String(r.positionNumber))throw Error('Select an active position.');
   const hours=Number(r.hours);if(!['string','number'].includes(typeof r.hours)||!Number.isFinite(hours)||hours<=0||hours>24)throw Error('Enter casual hours greater than zero and no more than 24 for each day.');
   const base=casualInputRate(s,empId,r);if(!Number.isFinite(base)||base<=0)throw Error('The selected position must have a positive hourly rate.');
   const loaded=E.round4(base*1.25);
   return {...(old||{}),id:old?.id||uid('add'),empId,jobRecord:n,cycleId:c.id,earningType:'Casual Earnings',startDate:start,endDate:start,hours,casualBaseRate:base,casualLoadingRate:0.25,casualLoadedRate:loaded,amount:E.round2(hours*loaded),positionNumber:position.positionNumber,positionName:position.positionName,positionDepartment:position.department||'',saved:true,source:old?.source||'Casual Input',enteredBy:old?.enteredBy||id,updatedBy:id,updatedAt:stamp()};
  });
  const ids=new Set(existing.map(r=>r.id));s.additionalEarnings=rows(s,'additionalEarnings').filter(r=>!ids.has(r.id)).concat(saved);audit(s,id,'Saved Casual Input for '+empId+' in '+E.ppeLabel(c));return saved;
 }
 function activeCasualRecords(s,empId,d=today()){
  return E.jobRecords.activeRecords(s,empId,d).filter(r=>{const v=E.jobRecords.scope(s,empId,r.recordNumber);return E.activeEmploymentType(v,person(v,empId),d)==='Casual';});
 }
 // Instances distinguish inputs sharing an actual work date, not lifetime input count.
 function casualWorkDates(input){
  return Object.entries(input.hoursByDate||{}).filter(([d,h])=>Number(h)>0&&d>=input.startDate&&d<=input.endDate).map(([d])=>d);
 }
 function casualInputInstance(s,input,entries=rows(s,'casualInputs')){
  const days=casualWorkDates(input),used=new Set(entries.filter(e=>!e.deletedAt&&e.empId===input.empId&&(!input.id||e.id!==input.id)&&casualWorkDates(e).some(d=>days.length?days.includes(d):d>=input.startDate&&d<=input.endDate)).map(e=>Number(e.instance||1)));
  let instance=1;while(used.has(instance))instance++;return instance;
 }
 function normaliseCasualInstances(entries){
  const numbered=[];for(const entry of entries){if(entry.deletedAt)continue;entry.instance=casualInputInstance(null,entry,numbered);numbered.push(entry);}
 }
 function casualReference(s){
  s.casualInputSequence=Math.max(0,Number(s.casualInputSequence)||0)+1;
  return 'CI-'+String(s.casualInputSequence).padStart(5,'0');
 }
 function casualGross(s,a){
  const rate=E.round4(Number(a.casualBaseRate||E.positionHourlyRate(s,a.positionNumber,a.startDate)||0)*1.25);
  return {rate,amount:E.round2(Number(a.hours||0)*rate)};
 }
 function casualSettlement(s,a,cycleId){
  const {rate,amount}=casualGross(s,a);return {cycleId,hours:Number(a.hours||0),rate,amount,positionNumber:String(a.positionNumber||'')};
 }
 function casualSourcePaid(s,entry,a){
  const settled=entry?.paidByDate?.[a.startDate],now=casualSettlement(s,a);
  return !!settled&&['hours','rate','amount','positionNumber'].every(k=>settled[k]===now[k]);
 }
 // Older payslips were grouped; allocate each historical line only once and
 // never infer payment before a modern input existed.
 function inferCasualSettlements(s,entries){
  const unknown=entries.filter(e=>!e.deletedAt&&!e.paidByDate);
  if(!unknown.length)return;
  const byId=new Map(entries.map(e=>[e.id,e])),ids=new Set(unknown.map(e=>e.id));
  const sources=rows(s,'additionalEarnings').filter(a=>a.saved!==false&&byId.has(a.casualInputId));
  const slips=rows(s,'payslips').filter(p=>p.finalised).slice().sort((a,b)=>Number(a.cycleId)-Number(b.cycleId));
  for(const e of unknown)e.paidByDate={};
  const lines=slips.flatMap(p=>(p.rows||[]).filter(r=>r.casualEarnings&&Number(r.amount)!==0).map(r=>({p,r,remaining:Number(r.amount)})));
  const matches=(line,a,settled)=>line.p.empId===a.empId&&Number(a.jobRecord||0)===Number(line.r.jobRecord||0)&&settled.positionNumber===String(line.r.positionNumber||'')&&a.startDate>=line.r.startDate&&a.startDate<=(line.r.endDate||line.r.startDate)&&Math.abs(settled.rate-Number(line.r.rate||0))<=0.0001;
  const reserve=(a,settled,when)=>lines.find(l=>l.remaining>=settled.amount&&when(l.p)&&matches(l,a,settled));
  for(const a of sources){
   const known=byId.get(a.casualInputId).paidByDate?.[a.startDate];
   if(known?.amount>0){const l=reserve(a,known,p=>Number(p.cycleId)===Number(known.cycleId));if(l)l.remaining=E.round2(l.remaining-known.amount);}
  }
  for(const a of sources){
   const e=byId.get(a.casualInputId);if(!ids.has(e.id)||e.paidByDate[a.startDate]||!e.legacy&&!e.finalisedAt)continue;
   const settled=casualSettlement(s,a);
   // Historical recoveries can make an apparent positive match ambiguous.
   if(!(settled.amount>0)||lines.some(l=>l.remaining<0&&matches(l,a,settled)))continue;
   const l=reserve(a,settled,p=>e.legacy||!(Number(e.createdInCycleId)>Number(p.cycleId)||Number(e.finalisedCycleId)>Number(p.cycleId)));
   if(!l)continue;
   e.paidByDate[a.startDate]={...settled,cycleId:l.p.cycleId,historical:true};l.remaining=E.round2(l.remaining-settled.amount);
  }
 }
 function ensureCasualInputs(s){
  const entries=rows(s,'casualInputs');
  for(const a of rows(s,'additionalEarnings').filter(casualInputRow)){
   if(a.casualInputId&&entries.some(entry=>entry.id===a.casualInputId))continue;
   const id='casual_legacy_'+a.id;let entry=entries.find(entry=>entry.id===id);
   if(!entry){const n=Number(a.jobRecord||0);entry={id,empId:a.empId,jobRecord:n,instance:1,startDate:a.startDate,endDate:a.startDate,replacementMode:'position',positionNumber:a.positionNumber,positionName:a.positionName||'',hoursByDate:{[a.startDate]:Number(a.hours||0)},createdAt:a.createdAt||stamp(),updatedAt:a.updatedAt||stamp(),legacy:true};entries.push(entry);}
   a.casualInputId=id;
  }
  s.casualInputSequence=Math.max(0,Number(s.casualInputSequence)||0,...entries.map(e=>/^CI-\d+$/.test(e.reference||'')?Number(e.reference.slice(3)):0));
  for(const e of entries)if(!e.reference)e.reference=casualReference(s);
  normaliseCasualInstances(entries);inferCasualSettlements(s,entries);return entries;
 }
 function casualAccess(s,id,d=today(),area='payroll'){
  if(area==='payroll'){payroll(s,id,d);return;}if(area!=='mss'||!S.profile(s,id,d).mss)throw Error('Manager Self Service access is required.');
 }
 function casualEntryFinalised(s,entry){
  if(entry.finalisedAt)return true;
  if(!entry.legacy&&entry.createdInCycleId!==undefined)return false;
  const source=rows(s,'additionalEarnings').filter(a=>a.casualInputId===entry.id);
  return (s.payslips||[]).some(p=>p.finalised&&p.empId===entry.empId&&(p.rows||[]).some(r=>r.casualEarnings&&Math.abs(Number(r.amount||0))>0.004&&source.some(a=>Number(a.jobRecord||0)===Number(r.jobRecord||0)&&String(a.positionNumber)===String(r.positionNumber)&&a.startDate>=(r.startDate||'')&&a.startDate<=(r.endDate||r.startDate||''))));
 }
 function casualPayTarget(s,a,current=E.currentCycle(s),view){
  const work=E.cycleForDate(a.startDate);
  if(!work)return {reason:'Work date is outside the payroll calendar.'};
  const backdated=work.id<current.id||E.isFinalised(s,work)&&work.id!==current.id;
  try{view=view||E.jobRecords.scope(s,a.empId,Number(a.jobRecord||0));}catch{return {work,backdated,reason:'Job record is unavailable.'};}
  const target=backdated?current:work;
  if(backdated&&work.end<E.RETRO_PROCESSING_START)return {work,backdated,reason:'Outside the automatic arrears window.'};
  if(E.isPayCeasedOn(view,a.empId,a.startDate)||!E.payEnabledInCycle(view,a.empId,target))return {work,backdated,reason:'Pay is on hold.'};
  return {work,backdated,target};
 }
 function commitCasualInputFinalisation(s,c){
  const entries=new Map(rows(s,'casualInputs').filter(e=>!e.deletedAt).map(e=>[e.id,e])),views=new Map();
  // Current earnings and cumulative retro both settle eligible sources. The
  // net retro can be zero, so a positive payslip line is not required.
  for(const a of rows(s,'additionalEarnings')){
   const entry=entries.get(a.casualInputId);
   if(!entry||!casualInputRow(a)||a.saved===false||casualSourcePaid(s,entry,a)||!(casualGross(s,a).amount>0))continue;
   const key=a.empId+':'+Number(a.jobRecord||0);
   if(!views.has(key)){try{views.set(key,E.jobRecords.scope(s,a.empId,Number(a.jobRecord||0)));}catch{continue;}}
   if(casualPayTarget(s,a,c,views.get(key)).target?.id!==c.id)continue;
   (entry.paidByDate||(entry.paidByDate={}))[a.startDate]=casualSettlement(s,a,c.id);
   if(!entry.finalisedAt){entry.finalisedAt=stamp();entry.finalisedCycleId=c.id;}
  }
  for(const entry of entries.values())for(const [date,paid] of Object.entries(entry.paidByDate||{})){
   if(!paid.pendingRemoval||casualPayTarget(s,{startDate:date,empId:entry.empId,jobRecord:entry.jobRecord},c).target?.id!==c.id)continue;
   entry.paidByDate[date]={...paid,amount:0,hours:0,pendingRemoval:false,removed:true,cycleId:c.id};
  }
 }
 function casualPaymentStatus(s,entry,source=rows(s,'additionalEarnings').filter(a=>a.casualInputId===entry.id&&a.saved!==false)){
  const unknown=!Object.keys(entry.paidByDate||{}).length&&casualEntryFinalised(s,entry);
  const dates=casualWorkDates(entry).sort().map(date=>{
   const a=source.find(a=>a.startDate===date),paid=entry.paidByDate?.[date],settled=a&&casualSourcePaid(s,entry,a);
   const status=settled?'Paid':paid?'Adjustment pending':unknown?'Check pay history':'Pending';
   return {date,hours:Number(entry.hoursByDate[date]),status,historical:settled&&!!paid.historical,cycleId:paid?.cycleId,reason:settled?'':a?casualPayTarget(s,a).reason:'Earnings row is missing.'};
  });
  const paid=dates.filter(d=>d.status==='Paid').length,removed=Object.keys(entry.paidByDate||{}).filter(d=>!dates.some(x=>x.date===d)&&entry.paidByDate[d].pendingRemoval);
  for(const date of removed)dates.push({date,hours:0,status:'Adjustment pending',cycleId:entry.paidByDate[date].cycleId});
  return {status:paid&&paid===dates.length?'Finalised':paid||dates.some(d=>d.status==='Adjustment pending')?'Partially Paid':dates.some(d=>d.status==='Check pay history')?'Check Pay History':'Awaiting Pay',dates:dates.sort((a,b)=>a.date.localeCompare(b.date))};
 }
 function casualDuplicates(s,entry,lines){
  const byId=new Map(rows(s,'casualInputs').filter(e=>!e.deletedAt&&e.id!==entry.id&&e.empId===entry.empId).map(e=>[e.id,e]));
  const dates=new Set(lines.map(a=>a.startDate));
  return rows(s,'additionalEarnings').filter(a=>a.saved!==false&&dates.has(a.startDate)&&Number(a.hours)>0&&byId.has(a.casualInputId)).map(a=>{
   const e=byId.get(a.casualInputId);return {date:a.startDate,reference:e.reference,position:a.positionName||a.positionNumber,hours:Number(a.hours),instance:e.instance};
  }).sort((a,b)=>a.date.localeCompare(b.date)||a.instance-b.instance);
 }
 function casualEntries(s,id,empId,d=today(),area='payroll'){casualAccess(s,id,d,area);return ensureCasualInputs(s).filter(e=>e.empId===empId&&!e.deletedAt).slice().sort((a,b)=>b.startDate.localeCompare(a.startDate)||b.instance-a.instance).map(copy);}
 function replacementPosition(s,input,onDate){
  if(input.replacementMode==='employee'){
   if(!person(s,input.replacedEmployeeId))throw Error('Select the employee being replaced.');
   const n=Number(input.replacedJobRecord??0),view=E.jobRecords.scope(s,input.replacedEmployeeId,n),e=person(view,input.replacedEmployeeId);E.reconcileEmploymentFromJobData(view,e);
   if(!E.isEmployedOn(e,onDate)||E.activeEmploymentType(view,e,onDate)==='Casual')throw Error('The employee being replaced must have a non-casual record on the work date.');
   const job=E.selfService.assignments(view,input.replacedEmployeeId,onDate)[0]||E.activeJobDataRow(view,e,onDate);return s.positions.find(p=>String(p.positionNumber)===String(job?.positionNumber));
  }
  if(input.replacementMode!=='position')throw Error('Choose replacement by employee or position.');
  return s.positions.find(p=>String(p.positionNumber)===String(input.positionNumber));
 }
 function prepareCasualEntry(s,id,input,d,area){
  casualAccess(s,id,d,area);if(!person(s,input.empId)||!activeCasualRecords(s,input.empId,d).length)throw Error('Select an employee with an active casual record.');
  const entries=ensureCasualInputs(s),old=input.id&&entries.find(e=>e.id===input.id&&!e.deletedAt);
  if(input.id&&(!old||old.empId!==input.empId))throw Error('Casual input is not available for this employee.');
  const wasFinalised=old&&casualEntryFinalised(s,old);
  const n=Number(input.jobRecord??0);E.jobRecords.record(s,input.empId,n);if(!old&&!activeCasualRecords(s,input.empId,d).some(r=>r.recordNumber===n))throw Error('Select an active casual record.');
  if(old&&old.jobRecord!==n)throw Error('The record number of a saved casual input cannot be changed.');
  const start=date(input.startDate),end=date(input.endDate);if(end<start)throw Error('End date must not be before start date.');
  if(E.dateDiffDays(start,end)>365)throw Error('Enter a casual date range of no more than 366 days.');const dates=E.daysBetween(start,end);
  if(!input.hoursByDate||typeof input.hoursByDate!=='object'||Array.isArray(input.hoursByDate))throw Error('Open Schedule and enter the hours worked.');
  for(const [day,hours]of Object.entries(input.hoursByDate))if(!dates.includes(day)&&Number(hours)!==0)throw Error('Schedule hours must fall within the work date range.');
  const view=E.jobRecords.scope(s,input.empId,n),e=person(view,input.empId);E.reconcileEmploymentFromJobData(view,e);
  const entryId=old?.id||uid('casual'),hoursByDate={},source=rows(s,'additionalEarnings').filter(a=>a.casualInputId===entryId),sourceByDate=new Map(source.map(a=>[a.startDate,a]));let total=0;
  const generated=[];
  for(const day of dates){
   const value=input.hoursByDate[day]??0,h=Number(value);if(!['number','string'].includes(typeof value)||value===''||!Number.isFinite(h)||h<0||h>24)throw Error('Enter daily hours between 0 and 24.');hoursByDate[day]=h;if(!h)continue;total+=h;
   if(!E.isEmployedOn(e,day)||E.activeEmploymentType(view,e,day)!=='Casual')throw Error('Work dates must fall within casual employment for this record.');
   const cycle=E.cycleForDate(day);if(!cycle)throw Error('The work date is outside the supported payroll calendar.');
   const position=replacementPosition(s,input,day),prior=sourceByDate.get(day);if(!position||position.active===false&&String(prior?.positionNumber)!==String(position.positionNumber))throw Error('Select an active replacement position.');
   const line={id:prior?.id||entryId+'_'+day,empId:input.empId,jobRecord:n,startDate:day,positionNumber:position.positionNumber},base=casualInputRate(s,input.empId,line);if(!Number.isFinite(base)||base<=0)throw Error('The replacement position must have a positive hourly rate.');
   generated.push({...prior,...line,endDate:day,cycleId:cycle.id,earningType:'Casual Earnings',hours:h,casualBaseRate:base,casualLoadingRate:0.25,casualLoadedRate:E.round4(base*1.25),amount:E.round2(h*E.round4(base*1.25)),positionName:position.positionName,positionDepartment:position.department||'',casualInputId:entryId,source:'Casual Input',saved:true,enteredBy:prior?.enteredBy||id,updatedBy:id,updatedAt:stamp()});
  }
  if(total<=0)throw Error('Open Schedule and enter hours for at least one work day.');
  const position=replacementPosition(s,input,start)||replacementPosition(s,input,generated[0].startDate);
  return {entries,old,wasFinalised,n,start,end,entryId,hoursByDate,total,generated,position};
 }
 function previewCasualEntry(s,id,input,d=today(),area='payroll'){
  const state=copy(s),{old,generated}=prepareCasualEntry(state,id,input,d,area),current=E.currentCycle(state);
  const groups=new Map();
  const add=(a,gross,removed=false)=>{
   const {work,backdated,target,reason}=casualPayTarget(state,a,current),settled=!removed&&casualSourcePaid(state,old,a),paid=old?.paidByDate?.[a.startDate];
   const key=settled?'settled:'+paid.cycleId:target?.id??'pending';
   if(!groups.has(key))groups.set(key,{cycleId:settled?paid.cycleId:target?.id,settled,total:0,backdatedTotal:0,lines:[]});
   const group=groups.get(key),amount=settled?0:E.round2(gross-Number(paid?.amount||0));
   group.lines.push({date:a.startDate,position:a.positionName||a.positionNumber,hours:Number(a.hours||0),rate:a.casualLoadedRate,gross,amount,backdated:!!backdated,reason,workCycleId:work?.id,removed});
   group.total=E.round2(group.total+amount);if(backdated)group.backdatedTotal=E.round2(group.backdatedTotal+amount);
  };
  generated.forEach(a=>add(a,a.amount));
  for(const [day,paid] of Object.entries(old?.paidByDate||{})){
   if(!paid.removed&&!generated.some(a=>a.startDate===day))add({startDate:day,empId:old.empId,jobRecord:old.jobRecord,positionNumber:paid.positionNumber,casualLoadedRate:paid.rate},0,true);
  }
  return {groups:[...groups.values()].sort((a,b)=>(a.cycleId??Infinity)-(b.cycleId??Infinity)),duplicates:casualDuplicates(state,input,generated)};
 }
 function saveCasualEntry(s,id,input,d=today(),area='payroll'){
  const {entries,old,wasFinalised,n,start,end,entryId,hoursByDate,total,generated,position}=prepareCasualEntry(s,id,input,d,area);
  const paidByDate={...old?.paidByDate};
  for(const [day,paid] of Object.entries(paidByDate))if(!paid.removed)paidByDate[day]={...paid,pendingRemoval:!(hoursByDate[day]>0)};
  const entry={...old,reference:old?.reference||casualReference(s),paidByDate,...(wasFinalised&&!old.finalisedAt?{finalisedAt:stamp()}:{}),id:entryId,empId:input.empId,jobRecord:n,instance:casualInputInstance(s,{...input,id:entryId,startDate:start,endDate:end,hoursByDate},entries),startDate:start,endDate:end,replacementMode:input.replacementMode,replacedEmployeeId:input.replacementMode==='employee'?input.replacedEmployeeId:'',replacedJobRecord:input.replacementMode==='employee'?Number(input.replacedJobRecord||0):null,positionNumber:position.positionNumber,positionName:position.positionName,hoursByDate,totalHours:E.round4(total),comments:String(input.comments||'').trim().slice(0,20000),createdAt:old?.createdAt||stamp(),createdInCycleId:old?old.createdInCycleId:E.currentCycle(s).id,updatedAt:stamp(),updatedBy:id};
  s.additionalEarnings=rows(s,'additionalEarnings').filter(a=>a.casualInputId!==entryId).concat(generated);const index=entries.findIndex(e=>e.id===entryId);if(index<0)entries.push(entry);else entries[index]=entry;audit(s,id,'Saved Casual Input '+entry.reference+' for '+entry.empId);return copy(entry);
 }
 function deleteCasualEntry(s,id,entryId,d=today(),area='payroll'){
  casualAccess(s,id,d,area);const entry=ensureCasualInputs(s).find(e=>e.id===entryId&&!e.deletedAt);if(!entry)throw Error('Casual input no longer exists.');
  if(area==='mss'&&casualEntryFinalised(s,entry))throw Error('This casual input has been finalised. Raise a support request with Payroll to delete it.');
  s.additionalEarnings=rows(s,'additionalEarnings').filter(a=>a.casualInputId!==entryId);entry.deletedAt=stamp();entry.deletedBy=id;audit(s,id,'Deleted Casual Input '+entry.reference+' for '+entry.empId+'; settled pay is corrected through retro processing.');
 }
 function casualReview(s,id,d=today()){
  payroll(s,id,d);const entries=ensureCasualInputs(s).filter(e=>!e.deletedAt),c=E.currentCycle(s),byId=new Map(entries.map(e=>[e.id,e])),issues=[];
  const sources=rows(s,'additionalEarnings').filter(a=>a.saved!==false&&byId.has(a.casualInputId));
  const add=(entry,date,type,detail)=>issues.push({id:entry.id,reference:entry.reference,empId:entry.empId,name:E.employeeDisplayName(person(s,entry.empId)||{id:entry.empId}),date,type,detail});
  for(const entry of entries)for(const date of casualWorkDates(entry)){
   const a=sources.find(a=>a.casualInputId===entry.id&&a.startDate===date);
   if(!a){add(entry,date,'Missing earnings','No linked earnings line for this worked date.');continue;}
   const rate=casualGross(s,a).rate;
   if(!Number.isFinite(rate)||rate<=0)add(entry,date,'Missing rate','No positive hourly rate for '+(a.positionName||a.positionNumber||'the replacement position')+'.');
   if(date>c.end||casualSourcePaid(s,entry,a))continue;
   for(const dup of casualDuplicates(s,entry,[a]))add(entry,date,'Possible duplicate',dup.reference+' · '+dup.position+' · '+dup.hours+' h · instance '+dup.instance);
   if(date<c.start){const {reason}=casualPayTarget(s,a,c);add(entry,date,'Unpaid backdated work',reason||'Not yet confirmed in a finalised pay.');}
  }
  return issues.sort((a,b)=>a.date.localeCompare(b.date)||a.reference.localeCompare(b.reference));
 }
 function saveResponse(s,id,input,d=today()){payroll(s,id,d);if(!String(input.name||'').trim()||!String(input.body||'').trim())throw Error('Template name and reply are required.');if(input.name.length>100||input.body.length>20000)throw Error('Template name or reply is too long.');let r=rows(s,'supportResponseTemplates').find(r=>r.id===input.id);if(!r){r={id:uid('reply')};s.supportResponseTemplates.push(r);}Object.assign(r,{name:String(input.name).trim(),body:String(input.body),active:input.active!==false,updatedBy:id,updatedAt:stamp()});audit(s,id,'Updated support response template '+r.name);return r;}
 function saveOnCall(s,id,input,d=today()){payroll(s,id,d);if(!person(s,input.empId))throw Error('Select an employee.');if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(input.start||'')||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(input.end||''))throw Error('Enter start and end date/time.');date(input.start.slice(0,10));date(input.end.slice(0,10));const hours=(new Date(input.end+'+08:00')-new Date(input.start+'+08:00'))/3600000,rate=E.ON_CALL_ALLOWANCE_RATE;if(!Number.isFinite(hours)||hours<=0||hours>336||!Number.isFinite(rate)||rate<=0)throw Error('Enter a positive rate and a period of up to 14 days.');const endDay=input.end.endsWith('T00:00')?E.addDays(input.end.slice(0,10),-1):input.end.slice(0,10);if(!S.isActiveEmployee(s,person(s,input.empId),input.start.slice(0,10))||!S.isActiveEmployee(s,person(s,input.empId),endDay))throw Error('On-call periods must fall within active employment.');const c=E.cycleForDate(input.start.slice(0,10));if(!c||endDay>c.end)throw Error('Split on-call periods at pay-period boundaries.');if(E.isFinalised(s,c))throw Error('Use an open pay period for on-call entries.');if((s.onCallPeriods||[]).some(r=>r.empId===input.empId&&r.start<input.end&&input.start<r.end))throw Error('This on-call period overlaps another entry.');const r={id:uid('oncall'),empId:input.empId,start:input.start,end:input.end,rate,hours:E.round4(hours),superEligible:false,createdBy:id,createdAt:stamp()},a={id:uid('add'),empId:r.empId,cycleId:c.id,earningType:'On-call Allowance',startDate:input.start.slice(0,10),endDate:endDay,hours:r.hours,unitRate:rate,amount:E.round2(r.hours*rate),ote:r.superEligible,accruesLeave:false,saved:true,onCallId:r.id};r.additionalId=a.id;rows(s,'onCallPeriods').push(r);s.additionalEarnings.push(a);audit(s,id,'Recorded on-call period '+r.id);return r;}
 function removeOnCall(s,id,recordId,d=today()){payroll(s,id,d);const r=rows(s,'onCallPeriods').find(x=>x.id===recordId);if(!r)throw Error('Entry not found.');if(E.isFinalised(s,E.cycleForDate(r.start.slice(0,10))))throw Error('Finalised on-call periods cannot be deleted.');s.additionalEarnings=s.additionalEarnings.filter(a=>a.onCallId!==r.id);s.onCallPeriods=s.onCallPeriods.filter(x=>x.id!==r.id);audit(s,id,'Deleted on-call period '+r.id);}
 function validateOnCallAdditional(s,a){
  const e=person(s,a.empId);date(a.startDate);date(a.endDate);
  if(!e||a.endDate<a.startDate||!E.isEmployedOn(e,a.startDate)||!E.isEmployedOn(e,a.endDate))throw Error('On-call dates must fall within active employment.');
  const hours=Number(a.hours);
  if(!Number.isFinite(hours)||hours<=0||hours>E.calendarDaysInclusive(a.startDate,a.endDate)*24)throw Error('Enter positive on-call hours. Hours cannot exceed the covered period.');
 }

 const Time=E.timeRecords;

 function leaveOverviewSettings(s){const c=s.leaveOverviewSettings||{};return {extendedDays:Number.isInteger(c.extendedDays)&&c.extendedDays>=1&&c.extendedDays<=3650?c.extendedDays:14,reminderDays:Number.isInteger(c.reminderDays)&&c.reminderDays>=1&&c.reminderDays<=90?c.reminderDays:7};}
 function saveLeaveOverviewSettings(s,id,input,d=today()){payroll(s,id,d);const extendedDays=Number(input.extendedDays),reminderDays=Number(input.reminderDays);if(!Number.isInteger(extendedDays)||extendedDays<1||extendedDays>3650||!Number.isInteger(reminderDays)||reminderDays<1||reminderDays>90)throw Error('Enter whole calendar days: extended absence 1–3650; reminders 1–90.');s.leaveOverviewSettings={extendedDays,reminderDays};audit(s,id,'Updated extended absence and return reminder settings.');}
 function leaveEpisodes(s,asOf=today()){
  const concurrent=s.employees.filter(e=>E.jobRecords.multiple(s,e.id));if(concurrent.length){const ids=new Set(concurrent.map(e=>e.id)),out=leaveEpisodes({...s,employees:s.employees.filter(e=>!ids.has(e.id))},asOf);for(const e of concurrent)for(const r of E.jobRecords.records(s,e.id)){const v=E.jobRecords.scope(s,e.id,r.recordNumber);v.employees=v.employees.filter(x=>x.id===e.id);out.push(...leaveEpisodes(v,asOf).map(row=>({...row,jobRecord:r.recordNumber,name:row.name+' · Job '+r.recordNumber})));}return out.sort((a,b)=>a.end.localeCompare(b.end)||a.name.localeCompare(b.name));}
  const result=[];
  for(const e of s.employees||[]){
   const bookings=(s.leaveBookings||[]).filter(l=>l.empId===e.id&&E.leaveBookingIsApproved(l)&&l.startDate&&l.endDate&&l.endDate>=l.startDate).slice().sort((a,b)=>a.startDate.localeCompare(b.startDate)||a.endDate.localeCompare(b.endDate));
   const episodes=[];for(const l of bookings){const last=episodes.at(-1),gap=last&&E.daysBetween(E.addDays(last.end,1),E.addDays(l.startDate,-1));const join=last&&(l.startDate<=E.addDays(last.end,1)||gap.every(date=>!Number(E.activeSchedule(s,e.id,date)?.hoursByDay?.[E.parseDate(date).getDay()]||0)||E.isPublicHoliday(date)));
    if(join){if(l.endDate>last.end)last.end=l.endDate;last.bookings.push(l);}else episodes.push({start:l.startDate,end:l.endDate,bookings:[l]});
   }
   for(const episode of episodes){const length=E.dateDiffDays(episode.start,episode.end)+1;if(length<leaveOverviewSettings(s).extendedDays)continue;
    let returnDate='';for(let n=1;n<=366;n++){const date=E.addDays(episode.end,n);if(!S.isActiveEmployee(s,e,date))break;const hours=Number(E.activeSchedule(s,e.id,date)?.hoursByDay?.[E.parseDate(date).getDay()]||0);if((hours>0&&!E.isPublicHoliday(date))||E.isCasualOnly(s,e,date)){returnDate=date;break;}}
    const current=S.isActiveEmployee(s,e,asOf)&&episode.start<=asOf&&episode.end>=asOf;
    result.push({empId:e.id,name:E.employeeDisplayName(e),start:episode.start,end:episode.end,days:length,elapsed:Math.max(0,Math.min(length,E.dateDiffDays(episode.start,asOf)+1)),returnDate,current,types:[...new Set(episode.bookings.map(l=>l.type===E.FDV_LEAVE_TYPE?'Approved Leave':l.type==='LWOP'?'Leave without Pay':l.type))],leaveIds:episode.bookings.map(l=>l.id)});
   }
  }return result.sort((a,b)=>a.end.localeCompare(b.end)||a.name.localeCompare(b.name));
 }
 function extendedAbsences(s,asOf=today()){return leaveEpisodes(s,asOf).filter(r=>r.current);}
 function ensureReturnLeaveNotifications(s,asOf=today()){
  const desired=new Map(),lead=leaveOverviewSettings(s).reminderDays;
  for(const r of leaveEpisodes(s,asOf)){if(r.start>asOf||!r.returnDate||!S.isActiveEmployee(s,person(s,r.empId),asOf))continue;const remaining=E.dateDiffDays(asOf,r.returnDate);if(remaining<1||remaining>lead)continue;
   for(const managerId of S.managerFor(E.jobRecords.multiple(s,r.empId)?E.jobRecords.scope(s,r.empId,r.jobRecord||0):s,r.empId,asOf).managerIds||[]){const key='leave-return:'+r.empId+':'+(r.jobRecord!==undefined?'job'+r.jobRecord+':':'')+r.start+':'+r.returnDate+':'+managerId;desired.set(key,{id:uid('alert'),key,type:'Return from Leave Reminder',message:r.name+' ('+r.empId+') is expected to return from extended leave on '+E.fmtPay(r.returnDate)+'.',recipientIds:[managerId],readBy:[],read:false,createdAt:stamp(),empId:r.empId,action:{area:'mss',page:'requests',empId:r.empId}});}
  }
  const alerts=rows(s,'alerts'),kept=alerts.filter(a=>a.type!=='Return from Leave Reminder'||desired.has(a.key));let changed=kept.length!==alerts.length;const existing=new Set(kept.map(a=>a.key));for(const a of kept){const latest=desired.get(a.key);if(latest&&a.message!==latest.message){a.message=latest.message;changed=true;}}for(const [key,a]of desired)if(!existing.has(key)){kept.unshift(a);changed=true;}if(changed)s.alerts=kept;return changed;
 }
 return {previewCasualEntry,casualPaymentStatus,casualReview,casualInputInstance,casualAccess,casualEntryFinalised,commitCasualInputFinalisation,activeCasualRecords,ensureCasualInputs,casualEntries,replacementPosition,saveCasualEntry,deleteCasualEntry,casualRecords,casualInputRows,casualInputRate,saveCasualInput,negativeNetErrors,notifyRecoveryCompletions,leaveOverviewSettings,saveLeaveOverviewSettings,leaveEpisodes,extendedAbsences,ensureReturnLeaveNotifications,validateOnCallAdditional,payroll,scope,attachments,leaveFiles,thresholds,excess,rosterComparison,establishment,acting,expiries,recovery,saveProbation,saveResponse,saveOnCall,removeOnCall,...Time};
}
async function readFiles(files){const list=Array.from(files||[]);if(list.length>5||list.some(f=>f.size>1048576)||list.reduce((n,f)=>n+f.size,0)>2097152)throw Error('Attach up to five files, 1 MB each and 2 MB total.');return Promise.all(list.map(f=>new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve({name:f.name,size:f.size,data:r.result});r.onerror=()=>reject(Error('Unable to read '+f.name));r.readAsDataURL(f);})));}
function download(f,doc=g.document){const encoded=f.data.split(',')[1],data=Uint8Array.from(atob(encoded),c=>c.charCodeAt(0)),url=URL.createObjectURL(new Blob([data],{type:'application/octet-stream'})),a=doc.createElement('a');a.href=url;a.download=f.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
const api={create,readFiles,download};g.PayrollOperations=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
