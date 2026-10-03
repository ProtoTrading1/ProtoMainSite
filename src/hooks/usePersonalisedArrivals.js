import { useCallback,useEffect,useRef,useState } from 'react';
import { authHeaders } from '../lib/authHeaders';
import { trackShoppingEvent } from '../lib/shoppingAnalytics';
import { browserCartStorage as localStorage } from '../lib/cartStorage.mjs';
const memory=new Map();
const WAIT=60000;const COOLDOWN=7*24*60*60*1000;
function read(store,key){try{return JSON.parse(store.getItem(key)||'null') ?? memory.get(key);}catch{return memory.get(key);}}
function write(store,key,value){memory.set(key,value);try{store.setItem(key,JSON.stringify(value));}catch{/* memory prevents repeated prompts */}}
const unsafe=()=>document.visibilityState!=='visible' || Boolean(document.querySelector('[aria-modal="true"], .pz-modal, .cart-drawer.open, .cart-drawer.peek, .topnav-modal-backdrop')) || [...document.querySelectorAll('.customer-journey-prompt')].some(node=>!node.closest('.personalised-arrival-tip'));
/** Preview integration only. Calling app supplies route, readiness and existing product-opening callback. */
export default function usePersonalisedArrivals({accountId,ready,browsing,blocked=false,enabled=false,onOpenProduct}){
  const [suggestion,setSuggestion]=useState(null);const [anchor,setAnchor]=useState({anchorTop:140,anchorLeft:12,anchorWidth:430});
  const current=useRef(null);const openRef=useRef(onOpenProduct);
  useEffect(()=>{openRef.current=onOpenProduct;},[onOpenProduct]);
  const close=useCallback((reason='dismissed')=>{const row=current.current;if(!row)return;trackShoppingEvent(reason==='clicked'?'personalised_tip_clicked':'personalised_tip_dismissed',{source:row.source,productId:row.code,tipStage:'arrival'});if(reason==='dismissed')write(localStorage,`proto_arrival_dismissed_v1:${accountId}`,Date.now());current.current=null;setSuggestion(null);},[accountId]);
  useEffect(()=>{
    setSuggestion(null);current.current=null;
    if(!enabled || !accountId || !ready || !browsing || blocked || typeof openRef.current!=='function')return;
    const seenKey=`proto_arrival_session_v1:${accountId}`;const dismissedKey=`proto_arrival_dismissed_v1:${accountId}`;
    if(read(sessionStorage,seenKey) || Date.now()-Number(read(localStorage,dismissedKey)||0)<COOLDOWN)return;
    let cancelled=false;let busy=false;let eligible=false;let fetched=false;let candidates=[];
    const show=async()=>{
      if(cancelled || busy || !eligible || unsafe() || read(sessionStorage,seenKey))return;
      busy=true;
      try{
        if(!fetched){fetched=true;const response=await fetch('/api/personalised-arrivals',{headers:await authHeaders()});if(!response.ok)return;const data=await response.json();candidates=Array.isArray(data.suggestions)?data.suggestions:[];}
        const row=candidates.find(p=>p.provenance?.verified===true && p.code && p.name);
        if(cancelled || !row || unsafe() || read(sessionStorage,seenKey))return;
        const header=document.querySelector('.app-header');const grid=document.querySelector('.product-grid, .catalog-instore-grid, .instore-grid');const left=Math.max(8,Math.min(grid?.getBoundingClientRect().left || 12,window.innerWidth-32));
        setAnchor({anchorTop:Math.max(12,(header?.getBoundingClientRect().bottom || 128)+12),anchorLeft:left,anchorWidth:Math.min(430,window.innerWidth-left-12)});
        write(sessionStorage,seenKey,true);current.current=row;setSuggestion(row);trackShoppingEvent('personalised_tip_shown',{source:row.source,productId:row.code,tipStage:'arrival'});
      }catch{/* suggestions must not interrupt browsing */}finally{busy=false;}
    };
    const timer=setTimeout(()=>{eligible=true;void show();},WAIT);
    const observe=new MutationObserver(()=>{if(current.current && unsafe()){current.current=null;setSuggestion(null);}else void show();});
    observe.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
    const visibility=()=>void show();document.addEventListener('visibilitychange',visibility);
    return()=>{cancelled=true;clearTimeout(timer);observe.disconnect();document.removeEventListener('visibilitychange',visibility);};
  },[accountId,ready,browsing,blocked,enabled]);
  useEffect(()=>{if(!suggestion)return;const clear=()=>{current.current=null;setSuggestion(null);};const timer=setTimeout(clear,12000);window.addEventListener('scroll',clear,{capture:true,passive:true});return()=>{clearTimeout(timer);window.removeEventListener('scroll',clear,true);};},[suggestion]);
  const open=useCallback(()=>{const row=current.current;if(!row || typeof openRef.current!=='function')return;close('clicked');openRef.current(row);},[close]);
  return {suggestion,state:suggestion?{presentation:'toast',action:'search',...anchor,eyebrow:'SELECTED FOR YOUR INTERESTS',title:'New in the catalogue',message:`${suggestion.name}. Matches the ${suggestion.selectedInterest} interest you selected.`,primaryLabel:'View product',dismissLabel:'Dismiss product suggestion',dismissAfterMs:12000}:null,dismiss:close,open};
}
