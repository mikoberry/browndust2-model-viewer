// Error boundary around the settings drawer.
//
// In Wallpaper Engine a JS exception inside the drawer would unmount the whole
// React tree and leave a black wallpaper — the drawer is a tool, the wallpaper
// is the product, so a broken panel must degrade to "no panel" instead. The
// boundary re-arms itself when the drawer is closed, so the next `S` press
// gives the panel another chance instead of killing it for the session.

import { Component } from 'react'

export default class SettingsBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { failed: false }
  }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  static getDerivedStateFromProps(props, state) {
    // Closing the drawer resets the boundary: reopening retries the render.
    if (!props.open && state.failed) return { failed: false }
    return null
  }

  componentDidCatch(error, info) {
    console.error('[wallpaper] 设置面板渲染失败，已隐藏面板（壁纸继续运行）：', error, info)
  }

  render() {
    if (this.state.failed) return null
    return this.props.children
  }
}
