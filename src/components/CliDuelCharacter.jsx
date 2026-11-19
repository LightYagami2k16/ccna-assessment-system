import {useState} from 'react'
import {getDuelCharacter} from '../services/cliDuelCharacters'

export default function CliDuelCharacter({characterId,size='portrait',showName=false}){
 const character=getDuelCharacter(characterId),[failedSrc,setFailedSrc]=useState('')
 if(!character)return null
 return <span className={`duel-character duel-character--${size}`}>
  {failedSrc===character.src?<span className="duel-character__fallback" role="img" aria-label={character.name}>{character.name.slice(0,1)}</span>:<img src={character.src} alt={character.name} decoding="async" onError={()=>setFailedSrc(character.src)}/>}
  {showName&&<span className="duel-character__name">{character.name}</span>}
 </span>
}
