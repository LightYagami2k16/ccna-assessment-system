import {useCallback,useEffect,useState,useMemo} from 'react'
import useCliDuel from '../hooks/useCliDuel'
import useAssessmentFocusMode from '../hooks/useAssessmentFocusMode'
import {getDuelHostArena,controlDuel,duelError} from '../services/cliDuelService'
import CliDuelDeviceConsole from './CliDuelDeviceConsole'
import CliDuelHealthBar from './CliDuelHealthBar'
import CliDuelOverlay from './CliDuelOverlay'
import CliDuelStage,{DuelFullscreenButton} from './CliDuelStage'
import CliDuelWaitingRoom from './CliDuelWaitingRoom'
import CliDuelCharacter from './CliDuelCharacter'
import CliDuelVersus from './CliDuelVersus'
import {getDuelIntroPhase} from '../services/cliDuelCharacters'
import {getDuelWinners} from '../services/cliDuelWinners'

export default function CliDuelHostArena({id,onBack,onHistory}){
 useAssessmentFocusMode()
 const loader=useCallback(snapshot=>getDuelHostArena(id,Object.fromEntries((snapshot?.players||[]).map(p=>[p.id,p.commands?.at(-1)?.sequence||0]))),[id])
 const {data,error,fresh,refresh}=useCliDuel(loader,id,3000)
 const [clock,setClock]=useState(Date.now()),[busy,setBusy]=useState(false),[message,setMessage]=useState('')
 useEffect(()=>{const timer=window.setInterval(()=>setClock(Date.now()),200);return()=>window.clearInterval(timer)},[])
 const match=data?.competition,terminal=['completed','cancelled','voided'].includes(match?.status)
 // Offset is captured at each server refresh; countdown keeps advancing between reads.
 const [offset,setOffset]=useState(0),[resultDismissed,setResultDismissed]=useState(false)
 useEffect(()=>{if(data?.serverNow)setOffset(new Date(data.serverNow).getTime()-Date.now())},[data?.serverNow])
 const count=match?.startsAt?Math.max(0,Math.ceil((new Date(match.startsAt)-(clock+offset))/1000)):0
 const remaining=match?.status==='active'?Math.max(0,Math.ceil((new Date(match.deadline)-(clock+offset))/1000)):Math.ceil((match?.remainingMs??(match?.durationMinutes||0)*60000)/1000)
 const bothActive=data?.participants?.length===2&&data.participants.every(p=>p.inArena)
 async function act(action){setBusy(true);setMessage('');try{await controlDuel(id,action);await refresh()}catch(failure){setMessage(duelError(failure))}finally{setBusy(false)}}
 if(!match)return <CliDuelStage><section className="panel cli-duel"><header className="duel-heading"><div><span className="eyebrow">HOST ARENA</span><h2>Connecting to arena</h2></div><button className="secondary" onClick={onBack}>Leave arena</button></header><p role={error?'alert':'status'}>{error||'Loading host arena…'}</p></section></CliDuelStage>
 const status=match.status==='waiting'?'Waiting for players':match.status==='paused'?'Paused':terminal?'Match ended':match.status==='countdown'?'Starting soon':'In progress'
 const players=data.players||[]
 const introPhase=getDuelIntroPhase(match)
 const charactersReady=!match.characterSelectionRequired||data.participants.every(p=>Boolean(p.characterId))
 const showBattle=Boolean(match.hasStarted||['active','paused','completed','voided'].includes(match.status))
 const winners=getDuelWinners(match,data.participants),draw=winners.length>1
 return <CliDuelStage><section className="panel cli-duel duel-host-arena">
  <header className="duel-heading"><div><span className="eyebrow">HOST ARENA · READ-ONLY PLAYER VIEWS</span><h2>{match.title}</h2><p>{status} · Leaving this view does not stop the match.</p></div><div className="duel-arena-actions"><DuelFullscreenButton/><button className="secondary" onClick={onBack}>Leave arena</button></div></header>
  {(error||message)&&<p role="alert">{error||message}</p>}
  <div className="duel-host-controls"><p role="timer">{terminal?'Duel ended':introPhase==='versus'?'Versus introduction · timer has not started':!showBattle&&match.status!=='countdown'?'Waiting to start':`${match.status==='paused'?'Time frozen':'Time remaining'} ${Math.floor(remaining/60)}:${String(remaining%60).padStart(2,'0')}`}</p>
   {match.status==='waiting'&&<button className="primary" disabled={busy||!fresh||!bothActive} onClick={()=>act('start')}>Start game</button>}
   {match.status==='active'&&<button className="secondary" disabled={busy||!fresh} onClick={()=>act('pause')}>⏸ Pause game</button>}
   {match.status==='paused'&&<button className="primary" disabled={busy||!fresh||!bothActive} onClick={()=>act('resume')}>▶ Continue game</button>}
   <button className="secondary" onClick={onHistory}>Match details & history</button>
  </div>
  {['waiting','paused'].includes(match.status)&&<p className="duel-lobby-notice">{!bothActive?'Waiting for both players to be active inside the arena.':!charactersReady?'Unselected characters will be assigned randomly when you start.':'Both players are active. You can start the countdown.'}</p>}
  {showBattle?<div className="duel-host-layout">
   {players[0]&&<PlayerView player={players[0]} side="left" summary={data.participants.find(p=>p.id===players[0].id)} task={data.task}/>}
   <section className="duel-host-task"><span className="eyebrow">DUEL TASK</span><h3>{data.task?.title||match.title}</h3>{data.task?.description&&<p>{data.task.description}</p>}<h4>Requirements</h4><p>{data.task?.instructions}</p>{terminal&&<strong>{match.endReason==='knockout'?`${data.participants.find(p=>p.id===match.winnerParticipantId)?.displayName} wins by knockout`:'Final standings are available in match history.'}</strong>}</section>
   {players[1]&&<PlayerView player={players[1]} side="right" summary={data.participants.find(p=>p.id===players[1].id)} task={data.task}/>}
  </div>:<CliDuelWaitingRoom participants={data.participants} host closed={terminal}/>}
  {introPhase==='versus'&&<CliDuelVersus participants={data.participants} onLeave={onBack}/>}
  {introPhase==='countdown'&&<CliDuelOverlay count={count} onLeave={onBack}><p>{count?'Both players must stay connected.':'Confirming both players are active…'}</p></CliDuelOverlay>}
  {match.status==='completed'&&!resultDismissed&&<CliDuelOverlay kind={winners.length&&!draw?'victory':'result'} title={draw?'DRAW':winners.length?'WINNER':'DUEL COMPLETE'} onClose={()=>setResultDismissed(true)}>{winners.map(player=><CliDuelCharacter key={player.id} characterId={player.characterId} size="result" showName/>)}<p className="duel-winner-name">{winners.length?winners.map(player=>player.displayName||'Player').join(' & '):'Open match details to see the final standings.'}</p>{winners.length>0&&<p>{draw?'Shared first place.':match.endReason==='knockout'?'Wins by knockout!':'Wins the duel!'}</p>}</CliDuelOverlay>}
 </section></CliDuelStage>
}
function PlayerView({player,summary,task,side}){
 const consoleData=useMemo(()=>({task,ownState:player.state,ownCommands:player.commands,revision:player.commands.length}),[task,player.state,player.commands])
 return <section className={`duel-host-player ${side==='right'?'duel-host-player--right':''}`} aria-label={`${player.displayName} player view`}><header><div className="duel-player-identity"><CliDuelCharacter characterId={summary?.characterId}/><h3>{player.displayName}</h3></div><span className={summary?.inArena?'duel-status duel-status--online':'duel-status'}>{summary?.inArena?'In arena':'Not in arena'}</span></header><p>{summary?.scorePoints||0} / {summary?.maximumPoints} points</p><CliDuelHealthBar hp={summary?.hp??100} maximumHp={summary?.maximumHp||100} name={player.displayName} side={side}/><CliDuelDeviceConsole key={player.id} data={consoleData} enabled={false} readOnly compact/></section>
}
