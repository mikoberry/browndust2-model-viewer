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
import { embeddedAsset } from '../embed.js'
import { modelPrefix } from '../assets.js'
import { mergeClipLayers } from './clipLayers.js'

const POLL_MS = 30
const LOAD_TIMEOUT_MS = 60_000

// Spine's Downloader decodes data URIs with atob(), i.e. one char per byte
// (latin1). That is fine for ASCII atlases, but BD2 atlases are not always
// ASCII: `cutscene_char021291` carries UTF-8 region names such as `레이어 67`,
// which atob() turns into mojibake that can never match the skeleton's own
// (correctly UTF-8) region names — showing up as
// `Region not found in atlas: 레이어 67 (mesh attachment: 레이어 67)`.
// Only installed for the embedded (file://) build; the request path uses
// XHR/responseText, which the host already decodes correctly.
function decodeUtf8DataUri(dataUri) {
  const MARKER = 'base64,'
  const at = dataUri.indexOf(MARKER)
  if (!dataUri.startsWith('data:') || at < 0) return dataUri
  const binary = atob(dataUri.slice(at + MARKER.length))
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new TextDecoder('utf-8').decode(bytes)
}

export function readAssetInfo(asset) {
  const { data } = asset
  // Multi-part shots were folded into their base animation at load time; the
  // sub-clips stay in `data` (configs may still name them) but are not listed,
  // because on their own they only draw part of the scene.
  const layersOf = new Map((asset.clipLayers ?? []).map((entry) => [entry.base, entry.layers]))
  // Use the immutable setup-pose bounds captured at load time, not the live
  // animated pose (getBoundsRect changes as the animation plays).
  const setup = asset.setupBounds
  return {
    modelId: asset.modelId,
    version: data.version ?? '未知',
    animations: data.animations
      .filter((a) => !a.clipLayerOf)
      .map((a) => ({ name: a.name, duration: a.duration, layers: layersOf.get(a.name) ?? [] })),
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
      // file:// builds (BD2_EMBED=1) carry every file as a base64 data URI and
      // the host blocks XHR / cross-origin image loads, so register them first.
      // Spine then decodes them in memory instead of fetching: binary and text
      // through atob(), atlas pages by assigning the data URI to <img>.src
      // (data: images do not taint the canvas, so the WebGL upload is safe).
      // Keys are relative to the model folder, which is what the loads below
      // use once Spine prepends its own pathPrefix.
      let embedded = 0
      for (const file of [model.skeleton, model.atlas, ...(model.pages ?? [])]) {
        const dataUri = embeddedAsset(file.source)
        if (!dataUri) continue
        manager.setRawDataURI(file.file, dataUri)
        embedded++
      }
      // Text assets (atlas, json skeleton) come back from the table as base64,
      // so make sure they decode as UTF-8 instead of latin1. See
      // decodeUtf8DataUri above.
      if (embedded && manager.downloader?.dataUriToString) {
        manager.downloader.dataUriToString = decodeUtf8DataUri
      }
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

        // Some BD2 cuts ship as a body clip plus additive prop / effect clips
        // (`cut_A` + `cut_A_water`, `loop` + `loop_bowl`). Fold them into one
        // animation before anything can select a half-empty shot.
        const clipLayers = mergeClipLayers(data)

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

        setAsset({ data, skeleton, state, stateData, manager, clipLayers, modelId: model.id, setupBounds })
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
