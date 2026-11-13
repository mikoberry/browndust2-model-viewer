// Loads the spine assets (skel + atlas + textures) and builds the runtime
// objects. Returns null until everything is ready; errors surface as state.
//
// Uses spine-webgl's AssetManager so textures upload to the same GL context
// the SceneRenderer uses. Cleanup disposes uploaded textures.

import { useEffect, useState } from 'react'
import {
  AssetManager,
  AtlasAttachmentLoader,
  Skeleton,
  SkeletonBinary,
  AnimationState,
  AnimationStateData,
} from '@esotericsoftware/spine-webgl'
import { MODEL } from './stageConfig.js'

export function useSpineAsset(context) {
  const [asset, setAsset] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!context) return undefined

    let cancelled = false
    let manager = null

    try {
      manager = new AssetManager(context, MODEL.dir)
      manager.loadBinary(`${MODEL.name}.skel`)
      manager.loadTextureAtlas(`${MODEL.name}.atlas`)
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)))
      return undefined
    }

    const poll = () => {
      if (cancelled) return
      if (manager.hasErrors()) {
        setError(new Error(JSON.stringify(manager.getErrors())))
        return
      }
      if (!manager.isLoadingComplete()) {
        pollTimer = setTimeout(poll, 50)
        return
      }
      try {
        const atlas = manager.get(`${MODEL.name}.atlas`)
        const binary = manager.get(`${MODEL.name}.skel`)
        const data = new SkeletonBinary(new AtlasAttachmentLoader(atlas)).readSkeletonData(binary)
        const skeleton = new Skeleton(data)
        skeleton.setToSetupPose()
        const stateData = new AnimationStateData(data)
        const state = new AnimationState(stateData)
        setAsset({ data, skeleton, state, stateData, manager })
      } catch (err) {
        setError(err instanceof Error ? err : new Error(String(err)))
      }
    }

    let pollTimer = setTimeout(poll, 50)

    return () => {
      cancelled = true
      clearTimeout(pollTimer)
      // Frees uploaded page textures. The manager rejects a second dispose,
      // so guard like the runtime does internally.
      try {
        manager.dispose()
      } catch {
        // already disposed or never fully loaded
      }
    }
  }, [context])

  return { asset, error }
}
