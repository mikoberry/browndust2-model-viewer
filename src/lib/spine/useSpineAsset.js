// Loads one model (skeleton + atlas + all atlas pages) into the shared WebGL
// context and builds the Spine runtime objects. AssetManager is used because
// it uploads textures through the same GL context SceneRenderer renders with.

import { useEffect, useState } from 'react'
import {
  AnimationState,
  AnimationStateData,
  AssetManager,
  AtlasAttachmentLoader,
  Skeleton,
  SkeletonBinary,
  SkeletonJson,
} from '@esotericsoftware/spine-webgl'
import { modelPrefix } from '../assets.js'

const POLL_MS = 30
const LOAD_TIMEOUT_MS = 60_000

export function readAssetInfo(asset) {
  const { data } = asset
  // Use the immutable setup-pose bounds captured at load time, not the live
  // animated pose (getBoundsRect changes as the animation plays).
  const setup = asset.setupBounds
  return {
    modelId: asset.modelId,
    version: data.version ?? '未知',
    animations: data.animations.map((a) => ({ name: a.name, duration: a.duration })),
    skins: data.skins.map((s) => s.name),
    bones: data.bones.length,
    slots: data.slots.length,
    width: data.width,
    height: data.height,
    setupBounds: Number.isFinite(setup?.x) ? setup : null,
  }
}

export function useSpineAsset(context, model) {
  const [asset, setAsset] = useState(null)
  const [error, setError] = useState(null)
  const [phase, setPhase] = useState('idle')

  useEffect(() => {
    setAsset(null)
    setError(null)
    if (!context || !model) {
      setPhase('idle')
      return undefined
    }

    setPhase('loading')
    let cancelled = false
    let timer = 0
    let manager = null
    const startedAt = Date.now()

    try {
      manager = new AssetManager(context, modelPrefix(model))
      if (model.skeleton.kind === 'json') manager.loadJson(model.skeleton.file)
      else manager.loadBinary(model.skeleton.file)
      // Page images are resolved as pathPrefix + page.name, so every page must
      // live in the same folder as the atlas (which is how BD2 ships them).
      manager.loadTextureAtlas(model.atlas.file)
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)))
      setPhase('error')
      return undefined
    }

    const fail = (message) => {
      setError(new Error(message))
      setPhase('error')
    }

    const poll = () => {
      if (cancelled) return
      if (manager.hasErrors()) {
        fail(`资源加载失败：${Object.values(manager.getErrors()).join('; ')}`)
        return
      }
      if (!manager.isLoadingComplete()) {
        if (Date.now() - startedAt > LOAD_TIMEOUT_MS) {
          fail('资源加载超时（60s），请检查 model-library 中的图集页是否齐全')
          return
        }
        timer = setTimeout(poll, POLL_MS)
        return
      }
      try {
        const atlas = manager.get(model.atlas.file)
        const loader = new AtlasAttachmentLoader(atlas)
        const skeletonSource = manager.get(model.skeleton.file)
        const data =
          model.skeleton.kind === 'json'
            ? new SkeletonJson(loader).readSkeletonData(skeletonSource)
            : new SkeletonBinary(loader).readSkeletonData(skeletonSource)

        const skeleton = new Skeleton(data)
        skeleton.setToSetupPose()
        skeleton.updateWorldTransform()
        // Frozen at load time: the wallpaper's fixed composition must never
        // drift when an animation changes the live pose bounds.
        const raw = skeleton.getBoundsRect()
        const setupBounds = {
          x: raw.x,
          y: raw.y,
          width: raw.width,
          height: raw.height,
        }

        const stateData = new AnimationStateData(data)
        stateData.defaultMix = 0.2
        const state = new AnimationState(stateData)

        setAsset({ data, skeleton, state, stateData, manager, modelId: model.id, setupBounds })
        setPhase('ready')
      } catch (err) {
        fail(`骨骼解析失败：${err instanceof Error ? err.message : String(err)}`)
      }
    }

    timer = setTimeout(poll, POLL_MS)
    return () => {
      cancelled = true
      clearTimeout(timer)
      // Frees uploaded atlas page textures before the next model loads.
      try {
        manager?.dispose()
      } catch {
        // already disposed or never fully loaded
      }
    }
  }, [context, model?.id])

  return { asset, error, phase }
}
