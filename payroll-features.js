(function(g){
 'use strict';
 const CASH_TYPES=['Annual Leave Cash Out','Long Service Leave Cash Out'];
 const REASONS={Commencement:['New Hire Permanent','New Hire Fixed-Term','New Hire Casual','Rehire Permanent','Rehire Fixed-Term','Rehire Casual','New Fixed Term Contract'],Variation:['Work Schedule Adjustment','Permanency Confirmed','Permanency Removed','Position Refresh','Pay Rate Change'],Movement:['Acting Same Level','Acting Higher Level','Acting Lower Level','Return from Temp Assignment','Promotion','Regression'],Termination:['Voluntary Resignation','Voluntary Retirement','Appointment Cancelled','Expiry of Fixed Term','Deceased','Misconduct','Abandonment','Redundant','Dismissal','Ill Health']};
 function create(E){
  function migrateCashOuts(s){
   for(const c of s.cashOutRequests||[]){if(c.deleted)continue;const existing=s.additionalEarnings.find(a=>a.legacyCashOutId===c.id);if(existing){c.additionalId=existing.id;continue;}const cycle=E.cycleById(c.cycleId),date=c.effectiveDate||cycle.start,rate=E.activePayRate(s,c.empId,date).hourlyRate;
    const description=c.leaveType==='Long Service Leave'?CASH_TYPES[1]:CASH_TYPES[0],paid=(s.payslips||[]).filter(p=>p.empId===c.empId&&Number(p.cycleId)===Number(c.cycleId)&&p.finalised).flatMap(p=>p.rows||[]).find(r=>r.description===description&&r.startDate===date&&Number(r.units)===Number(c.hours));
    c.additionalId='cashrow_'+c.id;s.additionalEarnings.push({id:c.additionalId,legacyCashOutId:c.id,empId:c.empId,cycleId:c.cycleId,earningType:c.leaveType==='Long Service Leave'?CASH_TYPES[1]:CASH_TYPES[0],startDate:date,endDate:date,hours:Number(c.hours),amount:paid?Number(paid.amount):E.round2(Number(c.hours)*Number(rate)),saved:c.saved!==false,migrated:true});
   }
  }
  function validateCashDraft(s,empId,cycle,rows){
   const old=s.additionalEarnings.filter(a=>a.empId===empId&&Number(a.cycleId)===cycle.id&&CASH_TYPES.includes(a.earningType));
   const cash=rows.filter(a=>CASH_TYPES.includes(a.earningType));
   if(E.isFinalised(s,cycle)){
    const clean=a=>JSON.stringify([a.id,a.earningType,Number(a.hours),a.startDate,a.endDate]);
    if(JSON.stringify(old.map(clean).sort())!==JSON.stringify(cash.map(clean).sort()))throw Error('Finalised cash-outs are historical and cannot be changed here.');return;
   }
   if(cash.length&&cycle.id!==E.currentCycle(s).id)throw Error('Enter new cash-outs in the current open pay period.');
   if(!cash.length)return;
   const copy=Object.assign({},s,{cashOutRequests:(s.cashOutRequests||[]).filter(c=>!(c.empId===empId&&Number(c.cycleId)===cycle.id))});
   const e=s.employees.find(e=>e.id===empId),balances=E.projectedBalances(copy,e,cycle,false);
   for(const type of CASH_TYPES){const hours=cash.filter(a=>a.earningType===type).reduce((n,a)=>n+Number(a.hours),0),available=type===CASH_TYPES[0]?balances.annual:balances.lslAccrued;
    if(cash.some(a=>a.earningType===type&&(!Number.isFinite(Number(a.hours))||Number(a.hours)<=0)))throw Error('Enter positive cash-out hours.');if(hours>available+0.0001)throw Error(type+' exceeds available leave credits.');}
  }
  function syncCashOuts(s,empId,cycle){
   const rows=s.additionalEarnings.filter(a=>a.empId===empId&&Number(a.cycleId)===cycle.id&&CASH_TYPES.includes(a.earningType));
   const keys=new Set(rows.map(a=>a.legacyCashOutId).filter(Boolean));
   s.cashOutRequests=s.cashOutRequests.filter(c=>!(c.empId===empId&&Number(c.cycleId)===cycle.id&&c.additionalId&&!keys.has(c.id)));
   for(const a of rows){let c=s.cashOutRequests.find(c=>c.id===a.legacyCashOutId);if(c){c.additionalId=a.id;if(E.isFinalised(s,cycle))continue;}else{a.legacyCashOutId='cash_'+a.id;c={id:a.legacyCashOutId};s.cashOutRequests.push(c);}
    Object.assign(c,{additionalId:a.id,empId,cycleId:cycle.id,effectiveDate:a.startDate,leaveType:a.earningType===CASH_TYPES[1]?'Long Service Leave':'Annual Leave',hours:Number(a.hours),saved:true,deleted:false});}
  }
  function statement(s,id,date){
   const e=s.employees.find(e=>e.id===id);if(!e)throw Error('Select an employee.');if(!/^\d{4}-\d{2}-\d{2}$/.test(date||'')||E.iso(E.parseDate(date))!==date)throw Error('Enter a valid as-at date.');if(!E.isEmployedOn(e,date))throw Error('Employee must be employed on the as-at date.');
   const type=E.activeEmploymentType(s,e,date);if(type==='Casual')throw Error('Casual employees do not have guaranteed regular fortnightly earnings.');
   const schedule=E.activeSchedule(s,id,date);if(!schedule)throw Error('No active roster was found.');
   const hours=E.weeklyHoursFromSchedule(schedule)*2;
   const rate=E.activePayRate(s,id,date),gross=E.round2(hours*Number(rate.hourlyRate||0));
   if(hours<=0||Number(rate.hourlyRate)<=0)throw Error('A valid roster and pay rate are required.');
   return {name:E.employeeName(e),type,hours,position:rate.position||e.position,regular:gross,gross,date,fullTime:hours>=E.STANDARD_WEEKLY_HOURS*2};
  }
  function validateTemplate(type,d,raisedFor,s){
   if(!Object.hasOwn(REASONS,type))throw Error('Select a valid request type.');
   const validDate=(key,value)=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(value||'')||E.iso(E.parseDate(value))!==value)throw Error('Enter a valid '+key.replace(/([A-Z])/g,' $1').toLowerCase()+'.');};
   if(type!=='Commencement'&&raisedFor==='new-employee')throw Error('Select an existing employee for this request.');
   if(type==='Termination'){if(!REASONS.Termination.includes(d.reason))throw Error('Select a valid termination reason.');if(!String(d.lastWorkingDay||'').trim())throw Error('Enter last working day.');validDate('lastWorkingDay',d.lastWorkingDay);return {reason:d.reason,lastWorkingDay:d.lastWorkingDay};}
   if(!REASONS[type].includes(d.reason))throw Error('Select a valid '+type+' reason.');
   const rosterNeeded=type==='Commencement'||type==='Movement'||type==='Variation'&&d.reason==='Work Schedule Adjustment';
   const required=type==='Commencement'?['effectiveDate','employmentType','positionNumber']:type==='Variation'?['effectiveDate',...(rosterNeeded?[]:['changes'])]:['effectiveDate','positionNumber','temporary'];
   for(const key of required)if(!String(d[key]||'').trim())throw Error('Enter '+key.replace(/([A-Z])/g,' $1').toLowerCase()+'.');
   validDate('effectiveDate',d.effectiveDate);
   for(const key of ['returnDate','contractEndDate'])if(d[key])validDate(key,d[key]);
   if(type==='Movement'&&!['Permanent','Temporary'].includes(d.temporary))throw Error('Select a valid assignment.');
   if(type==='Movement'&&d.temporary==='Temporary'&&(!d.returnDate||d.returnDate<=d.effectiveDate))throw Error('Enter a return date after the movement date.');
   if(type==='Commencement'&&!['Permanent','Fixed Term','Casual'].includes(d.employmentType))throw Error('Select a valid employment type.');
   if(type==='Commencement'&&d.employmentType==='Fixed Term'&&(!d.contractEndDate||d.contractEndDate<d.effectiveDate))throw Error('Enter a valid contract end date.');
   const fields=['reason','effectiveDate','firstName','lastName','dateOfBirth','email','address','employmentType','contractEndDate','positionNumber','changes','temporary','returnDate'];
   const result=Object.fromEntries(fields.filter(k=>d[k]!==undefined&&String(d[k]).trim()!=='').map(k=>[k,String(d[k]).trim()]));
   if(type==='Commencement'){
    for(const key of ['firstName','lastName','dateOfBirth','email','address'])delete result[key];
    if(raisedFor!=='new-employee'){
     const e=(s?.employees||[]).find(e=>e.id===raisedFor);if(!e)throw Error('Select an existing employee.');
     result.employeeName=E.employeeName(e);result.employeeId=e.id;
    }else{
     const section=(key,label)=>{const value=d[key];if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Enter '+label+'.');return value;};
     const text=(value,label,max=255)=>{if(!['string','number'].includes(typeof value)||!String(value).trim())throw Error('Enter '+label+'.');const out=String(value).trim();if(out.length>max)throw Error(label+' is too long.');return out;};
     const p=section('personalDetails','personal details'),personal={};
     for(const [key,label]of [['firstName','first name'],['lastName','last name'],['dateOfBirth','date of birth'],['email','email'],['phone','phone number'],['addressLine','address'],['townSuburb','town/suburb'],['state','state'],['postcode','postcode'],['country','country']])personal[key]=text(p[key],label);
     validDate('dateOfBirth',personal.dateOfBirth);if(personal.dateOfBirth>d.effectiveDate)throw Error('Date of birth cannot be after commencement.');if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(personal.email))throw Error('Enter a valid email address.');
     const t=section('taxDetails','tax details');for(const key of ['claimTaxFreeThreshold','stsl'])if(typeof t[key]!=='boolean')throw Error('Select '+(key==='stsl'?'STSL':'whether to claim the tax-free threshold')+'.');
     const tfnNotProvided=t.tfnNotProvided===true,taxFileNumber=tfnNotProvided?'':String(t.taxFileNumber||'').replace(/\s/g,'');if(!tfnNotProvided&&!/^\d{8,9}$/.test(taxFileNumber))throw Error('Enter an eight or nine digit TFN, or select TFN not provided.');
     const u=section('superDetails','super details'),usi=text(u.usi,'super USI',100),funds=(s?.superFunds||[]).filter(f=>String(f.usi).trim()===usi),fund=funds.find(f=>!f.deleted&&f.active!==false);
     if(funds.length&&!fund)throw Error('Select an active super fund.');
     const superDetails={usi,memberNumber:text(u.memberNumber,'super member number',100),fundName:fund?fund.fundName:text(u.fundName,'super fund name'),abn:String(fund?fund.abn:u.abn||'').replace(/\s/g,'')};if(!/^\d{11}$/.test(superDetails.abn))throw Error('Enter an eleven digit super fund ABN.');if(fund)superDetails.fundId=fund.id;
     const b=section('bankDetails','bank details'),bankDetails={bsb:String(b.bsb||'').replace(/[\s-]/g,''),accountNumber:String(b.accountNumber||'').trim(),accountName:text(b.accountName,'bank account name')};
     if(!/^\d{6}$/.test(bankDetails.bsb))throw Error('Enter a six digit BSB.');if(!/^\d{1,34}$/.test(bankDetails.accountNumber))throw Error('Enter a digits-only bank account number.');
     Object.assign(result,{personalDetails:personal,taxDetails:{taxFileNumber,tfnNotProvided,claimTaxFreeThreshold:t.claimTaxFreeThreshold,stsl:t.stsl},superDetails,bankDetails});
    }
   }
   if(type==='Commencement'&&d.employmentType!=='Fixed Term')delete result.contractEndDate;
   if(type==='Movement'&&d.temporary!=='Temporary')delete result.returnDate;
   if(type==='Commencement'||type==='Movement'){
    const pos=(s?.positions||[]).find(p=>p.active!==false&&String(p.positionNumber)===String(d.positionNumber));if(!pos)throw Error('Select an active position.');
    result.positionName=String(pos.positionName||'');result.reportsTo=Array.isArray(pos.reportsTo)?pos.reportsTo.map(String).join(', '):String(pos.reportsTo||'');
   }
   if(rosterNeeded){
    const employee=(s?.employees||[]).find(e=>e.id===raisedFor),employmentType=type==='Commencement'?d.employmentType:E.activeEmploymentType(s,employee,d.effectiveDate);
    if(!employmentType)throw Error('Select an existing employee with employment details.');
    const zero={0:0,1:0,2:0,3:0,4:0,5:0,6:0},casual=employmentType==='Casual';
    if(!casual&&!['1-week','2-week'].includes(d.rosterPattern))throw Error('Select a roster pattern.');
    const pattern=casual?'1-week':d.rosterPattern;
    function week(values,name){if(!values||typeof values!=='object'||Array.isArray(values))throw Error('Enter the '+name+' roster hours.');const out={};for(let day=0;day<7;day++){const value=values[day];if(value===''||value==null||!['string','number'].includes(typeof value)||!Number.isFinite(Number(value))||Number(value)<0||Number(value)>24)throw Error('Enter '+name+' daily hours between 0 and 24.');out[day]=Number(value);}return out;}
    const first=casual?{...zero}:week(d.hoursByDayWeek1,'week 1'),second=casual?{...zero}:pattern==='2-week'?week(d.hoursByDayWeek2,'week 2'):{...first};
    if(!casual&&[...Object.values(first),...Object.values(second)].reduce((n,x)=>n+x,0)<=0)throw Error('Enter the employee’s roster hours.');
    Object.assign(result,{rosterPattern:pattern,hoursByDay:{...first},hoursByDayWeek1:first,hoursByDayWeek2:second});
   }
   return result;
  }
  function adjustAbsenceBalances(s,actorId,empId,input,today=E.iso(new Date())){
   if(!E.selfService.profile(s,actorId,today).payroll)throw Error('Payroll Management access is required.');
   const e=s.employees.find(e=>e.id===empId);if(!e)throw Error('Select an employee.');
   const c=E.currentCycle(s);if(E.isCasualOnly(s,e,c.end))throw Error('Casual-only employees do not have leave credits to adjust.');
   const before=E.projectedBalances(s,e,c,false),deltas={};
   for(const key of ['annual','personal','lslProRata','lslAccrued']){const raw=input[key]??0;if(typeof raw==='boolean'||!Number.isFinite(Number(raw)))throw Error('Enter valid adjustment hours.');deltas[key]=E.round4(Number(raw));}
   const date=input.lslEntitlementDate===undefined?before.lslEntitlementDate:String(input.lslEntitlementDate||'');
   if((date||before.lslEntitlementDate)&&(!/^\d{4}-\d{2}-\d{2}$/.test(date)||E.iso(E.parseDate(date))!==date))throw Error('Enter a valid LSL entitlement date.');
   const comment=String(input.comment||'').trim();if(!comment)throw Error('A comment is required.');if(comment.length>20000)throw Error('Comment must be at most 20,000 characters.');
   const after=Object.fromEntries(Object.keys(deltas).map(k=>[k,E.round4(before[k]+deltas[k])]));after.lslEntitlementDate=date;
   if(after.lslProRata<0||after.lslAccrued<0)throw Error('LSL adjustments cannot take more credits than the available balance.');
   if(!Object.values(deltas).some(n=>n!==0)&&date===before.lslEntitlementDate)throw Error('Enter an adjustment or change the LSL entitlement date.');
   const base=E.lslBalances(s,e,c.end,{ignoreManual:true,ignoreDateAdjustment:true}),profile=E.lslServiceProfile(s,e,c.end,{ignoreDateAdjustment:true});
   if(date!==before.lslEntitlementDate&&!base.entitlementDate)throw Error('An LSL service history is required to change the entitlement date.');
   e.annualLeaveBalance=after.annual;e.personalLeaveBalance=after.personal;
   e.lslAccruedAdjustment=0;e.lslProRataAdjustment=0;e.lslAccruedBalance=after.lslAccrued;e.lslProRataOverride=profile.continuityStart?'':after.lslProRata;e.lslEntitlementDateOverride=profile.continuityStart?'':date;e.lslEntitlementConvertedAt='';
   if(date!==before.lslEntitlementDate){e.lslEntitlementDateAdjustmentDays=E.dateDiffDays(base.entitlementDate,date);e.lslEntitlementDateAdjustmentCycleStart=profile.cycleStart||'';}
   const description=`Balances adjusted. Annual ${before.annual.toFixed(4)} → ${after.annual.toFixed(4)}, Personal ${before.personal.toFixed(4)} → ${after.personal.toFixed(4)}, LSL Accrued ${before.lslAccrued.toFixed(4)} → ${after.lslAccrued.toFixed(4)}, LSL Pro-rata ${before.lslProRata.toFixed(4)} → ${after.lslProRata.toFixed(4)}, LSL Date ${E.fmtPay(before.lslEntitlementDate)} → ${E.fmtPay(date)}. Comment: ${comment}`;
   (s.jobEvents||(s.jobEvents=[])).push({id:'balance_'+Date.now()+'_'+Math.random().toString(16).slice(2),empId,type:'Absence Balance Adjustment',effectiveDate:c.end,description,refKind:'employee',refId:empId,actorId,adjustments:deltas});
   (s.auditLog||(s.auditLog=[])).unshift(`${new Date().toISOString()} — ${actorId}: Absence balances adjusted for ${empId}. ${comment}`);
   return {before,after};
  }
  function upcomingEmployeeChanges(s,today){
   const until=E.addDays(today,30),changes=[],seen=new Set();
   const valid=date=>/^\d{4}-\d{2}-\d{2}$/.test(date||'')&&E.iso(E.parseDate(date))===date;
   function add(e,date,type,detail,rowId=''){
    if(!valid(date)||date<today||date>until)return;
    const key=[e.id,date,type].join('|');if(seen.has(key))return;seen.add(key);
    changes.push({empId:e.id,name:E.employeeName(e),date,type,detail,rowId});
   }
   for(const e of s.employees||[]){
    const rows=(s.jobDataRows||[]).filter(j=>j.empId===e.id&&j.saved!==false&&valid(j.effectiveDate)).slice().sort((a,b)=>a.effectiveDate.localeCompare(b.effectiveDate)||Number(a.effectiveSequence||0)-Number(b.effectiveSequence||0));
    const latest=new Map();for(const row of rows)latest.set(row.action+'|'+row.effectiveDate,row);
    for(const row of latest.values()){
     if(row.action==='Commencement')add(e,row.effectiveDate,row.reason==='New Fixed Term Contract'?'Contract commencement':'Commencement',row.reason||'',row.id);
     if(row.action==='Movement'&&row.reason==='Return from Temp Assignment')add(e,row.effectiveDate,'Return from temporary assignment',row.positionName||'',row.id);
     if(row.action==='Termination'){
      const expiry=row.reason==='Expiry of Fixed Term',last=E.addDays(row.effectiveDate,-1);
      // A permanent appointment supersedes an obsolete fixed-term expiry row.
      const job=rows.filter(j=>j.action!=='Termination'&&j.effectiveDate<=last).at(-1);
      if(expiry&&job?.positionClass==='Permanent')continue;
      add(e,expiry?last:row.effectiveDate,expiry?'Contract expiry':'Termination',expiry?'Last contract day':`${row.reason||'Termination'} · Last working day: ${E.fmtPay(last)}`,row.id);
     }
    }
    if(!rows.some(j=>j.action==='Commencement'))add(e,e.startDate,'Commencement','Employment start');
    if(!rows.some(j=>j.action==='Termination')){
     if(e.type==='Fixed Term'&&e.contractEndDate&&(!e.terminationDate||e.terminationReason==='Expiry of Fixed Term'))add(e,e.contractEndDate,'Contract expiry','Last contract day');
     else if(e.terminationDate){const last=e.terminationReason==='Expiry of Fixed Term'?e.terminationDate:E.addDays(e.terminationDate,-1);add(e,e.terminationReason==='Expiry of Fixed Term'?last:e.terminationDate,e.terminationReason==='Expiry of Fixed Term'?'Contract expiry':'Termination',`${e.terminationReason||'Termination'} · Last working day: ${E.fmtPay(last)}`);}
    }
   }
   return changes.sort((a,b)=>a.date.localeCompare(b.date)||a.name.localeCompare(b.name)||a.type.localeCompare(b.type));
  }
  return {migrateCashOuts,validateCashDraft,syncCashOuts,statement,validateTemplate,upcomingEmployeeChanges,adjustAbsenceBalances};
 }
 // Standalone PDF letter using the same company heading and footer as Statement of Service.
 function earningsPdf(d){
  const lines=[{text:"McDonald's California Franchise",bold:true,size:20,width:350,y:780},{text:d.reference,size:10,right:true,y:746},
   {text:d.name,bold:true,y:704},...d.address.filter(Boolean).map(text=>({text:String(text).toUpperCase()})),
   {text:'STATEMENT OF EARNINGS',bold:true,size:14,gap:30},
   {text:`${d.name} is currently employed by McDonald's California Franchise as a ${d.type.toLowerCase()}, ${d.fullTime?'full-time':'part-time'} employee. Salary details are as follows:`,gap:18},
   {text:'Regular Earnings',bold:true,gap:24},{text:d.regularAmount,right:true,sameLine:true},
   {text:'Gross Fortnightly Income',bold:true,gap:12},{text:d.grossAmount,right:true,sameLine:true},
   {text:`This statement is a true indication of earnings as at ${d.asAt}.`,gap:30},
   {text:`Please contact the Human Resources Department on ${d.contact}, if you have any enquiries relating to this matter.`,gap:10},
   {text:'Yours sincerely',gap:22},{text:d.signer.toUpperCase(),bold:true,gap:45},
   {text:d.role.toUpperCase(),bold:true},{text:d.issued}];
  return pdf(lines);
 }
 function payErrorsPdf(report){
  return pdf([{text:"McDonald's California Franchise",bold:true,size:18},{text:'PAY ERRORS',bold:true,size:15,gap:16},{text:report.cycle,size:10,gap:8},{text:`Generated: ${report.generatedAt} (Perth)`,size:9},{text:`${report.rows.length} errors / warnings`,size:9},{text:'Warnings are for review and do not prevent pay finalisation.',size:9,gap:6},...(report.rows.length?[{table:{headers:['Employee Name','Employee ID','Error Message'],rows:report.rows.map(r=>[r.employeeName,r.empId,r.message])}}]:[{text:'No errors found',bold:true,gap:15}])]);
 }
 function pdf(lines){
  const fonts=typeof module!=='undefined'?require('./pdf-fonts'):g.PayrollPdfFonts;
  const cp={'€':128,'‘':145,'’':146,'“':147,'”':148,'–':150,'—':151,'…':133};
  const escape=s=>Array.from(String(s),c=>{const n=cp[c]||c.charCodeAt(0);if(n===40||n===41||n===92)return '\\'+String.fromCharCode(n);if(n<32||n>255)throw Error('Use Print / Save PDF to preserve characters outside the embedded PDF font.');return String.fromCharCode(n);}).join('');
  const width=(text,size,bold=false)=>Array.from(String(text),c=>fonts[bold?'bold':'regular'].widths[(cp[c]||c.charCodeAt(0))-32]||600).reduce((n,w)=>n+w,0)*size/1000;
  const pages=[[]];let y=780,previousY=y;
  for(const line of lines){const o=typeof line==='object'&&!Array.isArray(line)?line:Array.isArray(line)?{text:line[0],bold:line[1],size:line[2]}:{text:line};const size=o.size||11,maxWidth=o.width||487;
   if(o.table){
    const widths=[125,80,282],xs=[54,179,259],size=9,leading=13;
    function wrapCell(text,max){const result=[];for(const paragraph of String(text??'').split('\n')){let part='';for(const word of paragraph.split(/\s+/)){if(width(word,size)>max){if(part){result.push(part);part='';}for(const char of word){if(part&&width(part+char,size)>max){result.push(part);part='';}part+=char;}}else if(part&&width(part+' '+word,size)>max){result.push(part);part=word;}else part+=(part?' ':'')+word;}result.push(part);}return result;}
    function row(cells,height,bold=false){const commands=pages.at(-1);if(bold)commands.push(`0.94 0.96 0.98 rg 54 ${y-height} 487 ${height} re f 0 g`);commands.push(`0.82 0.86 0.9 RG 0.5 w 54 ${y-height} 487 ${height} re S`);for(const x of [179,259])commands.push(`${x} ${y} m ${x} ${y-height} l S`);cells.forEach((lines,i)=>lines.forEach((text,n)=>commands.push(`BT /${bold?'F2':'F1'} ${size} Tf ${xs[i]+7} ${y-16-n*leading} Td (${escape(text)}) Tj ET`)));y-=height;}
    const header=()=>row(o.table.headers.map(h=>[h]),28,true);
    function nextPage(){pages.push([]);y=780;pages.at(-1).push(`BT /F2 13 Tf 54 780 Td (Pay Errors - continued) Tj ET`);y-=30;header();}
    if(y<130)nextPage();else header();
    for(const record of o.table.rows){const cells=record.map((text,i)=>wrapCell(text,widths[i]-14)),total=Math.max(...cells.map(c=>c.length)),height=total*leading+14;if(height>y-86&&height<=620)nextPage();let offset=0;
     while(offset<total){if(y<113)nextPage();const count=Math.min(total-offset,Math.floor((y-86-14)/leading));if(count<1){nextPage();continue;}row(cells.map((lines,i)=>offset>0&&i<2&&offset>=lines.length?lines.slice(0,count):lines.slice(offset,offset+count)),count*leading+14);offset+=count;}
    }
    y-=18;continue;
   }
   if(o.y!==undefined)y=o.y;else if(o.sameLine)y=previousY;else y-=o.gap||0;
   const chunks=[];for(const paragraph of String(o.text||'').split('\n')){let chunk='';for(const word of paragraph.split(/\s+/)){if(width(word,size,o.bold)>maxWidth){if(chunk){chunks.push(chunk);chunk='';}for(const char of word){if(width(chunk+char,size,o.bold)>maxWidth&&chunk){chunks.push(chunk);chunk='';}chunk+=char;}}else if(width(chunk+' '+word,size,o.bold)>maxWidth&&chunk){chunks.push(chunk);chunk=word;}else chunk+=(chunk?' ':'')+word;}chunks.push(chunk);}
   for(const chunk of chunks){if(y<86){pages.push([]);y=780;}const x=o.right?Math.max(54,541-width(chunk,size,o.bold)):54;pages.at(-1).push(`BT /${o.bold?'F2':'F1'} ${size} Tf ${x.toFixed(2)} ${y} Td (${escape(chunk)}) Tj ET`);previousY=y;y-=size+6;}
  }
  pages.forEach((commands,i)=>{commands.push('0.6 w 54 62 m 541 62 l S',`BT /F1 9 Tf 54 46 Td (McDonald's California Franchise) Tj ET`,`BT /F1 9 Tf 510 46 Td (Page ${i+1}) Tj ET`);});
  const regular=fonts.regular,bold=fonts.bold;
  const binary=data=>typeof Buffer!=='undefined'?Buffer.from(data,'base64').toString('latin1'):atob(data);
  const stream=data=>`<< /Length ${data.length} /Length1 ${data.length} >>\nstream\n${data}\nendstream`;
  const font=(name,f,desc)=>`<< /Type /Font /Subtype /TrueType /BaseFont /${name} /Encoding /WinAnsiEncoding /FirstChar 32 /LastChar 255 /Widths [${f.widths.join(' ')}] /FontDescriptor ${desc} 0 R >>`;
  const descriptor=(name,f,file)=>`<< /Type /FontDescriptor /FontName /${name} /Flags 32 /FontBBox [${f.bbox.join(' ')}] /ItalicAngle 0 /Ascent ${f.ascent} /Descent ${f.descent} /CapHeight ${f.ascent} /StemV 80 /FontFile2 ${file} 0 R >>`;
  const objects=['<< /Type /Catalog /Pages 2 0 R >>','',font('DejaVuSans',regular,5),font('DejaVuSans-Bold',bold,7),descriptor('DejaVuSans',regular,6),stream(binary(regular.data)),descriptor('DejaVuSans-Bold',bold,8),stream(binary(bold.data))];const kids=[];
  pages.forEach(commands=>{const page=objects.length+1,stream=page+1;kids.push(page+' 0 R');objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${stream} 0 R >>`);const data=commands.join('\n');objects.push(`<< /Length ${data.length} >>\nstream\n${data}\nendstream`);});objects[1]=`<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${pages.length} >>`;
  let out='%PDF-1.4\n',offsets=[0];objects.forEach((o,i)=>{offsets.push(out.length);out+=`${i+1} 0 obj\n${o}\nendobj\n`;});const start=out.length;out+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`+offsets.slice(1).map(o=>String(o).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`;return Uint8Array.from(out,c=>c.charCodeAt(0));
 }
 const api={create,CASH_TYPES,REASONS,pdf,earningsPdf,payErrorsPdf};g.PayrollFeatures=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
