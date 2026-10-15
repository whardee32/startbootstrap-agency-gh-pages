
(function(){
'use strict';
const email='routinereliefsystems@gmail.com';
const escapeHTML=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const validPhone=value=>/^(?:1)?\d{10}$/.test(String(value).replace(/\D/g,''));
async function fetchJSON(url,options={},timeout=15000){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeout);
 try{const response=await fetch(url,{...options,signal:controller.signal});let data;try{data=await response.json()}catch{throw new Error('The service returned an unreadable response. Please try again or email us.')}
 if(!response.ok||!data.ok)throw new Error('The request was not accepted. Please check your details or email us.');return data;
 }finally{clearTimeout(timer)}
}
window.RR={escapeHTML,validPhone,fetchJSON};
const toggle=document.getElementById('rr-menu'),nav=document.getElementById('rr-links');
if(toggle&&nav){toggle.addEventListener('click',()=>{const open=toggle.getAttribute('aria-expanded')!=='true';toggle.setAttribute('aria-expanded',String(open));nav.classList.toggle('open',open)});nav.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>{toggle.setAttribute('aria-expanded','false');nav.classList.remove('open')}));document.addEventListener('keydown',e=>{if(e.key==='Escape'){toggle.setAttribute('aria-expanded','false');nav.classList.remove('open')}})}
document.querySelectorAll('[data-year]').forEach(el=>el.textContent=new Date().getFullYear());
const form=document.getElementById('contactForm');
if(!form)return;
const status=document.getElementById('home-status'),phone=document.getElementById('phoneNumber'),method=document.getElementById('preferredContact');
const key=new URLSearchParams(window.location.search).get('plan');
const radio=document.getElementById('plan-'+key);
if(radio&&radio.name==='plan'){radio.checked=true;document.getElementById('serviceFocus').value=key==='air'?'HVAC':key==='salt'?'Water Softener':'Combined'}
function validate(){
 phone.setCustomValidity('');
 if((phone.value.trim()&&!validPhone(phone.value))||(['Text','Call'].includes(method.value)&&!validPhone(phone.value)))phone.setCustomValidity('Enter a valid 10-digit phone number for phone or text replies.');
 const zip=document.getElementById('zip');zip.setCustomValidity(zip.value.trim()&&!/^\d{5}(?:-\d{4})?$/.test(zip.value.trim())?'Enter a valid ZIP code.':'');
 return form.reportValidity();
}
phone.addEventListener('input',()=>phone.setCustomValidity(''));
document.getElementById('zip').addEventListener('input',e=>e.target.setCustomValidity(''));
function message(){return 'Hello Routine Relief,\n\nPlease send service details for my home.\n\n'+Array.from(form.querySelectorAll('input:not([type=radio]),select,textarea')).map(el=>(form.querySelector('label[for="'+el.id+'"]')?.textContent||el.id)+': '+el.value.trim()).join('\n')+'\nPlan: '+(form.querySelector('input[name=plan]:checked')?.value||'Not sure')+'\n\nPlease confirm equipment, route availability, and final pricing before enrollment.'}
document.getElementById('home-email').addEventListener('click',()=>{if(!validate())return;const text=message();document.getElementById('home-email-text').value=text;document.getElementById('home-email-preview').hidden=false;status.textContent='Your inquiry is prepared, not sent. Review and send it in your email app, or copy the text below.';window.location.href='mailto:'+email+'?subject='+encodeURIComponent('Home service inquiry')+'&body='+encodeURIComponent(text)});
let pendingTimer;
form.addEventListener('submit',event=>{
 if(!validate()){event.preventDefault();event.stopImmediatePropagation();return}
 if(!window.RRFormSDKLoaded){event.preventDefault();event.stopImmediatePropagation();status.textContent='Online submission is unavailable. Use “Prepare an email instead” below.';return}
 status.textContent='Submitting your inquiry…';clearTimeout(pendingTimer);
 pendingTimer=setTimeout(()=>{const ok=document.getElementById('submitSuccessMessage');if(ok.classList.contains('d-none'))status.textContent='Submission is taking longer than expected. If no confirmation appears, use the email option below.'},20000);
},true);
const watch=new MutationObserver(()=>{const ok=document.getElementById('submitSuccessMessage'),err=document.getElementById('submitErrorMessage');if(!ok.classList.contains('d-none')){clearTimeout(pendingTimer);status.textContent='';}if(!err.classList.contains('d-none')){clearTimeout(pendingTimer);status.textContent='Please use the email option below if the form cannot submit.'}});
watch.observe(document.getElementById('submitSuccessMessage'),{attributes:true,attributeFilter:['class']});watch.observe(document.getElementById('submitErrorMessage'),{attributes:true,attributeFilter:['class']});
})();