(() => {
  const version = '2026-09-22';
  let choices;
  const $ = id => document.getElementById(id);
  async function request(url, options = {}) {
    const res = await fetch(url, { ...options, headers: { 'Content-Type':'application/json' } });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'บันทึกไม่สำเร็จ โปรดลองอีกครั้ง');
    return data;
  }
  async function save(value) {
    return request('/api/privacy/preferences', { method:'POST', body:JSON.stringify({version, acknowledged:true, ...value}) });
  }
  function renderChoices() {
    if (!$('privacyForm')) return;
    $('privacyAcknowledged').checked = choices.acknowledged;
    $('privacyAnalytics').checked = choices.analytics;
    $('privacyMatching').checked = choices.matching;
    $('privacyEmail').checked = choices.email;
    $('privacyMatching').disabled = !choices.loggedIn;
    $('privacyEmail').disabled = !choices.loggedIn;
    $('privacyIdentity').textContent = choices.loggedIn ? 'ตัวเลือกนี้ผูกกับบัญชีของคุณ ถอนความยินยอมได้โดยเอาเครื่องหมายออกแล้วบันทึก' : 'ขณะนี้ยังไม่เข้าสู่ระบบ ตัวเลือกสถิติจะบันทึกเฉพาะเบราว์เซอร์นี้ เข้าสู่ระบบเพื่อจัดการตัวเลือกของบัญชี';
    $('privacyRequestForm').hidden = !choices.loggedIn;
    $('requestLogin').hidden = choices.loggedIn;
  }
  async function refreshRequests() {
    if (!choices.loggedIn || !$('requestList')) return;
    const rows = await request('/api/privacy/requests');
    const container = $('requestList'); container.replaceChildren();
    const labels = {pending:'รอตรวจสอบ',reviewed:'กำลังดำเนินการ',resolved:'ดำเนินการแล้ว',rejected:'ไม่สามารถดำเนินการตามคำขอ'};
    const types = {access:'ขอเข้าถึงข้อมูล',correct:'แก้ไขข้อมูล',delete:'ลบข้อมูล/บัญชี',restrict:'จำกัดการใช้ข้อมูล',object:'คัดค้าน',portability:'โอนย้ายข้อมูล',withdraw:'ถอนความยินยอม'};
    for (const row of rows) {
      const item = document.createElement('article'); item.className='privacy-request';
      const title = document.createElement('strong'); title.textContent = '#' + row.id + ' · ' + (types[row.report_type.replace('privacy:','')] || 'คำขอข้อมูล') + ' · ' + (labels[row.status] || row.status);
      const body = document.createElement('p'); body.textContent=row.description;
      const note = document.createElement('small'); note.textContent=row.admin_note ? 'ผู้ดูแล: ' + row.admin_note : 'ส่งเมื่อ ' + row.created_at;
      item.append(title,body,note);container.append(item);
    }
  }
  async function banner() {
    if (choices.chosen || $('privacyForm') || location.pathname.includes('register')) return;
    const panel = document.createElement('aside');panel.className='privacy-banner';panel.setAttribute('aria-label','ตัวเลือกความเป็นส่วนตัว');
    panel.innerHTML='<strong>เลือกได้ว่าจะให้เก็บสถิติไหม</strong><p>เราใช้คุกกี้ที่จำเป็นเพื่อเข้าสู่ระบบและจดจำตัวเลือก สถิติการใช้งานจะปิดไว้จนกว่าคุณเลือกเปิด</p><div><button type="button" data-choice="false">ใช้เฉพาะที่จำเป็น</button><button type="button" data-choice="true">เปิดสถิติการใช้งาน</button><a href="/privacy">อ่านรายละเอียด / จัดการ</a></div><p role="status"></p>';
    panel.querySelectorAll('button').forEach(button => button.addEventListener('click', async()=>{
      const buttons=panel.querySelectorAll('button');buttons.forEach(b=>b.disabled=true);
      try { await save({analytics:button.dataset.choice==='true',matching:choices.matching,email:choices.email});panel.remove(); }
      catch(err){panel.querySelector('[role=status]').textContent=err.message;buttons.forEach(b=>b.disabled=false);}
    }));document.body.append(panel);
  }
  $('privacyForm')?.addEventListener('submit',async event=>{
    event.preventDefault();const button=event.submitter;button.disabled=true;
    try {const result=await save({analytics:$('privacyAnalytics').checked,matching:$('privacyMatching').checked,email:$('privacyEmail').checked});$('privacyMessage').textContent=result.message;}
    catch(err){$('privacyMessage').textContent=err.message;}finally{button.disabled=false;}
  });
  $('privacyReject')?.addEventListener('click',async()=>{
    const button=$('privacyReject');button.disabled=true;
    try {const result=await save({analytics:false,matching:false,email:false});for(const id of ['privacyAnalytics','privacyMatching','privacyEmail'])$(id).checked=false;$('privacyAcknowledged').checked=true;$('privacyMessage').textContent=result.message;}
    catch(err){$('privacyMessage').textContent=err.message;}finally{button.disabled=false;}
  });
  $('privacyRequestForm')?.addEventListener('submit',async event=>{
    event.preventDefault();const button=event.submitter;button.disabled=true;
    try {const result=await request('/api/privacy/requests',{method:'POST',body:JSON.stringify({type:$('requestType').value,description:$('requestDescription').value})});$('requestMessage').textContent=result.message+' (#'+result.id+')';$('requestDescription').value='';await refreshRequests();}
    catch(err){$('requestMessage').textContent=err.message;}finally{button.disabled=false;}
  });
  request('/api/privacy/preferences').then(async result=>{choices=result;renderChoices();await banner();await refreshRequests();}).catch(err=>{if($('privacyMessage'))$('privacyMessage').textContent=err.message;});
})();
