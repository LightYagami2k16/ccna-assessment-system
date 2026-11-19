import {useState,useRef,useLayoutEffect} from 'react'
import {DUEL_CHARACTERS,getDuelCharacter} from '../services/cliDuelCharacters'
import CliDuelCharacter from './CliDuelCharacter'

function preload(character){return new Promise((resolve,reject)=>{
 const image=new Image(),timer=window.setTimeout(()=>reject(new Error('The character image could not load. Try again or choose another character.')),10000)
 const fail=()=>{window.clearTimeout(timer);reject(new Error('The character image could not load. Try again or choose another character.'))}
 image.onload=()=>{image.decode().then(()=>{window.clearTimeout(timer);resolve()},fail)};image.onerror=fail;image.src=character.src
})}
export default function CliDuelCharacterPicker({own,disabled,onConfirm}){
 const [choice,setChoice]=useState(''),[saving,setSaving]=useState(false),[error,setError]=useState(''),[previewRevision,setPreviewRevision]=useState(0)
 const active=useRef(true)
 useLayoutEffect(()=>{active.current=true;return()=>{active.current=false}},[])
 const selected=getDuelCharacter(choice||own.characterId)||DUEL_CHARACTERS[0],confirmed=getDuelCharacter(own.characterId)
 async function confirm(random=false){setSaving(true);setError('');try{if(!random){await preload(selected);if(!active.current)return;setPreviewRevision(revision=>revision+1)}await onConfirm(random?'random':selected.id)}catch(failure){if(active.current)setError(failure.message||'Character selection could not be saved. Try again.')}finally{if(active.current)setSaving(false)}}
 return <section className="duel-character-picker" aria-label="Character selection">
  <header><div><span className="eyebrow">CHOOSE YOUR FIGHTER</span><h3>Your arena character</h3><p>Choose a character or use Random. If you skip selection, a character will be assigned when the host starts.</p></div><span className="duel-character-count">15 characters</span></header>
  <div className="duel-character-picker__layout"><div className="duel-character-grid" role="group" aria-label="Choose your character">{DUEL_CHARACTERS.map(character=><button type="button" key={character.id} aria-label={character.name} aria-pressed={selected.id===character.id} disabled={disabled||saving} onClick={()=>{setChoice(character.id);setError('')}}><img src={character.src} alt="" loading="lazy" decoding="async"/><span>{character.name}</span></button>)}</div>
   <aside className="duel-character-preview" aria-label="Selected character preview"><CliDuelCharacter key={`${selected.id}:${previewRevision}`} characterId={selected.id} size="preview" showName/><button type="button" className="primary" disabled={disabled||saving||selected.id===own.characterId} onClick={()=>confirm()}>{saving?'Confirming…':'Confirm character'}</button><button type="button" className="secondary" disabled={disabled||saving} onClick={()=>confirm(true)}>Random</button>{confirmed&&<p role="status">{confirmed.name} confirmed</p>}<small>Both players may choose the same character.</small></aside>
  </div>{error&&<p role="alert">{error}</p>}
 </section>
}
