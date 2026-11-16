const $ = id => document.getElementById(id);
let filter='all', next=null, loading=false, token='', requestId=crypto.randomUUID(), selectedFile=null, previewUrl=null;
async function api(path,options={}) {
  const response=await fetch(path,{...options,headers:{'Content-Type':'application/json',...options.headers}});
  const data=await response.json();
  if(!response.ok) throw new Error(data.error || 'Could not connect. Please try again.');
  return data;
}
function status(message,kind='') {$('form-status').textContent=message;$('form-status').className=`status ${kind}`;}
function toast(message){$('toast').textContent=message;$('toast').hidden=false;setTimeout(()=>$('toast').hidden=true,4500);}
function showState(title,description,retry=false){
  const box=$('archive-state');box.replaceChildren();box.hidden=false;
  const symbol=document.createElement('span');symbol.className='empty-symbol';symbol.textContent='↗';symbol.setAttribute('aria-hidden','true');
  const h=document.createElement('h3');h.textContent=title;const p=document.createElement('p');p.textContent=description;box.append(symbol,h,p);
  if(retry){const b=document.createElement('button');b.className='button outline';b.textContent='TRY AGAIN';b.onclick=()=>loadEntries();box.append(b);}
  else{const a=document.createElement('a');a.href='#leave-love';a.className='text-link';a.textContent='BE THE FIRST TO LEAVE SOME LOVE ↗';box.append(a);}
}
function renderEntry(entry){
  const card=document.createElement('article');card.className='entry';
  if(entry.hasPhoto){const button=document.createElement('button');button.type='button';button.className='photo-button';button.setAttribute('aria-label',`Open photo shared by ${entry.name}`);const image=document.createElement('img');image.src=`/api/photos/${entry.id}`;image.alt=`Memory shared by ${entry.name}`;image.loading='lazy';button.append(image);button.onclick=()=>{const modal=$('lightbox');modal.querySelector('img').src=image.src;modal.querySelector('img').alt=image.alt;modal.querySelector('p').textContent=`Shared by ${entry.name}`;modal.showModal();};card.append(button);}
  const message=document.createElement('p');message.className='entry-message';message.textContent=entry.message;
  const byline=document.createElement('div');byline.className='byline';const author=document.createElement('span');author.textContent=entry.name;const time=document.createElement('time');time.dateTime=entry.createdAt;time.textContent=new Date(entry.createdAt).toLocaleDateString('en-GB',{day:'2-digit',month:'short'});byline.append(author,time);card.append(message,byline);return card;
}
async function loadEntries(append=false){
  if(loading)return;loading=true;$('load-more').disabled=true;
  document.querySelectorAll('[data-filter]').forEach(b=>b.disabled=true);
  try{const data=await api(`/api/entries?filter=${filter}${append&&next?`&before=${next}`:''}`);if(!append)$('entries').replaceChildren();data.entries.forEach(e=>$('entries').append(renderEntry(e)));next=data.next;$('load-more').hidden=!next;$('wish-count').textContent=data.totals.wishes;$('photo-count').textContent=data.totals.photos;$('archive-state').hidden=true;if(!$('entries').children.length)showState(filter==='photos'?'Every photo has a story.':'The first page is yours.',filter==='photos'?'Share a moment with Gbo. Approved photos will live here.':'Leave the first birthday wish. Approved messages will appear here.');}
  catch(e){if(!append)showState('The archive is taking a moment.',e.message,true);else toast(e.message);}
  finally{loading=false;$('load-more').disabled=false;document.querySelectorAll('[data-filter]').forEach(b=>b.disabled=false);}
}
document.querySelectorAll('[data-filter]').forEach(button=>button.onclick=()=>{filter=button.dataset.filter;document.querySelectorAll('[data-filter]').forEach(b=>{b.classList.toggle('active',b===button);b.setAttribute('aria-pressed',String(b===button));});loadEntries();});
$('load-more').onclick=()=>loadEntries(true);
$('message').oninput=()=>{$('char-count').textContent=`${$('message').value.length} / 1200`;};
function clearPhoto(){selectedFile=null;$('photo').value='';if(previewUrl)URL.revokeObjectURL(previewUrl);previewUrl=null;$('photo-preview').hidden=true;$('preview-img').removeAttribute('src');}
function choosePhoto(file){
  clearPhoto();if(!file)return;
  if(/\.(heic|heif)$/i.test(file.name)||['image/heic','image/heif'].includes(file.type)){
    status('This is an iPhone HEIC original. Please export or share it as a JPEG, then choose that version.','error');return;
  }
  const validType=['image/jpeg','image/png','image/webp'].includes(file.type);
  const validExtension=!file.type&&/\.(jpe?g|png|webp)$/i.test(file.name);
  if(!validType&&!validExtension){status('Choose a JPEG, PNG or WebP photo.','error');return;}
  if(file.size>20*1024*1024){status('That photo is too large. Please choose one up to 20 MB.','error');return;}
  selectedFile=file;previewUrl=URL.createObjectURL(file);$('preview-img').src=previewUrl;$('photo-preview').hidden=false;status('');
}
$('photo').onchange=e=>choosePhoto(e.target.files[0]);$('remove-photo').onclick=clearPhoto;
const zone=$('drop-zone');zone.ondragover=e=>{e.preventDefault();zone.classList.add('dragging');};zone.ondragleave=()=>zone.classList.remove('dragging');zone.ondrop=e=>{e.preventDefault();zone.classList.remove('dragging');choosePhoto(e.dataTransfer.files[0]);};
async function challenge(){token=(await api('/api/challenge')).token;}
const base64=file=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.onerror=()=>reject(new Error('Could not read this photo.'));reader.readAsDataURL(file);});
$('wish-form').onsubmit=async e=>{
  e.preventDefault();$('submit').disabled=true;status('Sending your love…');
  try{if(!token){await challenge();throw new Error('The form is ready now. Please press Send the love again.');}
    await api('/api/entries',{method:'POST',body:JSON.stringify({name:$('name').value,message:$('message').value,consent:$('consent').checked,website:$('website').value,token,requestId,photo:selectedFile?await base64(selectedFile):null})});
    $('wish-form').reset();clearPhoto();$('char-count').textContent='0 / 1200';requestId=crypto.randomUUID();status('Love received. Your entry is saved and waiting for the host’s review. Thank you for making Gbo’s day.','success');challenge().catch(()=>{token='';});
  }catch(error){status(error.message,'error');if(error.message.includes('refresh'))challenge().catch(()=>{token='';});}
  finally{$('submit').disabled=false;}
};
$('share').onclick=async()=>{try{await navigator.clipboard.writeText(location.origin+'/');toast('Link copied. Send a little love around.');}catch{toast(`Share this link: ${location.origin}/`);}};
$('privacy-open').onclick=()=>$('privacy').showModal();document.querySelectorAll('dialog').forEach(dialog=>{dialog.querySelector('.dialog-close').onclick=()=>dialog.close();dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});});
async function configure(){try{const c=await api('/api/config');document.title=`${c.name} / ${c.age} — The Birthday Archive`;$('hero-name').textContent=c.name.toUpperCase();$('hero-age').textContent=c.age+'.';$('closing-name').textContent=c.name.toUpperCase()+'.';$('intro').textContent=c.intro;$('portrait').src=c.portrait;$('portrait').alt=c.portraitAlt;$('birthday-date').textContent=new Date(c.birthday).toLocaleDateString('en-GB',{day:'2-digit',month:'long',year:'numeric',timeZone:c.timezone}).toUpperCase();const countdown=()=>{const remaining=new Date(c.birthday)-Date.now();const day=new Date().toLocaleDateString('en-CA',{timeZone:c.timezone});const birthdayDay=new Date(c.birthday).toLocaleDateString('en-CA',{timeZone:c.timezone});$('countdown').textContent=remaining>0?`CHAPTER ${c.age} IN ${Math.floor(remaining/3600000)}H ${Math.floor(remaining/60000)%60}M`:day===birthdayDay?'TODAY IS YOURS. HAPPY BIRTHDAY.':`CHAPTER ${c.age}. KEEP THE LOVE COMING.`;};countdown();setInterval(countdown,60000);}catch{toast('Could not load site details. Please refresh.');}}
configure();loadEntries();challenge().catch(()=>{token='';});
