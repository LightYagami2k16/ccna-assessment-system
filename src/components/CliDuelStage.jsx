import {useLayoutEffect,useEffect,useRef,useState} from 'react'
import {createPortal} from 'react-dom'

export default function CliDuelStage({children}){
 const stage=useRef(null)
 useLayoutEffect(()=>{
  const root=document.getElementById('root'),wasInert=root?.inert,overflow=document.body.style.overflow,opener=document.activeElement
  if(root)root.inert=true
  document.body.style.overflow='hidden'
  const arena=stage.current
  if(!arena?.querySelector('dialog[open]'))arena?.focus({preventScroll:true})
  return()=>{if(document.fullscreenElement===arena)void document.exitFullscreen().catch(()=>{});if(root)root.inert=wasInert;document.body.style.overflow=overflow;const target=opener?.isConnected&&opener!==document.body?opener:document.getElementById('main-workspace-content');if(!wasInert)target?.focus({preventScroll:true})}
 },[])
 return createPortal(<main ref={stage} className="duel-stage" tabIndex="-1" aria-label="CLI Duel arena">{children}</main>,document.body)
}

export function DuelFullscreenButton(){
 const [fullscreen,setFullscreen]=useState(false),[message,setMessage]=useState('')
 useEffect(()=>{const update=()=>setFullscreen(Boolean(document.fullscreenElement?.classList.contains('duel-stage')));update();document.addEventListener('fullscreenchange',update);return()=>document.removeEventListener('fullscreenchange',update)},[])
 async function toggle(event){const arena=event.currentTarget.closest('.duel-stage');setMessage('');try{if(document.fullscreenElement===arena)await document.exitFullscreen();else if(arena?.requestFullscreen)await arena.requestFullscreen();else setMessage('Fullscreen is unavailable here. The arena still fills this window.')}catch{setMessage('Fullscreen is unavailable here. The arena still fills this window.')}}
 return <div className="duel-fullscreen-control"><button type="button" className="secondary" onClick={toggle}>{fullscreen?'Exit fullscreen':'Enter fullscreen'}</button>{message&&<span role="status">{message}</span>}</div>
}
