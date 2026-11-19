import { expect, test } from '@playwright/test'

async function openBuilder(page, { incomplete = false } = {}) {
  const writes = []
  const devices = Array.from({length:12},(_,i)=>({id:`d${i+1}`,label:`Switch ${i+1}`,hostname:incomplete && i===11?'':`SW${i+1}`,type:'switch'}))
  const lab = {id:'lab-one',title:'Twelve devices',courseId:1,courseCode:'ITN',status:'draft',instructions:'Configure the topology.',durationMinutes:30,maxAttempts:1,passingScore:70,classIds:[],criteria:[{deviceId:'d1',type:'hostname',expected:'Core',target:'',points:10}]}
  const topology = {links:[{id:'link-1',fromDeviceId:'d1',fromInterface:'FastEthernet0/1',toDeviceId:'d12',toInterface:'FastEthernet0/1'}]}
  await page.route('**/rest/v1/**',route=>{
    const endpoint = new URL(route.request().url()).pathname.split('/').at(-1)
    if(endpoint==='save_cli_lab_with_review'){writes.push(route.request().postDataJSON().p_payload);return route.fulfill({json:'saved'})}
    const data={courses:[{id:1,code:'ITN',title:'Introduction to Networks'}],get_instructor_cli_workspace:{labs:[lab],classes:[]},get_cli_lab_topology_data:[{id:'lab-one',devices,topology}],get_assessment_review_policy:{allowReview:false,availableFrom:null,availableUntil:null}}
    return route.fulfill({json:data[endpoint]??[]})
  })
  await page.goto('/?uat-role=instructor#/instructor/practicals')
  await page.getByRole('button',{name:'Show practicals',exact:true}).click()
  await page.getByRole('button',{name:'Show details',exact:true}).click()
  await page.getByRole('dialog').getByRole('button',{name:'Edit',exact:true}).click()
  const editor=page.locator('.cli-lab-editor')
  const section=editor.getByRole('group',{name:'Devices and topology',exact:true})
  return {writes,editor,section,select:section.getByRole('combobox',{name:'Device to edit',exact:true})}
}

test('twelve-device editor navigates, retains changes, adds and removes without cramped cards',async({page},testInfo)=>{
  const {writes,editor,section,select}=await openBuilder(page)
  await expect(select).toHaveValue('d1')
  await expect(section.locator('.cli-device-editor-card')).toHaveCount(1)
  await expect(section.getByRole('button',{name:'Previous device',exact:true})).toBeDisabled()
  await section.getByRole('button',{name:'Next device',exact:true}).click()
  await expect(select).toHaveValue('d2')
  await select.selectOption('d12')
  await section.getByRole('textbox',{name:/Display label/}).fill('Last switch edited')
  await section.getByRole('button',{name:'Previous device',exact:true}).click()
  await section.getByRole('button',{name:'Next device',exact:true}).click()
  await expect(section.getByRole('textbox',{name:/Display label/})).toHaveValue('Last switch edited')
  await expect(section.getByRole('button',{name:'Next device',exact:true})).toBeDisabled()
  await section.locator('.cli-device-editor-workspace').screenshot({path:testInfo.outputPath('devices-desktop.png')})
  await page.setViewportSize({width:390,height:900})
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth)).toBeLessThanOrEqual(1)
  await section.locator('.cli-device-editor-workspace').screenshot({path:testInfo.outputPath('devices-phone.png')})
  await section.locator('.cli-device-editor-card').getByRole('button',{name:'Remove device',exact:true}).click()
  await expect(select).toHaveValue('d11')
  await expect(section.locator('.cli-topology-link-row')).toHaveCount(0)
  await section.getByRole('button',{name:'Add device',exact:true}).click()
  await expect(select).not.toHaveValue('d11')
  await expect(section.getByRole('button',{name:'Add device',exact:true})).toBeDisabled()
  await section.getByRole('textbox',{name:/Display label/}).fill('Replacement switch')
  await section.getByRole('textbox',{name:/Starting hostname/}).fill('NEW1')
  await editor.getByRole('button',{name:'Save practical',exact:true}).click()
  await expect.poll(()=>writes.length).toBe(1)
  expect(writes[0].devices).toHaveLength(12)
  expect(writes[0].devices.some(device=>device.id==='d12')).toBe(false)
  expect(writes[0].devices.at(-1).label).toBe('Replacement switch')
  expect(writes[0].criteria[0].deviceId).toBe('d1')
  expect(writes[0].topology.links).toEqual([])
})

test('publishing reveals an incomplete device that is not currently selected',async({page})=>{
  const {writes,editor,section,select}=await openBuilder(page,{incomplete:true})
  await expect(select).toHaveValue('d1')
  await editor.getByRole('combobox',{name:'Status',exact:true}).selectOption('published')
  await editor.getByRole('button',{name:'Save practical',exact:true}).click()
  await expect(select).toHaveValue('d12')
  expect(writes).toHaveLength(0)
  await section.getByRole('textbox',{name:/Starting hostname/}).fill('SW12')
  await editor.getByRole('button',{name:'Save practical',exact:true}).click()
  await expect.poll(()=>writes.length).toBe(1)
  expect(writes[0].devices).toHaveLength(12)
  expect(writes[0].status).toBe('published')
})
