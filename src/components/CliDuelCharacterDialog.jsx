import {useLayoutEffect,useRef,useId} from 'react'
import CliDuelCharacterPicker from './CliDuelCharacterPicker'

export default function CliDuelCharacterDialog({own,disabled,onConfirm,onClose}){
 const ref=useRef(null),titleId=useId()
 useLayoutEffect(()=>{const dialog=ref.current,opener=document.activeElement;dialog.showModal();return()=>{dialog.close();if(opener?.isConnected)opener.focus({preventScroll:true})}},[])
 return <dialog ref={ref} className="duel-character-dialog" aria-labelledby={titleId} onCancel={event=>{event.preventDefault();onClose()}}>
  <header><h2 id={titleId}>Select character</h2><button type="button" className="secondary" aria-label="Close character selection" onClick={onClose} autoFocus>Close</button></header>
  <CliDuelCharacterPicker own={own} disabled={disabled} onConfirm={onConfirm}/>
 </dialog>
}
