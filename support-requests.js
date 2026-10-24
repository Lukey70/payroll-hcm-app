(function(global){
  'use strict';
  function create(E,S){
    const Features=typeof module!=='undefined'?require('./payroll-features'):global.PayrollFeatures,F=Features.create(E);
    const now=()=>new Date().toISOString(),date=()=>E.iso(new Date());
    const uid=p=>`${p}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const person=(s,id)=>s.employees.find(e=>e.id===id);
    const name=(s,id)=>id==='new-employee'?'New Employee':`${E.employeeName(person(s,id)||{id})} (${id})`;
    function signed(s,id,d=date()){S.assertScope(s,id,id,'ess',d);}
    function payroll(s,id,d=date()){signed(s,id,d);if(!S.profile(s,id,d).payroll)throw Error('Payroll Management access is required.');}
    function init(s){if(!Array.isArray(s.supportRequests))s.supportRequests=[];}
    function nextNumber(s){init(s);return 'CS'+String(Math.max(Number(s.supportSequence)||0,...s.supportRequests.map(c=>Number(String(c.number).replace(/^CS/,''))||0))+1).padStart(7,'0');}
    function notify(s,ids,message,key,c){
      const recipients=[...new Set(ids.filter(Boolean))];if(!recipients.length)return;
      s.alerts.unshift({id:uid('alert'),key,type:'Support Request',message,recipientIds:recipients,readBy:[],read:false,createdAt:now(),action:{page:'support',caseId:c.id}});
    }
    function audit(s,id,c,message){(s.auditLog||(s.auditLog=[])).unshift(`${now()} — ${name(s,id)}: ${c.number} ${message}`);}
    function get(s,id,caseId,mode='own',d=date()){
      signed(s,id,d);init(s);closeDue(s);const c=s.supportRequests.find(c=>c.id===caseId);if(!c)throw Error('Support request no longer exists.');
      if(mode==='payroll')payroll(s,id,d);else if(c.raisedBy!==id)throw Error('You do not have access to this support request.');return c;
    }
    function submit(s,id,input,area='ess',d=date()){
      signed(s,id,d);if(!['ess','mss','payroll'].includes(area))throw Error('Choose Employee, Manager or Payroll Management.');if(area==='payroll')payroll(s,id,d);
      if(area==='mss'&&!S.profile(s,id,d).mss)throw Error('Manager Self Service access is required.');
      const raisedBy=area==='payroll'?String(input.raisedBy||''):id;
      const raisedFor=area==='payroll'?String(input.raisedFor||''):area==='ess'?id:(input.raisedFor||id);
      if(!person(s,raisedBy))throw Error('Select Raised by.');
      if(raisedFor!=='new-employee'&&!person(s,raisedFor))throw Error('Choose an employee or New Employee.');
      const requestType=input.requestType||'General Enquiry';let template=null;
      if(requestType!=='General Enquiry'){if(area!=='mss'||!S.profile(s,id,d).mss)throw Error('Only managers in MSS can submit Job Data requests.');template=F.validateTemplate(requestType,input.template||{},raisedFor,s);}
      const structured=requestType!=='General Enquiry',subject=structured?requestType+' Request':String(input.subject||'').trim(),description=structured?'':String(input.description||'').trim();
      if(String(input.additionalComments||'').length>20000)throw Error('Additional Comments must be at most 20,000 characters.');
      if(!structured&&(!subject||!description))throw Error('Subject and Description are required.');
      if(subject.length>250||description.length>20000)throw Error('Subject must be at most 250 characters and Description at most 20,000.');
      init(s);const stamp=now(),number=nextNumber(s),c={id:uid('case'),number,requestType,template,additionalComments:String(input.additionalComments||'').trim(),raisedBy,raisedFor,createdBy:id,source:area,attachments:[],resolutions:[],status:'New',assignedTo:'',subject,description,createdAt:stamp,updatedAt:stamp,messages:[],resolutionNotes:'',resolvedAt:'',closedAt:'',timeWorkedSeconds:0,timerStartedAt:'',history:[{status:'New',actorId:id,at:stamp}]};
      const attachments=input.attachments||[];validateFiles(c,attachments);c.attachments=attachments.map(f=>({name:String(f.name),size:f.size,data:f.data}));
      s.supportSequence=Number(number.slice(2));s.supportRequests.push(c);
      notify(s,[raisedBy],`${number} has been submitted to Payroll.`,`support-submit:${c.id}`,c);audit(s,id,c,'submitted');return c;
    }
    function assign(s,id,caseId,assignee,d=date()){
      const c=get(s,id,caseId,'payroll',d);if(['Resolved','Closed'].includes(c.status))throw Error('Resolved or closed cases cannot be assigned.');
      if(assignee&&!S.profile(s,assignee,d).payroll)throw Error('Select an employee with Payroll Management access.');
      const previousAssignedTo=c.assignedTo;
      c.assignedTo=assignee||'';c.status=assignee?(c.status==='Awaiting Info'?'Awaiting Info':'Open'):'New';c.updatedAt=now();
      c.history.push({status:c.status,assignedTo:c.assignedTo,previousAssignedTo,actorId:id,at:c.updatedAt});audit(s,id,c,assignee?`assigned to ${name(s,assignee)}`:'unassigned');return c;
    }
    function status(s,id,caseId,value,notes='',d=date()){
      const c=get(s,id,caseId,'payroll',d);if(['Resolved','Closed'].includes(c.status))throw Error('This case is already resolved or closed.');
      if(!['Awaiting Info','Resolved'].includes(value))throw Error('Choose Awaiting Info or Resolved.');
      if(value==='Resolved'&&!String(notes).trim())throw Error('Resolution Notes are required.');if(String(notes).length>20000)throw Error('Resolution Notes must be at most 20,000 characters.');
      if(value==='Awaiting Info'&&!c.assignedTo)throw Error('Assign the case before marking it Awaiting Info.');
      c.status=value;c.updatedAt=now();c.history.push({status:value,actorId:id,at:c.updatedAt});
      if(value==='Resolved'){stopTimer(c);c.resolvedAt=c.updatedAt;c.resolutionNotes=String(notes).trim();c.resolvedBy=id;(c.resolutions||(c.resolutions=[])).push({notes:c.resolutionNotes,resolvedBy:id,resolvedAt:c.resolvedAt});notify(s,[c.raisedBy],`${c.number} has been marked as resolved. Please see support requests for resolution notes.`,`support-resolved:${c.id}`,c);}
      audit(s,id,c,`marked ${value}`);return c;
    }
    function validateFiles(c,files){
      if(!Array.isArray(files)||files.length>5)throw Error('Attach at most five files per message.');
      let total=(c.attachments||[]).reduce((n,f)=>n+Number(f.size||0),0)+(c.messages||[]).reduce((n,m)=>n+(m.attachments||[]).reduce((a,f)=>a+Number(f.size||0),0),0);
      for(const f of files){if(!f.name||!Number.isInteger(f.size)||f.size<=0||f.size>1024*1024||!/^data:[^,]*;base64,[A-Za-z0-9+/]*={0,2}$/.test(f.data||''))throw Error('Invalid attachment. Each file must be between 1 byte and 1 MB.');
        const encoded=f.data.split(',')[1];const decoded=Math.floor(encoded.length*3/4)-(encoded.endsWith('==')?2:encoded.endsWith('=')?1:0);if(decoded!==f.size)throw Error('Attachment size does not match its contents.');total+=f.size;}
      if(total>2*1024*1024)throw Error('Attachments for this case cannot exceed 2 MB in total.');
    }
    function message(s,id,caseId,text,files=[],mode='own',d=date()){
      const c=get(s,id,caseId,mode,d);if(['Resolved','Closed'].includes(c.status))throw Error('Messages cannot be sent on resolved or closed cases.');
      text=String(text||'').trim();if(!text&&!files.length)throw Error('Enter a message or attach a file.');if(text.length>20000)throw Error('Message must be at most 20,000 characters.');validateFiles(c,files);
      const m={id:uid('message'),senderId:id,senderName:name(s,id),side:id===c.raisedBy?'right':'left',text,attachments:files.map(f=>({name:String(f.name),size:f.size,data:f.data})),createdAt:now()};
      c.messages.push(m);c.updatedAt=m.createdAt;c.history.push({action:'Message sent',actorId:id,at:m.createdAt,attachmentCount:files.length});
      if(c.status==='Awaiting Info'&&id===c.raisedBy){
        c.status='Open';c.history.push({status:'Open',action:'Response received',actorId:id,at:m.createdAt,previousStatus:'Awaiting Info'});audit(s,id,c,'returned to Open after response');
      }
      const recipients=id===c.raisedBy?(c.assignedTo?[c.assignedTo]:[]):[c.raisedBy];
      notify(s,recipients.filter(r=>r!==id),`A message has been sent regarding ${c.number}.`,`support-message:${m.id}`,c);audit(s,id,c,'message sent');return m;
    }
    function reopen(s,id,caseId,reason,d=date()){
      const c=get(s,id,caseId,'own',d);if(c.status!=='Resolved')throw Error(c.status==='Closed'?'Closed cases cannot be reopened. Raise a new support request.':'Only resolved cases can be reopened.');
      reason=String(reason||'').trim();if(!reason)throw Error('Enter a message explaining why you are reopening the case.');if(reason.length>20000)throw Error('Reopening message must be at most 20,000 characters.');
      if(!c.resolutions?.length)c.resolutions=[{notes:c.resolutionNotes,resolvedBy:c.resolvedBy,resolvedAt:c.resolvedAt}];
      c.status='Open';c.resolvedAt='';c.closedAt='';c.resolutionNotes='';c.resolvedBy='';c.updatedAt=now();c.history.push({status:'Open',action:'Reopened',actorId:id,at:c.updatedAt,reason});
      const m=message(s,id,caseId,reason,[],'own',d);m.kind='Reopened';audit(s,id,c,'reopened with reason');return c;
    }
    function stopTimer(c,stamp=Date.now()){if(c.timerStartedAt){c.timeWorkedSeconds+=Math.max(0,Math.floor((stamp-Date.parse(c.timerStartedAt))/1000));c.timerStartedAt='';}}
    function timer(s,id,caseId,d=date()){const c=get(s,id,caseId,'payroll',d);if(['Resolved','Closed'].includes(c.status))throw Error('This case is resolved or closed.');if(c.timerStartedAt)stopTimer(c);else c.timerStartedAt=now();c.updatedAt=now();audit(s,id,c,c.timerStartedAt?'work timer started':'work timer paused');return c;}
    function timeWorked(c,stamp=Date.now()){return Number(c.timeWorkedSeconds||0)+(c.timerStartedAt?Math.max(0,Math.floor((stamp-Date.parse(c.timerStartedAt))/1000)):0);}
    function closeDue(s,stamp=Date.now()){init(s);let count=0;for(const c of s.supportRequests)if(c.status==='Resolved'&&Number.isFinite(Date.parse(c.resolvedAt))&&stamp-Date.parse(c.resolvedAt)>=14*86400000){c.status='Closed';c.closedAt=new Date(Date.parse(c.resolvedAt)+14*86400000).toISOString();c.updatedAt=c.closedAt;c.history.push({status:'Closed',actorId:'system',at:c.closedAt});count++;}return count;}
    function list(s,id,mode='own',filters={},d=date()){signed(s,id,d);if(mode==='payroll')payroll(s,id,d);init(s);closeDue(s);return s.supportRequests.filter(c=>(mode==='payroll'||c.raisedBy===id)&&(!filters.mine||c.assignedTo===id)&&(filters.closed?c.status==='Closed':filters.resolved?c.status==='Resolved':!['Resolved','Closed'].includes(c.status))).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));}
    return {name,nextNumber,submit,get,assign,status,message,reopen,timer,timeWorked,closeDue,list,validateFiles};
  }
  function createUI(o){
    const {E,S,getState,getUser,onChange,esc}=o,T=create(E,S);const Features=typeof module!=='undefined'?require('./payroll-features'):global.PayrollFeatures;const reportError=o.reportError||alert;
    const $=id=>document.getElementById(id),v=id=>$(id)?.value||'',put=(id,html)=>{if($(id))$(id).innerHTML=html;};
    let viewEpoch=0;let container='',mode='own',area='ess',caseId='',newCase=false,filter='open',mine=false,search='',page=0;
    const s=()=>getState(),u=()=>getUser(),label=id=>esc(T.name(s(),id));
    const dt=value=>new Date(value).toLocaleString('en-AU',{timeZone:'Australia/Perth',hour12:false});
    const icon=name=>global.PayrollUI?.icon(name)||'<svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3h14v18H5z M8 8h8 M8 12h8 M8 16h5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    const statusClass=status=>({'New':'new','Open':'open','Awaiting Info':'waiting','Resolved':'resolved','Closed':'closed'}[status]||'new');
    const badge=status=>`<span class="support-status support-status-${statusClass(status)}"><span class="support-status-dot" aria-hidden="true"></span>${esc(status)}</span>`;
    const fileButton=(f,token)=>`<button class="support-attachment" data-support-file="${esc(token)}">${icon('attachment')}<span>${esc(f.name)}<small>${Math.max(1,Math.ceil(f.size/1024))} KB</small></span><span class="support-download-label">Download</span></button>`;
    const upload=(inputId,listId,labelText)=>`<div class="support-upload"><label for="${inputId}" class="support-upload-label">${icon('attachment')}<span>${labelText}</span></label><input id="${inputId}" type="file" multiple aria-describedby="${inputId}Help"><p id="${inputId}Help" class="small-note">Up to five files, 1 MB each and 2 MB total per case.</p><div id="${listId}" class="support-selected-files" aria-live="polite"></div></div>`;
    function bindUpload(inputId,listId){$(''+inputId)?.addEventListener('change',()=>put(listId,Array.from($(inputId).files||[]).map(f=>`<span>${icon('attachment')}${esc(f.name)} <small>${Math.max(1,Math.ceil(f.size/1024))} KB</small></span>`).join('')));}
    const card=(title,body,subtitle='')=>`<section class="support-card"><header class="support-card-heading"><h3>${title}</h3>${subtitle?`<p>${subtitle}</p>`:''}</header>${body}</section>`;
    const popout=()=>mode==='payroll'&&o.openWindow?`<button id="supportPopout" class="support-popout">${icon('external')}Open in New Window</button>`:'';
    function hasDraft(){return newCase||!!v('supportMessage')||!!$('supportFiles')?.files?.length||!!$('supportResolveDialog')?.open||!!$('supportReopenDialog')?.open;}
    function refresh(){if(hasDraft())return false;const typed=v('supportSearch'),focused=document.activeElement?.id;render();if($('supportSearch')){$('supportSearch').value=typed;if(focused==='supportSearch')$('supportSearch').focus();}return true;}
    function navigate(id=''){if(id===caseId&&!newCase)return true;if(hasDraft())throw Error('Finish or discard the unsent draft in this window before opening another request.');viewEpoch++;caseId=id;newCase=false;render();return true;}
    function mutate(fn){const current=s(),before=JSON.parse(JSON.stringify(current));try{const result=fn(current);onChange();return result;}catch(e){Object.keys(current).forEach(k=>delete current[k]);Object.assign(current,before);throw e;}}
    function click(id,fn){$(id)?.addEventListener('click',async()=>{try{await fn();}catch(e){reportError(e.message);}});}
    function bind(attr,fn){document.querySelectorAll(`[${attr}]`).forEach(b=>b.addEventListener('click',()=>{try{fn(b.getAttribute(attr));}catch(e){reportError(e.message);}}));}
    function mount(id,options={}){viewEpoch++;container=id;mode=options.mode||'own';area=mode==='payroll'?'payroll':options.area||'ess';caseId=options.caseId||'';newCase=false;filter=mode==='payroll'&&['open','unassigned','awaiting','resolved','closed'].includes(options.filter)?options.filter:'open';mine=mode==='payroll'&&options.mine===true;search='';page=0;render();}
    function render(){if(mode==='payroll'&&!S.profile(s(),u()).payroll)throw Error('Payroll Management access is required.');if(newCase)return form();if(caseId)return details();return listing();}
    function listing(){
      const active=T.list(s(),u(),mode),resolved=T.list(s(),u(),mode,{resolved:true}),closed=T.list(s(),u(),mode,{closed:true});
      let rows=filter==='closed'?closed:filter==='resolved'?resolved:active;
      if(mode==='own'&&filter==='open')rows=active.concat(resolved);if(mine)rows=rows.filter(c=>c.assignedTo===u());
      if(filter==='unassigned')rows=rows.filter(c=>!c.assignedTo);if(filter==='awaiting')rows=rows.filter(c=>c.status==='Awaiting Info');
      const q=search.toLowerCase();rows=rows.filter(c=>[c.number,c.subject,T.name(s(),c.raisedBy),T.name(s(),c.raisedFor),c.status].some(t=>t.toLowerCase().includes(q)));
      const pages=Math.max(1,Math.ceil(rows.length/10));page=Math.min(page,pages-1);
      const headers=mode==='payroll'?['Subject','Raised by','Raised for','Status','Assigned to','Created']:['Number','Status','Subject','Updated'];
      const summary=[['Active requests',active.length,'support'],['Awaiting info',active.filter(c=>c.status==='Awaiting Info').length,'clock'],['Resolved',resolved.length,'tick'],['Closed',closed.length,'report']];
      const rowHtml=rows.slice(page*10,page*10+10).map(c=>{
        const subject=`<button class="case-link" data-support-case="${esc(c.id)}">${esc(c.subject)}<small>${esc(c.number)}</small></button>`;
        const cells=mode==='payroll'?[subject,label(c.raisedBy),label(c.raisedFor),badge(c.status),c.assignedTo?label(c.assignedTo):'<span class="support-unassigned">Unassigned</span>',`<time class="support-date">${esc(dt(c.createdAt))}</time>`]:[`<button class="case-link support-number" data-support-case="${esc(c.id)}">${esc(c.number)}</button>`,badge(c.status),`<button class="case-link" data-support-case="${esc(c.id)}">${esc(c.subject)}</button>`,`<time class="support-date">${esc(dt(c.updatedAt))}</time>`];
        return `<tr>${cells.map(x=>`<td>${x}</td>`).join('')}</tr>`;
      }).join('');
      put(container,`<section class="support-page support-list-page"><header class="support-heading"><div><p class="support-eyebrow">${mode==='payroll'?'Payroll Management':'Self Service'}</p><h2>${mode==='payroll'?'Support Requests':'My Support Requests'}</h2><p class="support-subtitle">${mode==='payroll'?'Manage enquiries and employee requests in one place.':'Keep track of your requests and conversations with Payroll.'}</p></div><div class="support-heading-actions">${popout()}<button id="supportNew" class="support-primary-action">${icon('plus')}${mode==='own'?'New Support Request':'Raise Support Request'}</button></div></header>
        <div class="support-overview">${summary.map(([name,total,glyph])=>`<div class="support-overview-item"><span class="support-overview-icon">${icon(glyph)}</span><div><span>${name}</span><strong>${total}</strong></div></div>`).join('')}</div>
        <section class="support-card support-inbox"><div class="support-filterbar">${mode==='own'?`<div class="support-view-tabs" aria-label="Request list"><button id="supportOpen" aria-pressed="${filter==='open'}" class="${filter==='open'?'is-active':''}">My Open Support Requests <span>${active.length+resolved.length}</span></button><button id="supportClosed" aria-pressed="${filter==='closed'}" class="${filter==='closed'?'is-active':''}">My Closed Support Requests <span>${closed.length}</span></button></div>`:`<label class="support-filter-status">Status<select id="supportFilter"><option value="open" ${filter==='open'?'selected':''}>Open cases</option><option value="unassigned" ${filter==='unassigned'?'selected':''}>Unassigned cases</option><option value="awaiting" ${filter==='awaiting'?'selected':''}>Awaiting information</option><option value="resolved" ${filter==='resolved'?'selected':''}>Show Resolved</option><option value="closed" ${filter==='closed'?'selected':''}>Show Closed</option></select></label><label class="support-mine-toggle"><input id="supportMine" type="checkbox" ${mine?'checked':''}> Assigned to me</label>`}<div class="support-search"><label for="supportSearch">Search requests</label><div><input id="supportSearch" value="${esc(search)}" type="search" placeholder="Number, subject or employee"><button id="supportSearchApply" class="secondary">${icon('search')}Search</button></div></div></div>
        <div class="table-wrap support-table-wrap"><table class="support-list"><thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rowHtml||`<tr><td colspan="${headers.length}"><div class="support-empty">${icon('support')}<strong>No support requests found.</strong><p>${q||mine?'Try another search or change the filters.':'Your requests will appear here when they are submitted.'}</p></div></td></tr>`}</tbody></table></div>
        <footer class="support-pagination"><span>Page ${page+1} of ${pages} · ${rows.length} requests</span><div><button id="supportPrev" class="secondary" ${page===0?'disabled':''}>Previous</button><button id="supportNext" class="secondary" ${page===pages-1?'disabled':''}>Next</button></div></footer></section></section>`);
      click('supportPopout',()=>o.openWindow(caseId));
      click('supportNew',()=>{newCase=true;form();});click('supportOpen',()=>{filter='open';page=0;listing();});click('supportClosed',()=>{filter='closed';page=0;listing();});
      $('supportMine')?.addEventListener('change',()=>{mine=$('supportMine').checked;page=0;listing();});$('supportFilter')?.addEventListener('change',()=>{filter=v('supportFilter');page=0;listing();});
      click('supportSearchApply',()=>{search=v('supportSearch');page=0;listing();});$('supportSearch')?.addEventListener('keydown',e=>{if(e.key==='Enter'){search=v('supportSearch');page=0;listing();}});
      click('supportPrev',()=>{page=Math.max(0,page-1);listing();});click('supportNext',()=>{page++;listing();});bind('data-support-case',id=>{caseId=id;details();});
    }

    async function readFiles(files){
      if(files.length>5||files.some(f=>f.size<=0||f.size>1024*1024))throw Error('Attach up to five files, between 1 byte and 1 MB each.');
      return Promise.all(files.map(f=>new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve({name:f.name,size:f.size,data:r.result});r.onerror=()=>reject(Error('Unable to read attachment.'));r.readAsDataURL(f);})));
    }
    const rosterDays=[['Mon','Monday',1],['Tue','Tuesday',2],['Wed','Wednesday',3],['Thu','Thursday',4],['Fri','Friday',5],['Sat','Saturday',6],['Sun','Sunday',0]];
    let lastRequestType='General Enquiry',generalSubject='',generalDescription='';
    function rosterFields(){
      const week=prefix=>`<div class="support-roster-days">${rosterDays.map(([short,name])=>`<label>${name}<input id="${prefix}${short}" type="number" min="0" max="24" step="0.01" value="0" aria-label="${prefix==='req_roster2'?'Week 2':'Week 1'} ${name} hours"></label>`).join('')}</div>`;
      return `<section id="req_rosterSection" class="support-roster"><h4>Work Schedule</h4><label>Roster Pattern<select id="req_rosterPattern"><option value="1-week">1 Week (Default)</option><option value="2-week">2 Week</option></select></label><div id="req_week1"><h5 id="req_week1Title">Regular Week</h5>${week('req_roster')}</div><div id="req_week2" hidden><h5>Week 2 — Pay Close Week</h5>${week('req_roster2')}</div><p id="req_rosterTotals" class="support-roster-totals"></p></section>`;
    }
    function requestEmploymentType(){if(v('supportRequestType')==='Commencement')return v('req_employmentType');const employee=s().employees.find(e=>e.id===v('supportRaisedFor'));return employee?E.activeEmploymentType(s(),employee,v('req_effectiveDate')||E.iso(new Date())):'';}
    function updateRoster(){
      if(!$('req_rosterPattern'))return;
      const casual=requestEmploymentType()==='Casual',needed=v('supportRequestType')!=='Variation'||v('req_reason')==='Work Schedule Adjustment';
      $('req_rosterSection').hidden=!needed;
      if($('req_changesLabel'))$('req_changesLabel').hidden=needed;
      if(casual)$('req_rosterPattern').value='1-week';$('req_rosterPattern').disabled=casual;
      for(const prefix of ['req_roster','req_roster2'])for(const [short] of rosterDays){const field=$(prefix+short);field.disabled=casual;if(casual)field.value='0';}
      const two=v('req_rosterPattern')==='2-week';$('req_week2').hidden=!two||casual;$('req_week1Title').textContent=two?'Week 1 — Pay Week':'Regular Week';
      const total=prefix=>rosterDays.reduce((n,[short])=>n+(Number(v(prefix+short))||0),0),first=total('req_roster'),second=total('req_roster2');
      const fields=(two?['req_roster','req_roster2']:['req_roster']).flatMap(prefix=>rosterDays.map(([short])=>v(prefix+short))),valid=fields.every(value=>value!==''&&Number.isFinite(Number(value))&&Number(value)>=0&&Number(value)<=24)&&fields.reduce((n,value)=>n+Number(value),0)>0;
      const summary=$(container)?.querySelector?.('.validation-summary');if(summary&&/roster hours|week [12] (?:roster|daily) hours/.test(summary.textContent)&&(!needed||casual||valid))summary.remove();
      $('req_rosterTotals').textContent=casual?'Total Scheduled Hours: 0.00 — Casual employees do not have a regular work schedule.':two?`Week 1 (Pay Week): ${first.toFixed(2)} hours · Week 2 (Pay Close Week): ${second.toFixed(2)} hours · Fortnight: ${(first+second).toFixed(2)} hours`:`Total Weekly Hours: ${first.toFixed(2)}`;
    }
    function updateRequestPosition(){
      if(!$('req_reportsTo'))return;const pos=s().positions.find(p=>p.active!==false&&String(p.positionNumber)===v('req_positionNumber'));
      const numbers=pos?(Array.isArray(pos.reportsTo)?pos.reportsTo:String(pos.reportsTo||'').split(',')).map(n=>String(n).trim()).filter(Boolean):[];
      $('req_reportsTo').value=pos?(numbers.map(n=>{const p=s().positions.find(p=>String(p.positionNumber)===n);return p?`${p.positionName} (${n})`:n;}).join(', ')||'No reporting position'):'';
    }
    function templateFields(){
      const type=v('supportRequestType'),structured=type!=='General Enquiry';
      if(lastRequestType==='General Enquiry'&&structured){generalSubject=v('supportSubject');generalDescription=v('supportDescription');}
      $('supportSubject').value=structured?type+' Request':generalSubject;$('supportSubject').readOnly=structured;$('supportSubject').required=!structured;$('supportSubjectRequired').hidden=structured;
      $('supportDescriptionLabel').hidden=structured;$('supportDescription').required=!structured;if(!structured)$('supportDescription').value=generalDescription;lastRequestType=type;
      if(!structured){put('supportTemplate','');return;}
      const field=(key,label,kind='text')=>`<label>${label}<input id="req_${key}" type="${kind}"></label>`;
      const reasons=`<label>${type==='Termination'?'Termination Reason <span class="support-required">Required</span>':'Reason'}<select id="req_reason" required><option value="">Select reason</option>${Features.REASONS[type].map(r=>`<option>${esc(r)}</option>`).join('')}</select></label>`;
      let body=reasons+(type==='Termination'?field('lastWorkingDay','Last Working Day','date'):field('effectiveDate','Effective Date','date'));
      if(type==='Commencement')body+=field('firstName','First Name')+field('lastName','Last Name')+field('dateOfBirth','Date of Birth','date')+field('email','Email','email')+field('address','Address')+`<label>Employment Type<select id="req_employmentType"><option value="">Select type</option><option>Permanent</option><option>Fixed Term</option><option>Casual</option></select></label>`+field('contractEndDate','Contract End Date (fixed term)','date');
      if(type==='Commencement'||type==='Movement')body+=`<label>Position<select id="req_positionNumber"><option value="">Select position</option>${s().positions.filter(p=>p.active!==false).map(p=>`<option value="${esc(p.positionNumber)}">${esc(p.positionName)} (${esc(p.positionNumber)})</option>`).join('')}</select></label><label class="full-line">Reports To (automatic)<input id="req_reportsTo" readonly placeholder="Populated from the selected position"></label>`;
      if(type==='Variation')body+='<label id="req_changesLabel" class="full-line">Details to Change and Proposed New Values<textarea id="req_changes" rows="5"></textarea></label>';
      if(type==='Movement')body+='<label>Assignment<select id="req_temporary"><option>Permanent</option><option>Temporary</option></select></label>'+field('returnDate','Expected Return Date (temporary)','date');
      put('supportTemplate',`<fieldset class="request-template"><legend>${esc(type)} Request Details</legend><div class="grid form-grid" data-sectioned="true">${body}</div>${type!=='Termination'?rosterFields():''}<label>Additional Comments<textarea id="req_comments" rows="4" maxlength="20000"></textarea></label></fieldset>`);
      fillTemplatePerson();
      const conditional=()=>{if($('req_contractEndDate'))$('req_contractEndDate').parentElement.hidden=v('req_employmentType')!=='Fixed Term';if($('req_returnDate'))$('req_returnDate').parentElement.hidden=v('req_temporary')!=='Temporary';updateRoster();};
      $('req_employmentType')?.addEventListener('change',conditional);$('req_temporary')?.addEventListener('change',conditional);$('req_positionNumber')?.addEventListener('change',updateRequestPosition);$('req_effectiveDate')?.addEventListener('change',updateRoster);$('req_rosterPattern')?.addEventListener('change',updateRoster);
      $('req_reason')?.addEventListener('change',()=>{if(type==='Commencement'){const reason=v('req_reason');if(/Casual/.test(reason))$('req_employmentType').value='Casual';else if(/Fixed-Term|Fixed Term Contract/.test(reason))$('req_employmentType').value='Fixed Term';else if(/Permanent/.test(reason))$('req_employmentType').value='Permanent';}conditional();});
      for(const prefix of ['req_roster','req_roster2'])for(const [short]of rosterDays)$(prefix+short)?.addEventListener('input',updateRoster);
      conditional();updateRequestPosition();
    }
    function fillTemplatePerson(){const e=s().employees.find(e=>e.id===v('supportRaisedFor'));if($('req_firstName'))$('req_firstName').value=e?.firstName||'';if($('req_lastName'))$('req_lastName').value=e?.lastName||'';updateRoster();}
    function templateValue(){
      const data={};for(const key of ['reason','effectiveDate','firstName','lastName','dateOfBirth','email','address','employmentType','contractEndDate','positionNumber','changes','temporary','returnDate','lastWorkingDay'])if($('req_'+key))data[key]=v('req_'+key);
      if($('req_rosterPattern')){data.rosterPattern=v('req_rosterPattern');data.hoursByDayWeek1=Object.fromEntries(rosterDays.map(([short,,day])=>[day,v('req_roster'+short)]));data.hoursByDayWeek2=Object.fromEntries(rosterDays.map(([short,,day])=>[day,v('req_roster2'+short)]));}return data;
    }
    function rosterSummary(template){
      if(!template.hoursByDayWeek1)return '';const two=template.rosterPattern==='2-week',first=template.hoursByDayWeek1,second=template.hoursByDayWeek2||first,total=values=>Object.values(values).reduce((n,x)=>n+Number(x||0),0);
      return `<section class="support-roster"><h4>Work Schedule</h4><div class="table-wrap"><table class="support-roster-summary"><thead><tr><th>Day</th><th>${two?'Week 1 — Pay Week':'Regular Week'}</th>${two?'<th>Week 2 — Pay Close Week</th>':''}</tr></thead><tbody>${rosterDays.map(([,name,day])=>`<tr><td>${name}</td><td>${Number(first[day]||0).toFixed(2)}</td>${two?`<td>${Number(second[day]||0).toFixed(2)}</td>`:''}</tr>`).join('')}<tr><th>Total hours</th><th>${total(first).toFixed(2)}</th>${two?`<th>${total(second).toFixed(2)}</th>`:''}</tr></tbody></table></div></section>`;
    }
    function form(){
      lastRequestType='General Enquiry';generalSubject='';generalDescription='';
      const people=()=>s().employees.map(e=>`<option value="${esc(e.id)}">${label(e.id)}</option>`).join('');
      const raisedBy=mode==='payroll'?`<select id="supportRaisedBy" required><option value="">Select employee</option>${people()}</select>`:`<input value="${label(u())}" readonly>`;
      const raisedFor=mode==='payroll'?`<select id="supportRaisedFor" required><option value="">Select employee</option>${people()}<option value="new-employee">New Employee</option></select>`:area==='mss'?`<select id="supportRaisedFor">${s().employees.map(e=>`<option value="${esc(e.id)}" ${e.id===u()?'selected':''}>${label(e.id)}</option>`).join('')}<option value="new-employee">New Employee</option></select>`:`<input value="${label(u())}" readonly>`;
      put(container,`<section class="support-page support-form-page"><button id="supportBack" class="support-back">${icon('back')}Back</button><header class="support-heading"><div><p class="support-eyebrow">Support Requests</p><h2>${mode==='payroll'?'Raise Support Request':'New Support Request'}</h2><p class="support-subtitle">Tell Payroll what you need help with and include any relevant documents.</p></div><span class="support-draft-label">${icon('edit')}New request</span></header>
        ${card('People & request',`<div class="support-fields"><label>Number<input value="${esc(T.nextNumber(s()))}" readonly></label><label>Opened<input value="${esc(dt(new Date().toISOString()))}" readonly></label><label>Raised by${raisedBy}</label><label>Raised for${raisedFor}</label></div>`)}
        ${card('Request details',`${area==='mss'?'<label>Request Type<select id="supportRequestType"><option>General Enquiry</option><option>Commencement</option><option>Variation</option><option>Movement</option><option>Termination</option></select></label><div id="supportTemplate"></div>':''}<label>Subject <span id="supportSubjectRequired" class="support-required">Required</span><input id="supportSubject" maxlength="250" placeholder="A brief summary of your request" required></label><label id="supportDescriptionLabel">Description <span class="support-required">Required</span><textarea id="supportDescription" rows="7" maxlength="20000" placeholder="Include the details Payroll needs to understand and process your request." required></textarea></label>`)}
        ${card('Attachments',upload('supportNewFiles','supportNewFileList','Attach Documents'),'Include supporting documents if they are relevant to your request.')}
        <footer class="support-submit-bar"><span>Your request will be sent to Payroll.</span><button id="supportSubmit" class="support-primary-action">${icon('send')}Submit</button></footer></section>`);
      bindUpload('supportNewFiles','supportNewFileList');
      $('supportRequestType')?.addEventListener('change',templateFields);$('supportRaisedFor')?.addEventListener('change',fillTemplatePerson);
      click('supportBack',()=>{viewEpoch++;newCase=false;listing();});
      click('supportSubmit',async()=>{
        const epoch=viewEpoch,actor=u(),source=area,button=$('supportSubmit'),input={raisedBy:v('supportRaisedBy'),raisedFor:v('supportRaisedFor'),subject:v('supportSubject'),description:v('supportDescription'),requestType:v('supportRequestType')||'General Enquiry',template:templateValue(),additionalComments:v('req_comments')},files=Array.from($('supportNewFiles').files||[]);
        button.disabled=true;try{input.attachments=await readFiles(files);if(epoch!==viewEpoch||actor!==u()||!newCase||$('supportSubmit')!==button)throw Error('The page changed. Open a new request to submit it.');
          const c=mutate(s=>T.submit(s,actor,input,source));newCase=false;caseId=c.id;details();
        }finally{button.disabled=false;}
      });
    }
    function details(){
      const c=T.get(s(),u(),caseId,mode),editable=!['Resolved','Closed'].includes(c.status),seconds=T.timeWorked(c),time=new Date(seconds*1000).toISOString().slice(11,19);
      const eligible=s().employees.filter(e=>S.profile(s(),e.id).payroll);
      const previous=(c.resolutions||[]).slice(0,-(c.resolutionNotes?1:0)||undefined);
      const resolution=c.resolutionNotes?`<section class="support-resolution"><header>${icon('tick')}<h3>Resolution Notes</h3></header><p>${esc(c.resolutionNotes)}</p><small>${label(c.resolvedBy)} · ${esc(dt(c.resolvedAt))}</small></section>`:'';
      const oldResolutions=previous.length?`<details class="support-previous-resolutions"><summary>Previous Resolution Notes <span>${previous.length}</span></summary>${previous.map(r=>`<article><p>${esc(r.notes)}</p><small>${label(r.resolvedBy)} · ${esc(dt(r.resolvedAt))}</small></article>`).join('')}</details>`:'';
      const template=c.requestType&&c.requestType!=='General Enquiry'?card(`${esc(c.requestType)} Request`,`<dl class="support-template-values">${Object.entries(c.template||{}).filter(([key])=>!['hoursByDay','hoursByDayWeek1','hoursByDayWeek2'].includes(key)).map(([key,value])=>`<div><dt>${esc(key.replace(/([A-Z])/g,' $1').replace(/^./,c=>c.toUpperCase()))}</dt><dd>${esc(value)||'—'}</dd></div>`).join('')}</dl>${rosterSummary(c.template)}<div class="support-comments"><h4>Additional Comments</h4><p>${esc(c.additionalComments)||'No additional comments.'}</p></div>`):'';
      const messages=c.messages.map((m,i)=>({m,i})).sort((a,b)=>b.m.createdAt.localeCompare(a.m.createdAt)||b.i-a.i).map(({m})=>`<article class="case-message ${m.side}"><header><span class="support-message-avatar" aria-hidden="true">${icon('person')}</span><div><strong>${esc(m.senderName)}</strong><small>${esc(c.number)} · ${esc(dt(m.createdAt))}</small></div></header>${m.kind==='Reopened'?'<span class="support-reopened-label">Support Request Reopened</span>':''}${m.text?`<p>${esc(m.text)}</p>`:''}${m.attachments.length?`<div class="support-attachment-list">${m.attachments.map((f,i)=>fileButton(f,`${m.id}:${i}`)).join('')}</div>`:''}</article>`).join('');
      const composer=editable?`<div class="support-composer"><label for="supportMessage">Message</label><textarea id="supportMessage" rows="4" maxlength="20000" placeholder="Write a message about this request…"></textarea>${upload('supportFiles','supportMessageFileList','Attach files')}<div class="support-composer-footer"><button id="supportSend" class="support-primary-action">${icon('send')}Send</button></div></div>`:`<div class="support-readonly-note">${icon('report')}<p>This request is read only because it has been resolved or closed.</p>${mode==='own'&&c.status==='Resolved'?'<button id="supportReopen" class="secondary">Re-open Support Request</button>':''}</div>`;
      const history=`<section class="support-card activity-history"><header class="support-card-heading"><h3>Activity History</h3><p>Changes to this request, most recent first.</p></header><ol class="support-timeline">${(c.history||[]).slice().reverse().map(h=>`<li><span class="support-timeline-dot" aria-hidden="true"></span><div><strong>${esc(h.action||('status' in h?h.status:'Updated'))}</strong><span class="support-history-meta">${h.actorId==='system'?'System':label(h.actorId||c.createdBy||c.raisedBy)} · ${esc(dt(h.at))}</span>${'assignedTo' in h?`<p>Assigned to: ${h.assignedTo?label(h.assignedTo):'Unassigned'}</p>`:''}${h.reason?`<p>${esc(h.reason)}</p>`:''}${(c.resolutions||[]).find(r=>r.resolvedAt===h.at)&&h.status==='Resolved'?`<p>${esc((c.resolutions||[]).find(r=>r.resolvedAt===h.at).notes)}</p>`:''}</div></li>`).join('')}</ol></section>`;
      const requestDetails=card('Request details',`<dl class="support-metadata"><div><dt>Number</dt><dd class="support-number">${esc(c.number)}</dd></div><div><dt>Raised by</dt><dd>${label(c.raisedBy)}</dd></div><div><dt>Raised for</dt><dd>${label(c.raisedFor)}</dd></div><div><dt>Created</dt><dd>${esc(dt(c.createdAt))}</dd></div><div><dt>Last updated</dt><dd>${esc(dt(c.updatedAt))}</dd></div></dl>`);
      const handling=mode==='payroll'?card('Payroll handling',`<label>Assigned to<div class="support-assignment"><select id="supportAssigned" ${editable?'':'disabled'}><option value="">Unassigned</option>${c.assignedTo&&!eligible.some(e=>e.id===c.assignedTo)?`<option value="${esc(c.assignedTo)}" selected>${label(c.assignedTo)} (access removed)</option>`:''}${eligible.map(e=>`<option value="${esc(e.id)}" ${e.id===c.assignedTo?'selected':''}>${label(e.id)}</option>`).join('')}</select><button id="supportAssignMe" class="support-icon-button" title="Assign to me" aria-label="Assign to me" ${editable?'':'disabled'}>${icon('person')}</button></div></label><div class="support-work-time"><span>${icon('clock')}Time worked</span><strong>${Math.floor(seconds/3600)}:${time.slice(3)}</strong>${c.timerStartedAt?'<small>Timer running</small>':''}<button id="supportTimer" class="secondary" ${editable?'':'disabled'}>${c.timerStartedAt?'Pause':'Start'} timer</button></div>`):'';
      put(container,`<section class="support-page support-case-page"><button id="supportBack" class="support-back">${icon('back')}Back</button><header class="support-heading support-case-heading"><div><p class="support-eyebrow">Support request <span class="support-number">${esc(c.number)}</span></p><h2>${esc(c.subject)}</h2><div class="support-case-subtitle">${badge(c.status)}<span>Updated ${esc(dt(c.updatedAt))}</span></div></div>${mode==='payroll'?`<div class="support-case-actions">${popout()}<button id="supportAwait" class="support-await-action" ${editable?'':'disabled'}>${icon('clock')}Awaiting Info</button><button id="supportResolve" class="support-resolve-action" ${editable?'':'disabled'}>${icon('tick')}Resolved</button></div>`:''}</header>
        <div class="support-case-layout"><div class="support-case-main">${resolution}${oldResolutions}${c.description?card('Description',`<p class="support-description">${esc(c.description)}</p>`):''}${template}${(c.attachments||[]).length?card('Submitted Documents',`<div class="support-attachment-list">${c.attachments.map((f,i)=>fileButton(f,`initial:${i}`)).join('')}</div>`):''}${card('Messages',`<div class="case-conversation">${messages||`<div class="support-empty">${icon('support')}<strong>No messages yet.</strong><p>Messages about this request will appear here.</p></div>`}</div>${composer}`,'Most recent messages appear at the top.')}${history}</div><aside class="support-case-aside">${requestDetails}${handling}</aside></div><div id="supportResolution"></div></section>`);
      bindUpload('supportFiles','supportMessageFileList');click('supportPopout',()=>o.openWindow(caseId));
      click('supportBack',()=>{viewEpoch++;caseId='';listing();});
      click('supportReopen',()=>{
        put('supportResolution','<dialog id="supportReopenDialog" aria-labelledby="reopenTitle"><h2 id="reopenTitle">Re-open Support Request</h2><label>Message explaining why<textarea id="supportReopenReason" rows="5" maxlength="20000" required></textarea></label><div class="controls"><button id="supportConfirmReopen">Re-open Support Request</button><button id="supportCancelReopen" class="secondary">Cancel</button></div></dialog>');
        $('supportReopenDialog').showModal();click('supportCancelReopen',()=>{$('supportReopenDialog').close();put('supportResolution','');});click('supportConfirmReopen',()=>{mutate(s=>T.reopen(s,u(),caseId,v('supportReopenReason')));$('supportReopenDialog').close();details();});
      });
      $('supportAssigned')?.addEventListener('change',()=>{try{mutate(s=>T.assign(s,u(),caseId,v('supportAssigned')));details();}catch(e){reportError(e.message);details();}});
      click('supportAssignMe',()=>{mutate(s=>T.assign(s,u(),caseId,u()));details();});click('supportTimer',()=>{mutate(s=>T.timer(s,u(),caseId));details();});click('supportAwait',()=>{mutate(s=>T.status(s,u(),caseId,'Awaiting Info'));details();});
      click('supportResolve',()=>{
        put('supportResolution','<dialog id="supportResolveDialog" aria-labelledby="resolutionTitle"><h2 id="resolutionTitle">Resolution Notes</h2><label>Resolution Notes<textarea id="supportNotes" rows="6" maxlength="20000"></textarea></label><div class="controls"><button id="supportConfirmResolve">Resolve</button><button id="supportCancelResolve" class="secondary">Cancel</button></div></dialog>');
        $('supportResolveDialog').showModal();click('supportCancelResolve',()=>{$('supportResolveDialog').close();put('supportResolution','');});click('supportConfirmResolve',()=>{mutate(s=>T.status(s,u(),caseId,'Resolved',v('supportNotes')));$('supportResolveDialog').close();details();});
      });
      click('supportSend',async()=>{
        const savedId=caseId,sender=u(),epoch=viewEpoch,body=v('supportMessage'),files=Array.from($('supportFiles').files||[]),button=$('supportSend'),savedMode=mode;
        button.disabled=true;try{const attachments=await readFiles(files);
          if(epoch!==viewEpoch||savedId!==caseId||sender!==u()||$('supportSend')!==button)throw Error('The page changed. Open the request to send your message.');
          mutate(s=>T.message(s,sender,savedId,body,attachments,savedMode));details();
        }finally{button.disabled=false;}
      });
      bind('data-support-file',value=>{const [messageId,index]=value.split(':'),current=T.get(s(),u(),caseId,mode),file=messageId==='initial'?(current.attachments||[])[Number(index)]:current.messages.find(m=>m.id===messageId)?.attachments[Number(index)];if(!file)throw Error('Attachment unavailable.');const bytes=Uint8Array.from(atob(file.data.split(',')[1]),c=>c.charCodeAt(0));const url=URL.createObjectURL(new Blob([bytes],{type:'application/octet-stream'})),a=document.createElement('a');a.href=url;a.download=file.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
    }
    return {mount,render,refresh,navigate,hasDraft};
  }
  const api={create,createUI};global.SupportRequests=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);

