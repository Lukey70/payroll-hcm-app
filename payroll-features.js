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
  function validateTemplate(type,d,raisedFor){
   if(!Object.hasOwn(REASONS,type))throw Error('Select a valid request type.');
   if(!REASONS[type].includes(d.reason))throw Error('Select a valid '+type+' reason.');
   const required=type==='Commencement'?['effectiveDate','employmentType','positionNumber','reportsTo','roster','firstName','lastName']:type==='Variation'?['effectiveDate','changes']:type==='Movement'?['effectiveDate','positionNumber','temporary','reportsTo','roster']:['effectiveDate','lastWorkingDay'];
   for(const key of required)if(!String(d[key]||'').trim())throw Error('Enter '+key.replace(/([A-Z])/g,' $1').toLowerCase()+'.');
   for(const key of ['effectiveDate','lastWorkingDay','returnDate','contractEndDate'])if(d[key]&&(!/^\d{4}-\d{2}-\d{2}$/.test(d[key])||E.iso(E.parseDate(d[key]))!==d[key]))throw Error('Enter a valid '+key+'.');
   if(type!=='Commencement'&&raisedFor==='new-employee')throw Error('Select an existing employee for this request.');
   if(type==='Termination'&&E.addDays(d.lastWorkingDay,1)!==d.effectiveDate)throw Error('Termination effective date must be the day after the last working day.');
   if(type==='Movement'&&d.temporary==='Temporary'&&(!d.returnDate||d.returnDate<=d.effectiveDate))throw Error('Enter a return date after the movement date.');
   if(type==='Commencement'&&d.employmentType==='Fixed Term'&&(!d.contractEndDate||d.contractEndDate<d.effectiveDate))throw Error('Enter a valid contract end date.');
   return Object.fromEntries(Object.entries(d).map(([k,v])=>[k,String(v).trim()]));
  }
  return {migrateCashOuts,validateCashDraft,syncCashOuts,statement,validateTemplate};
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
 function pdf(lines){
  const fonts=typeof module!=='undefined'?require('./pdf-fonts'):g.PayrollPdfFonts;
  const cp={'€':128,'‘':145,'’':146,'“':147,'”':148,'–':150,'—':151,'…':133};
  const escape=s=>Array.from(String(s),c=>{const n=cp[c]||c.charCodeAt(0);if(n===40||n===41||n===92)return '\\'+String.fromCharCode(n);if(n<32||n>255)throw Error('Use Print / Save PDF to preserve characters outside the embedded PDF font.');return String.fromCharCode(n);}).join('');
  const width=(text,size,bold=false)=>Array.from(String(text),c=>fonts[bold?'bold':'regular'].widths[(cp[c]||c.charCodeAt(0))-32]||600).reduce((n,w)=>n+w,0)*size/1000;
  const pages=[[]];let y=780,previousY=y;
  for(const line of lines){const o=typeof line==='object'&&!Array.isArray(line)?line:Array.isArray(line)?{text:line[0],bold:line[1],size:line[2]}:{text:line};const size=o.size||11,maxWidth=o.width||487;
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
 const api={create,CASH_TYPES,REASONS,pdf,earningsPdf};g.PayrollFeatures=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
