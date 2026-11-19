import test from 'node:test'
import assert from 'node:assert/strict'
import {getDuelWinners} from './cliDuelWinners.js'
const players=[{id:'one',displayName:'Player One',placement:2},{id:'two',displayName:'Player Two',placement:1}]
test('knockout winner name follows the recorded winner ID',()=>assert.deepEqual(getDuelWinners({status:'completed',endReason:'knockout',winnerParticipantId:'one'},players),[players[0]]))
test('non-knockout final winner follows server placement',()=>assert.deepEqual(getDuelWinners({status:'completed',endReason:'time_expired'},players),[players[1]]))
test('shared first placement preserves both winner names',()=>assert.equal(getDuelWinners({status:'completed',endReason:'both_finished'},players.map(player=>({...player,placement:1}))).length,2))
test('live, voided or incomplete results never invent a winner',()=>{for(const status of ['waiting','active','paused','voided','cancelled'])assert.deepEqual(getDuelWinners({status},players),[]);assert.deepEqual(getDuelWinners({status:'completed',endReason:'knockout',winnerParticipantId:'missing'},players),[])})
