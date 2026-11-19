import {useEffect,useRef,useState} from 'react'

export default function CliDuelHealthBar({hp,maximumHp=100,name='Player',side='left'}){
 const previous=useRef(hp),[damage,setDamage]=useState(0)
 useEffect(()=>{let timer;if(hp<previous.current){setDamage(Math.round((previous.current-hp)*100)/100);timer=window.setTimeout(()=>setDamage(0),600)}previous.current=hp;return()=>window.clearTimeout(timer)},[hp])
 const percent=Math.max(0,Math.min(100,Number(hp)/Number(maximumHp)*100))
 return <div className={`duel-health ${side==='right'?'duel-health--right':''} ${damage?'duel-health--damaged':''}`}>
  <div className="duel-health__label"><span>HP</span><strong>{Number(hp).toLocaleString()} / {Number(maximumHp).toLocaleString()}</strong></div>
  <meter className="duel-health__native" aria-label={`${name} HP`} min="0" max={maximumHp} value={hp}/>
  <div className="duel-health__track" aria-hidden="true"><div className={`duel-health__fill ${percent<=20?'duel-health__fill--low':percent<=50?'duel-health__fill--mid':''}`} style={{width:`${percent}%`}}/></div>
  {damage>0&&<span className="duel-health__damage" aria-live="polite">−{damage} HP</span>}
 </div>
}
