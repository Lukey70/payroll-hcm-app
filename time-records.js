(function(g){
'use strict';
const clone=x=>JSON.parse(JSON.stringify(x)),stamp=()=>new Date().toISOString(),uid=()=> 'time_'+Date.now()+'_'+Math.random().toString(16).slice(2);
function create(E,S){
 const CAP=37.5,today=()=>E.iso(new Date()),employee=(s,id)=>s.employees.find(e=>e.id===id),list=(s,k)=>s[k]||(s[k]=[]);
 function audit(s,id,text){list(s,'auditLog').unshift(stamp()+' — '+id+': '+text);}
 function notify(s,ids,message,t,page){if(!ids.length)return;list(s,'alerts').unshift({id:uid(),type:'Timesheet',message,recipientIds:[...new Set(ids)],readBy:[],read:false,createdAt:stamp(),action:{area:page==='approvals'?'mss':'ess',page:page==='approvals'?'approvals':'leave',timesheetId:t.id}});}
 function cycle(id){const c=E.PAY_CYCLES.find(c=>c.id===Number(id));if(!c)throw Error('Select a valid fortnight.');return c;}
 function payroll(s,id,d=today()){if(!S.profile(s,id,d).payroll)throw Error('Payroll Management access is required.');}
 function timesheets(s,id,area='ess',d=today()){
  if(area==='payroll'){payroll(s,id,d);return list(s,'timesheets');}
  S.assertScope(s,id,id,'ess',d);
  const ids=area==='mss'?S.directReports(s,id,d).map(e=>e.id):[id];return list(s,'timesheets').filter(t=>ids.includes(t.empId));
 }
 function minute(time){if(!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time||''))throw Error('Enter times as HH:MM.');return Number(time.slice(0,2))*60+Number(time.slice(3));}
 function normalise(s,empId,cycleId,days=[],strict=false,snapshots=false){
  const c=cycle(cycleId),person=employee(s,empId);if(!person)throw Error('Employee not found.');
  if(!Array.isArray(days)||days.length>14)throw Error('A fortnight has at most fourteen day records.');
  const byDate=new Map();for(const day of days){if(!day||!E.daysBetween(c.start,c.end).includes(day.date)||byDate.has(day.date))throw Error('Timesheet dates must be unique and within the fortnight.');byDate.set(day.date,day);}
  const result=[],intervals=[];let hasRecord=false;
  for(const date of E.daysBetween(c.start,c.end)){
   const input=byDate.get(date)||{},blocks=input.blocks||[];if(!Array.isArray(blocks)||blocks.length>6)throw Error('Use at most six work periods per day.');
   let first=null,last=null,workedMinutes=0,breakMinutes=0,incomplete=false;const clean=[];
   for(const b of blocks){
    const start=String(b.start||'').trim(),finish=String(b.finish||'').trim();
    if(start)minute(start);if(finish)minute(finish);
    if(!start&&!finish){clean.push({start:'',finish:''});continue;}
    if(!start||!finish){if(strict)throw Error('Complete both On and Off times for '+E.fmtPay(date)+'.');incomplete=true;clean.push({start,finish});continue;}
    let a=minute(start),z=minute(finish);if(a===z)throw Error('On and Off times must differ on '+E.fmtPay(date)+'.');
    if(last!==null)while(a<last)a+=1440;
    z+=Math.floor(a/1440)*1440;if(z<a)z+=1440;
    if(first===null)first=a;if(z-first>1440)throw Error('Work periods overlap or span more than 24 hours on '+E.fmtPay(date)+'.');
    if(last!==null)breakMinutes+=a-last;
    workedMinutes+=z-a;last=z;clean.push({start,finish});
    const base=E.dateDiffDays('2000-01-01',date)*1440;intervals.push({start:base+a,end:base+z});hasRecord=true;
   }
   const schedule=E.activeSchedule(s,empId,date),liveRoster=Number(schedule?.hoursByDay?.[E.parseDate(date).getDay()]||0);
   const roster=snapshots&&Number.isFinite(Number(input.rosteredHours))?Number(input.rosteredHours):liveRoster;
   const flexTaken=Number(input.flexTaken||0);if(!Number.isFinite(flexTaken)||flexTaken<0||flexTaken>24)throw Error('Flex Time Taken must be between 0 and 24 hours.');
   const worked=E.round4(workedMinutes/60),earned=E.round4(Math.max(0,worked-(roster>0?roster:7.5)));
   if(flexTaken>Math.max(0,roster-worked)+0.0001)throw Error('Flex Time Taken cannot exceed the rostered hours not worked on '+E.fmtPay(date)+'.');
   const remarks=String(input.remarks||'');if(remarks.length>2000)throw Error('Daily remarks must be at most 2,000 characters.');
   if((worked>0||flexTaken>0||remarks)&&!(E.isEmployedOn(person,date)||S.isActiveEmployee(s,person,date)))throw Error('Time records must fall within the employee’s employment.');
   if(flexTaken>0||remarks)hasRecord=true;
   result.push({date,blocks:clean,flexTaken:E.round4(flexTaken),remarks,rosteredHours:roster,workedHours:worked,breakHours:E.round4(breakMinutes/60),flexEarned:earned,totalHours:E.round4(worked+flexTaken),additionalDay:roster===0&&worked>0,incomplete});
  }
  intervals.sort((a,b)=>a.start-b.start);for(let i=1;i<intervals.length;i++)if(intervals[i].start<intervals[i-1].end)throw Error('Work periods on adjacent dates overlap.');
  return {days:result,hasRecord,intervals};
 }
 function validateTimes(s,empId,recordId,checked){
  for(const t of s.timesheets||[])if(t.empId===empId&&t.id!==recordId&&t.schemaVersion===2&&['Approved','Awaiting Manager Approval'].includes(t.status)){
   const other=normalise(s,empId,t.cycleId,t.days||[],false,true);
   for(const a of checked.intervals)for(const b of other.intervals)if(a.start<b.end&&b.start<a.end)throw Error('Work times overlap another submitted time record, including across fortnight boundaries.');
  }
 }
 function totals(days){const sum=key=>E.round4(days.reduce((n,d)=>n+Number(d[key]||0),0));return {worked:sum('workedHours'),breaks:sum('breakHours'),rostered:sum('rosteredHours'),earned:sum('flexEarned'),taken:sum('flexTaken'),total:sum('totalHours')};}
 function opening(s,empId){const value=Number(s.flexOpeningBalances?.[empId]||0);return Number.isFinite(value)?Math.max(0,Math.min(CAP,value)):0;}
 function applyFlex(balance,days,strict=false){
  let current=balance;for(const day of days){current=E.round4(current+day.flexEarned-day.flexTaken);if(strict&&current< -0.0001)throw Error('Insufficient approved flex balance for '+E.fmtPay(day.date)+'.');}
  return {closing:E.round4(Math.min(CAP,current)),uncapped:E.round4(current),excess:E.round4(Math.max(0,current-CAP))};
 }
 function carriedForward(s,empId,cycleId){
  let balance=opening(s,empId);
  const records=list(s,'timesheets').filter(t=>t.empId===empId&&t.schemaVersion===2&&t.status==='Approved'&&Number(t.cycleId)<Number(cycleId)).sort((a,b)=>Number(a.cycleId)-Number(b.cycleId));
  for(const t of records){const days=normalise(s,empId,t.cycleId,t.days,false,true).days;balance=applyFlex(balance,days).closing;}return balance;
 }
 function dayReferences(s,empId,day,asOf){
  const approvedLeave=(s.leaveBookings||[]).filter(l=>l.empId===empId&&E.leaveBookingIsApproved(l)&&l.startDate<=day.date&&l.endDate>=day.date).map(l=>{
   const explicit=l.startDate===l.endDate?(l.requestedHours??l.hours):undefined,hours=explicit!==undefined&&explicit!==null&&String(explicit)!==''?Math.min(day.rosteredHours,Math.max(0,Number(explicit)||0)):day.rosteredHours;
   return {id:l.id,type:l.type===E.FDV_LEAVE_TYPE?'Approved Leave':l.type==='LWOP'?'Leave without Pay':l.type,hours:E.round4(hours)};
  });
  const person=employee(s,empId),employed=E.isEmployedOn(person,day.date)||S.isActiveEmployee(s,person,day.date);
  const missingRecord=day.date<asOf&&![0,6].includes(E.parseDate(day.date).getDay())&&employed&&day.rosteredHours>0&&day.workedHours===0&&day.flexTaken===0&&!day.incomplete&&!approvedLeave.some(l=>l.hours>0)&&!E.isPublicHoliday(day.date);
  return {...day,approvedLeave,missingRecord};
 }
 function summary(s,t,asOf=today()){
  const days=normalise(s,t.empId,t.cycleId,t.days||[],false,t.status!=='Draft'&&t.status!=='Denied').days.map(day=>dayReferences(s,t.empId,day,asOf)),carried=carriedForward(s,t.empId,t.cycleId),result=applyFlex(carried,days);
  return {days,...totals(days),carried,...result,cap:CAP,provisional:t.status!=='Approved'};
 }
 function validateLedger(s,empId,candidate){
  let balance=opening(s,empId);
  const records=list(s,'timesheets').filter(t=>t.empId===empId&&t.schemaVersion===2&&t.status==='Approved'&&t.id!==candidate.id).concat(candidate).sort((a,b)=>Number(a.cycleId)-Number(b.cycleId));
  for(const t of records){const days=normalise(s,empId,t.cycleId,t.days||[],true,true).days;balance=applyFlex(balance,days,true).closing;}
 }
 function saveTimesheet(s,id,input,submit=false,d=today()){
  S.assertScope(s,id,id,'ess',d);if(Object.hasOwn(input,'lines'))throw Error('Timesheets record On/Off times and flex only. Enter payments separately in Additional Earnings.');
  const c=cycle(input.cycleId);if(c.id>E.currentCycle(s).id)throw Error('Future pay periods are not available for timesheets.');const old=list(s,'timesheets').find(t=>t.id===input.id);
  if(old&&(old.empId!==id||!['Draft','Denied'].includes(old.status)))throw Error('Only your draft or denied time records can be edited.');
  if(list(s,'timesheets').some(t=>t.id!==input.id&&t.empId===id&&Number(t.cycleId)===c.id))throw Error('A timesheet already exists for this fortnight.');
  const checked=normalise(s,id,c.id,input.days||[],submit),remarks=String(input.remarks||'');
  if(remarks.length>20000)throw Error('Remarks must be at most 20,000 characters.');
  if(submit&&!checked.hasRecord&&!remarks.trim())throw Error('Enter work times, flex taken or remarks before submitting.');
  const manager=S.managerFor(s,id,d);if(submit&&!manager.automatic&&(!manager.managerIds.length||manager.message))throw Error('A valid Reports To manager is required.');
  if(submit)validateTimes(s,id,old?.id,checked);
  if(submit)applyFlex(carriedForward(s,id,c.id),checked.days,true);
  const at=stamp(),next={...(old||{id:uid(),empId:id,createdAt:at}),schemaVersion:2,revision:(old?.revision||0)+1,cycleId:c.id,days:checked.days,remarks,status:submit?'Awaiting Manager Approval':'Draft',submittedAt:submit?at:'',updatedAt:at,approverIds:manager.managerIds||[],comment:'',decidedBy:'',decidedAt:'',needsTimeDetails:false,history:[...(old?.history||[]),{status:submit?'Awaiting Manager Approval':'Draft',at,actorId:id}]};
  if(submit&&manager.automatic){next.status='Approved';next.decidedBy=id;next.decidedAt=at;next.history.push({status:'Approved',at,actorId:id,automatic:true});validateLedger(s,id,next);}
  const index=list(s,'timesheets').findIndex(t=>t.id===next.id);if(index<0)s.timesheets.push(next);else s.timesheets[index]=next;
  if(submit&&!manager.automatic)notify(s,manager.managerIds,'Time and flex record submitted by '+E.employeeName(employee(s,id)),next,'approvals');
  audit(s,id,(submit?'Submitted':'Saved')+' time and flex record '+next.id);return next;
 }
 function approveTimesheet(s,id,recordId,status,comment='',d=today()){
  const t=list(s,'timesheets').find(t=>t.id===recordId);if(!t||t.schemaVersion!==2||t.status!=='Awaiting Manager Approval')throw Error('This time record is no longer awaiting approval.');
  S.assertScope(s,id,t.empId,'mss',d);if(!S.managerFor(s,t.empId,d).managerIds.includes(id))throw Error('You are not a current approver.');
  if(!['Approved','Denied'].includes(status))throw Error('Select Approve or Deny.');if(status==='Denied'&&!String(comment).trim())throw Error('Enter a reason for denial.');
  if(String(comment).length>20000)throw Error('Comment is too long.');
  const checked=normalise(s,t.empId,t.cycleId,t.days,true,true),days=checked.days;if(status==='Approved')validateTimes(s,t.empId,t.id,checked);if(status==='Approved')validateLedger(s,t.empId,{...t,days,status});
  const at=stamp();Object.assign(t,{revision:(t.revision||0)+1,days,status,comment:String(comment).trim(),decidedBy:id,decidedAt:at,updatedAt:at,history:[...(t.history||[]),{status,at,actorId:id,comment:String(comment).trim()}]});
  notify(s,[t.empId],'Your time and flex record for '+E.cycleDisplay(cycle(t.cycleId))+' was '+status.toLowerCase(),t,'timesheets');audit(s,id,status+' time and flex record '+t.id);return t;
 }
 function withdrawTimesheet(s,id,recordId,d=today()){
  S.assertScope(s,id,id,'ess',d);const t=list(s,'timesheets').find(t=>t.id===recordId);if(!t||t.empId!==id||!['Draft','Denied','Awaiting Manager Approval'].includes(t.status))throw Error('Only your unapproved time records can be withdrawn.');
  list(s,'timesheetRecordArchive').push({...clone(t),status:'Withdrawn',withdrawnAt:stamp(),withdrawnBy:id});s.timesheets=s.timesheets.filter(x=>x.id!==recordId);audit(s,id,'Withdrew time and flex record '+recordId);
 }
 function migrateTimesheets(s){
  let archived=0,detached=0,converted=0;const keep=[];
  for(const a of s.additionalEarnings||[]){
   if(!a.sourceTimesheetId){keep.push(a);continue;}
   const c=E.cycleForDate(a.startDate)||E.PAY_CYCLES.find(c=>c.id===Number(a.cycleId));
   if(c&&E.isFinalised(s,c)){const preserved={...a,legacyTimesheetSourceId:a.sourceTimesheetId,timesheetPayLinkDetachedAt:stamp()};delete preserved.sourceTimesheetId;keep.push(preserved);detached++;}
   else{list(s,'timesheetPayrollArchive').push({...clone(a),archivedAt:stamp(),reason:'Timesheets are time/flex records only; Payroll must enter any payment manually.'});archived++;}
  }
  s.additionalEarnings=keep;
  for(const t of s.timesheets||[])if(t.schemaVersion!==2){const previous=clone(t);Object.assign(t,{schemaVersion:2,legacyHoursRecord:previous,days:[],remarks:t.remarks||'',status:'Draft',decidedBy:'',decidedAt:'',needsTimeDetails:true,comment:'Earlier hours-only record retained for reference. Enter actual On/Off times and resubmit.',updatedAt:stamp(),history:[...(t.history||[]),{status:'Draft',at:stamp(),source:'Time-only migration'}]});delete t.lines;converted++;}
  if(archived||detached||converted){audit(s,'System','Converted '+converted+' legacy time records; archived '+archived+' unfinalised generated earnings; detached '+detached+' finalised sources without changing saved payslips.');s.payResults={};}
  return {archived,detached,converted};
 }
 return {CAP,timesheets,normalise,totals,summary,carriedForward,saveTimesheet,approveTimesheet,withdrawTimesheet,migrateTimesheets};
}
const api={create};g.TimeRecords=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
