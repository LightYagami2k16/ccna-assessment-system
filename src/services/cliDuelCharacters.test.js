import test from 'node:test'
import assert from 'node:assert/strict'
import {getDuelCharacter,getDuelIntroPhase} from './cliDuelCharacters.js'

test('unknown character IDs do not become arbitrary asset URLs',()=>{assert.equal(getDuelCharacter('../../private'),null);assert.equal(getDuelCharacter(null),null);assert.equal(getDuelCharacter('monkey-d-luffy').name,'Monkey D. Luffy')})
test('initial countdown changes to versus only on server instruction and waits for server activation',()=>{assert.equal(getDuelIntroPhase({status:'countdown',hasStarted:false}),'countdown');assert.equal(getDuelIntroPhase({status:'countdown',hasStarted:false,versusEndsAt:'2026-11-19T00:00:02Z'}),'versus');assert.equal(getDuelIntroPhase({status:'active',hasStarted:true,versusEndsAt:'2026-11-19T00:00:02Z'}),null)})
test('resume, completed and waiting matches never replay versus',()=>{assert.equal(getDuelIntroPhase({status:'countdown',hasStarted:true,versusEndsAt:'2026-11-19T00:00:02Z'}),'countdown');for(const status of ['waiting','paused','completed','cancelled'])assert.equal(getDuelIntroPhase({status,versusEndsAt:'2026-11-19T00:00:02Z'}),null)})
