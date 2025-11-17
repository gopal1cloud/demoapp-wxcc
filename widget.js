const logEl=document.getElementById("log");const statusEl=document.getElementById("status-indicator");const frame=document.getElementById("payment-frame");
const API_BASE="https://api.wxcc-us1.cisco.com";const ALLOWED_ORIGIN=window.location.origin;
function log(msg){const ts=new Date().toISOString();logEl.textContent+=`\n[${ts}] ${msg}`;logEl.scrollTop=logEl.scrollHeight;}
function setStatus(t,v="unknown"){statusEl.textContent=t;statusEl.className=`badge badge-${v}`;}
async function getAccessToken(){return await window.webex.contactCenter.getAccessToken();}
async function getActiveCall(){return await window.webex.contactCenter.getActiveCall();}
async function callRecordingAction(a){const token=await getAccessToken();const call=await getActiveCall();const recId=call?.recordingId||call?.recording?.id;if(!recId)throw new Error("No recordingId found");
const res=await fetch(`${API_BASE}/v1/recordings/${recId}/actions/${a}`,{method:"POST",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"}});if(!res.ok)throw new Error(`${a} failed ${res.status}`);
return await res.json().catch(()=>({}));}
async function safeAction(a){try{setStatus(a==="pause"?"Pausing…":"Resuming…","warn");const r=await callRecordingAction(a);const s=r?.state||(a==="pause"?"paused":"recording");
setStatus(s==="paused"?"Paused 🔴":"Recording 🟢",s==="paused"?"err":"ok");log(`${a.toUpperCase()} OK`);}catch(e){setStatus("Error","err");log(`ERROR ${a}: ${e.message}`);}}
window.addEventListener("message",(e)=>{if(e.origin!==ALLOWED_ORIGIN){log(`Rejected message from ${e.origin}`);return;}const a=e.data?.action;if(["pause","resume"].includes(a)){log(`Received ${a} trigger`);safeAction(a);}});
setStatus("Initializing…","warn");getAccessToken().then(()=>setStatus("Ready","ok")).catch(e=>{setStatus("Not in Agent Desktop","err");log(e.message);});
if(window?.webex?.contactCenter?.on){window.webex.contactCenter.on("CALL_CONNECTED",()=>setStatus("Recording 🟢","ok"));window.webex.contactCenter.on("CALL_DISCONNECTED",()=>setStatus("Unknown","unknown"));}