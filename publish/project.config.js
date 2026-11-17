// Wallpaper Engine manifest declaration for this wallpaper. This is the ONLY
// place to edit the Workshop title, blurb and settings-panel copy: running
// `npm run project:gen` (or `npm run deploy:we` / `build:we`) turns it into
// `project.json` in the WE project folder, merging with the copy the editor
// already wrote so `workshopid` / `preview` / `version` are never lost.
//
//   npm run project:gen      # regenerate project.json without rebuilding
//   npm run project:check    # report drift, write nothing
//
// `html()` blocks are display-only HTML in the engine's "wallpaper properties"
// panel; they are never pushed to the page, so nothing here touches the runtime.
// Panel links only open for allowlisted domains (Steam / Bilibili / YouTube) —
// GitHub is NOT one of them, so the homepage <a> below is coloured for
// visibility but still has to be copied into a browser.
// Images from github.com/<user>.png do render, which is how the avatar works.

import { html } from 'wallkit/project'

export default {
  file: 'index.html',
  title: 'BrownDust 2',

  // Paragraphs are joined with a blank line. Unlike the panel, the Workshop
  // page renders this as HTML, so links written here ARE clickable.
  description: [
    '《棕色尘埃 2》角色动态壁纸：Spine 立绘 + 对应场景背景，可叠加时钟、音频频谱、专辑卡、氛围粒子与指针特效。',
    'BrownDust 2 live wallpaper: Spine character art over its matching scene, with optional clock, audio spectrum, album card, ambient particles and pointer effects.',
    '本壁纸主要针对 1080p 16:9 屏幕设计，其他分辨率可在设置中自行调整构图。',
    'This wallpaper is designed primarily for 1080p 16:9 screens; other aspect ratios can be tuned in the settings.',
  ],

  // Thumbnail file name. The default image is `publish/preview.gif`; deploy seeds
  // it into a project folder that has none. The key is declared even when the
  // image is missing, because WE only shows a `preview` that the manifest names —
  // it never scans the folder. deploy/gen prefer whatever file is really there
  // (png/jpg also work), so this is only the fallback name.
  preview: 'preview.gif',

  // The engine rewrites `contentrating` / `visibility` itself, so they are
  // deliberately left out — mergeProject keeps whatever is on disk.
  // Add `tags: ['Anime']` here if the Workshop listing needs them.

  audioprocessing: true,

  properties: {
    // Top banner: settings hint above the avatar, then like/subscribe call to
    // action + homepage.
    // Emoji are plain text in the panel HTML — no external icon assets, so they
    // render even when the host blocks remote images.
    followBanner: html({
      text:
        '<center>' +
        '<h3><b><font color=#FFC83D>⚙️ Click the settings button in the bottom-right corner to customize ⚙️</font></b></h3>' +
        '<h3><b><font color=#FFC83D>⚙️ 点击页面右下角设置按钮可以自定义设置 ⚙️</font></b></h3>' +
        '<hr>' +
        '<img src="https://github.com/mikoberry.png?size=140" width="140" alt="mikoberry" />' +
        '<h4>✨ 喜欢这款壁纸的话，别忘了点个赞和订阅哦！❤️</h4>' +
        '<h5>👍 🔔</h5>' +
        '<h5>🌟 你的每一个赞、每一次订阅，都是我持续创作、分享更多壁纸的动力！💖</h5>' +
        '<h4>🎀 感谢每一份支持！</h4>' +
        '<h3><a href="https://github.com/mikoberry"><font color=#4DA3FF>github.com/mikoberry</font></a></h3>' +
        '</center>' +
        '<hr>' +
        '<center>' +
        '<h4>✨ If you enjoy this wallpaper, don\'t forget to Like &amp; Subscribe! ❤️</h4>' +
        '<h5>👍 🔔</h5>' +
        '<h5>🌟 Every like and every subscribe is what keeps me creating and sharing more wallpapers! 💖</h5>' +
        '<h4>🎀 Thank you for every bit of support!</h4>' +
        '</center>',
    }),

    // Section header, then the standing credits block.
    sectionAbout: html({ text: '<hr><h3>ℹ️ 关于 About</h3>' }),
    credits: html({
      text:
        '二次元角色立绘壁纸，基于 Spine 模型。' +
        '<br/><h6>非官方同人作品，角色与素材版权归原作所有。Fan-made and unofficial — all character assets belong to their respective owners.</h6>',
    }),
  },
}
