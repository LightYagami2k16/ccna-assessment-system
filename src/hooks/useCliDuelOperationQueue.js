import {useCallback,useLayoutEffect,useRef,useState} from 'react'
import {createDuelOperationQueue} from '../services/cliDuelOperationQueue'
import {sendDuelAction} from '../services/cliDuelService'
import {deliverDuelOperation} from '../services/cliDuelDelivery'

export default function useCliDuelOperationQueue({participantId,clientId,data,allowed,onAccepted,onError,onDiscard}){
 const queue=useRef(null),callbacks=useRef(null),permission=useRef(false)
 const [view,setView]=useState({entries:[],sending:false,uncertain:false})
 useLayoutEffect(()=>{callbacks.current={onAccepted,onError,onDiscard}},[onAccepted,onError,onDiscard])
 useLayoutEffect(()=>{
  const current=createDuelOperationQueue({
   createRequest:(entry,revision)=>({action:'operation',participantId,clientId,commandId:crypto.randomUUID(),sequence:revision+1,expectedRevision:revision,deviceId:entry.deviceId,operation:entry.operation}),
   send:payload=>deliverDuelOperation(sendDuelAction,payload,{canSend:()=>queue.current===current&&permission.current}),onChange:setView,
   onAccepted:value=>callbacks.current.onAccepted(value),onError:value=>callbacks.current.onError(value),onDiscard:items=>callbacks.current.onDiscard(items),
  });queue.current=current
  return()=>{current.dispose();if(queue.current===current)queue.current=null}
 },[participantId,clientId])
 useLayoutEffect(()=>{const snapshot=data?.ownParticipant?.id===participantId?data:null;permission.current=allowed&&Boolean(snapshot);queue.current?.update({revision:snapshot?.revision,allowed:permission.current,terminal:['completed','cancelled','voided'].includes(snapshot?.competition?.status)||snapshot?.ownParticipant?.status==='submitted'})},[data,allowed,participantId])
 const enqueue=useCallback((deviceId,operation)=>queue.current?.enqueue({deviceId,operation})??false,[])
 const retry=useCallback(()=>queue.current?.retry()??false,[])
 return {...view,enqueue,retry}
}
