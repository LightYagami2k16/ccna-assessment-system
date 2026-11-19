import {useLayoutEffect,useRef,useId} from 'react'

export default function CliDuelOverlay({kind='countdown',count,title,onClose,onLeave,children}){
 const ref=useRef(null),titleId=useId()
 useLayoutEffect(()=>{const dialog=ref.current,opener=document.activeElement;dialog.showModal();return()=>{dialog.close();if(opener?.isConnected)opener.focus()}},[])
 return <dialog ref={ref} className={`duel-overlay duel-overlay--${kind}`} aria-labelledby={titleId} onCancel={event=>{event.preventDefault();onClose?.()}}>
  {kind==='victory'&&<div className="duel-fireworks" aria-hidden="true">{[0,1,2].map(burst=><span key={burst} className={`duel-firework duel-firework--${burst}`} style={{'--burst-delay':`${burst*.24}s`}}>{Array.from({length:8},(_,ray)=><i key={ray} style={{'--ray-angle':`${ray*45}deg`,'--ray-color':['#80f4ba','#ffd36e','#83d9ff','#f4a6ff'][(ray+burst)%4]}}/>)}</span>)}</div>}
  <div className="duel-overlay__content">
   <span className="eyebrow">{kind==='countdown'?'GET READY':kind==='versus'?'CLI DUEL':'DUEL RESULT'}</span>
   <h2 id={titleId}>{title||'Both players are ready'}</h2>
   {kind==='countdown'&&<strong key={count} className={`duel-countdown__number ${count>0?'':'duel-countdown__number--waiting'}`} aria-live="polite" aria-atomic="true">{count>0?count:'Ready'}</strong>}
   {children}
   {onClose&&<button type="button" className="primary" autoFocus onClick={onClose}>View result</button>}
   {onLeave&&<button type="button" className="secondary" onClick={onLeave}>Leave arena</button>}
  </div>
 </dialog>
}
