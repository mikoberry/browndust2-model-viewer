// Minimal zero-dependency i18n for the wallpaper UI. Locales: zh / en / ja / ko.
// The debug viewer (/spine-viewer) is intentionally NOT translated — it is a
// developer tool, so its strings stay Chinese.
//
// A locale is chosen once (browser language, falling back to zh), persisted to
// localStorage, and switchable from the language button in the settings drawer.
// `t(key)` resolves the current locale; a missing key falls back to zh, then to
// the key itself, so a missing translation never blanks the UI.
//
// This module touches `document` / `navigator` only inside functions (never at
// module top level), so it stays importable from pure Node tooling.

import { useCallback, useSyncExternalStore } from 'react'

export const LOCALES = [
  { code: 'zh', native: '中文', short: '中文', flag: '🇨🇳' },
  { code: 'en', native: 'English', short: 'EN', flag: '🇺🇸' },
  { code: 'ja', native: '日本語', short: '日', flag: '🇯🇵' },
  { code: 'ko', native: '한국어', short: '한', flag: '🇰🇷' },
]

// BCP-47 tags handed to Intl-based formatters (WallKit's Clock uses
// `Intl.DateTimeFormat`, so the two-letter code must be widened to a full tag).
const LOCALE_TAGS = {
  zh: 'zh-CN',
  en: 'en',
  ja: 'ja-JP',
  ko: 'ko-KR',
}

// Weekday display names per locale, keyed by WallKit's `weekdayKey`
// ('sun'..'sat'). WallKit only returns the key and does not localize the word,
// so the caller supplies `labels.weekday`.
const WEEKDAY_NAMES = {
  zh: ['周日', '周一', '周二', '周三', '周四', '周五', '周六'],
  en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  ja: ['日', '月', '火', '水', '木', '金', '土'],
  ko: ['일', '월', '화', '수', '목', '금', '토'],
}

// BCP-47 tag for the current locale (falling back to zh-CN).
export function localeTag() {
  return LOCALE_TAGS[getLocale()] ?? 'zh-CN'
}

// Weekday name for a Date under the current locale, e.g. '周一' / 'Mon'.
export function weekdayName(date) {
  const idx = date.getDay()
  return (WEEKDAY_NAMES[getLocale()] ?? WEEKDAY_NAMES.zh)[idx]
}

const STORAGE_KEY = 'wallpaper.locale'

// Full message catalogue. Keys are grouped loosely by area (`common`,
// `composition`, `clock`, …) but resolved as one flat namespace.
const MESSAGES = {
  // ---- common / drawer chrome ----
  'common.reset': { zh: '重置', en: 'Reset', ja: 'リセット', ko: '초기화' },
  'common.auto': { zh: '自动', en: 'Auto', ja: '自動', ko: '자동' },
  'common.followAccent': { zh: '跟随主题色', en: 'Follow theme', ja: 'テーマに従う', ko: '테마 따르기' },
  'common.decidedBySize': { zh: '由尺寸决定', en: 'Set by size', ja: 'サイズに依存', ko: '크기에 따라' },
  'common.notInPreset': { zh: '不在预设内', en: 'not in preset', ja: 'プリセット外', ko: '프리셋 없음' },
  'common.confirmClear': { zh: '确认清除？', en: 'Confirm clear?', ja: '削除しますか？', ko: '삭제 확인?' },
  'common.confirmRestore': { zh: '确认恢复？', en: 'Confirm restore?', ja: '復元しますか？', ko: '복원 확인?' },
  'common.off': { zh: '关闭', en: 'Off', ja: 'オフ', ko: '끔' },

  // ---- drawer header / footer ----
  'drawer.title': { zh: '壁纸设置', en: 'Wallpaper Settings', ja: '壁紙設定', ko: '배경화면 설정' },
  'drawer.designCanvas': { zh: '设计画布', en: 'Design canvas', ja: 'デザインキャンバス', ko: '디자인 캔버스' },
  'drawer.close': { zh: '关闭设置', en: 'Close settings', ja: '設定を閉じる', ko: '설정 닫기' },
  'drawer.accent': { zh: '主题色', en: 'Theme colour', ja: 'テーマカラー', ko: '테마 색상' },
  'drawer.resetAll': { zh: '全部重置', en: 'Reset all', ja: 'すべてリセット', ko: '전체 초기화' },
  'drawer.record': { zh: '记录配置', en: 'Save config', ja: '設定を保存', ko: '설정 저장' },
  'drawer.restoreDefault': { zh: '恢复首次默认', en: 'Restore defaults', ja: '初期値に戻す', ko: '기본값 복원' },
  'drawer.restoreHint': {
    zh: '丢弃本机记录的配置，回到壁纸自带的默认值（会重新加载页面）',
    en: 'Discard the saved config and return to the shipped defaults (reloads the page)',
    ja: '保存した設定を破棄し、壁紙付属の初期値に戻します（ページを再読み込み）',
    ko: '저장된 설정을 버리고 기본값으로 돌아갑니다 (페이지 새로고침)',
  },
  'drawer.noWidgets': {
    zh: '当前没有任何控件浮层开启；需要的话在对应 tab 里打开。',
    en: 'No overlay widgets are enabled; turn them on in their tab if needed.',
    ja: '有効なオーバーレイがありません。必要な場合は対応するタブで有効にしてください。',
    ko: '활성화된 오버레이가 없습니다. 필요한 경우 해당 탭에서 켜세요.',
  },
  'drawer.sourceUser': {
    zh: '正在使用你记录的配置',
    en: 'Using your saved config',
    ja: '保存した設定を使用中',
    ko: '저장된 설정 사용 중',
  },
  'drawer.sourceFile': {
    zh: '默认值',
    en: 'Defaults',
    ja: '初期値',
    ko: '기본값',
  },
  'drawer.sourceFileNote': {
    zh: '（还会被记录覆盖）',
    en: ' (overridden by a saved config)',
    ja: '（保存で上書きされます）',
    ko: ' (저장 시 덮어씀)',
  },
  'drawer.sourceBuiltin': {
    zh: '默认值：内置（未读到配置文件）',
    en: 'Defaults: built-in (config file not found)',
    ja: '初期値：内蔵（設定ファイルを読めず）',
    ko: '기본값: 내장 (설정 파일 없음)',
  },

  // ---- composition tab ----
  'comp.title': { zh: '构图', en: 'Layout', ja: '構図', ko: '구도' },
  'comp.scale': { zh: '缩放', en: 'Scale', ja: '拡大縮小', ko: '배율' },
  'comp.offsetX': { zh: '水平偏移', en: 'Offset X', ja: '水平オフセット', ko: '가로 오프셋' },
  'comp.offsetY': { zh: '垂直偏移', en: 'Offset Y', ja: '垂直オフセット', ko: '세로 오프셋' },
  'comp.backdrop': { zh: '背景', en: 'Backdrop', ja: '背景', ko: '배경' },
  'comp.model': { zh: '模型', en: 'Model', ja: 'モデル', ko: '모델' },
  'comp.parallax': { zh: '鼠标视差', en: 'Mouse parallax', ja: 'マウス視差', ko: '마우스 패럴랙스' },
  'comp.parallaxNote': {
    zh: '强度按设计画布百分比：正值随鼠标同向、负值反向、0 不动；指针移出画面会自动回中。',
    en: 'Strength is a percentage of the design canvas: positive follows the cursor, negative reverses, 0 freezes; the layer recentres when the pointer leaves.',
    ja: '強度はデザインキャンバスの割合：正はマウスと同方向、負は逆、0 は固定。ポインタが画面外に出ると中央に戻ります。',
    ko: '강도는 디자인 캔버스 비율: 양수는 마우스 방향, 음수는 반대, 0은 고정. 포인터가 화면을 벗어나면 중앙으로 복귀합니다.',
  },
  'comp.parallaxEnabled': { zh: '启用视差', en: 'Enable parallax', ja: '視差を有効化', ko: '패럴랙스 활성화' },
  'comp.backdropStrength': { zh: '背景强度', en: 'Backdrop strength', ja: '背景の強度', ko: '배경 강도' },
  'comp.modelStrength': { zh: '人物强度', en: 'Model strength', ja: 'モデルの強度', ko: '모델 강도' },
  'comp.entrance': { zh: '入场动画', en: 'Entrance sequence', ja: '登場アニメ', ko: '등장 애니메이션' },
  'comp.autoplay': { zh: '启动时播放', en: 'Play on start', ja: '起動時に再生', ko: '시작 시 재생' },
  'comp.seqHint': {
    zh: "在 wallpaper.config.json 的 sequence 里修改（也可写 'auto' 自动识别）；留空则只播放单个循环动画",
    en: "Edit in the `sequence` field of wallpaper.config.json (or use 'auto'); leave empty to play a single loop",
    ja: "wallpaper.config.json の sequence で変更（'auto' で自動認識も可）。空にすると単一ループのみ再生",
    ko: "wallpaper.config.json의 sequence에서 수정 ('auto' 사용 가능). 비우면 단일 루프만 재생",
  },
  'comp.seqEmpty': { zh: '未配置（直接播放循环动画）', en: 'Not set (plays the loop)', ja: '未設定（ループを再生）', ko: '미설정 (루프 재생)' },
  'comp.replay': { zh: '重新播放', en: 'Replay', ja: '再再生', ko: '다시 재생' },
  'comp.clipRaw': { zh: '原始画布（未单独配置）', en: 'Raw canvas (not configured)', ja: '元のキャンバス（未設定）', ko: '원본 캔버스 (미설정)' },
  'comp.autoplayOnNote': {
    zh: '勾选「启动时播放」：加载完成后自动放一遍，右下角设置按钮上方会出现播放按钮，随时可重放。',
    en: 'With "Play on start" on: plays once after load, and a play button appears above the settings gear.',
    ja: '「起動時に再生」オン：読み込み後に一度再生し、設定ボタンの上に再生ボタンが現れます。',
    ko: '"시작 시 재생" 켜기: 로드 후 한 번 재생하고 설정 버튼 위에 재생 버튼이 나타납니다.',
  },
  'comp.autoplayOffNote': {
    zh: '不自动播放：打开就是上面的「构图」，设置按钮上方不显示播放按钮（这里的「重新播放」仍可用）。',
    en: 'Not auto-played: opens on the resting composition, no play button (the "Replay" here still works).',
    ja: '自動再生しない：静止した構図で開き、再生ボタンは表示されません（ここの「再再生」は使用可能）。',
    ko: '자동 재생 안 함: 정지된 구도로 열리고 재생 버튼 없음 (여기의 "다시 재생"은 사용 가능).',
  },
  'comp.clickTitle': { zh: '点击触发动画', en: 'Click to play', ja: 'クリックで再生', ko: '클릭 재생' },
  'comp.clickNote': {
    zh: '开启后，点击人物会播放一次所选动画（如 cut_B），播完自动回到循环动画。需要宿主能投递鼠标事件（WE 里要开「鼠标交互」）。',
    en: 'When on, clicking the model plays the chosen animation once (e.g. cut_B), then returns to the loop. Needs mouse events (enable "mouse interaction" in Wallpaper Engine).',
    ja: 'オンにすると、モデルをクリックした際に選んだアニメを一度再生（例：cut_B）し、その後ループに戻ります。マウスイベントが必要（WE で「マウス操作」を有効化）。',
    ko: '켜면 모델 클릭 시 선택한 애니메이션을 한 번 재생(예: cut_B) 후 루프로 복귀. 마우스 이벤트 필요(WE에서 "마우스 상호작용" 활성화).',
  },
  'comp.clickEnabled': { zh: '点击人物时播放动画', en: 'Play animation on click', ja: 'クリック時にアニメを再生', ko: '클릭 시 애니메이션 재생' },
  'comp.clickWhich': { zh: '点击后播放的动画', en: 'Animation to play', ja: '再生するアニメ', ko: '재생할 애니메이션' },
  'comp.clearStorage': { zh: '清除存储', en: 'Clear storage', ja: 'ストレージを消去', ko: '저장소 비우기' },
  'comp.clearStorageNote': {
    zh: '用于测试：清空后刷新页面，回到壁纸自带的默认配置。',
    en: 'For testing: clears then reloads, back to the shipped defaults.',
    ja: 'テスト用：消去後に再読み込みし、壁紙付属の初期値に戻ります。',
    ko: '테스트용: 비운 후 새로고침하여 기본 설정으로 복귀.',
  },
  'comp.clearLocal': { zh: '清除 localStorage', en: 'Clear localStorage', ja: 'localStorage を消去', ko: 'localStorage 비우기' },
  'comp.clearSession': { zh: '清除 sessionStorage', en: 'Clear sessionStorage', ja: 'sessionStorage を消去', ko: 'sessionStorage 비우기' },

  // ---- record / flash status ----
  'record.recorded': { zh: '已记录', en: 'Saved', ja: '保存済み', ko: '저장됨' },
  'record.recordFail': { zh: '记录失败（浏览器存储不可用）', en: 'Save failed (storage unavailable)', ja: '保存失敗（ストレージ不可）', ko: '저장 실패 (저장소 없음)' },
  'record.copied': { zh: '已复制', en: 'Copied', ja: 'コピー済み', ko: '복사됨' },
  'record.copyFail': { zh: '复制失败', en: 'Copy failed', ja: 'コピー失敗', ko: '복사 실패' },
  'record.storedNote': {
    zh: '以后打开壁纸都按这份配置',
    en: 'the wallpaper now loads this config',
    ja: '以降はこの設定で壁紙を読み込みます',
    ko: '이제 이 설정으로 배경화면을 불러옵니다',
  },
  'record.copyOnlyNote': {
    zh: '只有剪贴板里这一份，无法自动生效',
    en: 'only on the clipboard, cannot apply automatically',
    ja: 'クリップボードのみで、自動反映されません',
    ko: '클립보드에만 있어 자동 적용 불가',
  },
  'record.statusHas': {
    zh: '之后打开 / 切换壁纸再切回都按这份配置',
    en: 'applies on every future open / wallpaper switch',
    ja: '次回以降・壁紙切替後もこの設定を使用',
    ko: '이후 열 때마다 / 배경화면 전환 시 이 설정 사용',
  },
  'record.statusEmpty': {
    zh: '记录 = 保存到本机，此后打开壁纸按这份配置（文件只作为首次默认）',
    en: 'Save = store locally and load it from now on (the file is only the first-run default)',
    ja: '保存 = ローカルに保存し、以降はこの設定を使用（ファイルは初回のみの初期値）',
    ko: '저장 = 로컬에 보관 후 이 설정 사용 (파일은 최초 기본값)',
  },

  // ---- WallKit widget tabs ----
  'widget.clock': { zh: '时钟', en: 'Clock', ja: '時計', ko: '시계' },
  'widget.spectrum': { zh: '频谱', en: 'Spectrum', ja: 'スペクトル', ko: '스펙트럼' },
  'widget.album': { zh: '专辑卡', en: 'Album', ja: 'アルバム', ko: '앨범' },
  'widget.ambient': { zh: '氛围', en: 'Ambient', ja: '雰囲気', ko: '앰비언트' },
  'widget.pointer': { zh: '指针', en: 'Pointer', ja: 'ポインタ', ko: '포인터' },
  'widget.other': { zh: '其他', en: 'Other', ja: 'その他', ko: '기타' },

  'widget.show': { zh: '显示', en: 'Display', ja: '表示', ko: '표시' },
  'widget.appearance': { zh: '外观', en: 'Appearance', ja: '外観', ko: '외관' },
  'widget.position': { zh: '位置', en: 'Position', ja: '位置', ko: '위치' },
  'widget.interaction': { zh: '交互', en: 'Interaction', ja: 'インタラクション', ko: '상호작용' },
  'widget.response': { zh: '响应', en: 'Response', ja: 'レスポンス', ko: '반응' },
  'widget.channels': { zh: '通道', en: 'Channels', ja: 'チャンネル', ko: '채널' },
  'widget.density': { zh: '密度与强度', en: 'Density & strength', ja: '密度と強度', ko: '밀도와 강도' },
  'widget.layout': { zh: '布局', en: 'Layout', ja: 'レイアウト', ko: '레이아웃' },
  'widget.size': { zh: '尺寸', en: 'Size', ja: 'サイズ', ko: '크기' },
  'widget.width': { zh: '宽度', en: 'Width', ja: '幅', ko: '너비' },
  'widget.height': { zh: '高度', en: 'Height', ja: '高さ', ko: '높이' },
  'widget.color': { zh: '颜色', en: 'Colour', ja: '色', ko: '색상' },
  'widget.textColor': { zh: '文字颜色', en: 'Text colour', ja: '文字色', ko: '글자 색상' },
  'widget.spectrumColor': { zh: '频谱颜色', en: 'Spectrum colour', ja: 'スペクトラム色', ko: '스펙트럼 색상' },
  'widget.style': { zh: '样式', en: 'Style', ja: 'スタイル', ko: '스타일' },
  'widget.intensity': { zh: '强度', en: 'Intensity', ja: '強度', ko: '강도' },
  'widget.curve': { zh: '曲线', en: 'Curve', ja: 'カーブ', ko: '커브' },
  'widget.density2': { zh: '密度', en: 'Density', ja: '密度', ko: '밀도' },
  'widget.opacity': { zh: '不透明度', en: 'Opacity', ja: '不透明度', ko: '불투명도' },
  'widget.form': { zh: '形态', en: 'Form', ja: '形状', ko: '형태' },
  'widget.anchor': { zh: '锚点', en: 'Anchor', ja: 'アンカー', ko: '앵커' },
  'widget.trail': { zh: '鼠标拖尾', en: 'Pointer trail', ja: 'ポインタの軌跡', ko: '포인터 잔상' },
  'widget.click': { zh: '点击特效', en: 'Click effect', ja: 'クリック効果', ko: '클릭 효과' },
  'widget.trailForm': { zh: '拖尾形态', en: 'Trail form', ja: '軌跡の形状', ko: '잔상 형태' },
  'widget.clickForm': { zh: '点击形态', en: 'Click form', ja: 'クリック形状', ko: '클릭 형태' },

  // ---- per-widget enable toggles & notes ----
  'clock.enable': { zh: '在壁纸上显示时钟', en: 'Show clock on the wallpaper', ja: '壁紙に時計を表示', ko: '배경화면에 시계 표시' },
  'clock.tilt': { zh: '指针倾斜', en: 'Pointer tilt', ja: 'ポインタの傾き', ko: '포인터 기울기' },
  'clock.tiltNote': {
    zh: '跟随鼠标做 3D 倾斜，WE 桌面壁纸里通常收不到鼠标事件',
    en: '3D tilt following the mouse; desktop wallpapers usually receive no mouse events',
    ja: 'マウスに追従して 3D に傾く。デスクトップ壁紙では通常マウスイベントを受け取れません',
    ko: '마우스를 따라 3D 기울기. 데스크톱 배경화면은 보통 마우스 이벤트를 받지 못함',
  },
  'clock.beat': { zh: '音频响应', en: 'Audio response', ja: 'オーディオ反応', ko: '오디오 반응' },
  'clock.beatNote': { zh: '随低频鼓点缩放，需要 WE 音频数据', en: 'Scales with the bass; needs WE audio', ja: '低音に合わせて拡大。WE オーディオが必要', ko: '저음에 맞춰 확대. WE 오디오 필요' },
  'clock.beatStrength': { zh: '响应强度', en: 'Response strength', ja: '反応の強度', ko: '반응 강도' },
  'clock.beatCurve': { zh: '响应曲线', en: 'Response curve', ja: '反応カーブ', ko: '반응 커브' },
  'clock.anchorNote': {
    zh: '锚点描述「视口上的一点」与「控件上同名的一点」重合；偏移从锚点向内计。',
    en: 'The anchor aligns a viewport point with the same point on the widget; offsets count inward from it.',
    ja: 'アンカーは「ビューポート上の点」と「ウィジェット上の同じ点」を合わせます。オフセットはアンカーから内側に計ります。',
    ko: '앵커는 뷰포트의 점과 위젯의 같은 점을 정렬합니다. 오프셋은 앵커에서 안쪽으로 계산됩니다.',
  },

  'spectrum.enable': { zh: '在壁纸上显示频谱', en: 'Show spectrum on the wallpaper', ja: '壁紙にスペクトラムを表示', ko: '배경화면에 스펙트럼 표시' },
  'spectrum.enableNote': { zh: '条形数据来自 WE 音频帧；普通浏览器里是平的', en: 'Bars come from WE audio frames; flat in a normal browser', ja: 'バーは WE オーディオフレームから。通常ブラウザでは平坦です', ko: '막대는 WE 오디오 프레임에서. 일반 브라우저에서는 평평함' },
  'spectrum.radialNote': {
    zh: '环形类样式按「宽高中较小的一边」取直径，想要正圆就把宽、高设成相等（如都是 46）。',
    en: 'Radial styles take the diameter from the shorter side; set width = height (e.g. 46) for a perfect circle.',
    ja: 'リング系は「幅と高さの小さい方」を直径に使います。正円にするには幅と高さを同じ（例：46）に。',
    ko: '링형 스타일은 짧은 변을 지름으로 사용. 완전한 원은 너비=높이(예: 46)로 설정.',
  },
  'spectrum.linearNote': {
    zh: '宽度、高度填了会覆盖上面的「尺寸」；例如 100 / 14 铺满底边。',
    en: 'Width / height override the "Size" above; e.g. 100 / 14 fills the bottom edge.',
    ja: '幅・高さを指定すると上の「サイズ」を上書きします。例：100 / 14 で下端を埋めます。',
    ko: '너비/높이는 위의 "크기"를 덮어씁니다. 예: 100/14는 하단을 채움.',
  },

  'album.enable': { zh: '在壁纸上显示专辑卡', en: 'Show album art on the wallpaper', ja: '壁紙にアルバムアートを表示', ko: '배경화면에 앨범 아트 표시' },
  'album.enableNote': {
    zh: '没有正在播放的媒体信息时不渲染，不会显示空占位',
    en: 'Not rendered when no media is playing; no empty placeholder',
    ja: '再生中のメディアがない場合は描画せず、空のプレースホルダも表示しません',
    ko: '재생 중인 미디어가 없으면 렌더링하지 않음 (빈 자리 없음)',
  },

  'ambient.enable': { zh: '在壁纸上显示氛围粒子', en: 'Show ambient particles', ja: '壁紙にアンビエント粒子を表示', ko: '배경화면에 앰비언트 입자 표시' },
  'ambient.enableNote': {
    zh: '铺满视口，没有位置设置；背景里已有粒子时不要叠这一层',
    en: 'Fills the viewport, no position setting; do not layer over existing background particles',
    ja: 'ビューポート全体に広がり、位置設定はありません。背景に粒子がある場合は重ねないでください',
    ko: '뷰포트 전체를 채우며 위치 설정 없음. 배경에 이미 입자가 있으면 겹치지 마세요',
  },

  'pointer.enable': { zh: '在壁纸上显示指针特效', en: 'Show pointer effects', ja: '壁紙にポインタ効果を表示', ko: '배경화면에 포인터 효과 표시' },
  'pointer.enableNote': {
    zh: '覆盖层铺满视口；WE 桌面壁纸默认不投递鼠标事件，需在 WE 里开启鼠标交互',
    en: 'Overlay fills the viewport; desktop wallpapers default to no mouse events — enable mouse interaction in WE',
    ja: 'オーバーレイはビューポート全体。デスクトップ壁紙は既定でマウスイベントを投げないため、WE でマウス操作を有効化してください',
    ko: '오버레이가 뷰포트 전체를 채움. 데스크톱 배경화면은 기본적으로 마우스 이벤트를 보내지 않음 — WE에서 마우스 상호작용 활성화 필요',
  },
  'pointer.offsetNote': {
    zh: '当前偏移不是纯数字（配置文件里写了 CSS 长度），面板按百分比显示为 0；改动后会写回数字。',
    en: 'The current offset is not a plain number (a CSS length in the config); shown as 0 in percent, and edits write back numbers.',
    ja: '現在のオフセットは数値ではありません（設定に CSS 長さを記述）。パーセントで 0 と表示され、変更すると数値で書き戻されます。',
    ko: '현재 오프셋이 숫자가 아님(설정에 CSS 길이). 퍼센트로 0 표시, 변경 시 숫자로 기록.',
  },

  // ---- picker / anchor ----
  'picker.satBright': { zh: '饱和度与亮度（拖动选择）', en: 'Saturation & brightness (drag)', ja: '彩度と明度（ドラッグ選択）', ko: '채도와 밝기 (드래그)' },
  'picker.hue': { zh: '色相（拖动选择）', en: 'Hue (drag)', ja: '色相（ドラッグ選択）', ko: '색상 (드래그)' },
  'picker.expand': { zh: '展开取色面板', en: 'Open colour picker', ja: 'カラーピッカーを開く', ko: '색상 선택기 열기' },
  'picker.hexHint': { zh: '十六进制值（在配置文件里修改）', en: 'Hex value (edit in the config file)', ja: '16進数値（設定ファイルで変更）', ko: '16진수 값 (설정 파일에서 수정)' },
  'anchor.grid': { zh: '位置锚点', en: 'Anchor position', ja: '位置アンカー', ko: '위치 앵커' },
  'anchor.topLeft': { zh: '左上', en: 'Top-left', ja: '左上', ko: '왼쪽 위' },
  'anchor.topCenter': { zh: '上中', en: 'Top-center', ja: '上中央', ko: '위쪽 중앙' },
  'anchor.topRight': { zh: '右上', en: 'Top-right', ja: '右上', ko: '오른쪽 위' },
  'anchor.centerLeft': { zh: '左中', en: 'Center-left', ja: '左中央', ko: '왼쪽 중앙' },
  'anchor.center': { zh: '居中', en: 'Center', ja: '中央', ko: '중앙' },
  'anchor.centerRight': { zh: '右中', en: 'Center-right', ja: '右中央', ko: '오른쪽 중앙' },
  'anchor.bottomLeft': { zh: '左下', en: 'Bottom-left', ja: '左下', ko: '왼쪽 아래' },
  'anchor.bottomCenter': { zh: '下中', en: 'Bottom-center', ja: '下中央', ko: '아래쪽 중앙' },
  'anchor.bottomRight': { zh: '右下', en: 'Bottom-right', ja: '右下', ko: '오른쪽 아래' },

  // ---- page-level chrome ----
  'page.loading': { zh: '正在加载壁纸资源…', en: 'Loading wallpaper resources…', ja: '壁紙リソースを読み込み中…', ko: '배경화면 리소스를 불러오는 중…' },
  'page.followPrompt': {
    zh: '喜欢这个壁纸吗？欢迎关注、点赞、收藏',
    en: 'Enjoying this wallpaper? Follow, like and save it',
    ja: 'この壁紙が気に入ったら、フォロー・いいね・お気に入りをよろしく',
    ko: '이 배경화면이 마음에 든다면 팔로우·좋아요·즐겨찾기 부탁드려요',
  },
  'page.followClose': { zh: '关闭', en: 'Dismiss', ja: '閉じる', ko: '닫기' },
  'page.playEntrance': { zh: '播放开场动画', en: 'Play entrance', ja: '登場アニメを再生', ko: '등장 애니메이션 재생' },
  'page.openSettings': { zh: '打开构图设置', en: 'Open composition settings', ja: '構図設定を開く', ko: '구도 설정 열기' },
  'page.settingsHint': { zh: '构图设置（S）', en: 'Composition settings (S)', ja: '構図設定（S）', ko: '구도 설정 (S)' },
  'page.noModels': {
    zh: 'model-library/ 里没有可识别的模型',
    en: 'No recognizable models in model-library/',
    ja: 'model-library/ に認識可能なモデルがありません',
    ko: 'model-library/에 인식 가능한 모델이 없음',
  },

  // ---- variant labels (widget option chips) ----
  'clock.card': { zh: '卡片', en: 'Card', ja: 'カード', ko: '카드' },
  'clock.bar': { zh: '条形', en: 'Bar', ja: 'バー', ko: '막대' },
  'clock.minimal': { zh: '极简', en: 'Minimal', ja: 'ミニマル', ko: '미니멀' },
  'clock.cyberpunk': { zh: '赛博', en: 'Cyberpunk', ja: 'サイバーパンク', ko: '사이버펑크' },
  'clock.infobar': { zh: '信息条', en: 'Infobar', ja: 'インフォバー', ko: '정보 바' },
  'clock.split': { zh: '分栏', en: 'Split', ja: 'スプリット', ko: '분할' },
  'clock.poster': { zh: '海报', en: 'Poster', ja: 'ポスター', ko: '포스터' },
  'clock.ring': { zh: '环形', en: 'Ring', ja: 'リング', ko: '링' },
  'clock.segments': { zh: '三段', en: 'Segments', ja: 'セグメント', ko: '세그먼트' },
  'clock.stamp': { zh: '记录卡', en: 'Stamp', ja: 'スタンプ', ko: '스탬프' },

  'spectrum.bars': { zh: '柱状', en: 'Bars', ja: 'バー', ko: '막대' },
  'spectrum.mirror': { zh: '镜像', en: 'Mirror', ja: 'ミラー', ko: '미러' },
  'spectrum.curve': { zh: '曲线', en: 'Curve', ja: 'カーブ', ko: '커브' },
  'spectrum.pill': { zh: '胶囊', en: 'Pill', ja: 'ピル', ko: '필' },
  'spectrum.ring': { zh: '环形', en: 'Ring', ja: 'リング', ko: '링' },
  'spectrum.ringwave': { zh: '环形波', en: 'Ring wave', ja: 'リングウェーブ', ko: '링 웨이브' },
  'spectrum.dots': { zh: '点阵', en: 'Dots', ja: 'ドット', ko: '도트' },
  'spectrum.ripples': { zh: '涟漪', en: 'Ripples', ja: '波紋', ko: '물결' },
  'spectrum.aurora': { zh: '极光', en: 'Aurora', ja: 'オーロラ', ko: '오로라' },

  'album.classic': { zh: '经典', en: 'Classic', ja: 'クラシック', ko: '클래식' },
  'album.glass': { zh: '毛玻璃', en: 'Glass', ja: 'ガラス', ko: '글래스' },
  'album.vinyl': { zh: '唱片', en: 'Vinyl', ja: 'ビニール', ko: '바이닐' },
  'album.minimal': { zh: '极简', en: 'Minimal', ja: 'ミニマル', ko: '미니멀' },
  'album.bar': { zh: '条形', en: 'Bar', ja: 'バー', ko: '막대' },
  'album.wall': { zh: '墙面', en: 'Wall', ja: 'ウォール', ko: '월' },

  'ambient.snow': { zh: '飘雪', en: 'Snow', ja: '雪', ko: '눈' },
  'ambient.sakura': { zh: '樱花', en: 'Sakura', ja: '桜', ko: '벚꽃' },
  'ambient.bubble': { zh: '气泡', en: 'Bubbles', ja: '泡', ko: '거품' },
  'ambient.steam': { zh: '水汽', en: 'Steam', ja: '蒸気', ko: '수증기' },
  'ambient.rain': { zh: '细雨', en: 'Rain', ja: '雨', ko: '비' },
  'ambient.fog': { zh: '薄雾', en: 'Fog', ja: '霧', ko: '안개' },
  'ambient.leaves': { zh: '落叶', en: 'Falling leaves', ja: '落ち葉', ko: '떨어지는 나뭇잎' },
  'ambient.speed': { zh: '速度', en: 'Speed', ja: '速度', ko: '속도' },

  'pointer.glow': { zh: '柔光', en: 'Glow', ja: 'グロー', ko: '글로우' },
  'pointer.ribbon': { zh: '丝带', en: 'Ribbon', ja: 'リボン', ko: '리본' },
  'pointer.bubble': { zh: '气泡', en: 'Bubbles', ja: '泡', ko: '거품' },
  'pointer.firework': { zh: '烟花', en: 'Firework', ja: '花火', ko: '불꽃' },
  'pointer.ripple': { zh: '涟漪', en: 'Ripple', ja: '波紋', ko: '물결' },
  'pointer.sparks': { zh: '星尘', en: 'Sparks', ja: '火花', ko: '스파크' },

  // ---- language switcher ----
  'lang.label': { zh: '语言', en: 'Language', ja: '言語', ko: '언어' },
}

// ---------------------------------------------------------------------------
// Locale state
// ---------------------------------------------------------------------------

let currentLocale = null
const listeners = new Set()

function setCurrentLocale(next) {
  currentLocale = next
  listeners.forEach((fn) => fn())
}

function browserLocale() {
  const lang = (typeof navigator !== 'undefined' && (navigator.language || navigator.userLanguage || '')) || ''
  const base = lang.slice(0, 2).toLowerCase()
  return LOCALES.some((item) => item.code === base) ? base : 'zh'
}

function storedLocale() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return LOCALES.some((item) => item.code === raw) ? raw : null
  } catch {
    return null
  }
}

function initLocale() {
  if (currentLocale) return currentLocale
  currentLocale = storedLocale() ?? browserLocale()
  return currentLocale
}

export function getLocale() {
  return initLocale()
}

export function setLocale(code) {
  const next = LOCALES.some((item) => item.code === code) ? code : 'zh'
  setCurrentLocale(next)
  try {
    localStorage.setItem(STORAGE_KEY, next)
  } catch {
    // Storage can be unavailable on some WE origins; the in-memory locale still applies.
  }
  return next
}

// React subscription for the current locale; re-renders callers on switch.
function subscribe(callback) {
  listeners.add(callback)
  return () => listeners.delete(callback)
}

export function useLocale() {
  const locale = useSyncExternalStore(subscribe, getLocale, getLocale)
  return { locale, setLocale }
}

// Translate a key under the current locale. Falls back to zh, then to the key.
export function t(key) {
  const locale = getLocale()
  const entry = MESSAGES[key]
  if (!entry) return key
  return entry[locale] ?? entry.zh ?? key
}

export { MESSAGES }
