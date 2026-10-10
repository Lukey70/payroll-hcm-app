(function(global){
  'use strict';
  function create(E,S){
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
      signed(s,id,d);init(s);const c=s.supportRequests.find(c=>c.id===caseId);if(!c)throw Error('Support request no longer exists.');
      if(mode==='payroll')payroll(s,id,d);else if(c.raisedBy!==id)throw Error('You do not have access to this support request.');return c;
    }
    function submit(s,id,input,area='ess',d=date()){
      signed(s,id,d);if(!['ess','mss'].includes(area))throw Error('Choose Employee or Manager Self Service.');
      if(area==='mss'&&!S.profile(s,id,d).mss)throw Error('Manager Self Service access is required.');
      const raisedFor=area==='ess'?id:(input.raisedFor||id);
      if(raisedFor!=='new-employee'&&!person(s,raisedFor))throw Error('Choose an employee or New Employee.');
      const subject=String(input.subject||'').trim(),description=String(input.description||'').trim();
      if(!subject||!description)throw Error('Subject and Description are required.');
      if(subject.length>250||description.length>20000)throw Error('Subject must be at most 250 characters and Description at most 20,000.');
      init(s);const stamp=now(),number=nextNumber(s),c={id:uid('case'),number,raisedBy:id,raisedFor,status:'New',assignedTo:'',subject,description,createdAt:stamp,updatedAt:stamp,messages:[],resolutionNotes:'',resolvedAt:'',closedAt:'',timeWorkedSeconds:0,timerStartedAt:'',history:[{status:'New',actorId:id,at:stamp}]};
      s.supportSequence=Number(number.slice(2));s.supportRequests.push(c);
      notify(s,[id],`${number} has been submitted to Payroll.`,`support-submit:${c.id}`,c);audit(s,id,c,'submitted');return c;
    }
    function assign(s,id,caseId,assignee,d=date()){
      const c=get(s,id,caseId,'payroll',d);if(['Resolved','Closed'].includes(c.status))throw Error('Resolved or closed cases cannot be assigned.');
      if(assignee&&!S.profile(s,assignee,d).payroll)throw Error('Select an employee with Payroll Management access.');
      c.assignedTo=assignee||'';c.status=assignee?(c.status==='Awaiting Info'?'Awaiting Info':'Open'):'New';c.updatedAt=now();
      c.history.push({status:c.status,assignedTo:c.assignedTo,actorId:id,at:c.updatedAt});audit(s,id,c,assignee?`assigned to ${name(s,assignee)}`:'unassigned');return c;
    }
    function status(s,id,caseId,value,notes='',d=date()){
      const c=get(s,id,caseId,'payroll',d);if(['Resolved','Closed'].includes(c.status))throw Error('This case is already resolved or closed.');
      if(!['Awaiting Info','Resolved'].includes(value))throw Error('Choose Awaiting Info or Resolved.');
      if(value==='Resolved'&&!String(notes).trim())throw Error('Resolution Notes are required.');if(String(notes).length>20000)throw Error('Resolution Notes must be at most 20,000 characters.');
      if(value==='Awaiting Info'&&!c.assignedTo)throw Error('Assign the case before marking it Awaiting Info.');
      c.status=value;c.updatedAt=now();c.history.push({status:value,actorId:id,at:c.updatedAt});
      if(value==='Resolved'){stopTimer(c);c.resolvedAt=c.updatedAt;c.resolutionNotes=String(notes).trim();c.resolvedBy=id;notify(s,[c.raisedBy],`${c.number} has been marked as resolved. Please see support requests for resolution notes.`,`support-resolved:${c.id}`,c);}
      audit(s,id,c,`marked ${value}`);return c;
    }
    function validateFiles(c,files){
      if(!Array.isArray(files)||files.length>5)throw Error('Attach at most five files per message.');
      let total=(c.messages||[]).reduce((n,m)=>n+(m.attachments||[]).reduce((a,f)=>a+Number(f.size||0),0),0);
      for(const f of files){if(!f.name||!Number.isInteger(f.size)||f.size<=0||f.size>1024*1024||!/^data:[^,]*;base64,[A-Za-z0-9+/]*={0,2}$/.test(f.data||''))throw Error('Invalid attachment. Each file must be between 1 byte and 1 MB.');
        const encoded=f.data.split(',')[1];const decoded=Math.floor(encoded.length*3/4)-(encoded.endsWith('==')?2:encoded.endsWith('=')?1:0);if(decoded!==f.size)throw Error('Attachment size does not match its contents.');total+=f.size;}
      if(total>2*1024*1024)throw Error('Attachments for this case cannot exceed 2 MB in total.');
    }
    function message(s,id,caseId,text,files=[],mode='own',d=date()){
      const c=get(s,id,caseId,mode,d);if(['Resolved','Closed'].includes(c.status))throw Error('Messages cannot be sent on resolved or closed cases.');
      text=String(text||'').trim();if(!text&&!files.length)throw Error('Enter a message or attach a file.');if(text.length>20000)throw Error('Message must be at most 20,000 characters.');validateFiles(c,files);
      const m={id:uid('message'),senderId:id,senderName:name(s,id),side:id===c.raisedBy?'right':'left',text,attachments:files.map(f=>({name:String(f.name),size:f.size,data:f.data})),createdAt:now()};
      c.messages.push(m);c.updatedAt=m.createdAt;
      const recipients=id===c.raisedBy?(c.assignedTo?[c.assignedTo]:s.employees.filter(e=>S.profile(s,e.id,d).payroll).map(e=>e.id)):[c.raisedBy];
      notify(s,recipients.filter(r=>r!==id),`A message has been sent regarding ${c.number}.`,`support-message:${m.id}`,c);audit(s,id,c,'message sent');return m;
    }
    function stopTimer(c,stamp=Date.now()){if(c.timerStartedAt){c.timeWorkedSeconds+=Math.max(0,Math.floor((stamp-Date.parse(c.timerStartedAt))/1000));c.timerStartedAt='';}}
    function timer(s,id,caseId,d=date()){const c=get(s,id,caseId,'payroll',d);if(['Resolved','Closed'].includes(c.status))throw Error('This case is resolved or closed.');if(c.timerStartedAt)stopTimer(c);else c.timerStartedAt=now();c.updatedAt=now();audit(s,id,c,c.timerStartedAt?'work timer started':'work timer paused');return c;}
    function timeWorked(c,stamp=Date.now()){return Number(c.timeWorkedSeconds||0)+(c.timerStartedAt?Math.max(0,Math.floor((stamp-Date.parse(c.timerStartedAt))/1000)):0);}
    function closeDue(s,stamp=Date.now()){init(s);let count=0;for(const c of s.supportRequests)if(c.status==='Resolved'&&Number.isFinite(Date.parse(c.resolvedAt))&&stamp-Date.parse(c.resolvedAt)>=14*86400000){c.status='Closed';c.closedAt=new Date(Date.parse(c.resolvedAt)+14*86400000).toISOString();c.updatedAt=c.closedAt;c.history.push({status:'Closed',actorId:'system',at:c.closedAt});count++;}return count;}
    function list(s,id,mode='own',filters={},d=date()){signed(s,id,d);if(mode==='payroll')payroll(s,id,d);init(s);closeDue(s);return s.supportRequests.filter(c=>(mode==='payroll'||c.raisedBy===id)&&(!filters.mine||c.assignedTo===id)&&(filters.closed?c.status==='Closed':filters.resolved?c.status==='Resolved':!['Resolved','Closed'].includes(c.status))).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));}
    return {name,nextNumber,submit,get,assign,status,message,timer,timeWorked,closeDue,list,validateFiles};
  }
  function createUI(o){
    const {E,S,getState,getUser,onChange,esc}=o,T=create(E,S);
    const $=id=>document.getElementById(id),v=id=>$(id)?.value||'',put=(id,html)=>{if($(id))$(id).innerHTML=html;};
    let container='',mode='own',area='ess',caseId='',newCase=false,filter='open',mine=false,search='',page=0;
    const s=()=>getState(),u=()=>getUser(),label=id=>esc(T.name(s(),id));
    const dt=value=>new Date(value).toLocaleString('en-AU',{timeZone:'Australia/Perth',hour12:false});
    function mutate(fn){const current=s(),before=JSON.parse(JSON.stringify(current));try{const result=fn(current);onChange();return result;}catch(e){Object.keys(current).forEach(k=>delete current[k]);Object.assign(current,before);throw e;}}
    function click(id,fn){$(id)?.addEventListener('click',async()=>{try{await fn();}catch(e){alert(e.message);}});}
    function bind(attr,fn){document.querySelectorAll(`[${attr}]`).forEach(b=>b.addEventListener('click',()=>{try{fn(b.getAttribute(attr));}catch(e){alert(e.message);}}));}
    function mount(id,options={}){container=id;mode=options.mode||'own';area=options.area||'ess';caseId=options.caseId||'';newCase=false;filter='open';mine=false;search='';page=0;render();}
    function render(){if(mode==='payroll'&&!S.profile(s(),u()).payroll)throw Error('Payroll Management access is required.');if(newCase)return form();if(caseId)return details();return listing();}
    function listing(){
      const active=T.list(s(),u(),mode),resolved=T.list(s(),u(),mode,{resolved:true}),closed=T.list(s(),u(),mode,{closed:true});
      let rows=filter==='closed'?closed:filter==='resolved'?resolved:active;
      if(mode==='own'&&filter==='open')rows=active.concat(resolved);if(mine)rows=rows.filter(c=>c.assignedTo===u());
      const q=search.toLowerCase();rows=rows.filter(c=>[c.number,c.subject,T.name(s(),c.raisedBy),T.name(s(),c.raisedFor),c.status].some(t=>t.toLowerCase().includes(q)));
      const pages=Math.max(1,Math.ceil(rows.length/10));page=Math.min(page,pages-1);
      const headers=mode==='payroll'?['Subject','Raised by','Raised for','Status','Assigned to','Created']:['Number','Status','Subject','Updated'];
      put(container,`<section class="support-page"><div class="support-heading"><h2>${mode==='payroll'?'Support Requests':'My Support Requests'}</h2>${mode==='own'?'<button id="supportNew">New Support Request</button>':''}</div><div class="controls">${mode==='own'?`<button id="supportOpen" class="${filter==='open'?'':'secondary'}">My Open Support Requests (${active.length+resolved.length})</button><button id="supportClosed" class="${filter==='closed'?'':'secondary'}">My Closed Support Requests (${closed.length})</button>`:`<label><input id="supportMine" type="checkbox" ${mine?'checked':''}> Assigned to me</label><label>Show<select id="supportFilter"><option value="open" ${filter==='open'?'selected':''}>Open cases</option><option value="resolved" ${filter==='resolved'?'selected':''}>Show Resolved</option><option value="closed" ${filter==='closed'?'selected':''}>Show Closed</option></select></label>`}<label>Search<input id="supportSearch" value="${esc(search)}" type="search"></label><button id="supportSearchApply" class="secondary">Search</button></div><div class="table-wrap"><table class="support-list"><thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.slice(page*10,page*10+10).map(c=>`<tr>${(mode==='payroll'?[`<button class="case-link" data-support-case="${esc(c.id)}">${esc(c.subject)}<small>${esc(c.number)}</small></button>`,label(c.raisedBy),label(c.raisedFor),esc(c.status),c.assignedTo?label(c.assignedTo):'Unassigned',esc(dt(c.createdAt))]:[`<button class="case-link" data-support-case="${esc(c.id)}">${esc(c.number)}</button>`,esc(c.status),esc(c.subject),esc(dt(c.updatedAt))]).map(x=>`<td>${x}</td>`).join('')}</tr>`).join('')||`<tr><td colspan="${headers.length}">No support requests found.</td></tr>`}</tbody></table></div><div class="controls"><button id="supportPrev" class="secondary" ${page===0?'disabled':''}>Previous</button><span>Page ${page+1} of ${pages} · ${rows.length} requests</span><button id="supportNext" class="secondary" ${page===pages-1?'disabled':''}>Next</button></div></section>`);
      click('supportNew',()=>{newCase=true;form();});click('supportOpen',()=>{filter='open';page=0;listing();});click('supportClosed',()=>{filter='closed';page=0;listing();});
      $('supportMine')?.addEventListener('change',()=>{mine=$('supportMine').checked;page=0;listing();});$('supportFilter')?.addEventListener('change',()=>{filter=v('supportFilter');page=0;listing();});
      click('supportSearchApply',()=>{search=v('supportSearch');page=0;listing();});$('supportSearch')?.addEventListener('keydown',e=>{if(e.key==='Enter'){search=v('supportSearch');page=0;listing();}});
      click('supportPrev',()=>{page=Math.max(0,page-1);listing();});click('supportNext',()=>{page++;listing();});bind('data-support-case',id=>{caseId=id;details();});
    }
    function form(){
      put(container,`<section class="support-page"><button id="supportBack" class="secondary">Back</button><h2>New Support Request</h2><div class="support-fields"><label>Number<input value="${esc(T.nextNumber(s()))}" readonly></label><label>Raised by<input value="${label(u())}" readonly></label><label>Raised for${area==='mss'?`<select id="supportRaisedFor">${s().employees.map(e=>`<option value="${esc(e.id)}" ${e.id===u()?'selected':''}>${label(e.id)}</option>`).join('')}<option value="new-employee">New Employee</option></select>`:`<input value="${label(u())}" readonly>`}</label><label>Opened<input value="${esc(dt(new Date().toISOString()))}" readonly></label></div><label>Subject<input id="supportSubject" maxlength="250" required></label><label>Description<textarea id="supportDescription" rows="8" maxlength="20000" required></textarea></label><button id="supportSubmit">Submit</button></section>`);
      click('supportBack',()=>{newCase=false;listing();});click('supportSubmit',()=>{const c=mutate(s=>T.submit(s,u(),{raisedFor:v('supportRaisedFor'),subject:v('supportSubject'),description:v('supportDescription')},area));newCase=false;caseId=c.id;details();});
    }
    function details(){
      const c=T.get(s(),u(),caseId,mode),editable=!['Resolved','Closed'].includes(c.status),seconds=T.timeWorked(c),time=new Date(seconds*1000).toISOString().slice(11,19);
      const eligible=s().employees.filter(e=>S.profile(s(),e.id).payroll);
      put(container,`<section class="support-page"><button id="supportBack" class="secondary">Back</button><h2>${esc(c.number)} — ${esc(c.subject)}</h2><div class="case-status">${['New','Open','Awaiting Info','Resolved','Closed'].map(st=>mode==='payroll'&&['Awaiting Info','Resolved'].includes(st)?`<button id="support${st==='Resolved'?'Resolve':'Await'}" ${editable?'':'disabled'} class="${c.status===st?'':'secondary'}">${st}</button>`:`<span class="${c.status===st?'current':''}">${st}</span>`).join('')}</div><div class="support-fields"><label>Number<input value="${esc(c.number)}" readonly></label><label>Raised by<input value="${label(c.raisedBy)}" readonly></label><label>Raised for<input value="${label(c.raisedFor)}" readonly></label>${mode==='payroll'?`<label>Time worked<input value="${Math.floor(seconds/3600)}:${time.slice(3)}${c.timerStartedAt?' (running)':''}" readonly><button id="supportTimer" class="secondary" ${editable?'':'disabled'}>${c.timerStartedAt?'Pause':'Start'} timer</button></label><label>Assigned to<div class="controls"><select id="supportAssigned" ${editable?'':'disabled'}><option value="">Unassigned</option>${c.assignedTo&&!eligible.some(e=>e.id===c.assignedTo)?`<option value="${esc(c.assignedTo)}" selected>${label(c.assignedTo)} (access removed)</option>`:''}${eligible.map(e=>`<option value="${esc(e.id)}" ${e.id===c.assignedTo?'selected':''}>${label(e.id)}</option>`).join('')}</select><button id="supportAssignMe" title="Assign to me" aria-label="Assign to me" ${editable?'':'disabled'}>👤</button></div></label>`:''}</div><label>Subject<input value="${esc(c.subject)}" readonly></label><label>Description<textarea rows="5" readonly>${esc(c.description)}</textarea></label>${c.resolutionNotes?`<div class="resolution-notes"><h3>Resolution Notes</h3><p>${esc(c.resolutionNotes).replace(/\n/g,'<br>')}</p><small>${esc(dt(c.resolvedAt))} · ${label(c.resolvedBy)}</small></div>`:''}<h3>Messages</h3><div class="case-conversation">${c.messages.map(m=>`<article class="case-message ${m.side}"><strong>${esc(m.senderName)}</strong><small>${esc(c.number)} · ${esc(dt(m.createdAt))}</small><p>${esc(m.text).replace(/\n/g,'<br>')}</p>${m.attachments.map((f,i)=>`<button class="secondary" data-support-file="${esc(m.id)}:${i}">📎 ${esc(f.name)} (${Math.ceil(f.size/1024)} KB)</button>`).join('')}</article>`).join('')||'<p>No messages yet.</p>'}</div>${editable?'<label>Message<textarea id="supportMessage" rows="5" maxlength="20000"></textarea></label><label>Attach files<input id="supportFiles" type="file" multiple></label><p class="small-note">Up to five attachments per message, 1 MB per file and 2 MB total per case.</p><button id="supportSend">Send</button>':'<p>This request is read only because it has been resolved or closed.</p>'}<div id="supportResolution"></div></section>`);
      click('supportBack',()=>{caseId='';listing();});
      $('supportAssigned')?.addEventListener('change',()=>{try{mutate(s=>T.assign(s,u(),caseId,v('supportAssigned')));details();}catch(e){alert(e.message);details();}});
      click('supportAssignMe',()=>{mutate(s=>T.assign(s,u(),caseId,u()));details();});click('supportTimer',()=>{mutate(s=>T.timer(s,u(),caseId));details();});click('supportAwait',()=>{mutate(s=>T.status(s,u(),caseId,'Awaiting Info'));details();});
      click('supportResolve',()=>{
        put('supportResolution','<dialog id="supportResolveDialog" aria-labelledby="resolutionTitle"><h2 id="resolutionTitle">Resolution Notes</h2><label>Resolution Notes<textarea id="supportNotes" rows="6" maxlength="20000"></textarea></label><div class="controls"><button id="supportConfirmResolve">Resolve</button><button id="supportCancelResolve" class="secondary">Cancel</button></div></dialog>');
        $('supportResolveDialog').showModal();click('supportCancelResolve',()=>{$('supportResolveDialog').close();put('supportResolution','');});click('supportConfirmResolve',()=>{mutate(s=>T.status(s,u(),caseId,'Resolved',v('supportNotes')));$('supportResolveDialog').close();details();});
      });
      click('supportSend',async()=>{
        const savedId=caseId,sender=u(),body=v('supportMessage'),files=Array.from($('supportFiles').files||[]);if(files.length>5||files.some(f=>f.size<=0||f.size>1024*1024))throw Error('Attach up to five files, between 1 byte and 1 MB each.');
        $('supportSend').disabled=true;try{const attachments=await Promise.all(files.map(f=>new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve({name:f.name,size:f.size,data:r.result});r.onerror=()=>reject(Error('Unable to read attachment.'));r.readAsDataURL(f);})));
          if(savedId!==caseId||sender!==u()||!$(container)||!$('supportSend'))throw Error('The page changed. Open the request to send your message.');
          mutate(s=>T.message(s,sender,savedId,body,attachments,mode));details();
        }finally{if($('supportSend'))$('supportSend').disabled=false;}
      });
      bind('data-support-file',value=>{const [messageId,index]=value.split(':'),current=T.get(s(),u(),caseId,mode),file=current.messages.find(m=>m.id===messageId)?.attachments[Number(index)];if(!file)throw Error('Attachment unavailable.');const bytes=Uint8Array.from(atob(file.data.split(',')[1]),c=>c.charCodeAt(0));const url=URL.createObjectURL(new Blob([bytes],{type:'application/octet-stream'})),a=document.createElement('a');a.href=url;a.download=file.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
    }
    return {mount,render};
  }
  const api={create,createUI};global.SupportRequests=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
