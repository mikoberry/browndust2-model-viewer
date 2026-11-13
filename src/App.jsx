// App is the composition root: it owns the choreography state machine, the
// data plumbing (time, audio, WE properties, pause) and wires the three
// regions together — backdrop, spine stage and the wallkit overlay.

import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import {
  useWallpaperAudio,
  useWallpaperBeat,
  useWallpaperPaused,
} from 'wallkit/we'
import Backdrop from './backdrop/Backdrop.jsx'
import Overlay from './overlay/Overlay.jsx'
import SpineStage from './stage/SpineStage.jsx'
import { STATES, next } from './stage/choreography.js'
import { BACKDROP } from './stage/stageConfig.js'
import { useUserProperties } from './we/properties.js'

const AMBIENT_AFTER_MS = 5 * 60 * 1000

function reducer(state, event) {
  return next(state, event.type, { ambientEnabled: event.ambientEnabled })
}

export default function App() {
  const userProps = useUserProperties()
  const bars = useWallpaperAudio()
  const beat = useWallpaperBeat()
  const wePaused = useWallpaperPaused()

  const [tabPaused, setTabPaused] = useState(
    () => typeof document !== 'undefined' && document.hidden,
  )
  const paused = wePaused || tabPaused
  const [now, setNow] = useState(() => new Date())
  const [choreo, dispatch] = useReducer(reducer, STATES.idle)
  const lastActivityRef = useRef(Date.now())

  // Clock time is driven from here, once per second — wallkit components
  // never run their own timers.
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    const onVisibility = () => setTabPaused(document.hidden)
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  // User activity: anything recent blocks the ambient pose, and a moving
  // pointer wakes out of it. Clicks dispatch their own event.
  useEffect(() => {
    const bump = () => {
      lastActivityRef.current = Date.now()
    }
    const onMove = () => {
      bump()
      dispatch({ type: 'wake' })
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('click', bump)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('click', bump)
    }
  }, [])

  // Auto performance: every `autoPerform` seconds, unless disabled or paused.
  useEffect(() => {
    if (!userProps.autoPerform || paused) return undefined
    const id = setInterval(
      () => dispatch({ type: 'autoPerform' }),
      userProps.autoPerform * 1000,
    )
    return () => clearInterval(id)
  }, [userProps.autoPerform, paused])

  // Ambient pose check: idle for 5 minutes with the option enabled.
  useEffect(() => {
    if (!userProps.ambientPose || paused) return undefined
    const id = setInterval(() => {
      if (Date.now() - lastActivityRef.current >= AMBIENT_AFTER_MS) {
        dispatch({ type: 'idleLong', ambientEnabled: true })
      }
    }, 30 * 1000)
    return () => clearInterval(id)
  }, [userProps.ambientPose, paused])

  const onStageClick = useCallback(() => dispatch({ type: 'click' }), [])
  const onStageFinished = useCallback(() => dispatch({ type: 'finished' }), [])

  return (
    <div className="bd2-wallpaper">
      <Backdrop dim={(userProps.dim / 100) * BACKDROP.dim} />
      <SpineStage
        state={choreo}
        paused={paused}
        parallax={userProps.parallax}
        onFinished={onStageFinished}
        onClick={onStageClick}
      />
      <Overlay now={now} bars={bars} beat={beat} paused={paused} userProps={userProps} />
    </div>
  )
}
