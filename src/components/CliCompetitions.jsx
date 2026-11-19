import {useCallback,useRef,useState} from 'react'
import {duelCandidateKey} from '../services/cliDuelSync'
import {getAssessmentClientId} from '../services/assessmentClientSessionService'
import useCliDuel from '../hooks/useCliDuel'
import useCliPracticalEditor from '../hooks/useCliPracticalEditor'
import {getDuelWorkspace,getDuelConfiguration,sendDuelAction,enterDuelArena,duelError} from '../services/cliDuelService'
import {blankLab} from '../../supabase/functions/_shared/cliPracticalConfiguration.js'
import {defaultDuelDamage} from '../../supabase/functions/_shared/cliDuelProtocol.js'
import {prepareFullDuelDefinition} from '../../supabase/functions/_shared/cliDuelFullProtocol.js'
import CliPracticalConfigurationFields from './CliPracticalConfigurationFields'
import CliDuelLobby from './CliDuelLobby'
import './CliDuel.css'

function emptyConfiguration(){const lab=blankLab();return {...lab,criteria:lab.criteria.map(item=>({...item,duelDamage:100}))}}
function asConfiguration(lab){return {title:lab.title,description:lab.description||'',instructions:lab.instructions,devices:lab.devices,topology:lab.topology,durationMinutes:Number(lab.durationMinutes),criteria:lab.criteria.map(item=>({type:item.type,target:item.target||'',expected:item.expected||'',points:Number(item.points),deviceId:item.deviceId,label:item.label||''}))}}

export default function CliCompetitions({onPlay}){
 const loader=useCallback(()=>getDuelWorkspace(),[])
 const {data,error,loading,refresh}=useCliDuel(loader)
 const [selected,setSelected]=useState(null),[creating,setCreating]=useState(false),[rematchId,setRematchId]=useState(null)
 const [sourceId,setSourceId]=useState(''),[lab,setLabState]=useState(emptyConfiguration),[startingHp,setStartingHp]=useState(100)
 const [players,setPlayers]=useState(['','']),[allowReview,setAllowReview]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('')
 const [sourceLoading,setSourceLoading]=useState(false)
 const sourceRequest=useRef(0)
 const setLab=useCallback(updater=>setLabState(current=>{const next=typeof updater==='function'?updater(current):updater;return {...next,criteria:next.criteria.map(item=>({...item,duelDamage:item.duelDamage??10}))}}),[])
 const editor=useCliPracticalEditor(lab,setLab)
 const candidates=data?.candidates||[]
 async function importSource(id,rematch=null){
  const generation=++sourceRequest.current;setSourceId(id||'');setRematchId(rematch);setMessage('')
  if(!id&&!rematch){setLabState(emptyConfiguration());setStartingHp(100);setSourceLoading(false);return}
  setSourceLoading(true)
  try{
   const result=await getDuelConfiguration(id,rematch);if(generation!==sourceRequest.current)return
   const definition=result.definition;if(!definition?.devices?.length)throw new Error('This source configuration is unavailable.')
   const hp=definition.combat?.startingHp||100,damage=definition.combat?.damage||defaultDuelDamage(definition.criteria,hp)
   setLabState({...blankLab(),courseId:definition.courseId||'',moduleId:definition.moduleId||'',title:definition.title||'',description:definition.description||'',instructions:definition.instructions,devices:definition.devices,topology:definition.topology||{links:[]},durationMinutes:definition.durationMinutes||30,criteria:definition.criteria.map((item,index)=>({...item,duelDamage:damage[index]??0}))})
   setStartingHp(hp);editor.setDeviceEditorSelection(definition.devices[0].id);editor.setCriterionDeviceSelection(definition.devices[0].id);editor.setExpandedCriterionDeviceIds([definition.devices[0].id]);editor.setExpandedCriterionIndex(0)
  }catch(failure){if(generation===sourceRequest.current)setMessage(duelError(failure))}finally{if(generation===sourceRequest.current)setSourceLoading(false)}
 }
 async function enterParticipant(id,spectator=false){setBusy(true);setMessage('');try{if(!spectator)await enterDuelArena(id,getAssessmentClientId());onPlay?.(id)}catch(failure){setMessage(duelError(failure))}finally{setBusy(false)}}
 function begin(){sourceRequest.current++;setCreating(true);setSourceId('');setRematchId(null);setLabState(emptyConfiguration());setStartingHp(100);setPlayers(['','']);setMessage('')}
 const combat={startingHp:Number(startingHp),damage:lab.criteria.map(item=>Number(item.duelDamage))}
 let validation=''
 try{prepareFullDuelDefinition(asConfiguration(lab),combat)}catch(failure){validation=failure.message}
 async function create(event){
  event.preventDefault();if(sourceLoading||busy)return;setBusy(true);setMessage('')
  try{
   const picked=players.map(key=>candidates.find(item=>duelCandidateKey(item)===key));if(picked.some(item=>!item)||picked[0].studentId===picked[1].studentId)throw new Error('Select two different students.')
   const configuration=asConfiguration(lab);prepareFullDuelDefinition(configuration,combat)
   const response=await sendDuelAction({action:'create',rulesVersion:3,...(rematchId?{rematchId}:sourceId?{labId:sourceId}:{}),title:configuration.title,durationMinutes:configuration.durationMinutes,configuration,combat,participantSelections:picked.map(item=>({studentId:item.studentId,classId:item.classId})),allowReview})
   setSelected(response.competitionId);setCreating(false);await refresh()
  }catch(failure){setMessage(duelError(failure))}finally{setBusy(false)}
 }
 if(selected)return <div className="cli-duel"><CliDuelLobby onBack={()=>{setSelected(null);void refresh()}} key={selected} id={selected} onPlay={onPlay} onRematch={id=>{setSelected(null);setCreating(true);setPlayers(['','']);void importSource(null,id)}}/></div>
 return <section className="panel cli-duel"><header className="duel-heading"><div><span className="eyebrow">CONFIGURATION CHALLENGE</span><h2>CLI Duels</h2><p>Reduce your opponent to zero HP to win. Timed-out matches use score, then finish time.</p></div>{data?.canHost&&<button className="primary" onClick={begin}>Create duel</button>}</header>
 <p>Duels have their own history and do not affect academic grades or practical attempt limits.</p>
 {loading&&<p role="status">Loading duels…</p>}{error&&<p role="alert">{error}</p>}{message&&<p role="alert">{message}</p>}
 {creating&&data?.canHost&&<form className="duel-create cli-lab-editor" onSubmit={create}>
 <h3>{rematchId?'Create rematch from frozen configuration':'Create a 1 vs 1 duel'}</h3>
 {!rematchId&&<label>Load from CLI practical (optional)<select value={sourceId} onChange={event=>void importSource(event.target.value)}><option value="">Start a new configuration</option>{(data.compatibleLabs||[]).map(item=><option key={item.id} value={item.id}>{item.title}</option>)}</select></label>}
 {sourceLoading?<p role="status">Loading source configuration…</p>:<CliPracticalConfigurationFields lab={lab} setLab={setLab} editor={editor} duel renderCriterionExtra={(criterion,index)=><label>Damage<input aria-label={`Damage for criterion ${index+1}`} type="number" min="0" max="10000" step="0.01" value={criterion.duelDamage??10} onChange={event=>editor.updateCriterion(index,'duelDamage',event.target.value)}/></label>}/>}
 <fieldset className="form-fieldset"><legend>Duel settings</legend><div className="duel-actions"><label>Starting HP<input required type="number" min="1" max="10000" step="1" value={startingHp} onChange={event=>setStartingHp(event.target.value)}/></label><button type="button" className="secondary" onClick={()=>{try{const damage=defaultDuelDamage(lab.criteria,Number(startingHp));setLab(current=>({...current,criteria:current.criteria.map((item,index)=>({...item,duelDamage:damage[index]}))}))}catch(failure){setMessage(failure.message)}}}>Distribute damage by points</button></div>
 <p>Each criterion deals damage once. Total damage: {combat.damage.reduce((sum,n)=>sum+(Number.isFinite(n)?n:0),0)} / {startingHp} HP required for knockout.</p>
 <div className="duel-grid">{players.map((value,slot)=><label key={slot}>Player {slot+1}<select aria-label={`Player ${slot+1}`} required value={value} onChange={event=>setPlayers(current=>current.map((old,index)=>index===slot?event.target.value:old))}><option value="">Select a student</option>{candidates.map(item=><option key={duelCandidateKey(item)} value={duelCandidateKey(item)} disabled={candidates.find(other=>duelCandidateKey(other)===players[1-slot])?.studentId===item.studentId}>{item.displayName||item.email}{item.className?` · ${item.className}`:''}</option>)}</select></label>)}</div></fieldset>
 <label className="duel-review-setting"><input type="checkbox" checked={allowReview} onChange={event=>setAllowReview(event.target.checked)}/>Release own-attempt review automatically after the entire match ends</label>
 {validation&&<p className="form-message" role="status">{validation}</p>}
 <div className="duel-actions"><button className="primary" disabled={busy||sourceLoading||Boolean(validation)}>Create match</button><button type="button" className="secondary" onClick={()=>{sourceRequest.current++;setCreating(false)}}>Cancel</button></div></form>}
 <h3>Invitations & live matches</h3><MatchList matches={data?.matches?.filter(item=>['lobby','waiting','countdown','active','paused'].includes(item.competition.status))} onSelect={setSelected} onEnter={enterParticipant} busy={busy}/>
 <h3>Competition history</h3><MatchList matches={data?.matches?.filter(item=>!['lobby','waiting','countdown','active','paused'].includes(item.competition.status))} onSelect={setSelected} onEnter={enterParticipant} busy={busy}/></section>
}

function MatchList({ matches = [], onSelect, onEnter, busy }) {

  return !matches.length ? <p>No duels yet.</p> : <div className="duel-list">{matches.map(({ competition: match, participants }) => <article className="duel-match" key={match.id}>

    <div><h4>{match.title}</h4><p>{participants.map(p => p.displayName).join(' vs ')} · {match.durationMinutes} minutes · {match.status}{match.endReason ? ` · ${match.endReason.replaceAll('_',' ')}` : match.rulesVersion===1 ? ' · Legacy rules' : ''}</p></div><div className="duel-match-actions">{match.hostControlled&&!match.canHost&&['waiting','countdown','active','paused'].includes(match.status)&&participants.some(p=>p.isOwn&&['invited','ready','in_progress','submitted'].includes(p.status))&&<button className="primary" disabled={busy} onClick={()=>onEnter(participants.find(p=>p.isOwn).id,participants.find(p=>p.isOwn).status==='submitted')}>{participants.find(p=>p.isOwn).status==='submitted'?'Watch arena':'Enter arena'}</button>}<button className="secondary" onClick={() => onSelect(match.id)}>{match.hostControlled&&match.canHost?'Enter host arena':'Show details'}</button></div>

  </article>)}</div>

}
