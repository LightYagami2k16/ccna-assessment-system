import {useState,useMemo} from 'react'
import {blankCriterion,normalizeCriterionForDevice,presetCriteria,generateDeviceId,presetOptions} from '../../supabase/functions/_shared/cliPracticalConfiguration.js'
import {defaultCriterionTarget,isCriterionApplicable,isPresetApplicable} from '../services/cliCriterionApplicability'

export default function useCliPracticalEditor(lab,setLab) {
  const [expandedCriterionIndex, setExpandedCriterionIndex] = useState(0)
  const [criterionDeviceSelection, setCriterionDeviceSelection] = useState('')
  const [deviceEditorSelection, setDeviceEditorSelection] = useState('')
  const [
    expandedCriterionDeviceIds,
    setExpandedCriterionDeviceIds,
  ] = useState([lab.devices[0]?.id ?? 'device-1'])
  const [selectedPreset, setSelectedPreset] = useState('')
  const totalCriterionPoints = lab.criteria.reduce(
    (total, criterion) => total + (Number(criterion.points) || 0),
    0,
  )
  const deviceEditorIndex = Math.max(0, lab.devices.findIndex(device => device.id === deviceEditorSelection))
  const editorDevice = lab.devices[deviceEditorIndex]
  const criterionDeviceFilter = criterionDeviceSelection === 'all'
    ? 'all'
    : lab.devices.some(device => device.id === criterionDeviceSelection)
      ? criterionDeviceSelection
      : lab.devices[0]?.id ?? ''
  const criterionDeviceIndex = lab.devices.findIndex(device => device.id === criterionDeviceFilter)
  const criterionTargetDevice = lab.devices.find(device => device.id === criterionDeviceFilter)
    ?? lab.devices[0]
  const primaryDeviceType = criterionTargetDevice?.type ?? 'switch'
  const availablePresetOptions = presetOptions.filter(([value]) =>
    isPresetApplicable(primaryDeviceType, value),
  )

  const criterionDeviceGroups = useMemo(() => {
    const primaryDeviceId = lab.devices[0]?.id ?? 'device-1'
    return lab.devices.map((device, deviceIndex) => {
      const criteria = lab.criteria
        .map((criterion, index) => ({ criterion, index }))
        .filter(({ criterion }) =>
          (criterion.deviceId ?? primaryDeviceId) === device.id)
      return {
        device,
        label: device.label.trim() || `Device ${deviceIndex + 1}`,
        criteria,
        points: criteria.reduce(
          (total, { criterion }) =>
            total + (Number(criterion.points) || 0),
          0,
        ),
      }
    })
  }, [lab.criteria, lab.devices])

  function updateCriterion(index, field, value) {
    setLab((current) => ({
      ...current,
      criteria: current.criteria.map((criterion, itemIndex) =>
        itemIndex === index ? { ...criterion, [field]: value } : criterion,
      ),
    }))
    if (field === 'deviceId') {
      setExpandedCriterionDeviceIds((current) =>
        current.includes(value) ? current : [...current, value])
    }
  }

  function changeCriterionType(index, type) {
    setLab((current) => {
      const currentCriterion = current.criteria[index]
      const deviceType = current.devices.find(
        (device) => device.id === currentCriterion.deviceId,
      )?.type ?? current.devices[0]?.type ?? 'switch'
      return {
        ...current,
        criteria: current.criteria.map((criterion, itemIndex) =>
          itemIndex === index
            ? {
                ...criterion,
                type,
                target: defaultCriterionTarget(deviceType, type),
                expected: '',
              }
            : criterion,
        ),
      }
    })
  }

  function addCriterion(deviceId = criterionTargetDevice?.id ?? 'device-1') {
    const newIndex = lab.criteria.length
    const deviceType = lab.devices.find(
      (device) => device.id === deviceId,
    )?.type ?? 'switch'
    setLab((current) => ({
      ...current,
      criteria: [
        ...current.criteria,
        blankCriterion(deviceId, deviceType),
      ],
    }))
    setExpandedCriterionIndex(newIndex)
    setExpandedCriterionDeviceIds((current) => {
      return current.includes(deviceId) ? current : [...current, deviceId]
    })
  }

  function duplicateCriterion(index) {
    setLab((current) => {
      const nextCriteria = [...current.criteria]
      nextCriteria.splice(index + 1, 0, { ...current.criteria[index] })
      return { ...current, criteria: nextCriteria }
    })
    setExpandedCriterionIndex(index + 1)
    const deviceId = lab.criteria[index]?.deviceId
      ?? lab.devices[0]?.id
      ?? 'device-1'
    setExpandedCriterionDeviceIds((current) =>
      current.includes(deviceId) ? current : [...current, deviceId])
  }

  function removeCriterion(index) {
    setLab((current) => ({
      ...current,
      criteria: current.criteria.filter(
        (_, itemIndex) => itemIndex !== index,
      ),
    }))
    setExpandedCriterionIndex((current) => {
      if (current === null || current === index) return null
      return current > index ? current - 1 : current
    })
  }

  function addPreset() {
    if (criterionDeviceFilter === 'all' || !availablePresetOptions.some(([value]) => value === selectedPreset)) return
    const primaryDevice = criterionTargetDevice
    const additions = presetCriteria(selectedPreset)
      .filter((criterion) =>
        isCriterionApplicable(primaryDevice?.type ?? 'switch', criterion.type),
      )
      .map((criterion) => ({
        ...criterion,
        deviceId: primaryDevice?.id ?? 'device-1',
      }))
    if (!additions.length) return

    const replaceBlankCriterion =
      lab.criteria.length === 1
      && lab.criteria[0].type === 'hostname'
      && !lab.criteria[0].target
      && !lab.criteria[0].expected
      && (lab.criteria[0].deviceId ?? lab.devices[0]?.id) === primaryDevice?.id

    const startIndex = replaceBlankCriterion ? 0 : lab.criteria.length
    setLab((current) => ({
      ...current,
      criteria: replaceBlankCriterion
        ? additions
        : [...current.criteria, ...additions],
    }))
    setExpandedCriterionIndex(startIndex)
    const deviceId = primaryDevice?.id ?? 'device-1'
    setExpandedCriterionDeviceIds((current) =>
      current.includes(deviceId) ? current : [...current, deviceId])
    setSelectedPreset('')
  }

  function toggleClass(classId) {
    setLab((current) => ({
      ...current,
      classIds: current.classIds.includes(classId)
        ? current.classIds.filter((id) => id !== classId)
        : [...current.classIds, classId],
    }))
  }

  function selectCriterionDevice(deviceId) {
    setCriterionDeviceSelection(deviceId)
    setSelectedPreset('')
    setExpandedCriterionIndex(null)
    if (deviceId !== 'all') {
      setExpandedCriterionDeviceIds(current => current.includes(deviceId) ? current : [...current, deviceId])
    }
  }

  function toggleCriterionDevice(deviceId) {
    setExpandedCriterionDeviceIds((current) =>
      current.includes(deviceId)
        ? current.filter((id) => id !== deviceId)
        : [...current, deviceId])
  }

  function addDevice() {
    if (lab.devices.length >= 12) return
    const id = generateDeviceId(lab.devices)
    setLab(current => ({
      ...current,
      devices: [...current.devices, { id, label: '', hostname: '', type: 'switch' }],
    }))
    setDeviceEditorSelection(id)
  }

  function updateDevice(index, field, value) {
    if (index === 0 && field === 'type') setSelectedPreset('')
    setLab((current) => {
      const previousId = current.devices[index].id
      const nextDeviceType = field === 'type'
        ? value
        : current.devices[index].type
      return {
        ...current,
        deviceType: index === 0 && field === 'type'
          ? value
          : current.deviceType,
        initialHostname: index === 0 && field === 'hostname'
          ? value
          : current.initialHostname,
        devices: current.devices.map((device, itemIndex) =>
          itemIndex === index ? { ...device, [field]: value } : device),
        criteria: current.criteria.map((criterion) => {
          if (criterion.deviceId !== previousId) return criterion
          if (field === 'type') {
            return normalizeCriterionForDevice(
              criterion,
              nextDeviceType,
              previousId,
            )
          }
          return field === 'id'
            ? { ...criterion, deviceId: value }
            : criterion
        }),
        topology: field === 'id'
          ? {
            ...current.topology,
            links: (current.topology?.links ?? []).map((link) => ({
              ...link,
              fromDeviceId: link.fromDeviceId === previousId
                ? value
                : link.fromDeviceId,
              toDeviceId: link.toDeviceId === previousId
                ? value
                : link.toDeviceId,
            })),
          }
          : current.topology,
      }
    })
  }

  function removeDevice(index) {
    if (lab.devices.length === 1) return
    if (editorDevice?.id === lab.devices[index].id) {
      setDeviceEditorSelection(lab.devices[index + 1]?.id ?? lab.devices[index - 1]?.id ?? '')
    }
    setLab((current) => {
      if (current.devices.length === 1) return current
      const removedId = current.devices[index].id
      const devices = current.devices.filter(
        (_, itemIndex) => itemIndex !== index,
      )
      return {
        ...current,
        deviceType: devices[0].type,
        initialHostname: devices[0].hostname,
        devices,
        topology: {
          ...current.topology,
          links: (current.topology?.links ?? []).filter(
            (link) =>
              link.fromDeviceId !== removedId
              && link.toDeviceId !== removedId,
          ),
        },
        criteria: current.criteria.map((criterion) =>
          criterion.deviceId === removedId
            ? normalizeCriterionForDevice(
                criterion,
                devices[0].type,
                devices[0].id,
              )
            : criterion,
        ),
      }
    })
  }

  function addTopologyLink() {
    if (lab.devices.length < 2) return
    setLab((current) => ({
      ...current,
      topology: {
        ...current.topology,
        links: [
          ...(current.topology?.links ?? []),
          {
            id: `link-${Date.now()}`,
            fromDeviceId: current.devices[0].id,
            fromInterface: 'GigabitEthernet0/1',
            toDeviceId: current.devices[1].id,
            toInterface: 'GigabitEthernet0/1',
          },
        ],
      },
    }))
  }

  function updateTopologyLink(index, field, value) {
    setLab((current) => ({
      ...current,
      topology: {
        ...current.topology,
        links: (current.topology?.links ?? []).map((link, itemIndex) =>
          itemIndex === index ? { ...link, [field]: value } : link),
      },
    }))
  }

  function removeTopologyLink(index) {
    setLab((current) => ({
      ...current,
      topology: {
        ...current.topology,
        links: (current.topology?.links ?? []).filter(
          (_, itemIndex) => itemIndex !== index,
        ),
      },
    }))
  }

  return {expandedCriterionIndex,setExpandedCriterionIndex,criterionDeviceSelection,setCriterionDeviceSelection,deviceEditorSelection,setDeviceEditorSelection,expandedCriterionDeviceIds,setExpandedCriterionDeviceIds,selectedPreset,setSelectedPreset,totalCriterionPoints,deviceEditorIndex,editorDevice,criterionDeviceFilter,criterionDeviceIndex,criterionTargetDevice,primaryDeviceType,availablePresetOptions,criterionDeviceGroups,updateCriterion,changeCriterionType,addCriterion,duplicateCriterion,removeCriterion,addPreset,toggleClass,selectCriterionDevice,toggleCriterionDevice,addDevice,updateDevice,removeDevice,addTopologyLink,updateTopologyLink,removeTopologyLink}
}
